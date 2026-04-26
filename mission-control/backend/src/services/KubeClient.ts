import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  Deployment,
  DeploymentInventoryItem,
  EndpointAddressSummary,
  InventoryPodSummary,
  InventoryResponse,
  KubeEvent,
  KubeObjectRef,
  KubeSeverity,
  Pod,
  PodLogsResponse,
  Service,
  ServiceEndpointResolution,
  ServiceEndpointSummary,
  ServicePort,
} from '../types/index.js';

const exec = promisify(execFile);
const ENERGY_NAMESPACE = 'energy' as const;
const KUBECTL_TIMEOUT_MS = 15_000;
const LOG_TIMEOUT_MS = 20_000;
const DEFAULT_LOG_LINES = 500;
const MAX_LOG_LINES = 2_000;

const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const POD_NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;

export class KubeClientError extends Error {
  constructor(message: string, public readonly statusCode = 503) {
    super(message);
    this.name = 'KubeClientError';
  }
}

export class KubeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KubeInputError';
  }
}

/**
 * Kubernetes client that wraps kubectl JSON output into typed objects.
 */
export class KubeClient {
  async getPods(namespace = ENERGY_NAMESPACE): Promise<Pod[]> {
    const data = await kubectlJson(['get', 'pods', '-n', namespace, '-o', 'json']);
    return (data.items ?? []).map(toPod);
  }

  async getServices(namespace = ENERGY_NAMESPACE): Promise<Service[]> {
    const data = await kubectlJson(['get', 'services', '-n', namespace, '-o', 'json']);
    return (data.items ?? []).map(toService);
  }

  async getEvents(namespace = ENERGY_NAMESPACE): Promise<KubeEvent[]> {
    const data = await kubectlJson([
      'get', 'events', '-n', namespace, '-o', 'json',
    ]);

    return (data.items ?? [])
      .map(toKubeEvent)
      .sort((a: KubeEvent, b: KubeEvent) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp));
  }

  async getDeployments(namespace = ENERGY_NAMESPACE): Promise<Deployment[]> {
    const data = await kubectlJson(['get', 'deployments', '-n', namespace, '-o', 'json']);
    return (data.items ?? []).map(toDeployment);
  }

  async getInventory(): Promise<InventoryResponse> {
    const [deployments, pods, services, events, endpoints] = await Promise.all([
      this.getDeployments(ENERGY_NAMESPACE),
      this.getPods(ENERGY_NAMESPACE),
      this.getServices(ENERGY_NAMESPACE),
      this.getEvents(ENERGY_NAMESPACE),
      getEndpointSummaries(),
    ]);

    const endpointByService = new Map(endpoints.map((endpoint) => [endpoint.serviceName, endpoint]));
    const deploymentItems = deployments.map((deployment) => {
      const deploymentPods = pods.filter((pod) => selectorMatches(pod.labels ?? {}, deployment.selectorLabels ?? {}));
      const deploymentPodNames = new Set(deploymentPods.map((pod) => pod.name));
      const deploymentServices = services.filter((service) => selectorMatches(deployment.labels ?? {}, service.selector ?? {})
        || deploymentPods.some((pod) => selectorMatches(pod.labels ?? {}, service.selector ?? {})));
      const endpointReadiness = deploymentServices.map((service) => endpointByService.get(service.name) ?? emptyEndpointSummary(service.name));
      const recentEvents = events
        .filter((event) => eventMatchesDeployment(event, deployment.name, deploymentPodNames))
        .slice(0, 5);

      return toInventoryItem(deployment, deploymentPods, deploymentServices, endpointReadiness, recentEvents);
    });

    const claimedPods = new Set(deploymentItems.flatMap((item) => item.pods.map((pod) => pod.name)));

    return {
      namespace: ENERGY_NAMESPACE,
      updatedAt: new Date().toISOString(),
      deployments: deploymentItems,
      orphanPods: pods.filter((pod) => !claimedPods.has(pod.name)).map(toInventoryPodSummary),
      services,
      events: events.slice(0, 50),
    };
  }

  async getPodLogs(name: string, requestedLines = DEFAULT_LOG_LINES): Promise<PodLogsResponse> {
    validatePodName(name);
    const lines = clampLogLines(requestedLines);
    const { stdout } = await execKubectl([
      'logs', name, '-n', ENERGY_NAMESPACE,
      '--all-containers=true',
      '--tail', String(lines),
    ], LOG_TIMEOUT_MS);

    return {
      namespace: ENERGY_NAMESPACE,
      pod: name,
      lines,
      logs: redactSensitiveText(stdout),
      updatedAt: new Date().toISOString(),
    };
  }

  async getServiceEndpoints(name: string): Promise<ServiceEndpointResolution> {
    validateServiceName(name);

    const [services, pods, endpoints, endpointSlices] = await Promise.all([
      this.getServices(ENERGY_NAMESPACE),
      this.getPods(ENERGY_NAMESPACE),
      getEndpointSummaries(),
      getEndpointSliceSummaries(name),
    ]);

    const service = services.find((candidate) => candidate.name === name);
    if (!service) {
      throw new KubeClientError(`Service '${name}' was not found in namespace '${ENERGY_NAMESPACE}'.`, 404);
    }

    const servicePods = pods
      .filter((pod) => selectorMatches(pod.labels ?? {}, service.selector ?? {}))
      .map(toInventoryPodSummary);

    return {
      service,
      endpoints: endpoints.find((endpoint) => endpoint.serviceName === name) ?? emptyEndpointSummary(name),
      pods: servicePods,
      endpointSlices,
      updatedAt: new Date().toISOString(),
    };
  }
}

function validatePodName(name: string): void {
  if (!name || name.length > 253 || !POD_NAME_PATTERN.test(name)) {
    throw new KubeInputError('Pod name must be a valid Kubernetes DNS name.');
  }
}

function validateServiceName(name: string): void {
  if (!name || name.length > 63 || !DNS_LABEL_PATTERN.test(name)) {
    throw new KubeInputError('Service name must be a valid Kubernetes DNS label.');
  }
}

function clampLogLines(lines: number): number {
  if (!Number.isFinite(lines) || !Number.isInteger(lines)) {
    throw new KubeInputError('Log line count must be an integer.');
  }
  return Math.min(MAX_LOG_LINES, Math.max(1, lines));
}

async function kubectlJson(args: string[], timeout = KUBECTL_TIMEOUT_MS): Promise<any> {
  const { stdout } = await execKubectl(args, timeout);
  try {
    return JSON.parse(stdout);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new KubeClientError(`kubectl returned invalid JSON: ${message}`, 502);
  }
}

async function execKubectl(args: string[], timeout = KUBECTL_TIMEOUT_MS): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec('kubectl', args, { timeout, maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    throw normalizeKubectlError(err);
  }
}

function normalizeKubectlError(err: unknown): KubeClientError {
  if (isNodeError(err) && err.code === 'ENOENT') {
    return new KubeClientError('kubectl is unavailable on PATH. Install kubectl or run Mission Control from the dev container.', 503);
  }

  const stderr = isExecError(err) ? err.stderr?.trim() : undefined;
  const stdout = isExecError(err) ? err.stdout?.trim() : undefined;
  const detail = stderr || stdout || (err instanceof Error ? err.message : String(err));
  return new KubeClientError(`kubectl failed for namespace '${ENERGY_NAMESPACE}': ${redactSensitiveText(detail)}`, 503);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function isExecError(err: unknown): err is Error & { stderr?: string; stdout?: string } {
  return typeof err === 'object' && err !== null;
}

function toPod(item: any): Pod {
  const containers = item.status?.containerStatuses ?? [];
  const containerSummaries = containers.map((container: any) => ({
    name: container.name,
    ready: Boolean(container.ready),
    restartCount: container.restartCount ?? 0,
    state: getContainerState(container),
    reason: getContainerReason(container),
  }));
  const readyCount = containers.filter((container: any) => container.ready).length;
  const totalCount = containers.length || (item.spec?.containers?.length ?? 0);
  const status = getPodStatus(item, containers);

  return {
    name: item.metadata.name,
    namespace: item.metadata.namespace,
    status,
    ready: readyCount === totalCount && totalCount > 0,
    restarts: containers.reduce((sum: number, container: any) => sum + (container.restartCount ?? 0), 0),
    age: item.metadata.creationTimestamp ?? '',
    labels: item.metadata.labels ?? {},
    reason: status,
    phase: item.status?.phase ?? 'Unknown',
    podIP: item.status?.podIP,
    nodeName: item.spec?.nodeName,
    startTime: item.status?.startTime,
    containers: containerSummaries,
  } satisfies Pod;
}

function toService(item: any): Service {
  const portDetails = (item.spec?.ports ?? []).map((port: any) => ({
    name: port.name,
    port: port.port,
    targetPort: port.targetPort,
    nodePort: port.nodePort,
    protocol: port.protocol ?? 'TCP',
    appProtocol: port.appProtocol,
  } satisfies ServicePort));
  const loadBalancerIngress = item.status?.loadBalancer?.ingress ?? [];
  const externalIP = loadBalancerIngress.map((ingress: any) => ingress.ip).find(Boolean);
  const externalHostname = loadBalancerIngress.map((ingress: any) => ingress.hostname).find(Boolean);

  return {
    name: item.metadata.name,
    namespace: item.metadata.namespace,
    type: item.spec.type ?? 'ClusterIP',
    clusterIP: item.spec.clusterIP ?? '',
    ports: portDetails.map((port: ServicePort) => `${port.port}/${port.protocol}`).join(', '),
    selector: item.spec.selector ?? {},
    portDetails,
    externalIPs: item.spec.externalIPs ?? [],
    loadBalancerIngress,
    externalIP,
    externalHostname,
    publicUrl: item.spec.type === 'LoadBalancer' ? buildPublicUrl(externalHostname ?? externalIP, portDetails) : undefined,
  } satisfies Service;
}

function buildPublicUrl(host: string | undefined, ports: ServicePort[]): string | undefined {
  if (!host) return undefined;

  const webPort = ports.find((port) => getWebScheme(port) !== undefined);
  if (!webPort) return undefined;

  const scheme = getWebScheme(webPort);
  if (!scheme) return undefined;

  const defaultPort = scheme === 'https' ? 443 : 80;
  const portSuffix = webPort.port === defaultPort ? '' : `:${webPort.port}`;
  return `${scheme}://${formatUrlHost(host)}${portSuffix}`;
}

function getWebScheme(port: ServicePort): 'http' | 'https' | undefined {
  const name = port.name?.toLowerCase() ?? '';
  const appProtocol = port.appProtocol?.toLowerCase() ?? '';

  if (port.port === 443 || name.includes('https') || appProtocol.includes('https')) {
    return 'https';
  }

  if (port.port === 80 || name.includes('http') || appProtocol.includes('http')) {
    return 'http';
  }

  return undefined;
}

function formatUrlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function toDeployment(item: any): Deployment {
  const desiredReplicas = item.spec?.replicas ?? 1;
  return {
    name: item.metadata.name,
    namespace: item.metadata.namespace,
    desiredReplicas,
    readyReplicas: item.status?.readyReplicas ?? 0,
    replicas: item.status?.replicas ?? desiredReplicas,
    updatedReplicas: item.status?.updatedReplicas ?? 0,
    availableReplicas: item.status?.availableReplicas ?? 0,
    labels: item.metadata.labels ?? {},
    selectorLabels: item.spec?.selector?.matchLabels ?? {},
    age: item.metadata.creationTimestamp ?? '',
    updatedAt: latestDeploymentUpdate(item),
  } satisfies Deployment;
}

function toKubeEvent(item: any): KubeEvent {
  const lastTimestamp = item.lastTimestamp
    ?? item.eventTime
    ?? item.series?.lastObservedTime
    ?? item.metadata?.creationTimestamp
    ?? '';
  const firstTimestamp = item.firstTimestamp ?? item.metadata?.creationTimestamp ?? lastTimestamp;

  return {
    type: item.type ?? 'Normal',
    reason: item.reason ?? '',
    message: redactSensitiveText(item.message ?? ''),
    source: item.reportingController ?? item.source?.component ?? '',
    timestamp: lastTimestamp,
    involvedObject: item.involvedObject ? {
      kind: item.involvedObject.kind ?? '',
      name: item.involvedObject.name ?? '',
      namespace: item.involvedObject.namespace,
      fieldPath: item.involvedObject.fieldPath,
      apiVersion: item.involvedObject.apiVersion,
    } : undefined,
    count: item.count ?? item.series?.count ?? 1,
    firstTimestamp,
    lastTimestamp,
  } satisfies KubeEvent;
}

async function getEndpointSummaries(): Promise<ServiceEndpointSummary[]> {
  const data = await kubectlJson(['get', 'endpoints', '-n', ENERGY_NAMESPACE, '-o', 'json']);
  return (data.items ?? []).map(toEndpointSummary);
}

async function getEndpointSliceSummaries(serviceName: string): Promise<ServiceEndpointSummary[]> {
  const data = await kubectlJson([
    'get', 'endpointslices', '-n', ENERGY_NAMESPACE,
    '-l', `kubernetes.io/service-name=${serviceName}`,
    '-o', 'json',
  ]);
  return (data.items ?? []).map(toEndpointSliceSummary);
}

function toEndpointSummary(item: any): ServiceEndpointSummary {
  const addresses: EndpointAddressSummary[] = [];

  for (const subset of item.subsets ?? []) {
    const ports = (subset.ports ?? []).map(toEndpointPort);
    for (const address of subset.addresses ?? []) {
      addresses.push(toEndpointAddress(address, true, ports));
    }
    for (const address of subset.notReadyAddresses ?? []) {
      addresses.push(toEndpointAddress(address, false, ports));
    }
  }

  return {
    serviceName: item.metadata.name,
    ready: addresses.filter((address) => address.ready).length,
    notReady: addresses.filter((address) => !address.ready).length,
    total: addresses.length,
    addresses,
  };
}

function toEndpointSliceSummary(item: any): ServiceEndpointSummary {
  const ports = (item.ports ?? []).map(toEndpointPort);
  const addresses: EndpointAddressSummary[] = (item.endpoints ?? []).flatMap((endpoint: any) => (endpoint.addresses ?? []).map((ip: string) => ({
    ip,
    ready: endpoint.conditions?.ready !== false,
    nodeName: endpoint.nodeName,
    targetRef: endpoint.targetRef ? toObjectRef(endpoint.targetRef) : undefined,
    ports,
  } satisfies EndpointAddressSummary)));

  return {
    serviceName: item.metadata?.labels?.['kubernetes.io/service-name'] ?? item.metadata.name,
    ready: addresses.filter((address) => address.ready).length,
    notReady: addresses.filter((address) => !address.ready).length,
    total: addresses.length,
    addresses,
  };
}

function toEndpointAddress(address: any, ready: boolean, ports: ServicePort[]): EndpointAddressSummary {
  return {
    ip: address.ip,
    ready,
    nodeName: address.nodeName,
    targetRef: address.targetRef ? toObjectRef(address.targetRef) : undefined,
    ports,
  };
}

function toEndpointPort(port: any): ServicePort {
  return {
    name: port.name,
    port: port.port,
    protocol: port.protocol ?? 'TCP',
  };
}

function toObjectRef(ref: any): KubeObjectRef {
  return {
    kind: ref.kind ?? '',
    name: ref.name ?? '',
    namespace: ref.namespace,
    fieldPath: ref.fieldPath,
    apiVersion: ref.apiVersion,
  };
}

function emptyEndpointSummary(serviceName: string): ServiceEndpointSummary {
  return {
    serviceName,
    ready: 0,
    notReady: 0,
    total: 0,
    addresses: [],
  };
}

function toInventoryItem(
  deployment: Deployment,
  pods: Pod[],
  services: Service[],
  endpointReadiness: ServiceEndpointSummary[],
  recentEvents: KubeEvent[],
): DeploymentInventoryItem {
  const podSummaries = pods.map(toInventoryPodSummary);
  const readyPods = pods.filter((pod) => pod.ready).length;
  const runningPods = pods.filter((pod) => pod.phase === 'Running').length;
  const restarts = pods.reduce((sum, pod) => sum + pod.restarts, 0);
  const { severity, reason } = classifyDeployment(deployment, podSummaries, endpointReadiness, recentEvents);

  return {
    name: deployment.name,
    namespace: deployment.namespace,
    desiredReplicas: deployment.desiredReplicas,
    readyPods,
    runningPods,
    replicas: deployment.replicas,
    updatedReplicas: deployment.updatedReplicas,
    availableReplicas: deployment.availableReplicas,
    severity,
    status: severity,
    reason,
    restarts,
    age: deployment.age ?? '',
    updatedAt: deployment.updatedAt ?? deployment.age ?? '',
    labels: deployment.labels ?? {},
    selectorLabels: deployment.selectorLabels ?? {},
    pods: podSummaries,
    services,
    endpointReadiness,
    recentEvents,
  };
}

function toInventoryPodSummary(pod: Pod): InventoryPodSummary {
  return {
    name: pod.name,
    phase: pod.phase ?? 'Unknown',
    ready: pod.ready,
    status: pod.status,
    reason: pod.reason,
    restarts: pod.restarts,
    age: pod.age,
    podIP: pod.podIP,
    nodeName: pod.nodeName,
    labels: pod.labels ?? {},
    containers: pod.containers ?? [],
  };
}

function isDeploymentCurrentlyHealthy(
  deployment: Deployment,
  pods: InventoryPodSummary[],
  endpointReadiness: ServiceEndpointSummary[],
): boolean {
  const desired = deployment.desiredReplicas;
  const readyPods = pods.filter((pod) => pod.ready).length;
  const runningPods = pods.filter((pod) => pod.phase === 'Running').length;
  const restarts = pods.reduce((sum, pod) => sum + pod.restarts, 0);
  const warningReason = pods.map((pod) => pod.reason).find((reason) => reason && isWarningReason(reason));
  const notReadyService = endpointReadiness.find((endpoint) => endpoint.notReady > 0);

  return (
    desired > 0 &&
    pods.length > 0 &&
    readyPods === desired &&
    runningPods === desired &&
    deployment.availableReplicas === desired &&
    restarts === 0 &&
    !warningReason &&
    !notReadyService
  );
}

function classifyDeployment(
  deployment: Deployment,
  pods: InventoryPodSummary[],
  endpointReadiness: ServiceEndpointSummary[],
  events: KubeEvent[],
): { severity: KubeSeverity; reason: string } {
  const desired = deployment.desiredReplicas;
  const readyPods = pods.filter((pod) => pod.ready).length;
  const runningPods = pods.filter((pod) => pod.phase === 'Running').length;
  const restarts = pods.reduce((sum, pod) => sum + pod.restarts, 0);
  const podReason = pods.map((pod) => pod.reason).find((reason) => reason && reason !== 'Running' && reason !== 'Succeeded');
  const criticalReason = pods.map((pod) => pod.reason).find((reason) => reason && isCriticalReason(reason));
  const warningReason = pods.map((pod) => pod.reason).find((reason) => reason && isWarningReason(reason));
  const emptyService = endpointReadiness.find((endpoint) => desired > 0 && endpoint.total === 0);
  const notReadyService = endpointReadiness.find((endpoint) => endpoint.notReady > 0);
  const warningEvent = events.find((event) => event.type === 'Warning');

  if (desired > 0 && pods.length === 0) {
    return { severity: 'critical', reason: 'No pods found for deployment selector' };
  }

  if (criticalReason) {
    return { severity: 'critical', reason: criticalReason };
  }

  if (readyPods < desired || runningPods < desired || deployment.availableReplicas < desired) {
    return { severity: 'critical', reason: podReason ?? `${Math.max(desired - readyPods, 1)} unavailable replica(s)` };
  }

  if (emptyService) {
    return { severity: 'critical', reason: `Service ${emptyService.serviceName} has no endpoints` };
  }

  if (notReadyService) {
    return { severity: 'warning', reason: `Service ${notReadyService.serviceName} has ${notReadyService.notReady} not-ready endpoint(s)` };
  }

  if (warningReason) {
    return { severity: 'warning', reason: warningReason };
  }

  if (restarts > 0) {
    return { severity: 'warning', reason: `${restarts} container restart(s)` };
  }

  if (warningEvent && !isDeploymentCurrentlyHealthy(deployment, pods, endpointReadiness)) {
    return { severity: 'warning', reason: warningEvent.reason || 'Recent Kubernetes warning event' };
  }

  if (desired === 0) {
    return { severity: 'healthy', reason: 'Deployment scaled to zero' };
  }

  return { severity: 'healthy', reason: 'All desired replicas ready' };
}

function getPodStatus(item: any, containers: any[]): string {
  const waiting = containers.find((container: any) => container.state?.waiting?.reason);
  if (waiting) return waiting.state.waiting.reason;

  const terminated = containers.find((container: any) => container.state?.terminated?.reason);
  if (terminated) return terminated.state.terminated.reason;

  const lastTerminated = containers.find((container: any) => container.lastState?.terminated?.reason);
  if (lastTerminated && item.status?.phase !== 'Running') {
    return lastTerminated.lastState.terminated.reason;
  }

  return item.status?.phase ?? 'Unknown';
}

function getContainerState(container: any): string {
  if (container.state?.waiting) return 'waiting';
  if (container.state?.terminated) return 'terminated';
  if (container.state?.running) return 'running';
  return 'unknown';
}

function getContainerReason(container: any): string | undefined {
  return container.state?.waiting?.reason
    ?? container.state?.terminated?.reason
    ?? container.lastState?.terminated?.reason;
}

function latestDeploymentUpdate(item: any): string {
  const conditionTimes = (item.status?.conditions ?? [])
    .flatMap((condition: any) => [condition.lastUpdateTime, condition.lastTransitionTime])
    .filter(Boolean)
    .sort((a: string, b: string) => timestampMillis(b) - timestampMillis(a));
  return conditionTimes[0] ?? item.metadata.creationTimestamp ?? '';
}

function eventMatchesDeployment(event: KubeEvent, deploymentName: string, podNames: Set<string>): boolean {
  const object = event.involvedObject;
  if (!object) return false;
  if (object.kind === 'Deployment' && object.name === deploymentName) return true;
  if (object.kind === 'ReplicaSet' && object.name.startsWith(`${deploymentName}-`)) return true;
  if (object.kind === 'Pod' && podNames.has(object.name)) return true;
  return false;
}

function selectorMatches(labels: Record<string, string>, selector: Record<string, string>): boolean {
  const entries = Object.entries(selector);
  if (entries.length === 0) return false;
  return entries.every(([key, value]) => labels[key] === value);
}

function isCriticalReason(reason: string): boolean {
  return [
    'CrashLoopBackOff',
    'CreateContainerConfigError',
    'CreateContainerError',
    'ErrImagePull',
    'ImagePullBackOff',
    'InvalidImageName',
    'OOMKilled',
    'RunContainerError',
    'Unschedulable',
  ].includes(reason);
}

function isWarningReason(reason: string): boolean {
  return [
    'ContainerCreating',
    'Error',
    'Failed',
    'Pending',
    'ProbeError',
    'Unhealthy',
  ].includes(reason);
}

function timestampMillis(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(password|passwd|pwd|token|secret|api[_-]?key|client[_-]?secret|authorization)(\s*[:=]\s*)(["']?)[^\s"',;]+/gi, '$1$2$3[REDACTED]')
    .replace(/\b(AccountKey=)[^;\s]+/gi, '$1[REDACTED]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s]+@/gi, '$1[REDACTED]@');
}
