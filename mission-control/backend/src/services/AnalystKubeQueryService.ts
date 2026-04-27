import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AnalystAksQueryName,
  AnalystAksQueryResponse,
  AnalystDeploymentReplicaState,
  AnalystNodeAllocationSummary,
  AnalystPodContainerResources,
  AnalystPodResourceState,
  AnalystServiceEndpointsHealth,
  KubeEvent,
  KubernetesResourceList,
  ServicePort,
} from '../types/index.js';
import { KubeClientError, KubeInputError } from './KubeClient.js';

const exec = promisify(execFile);
const ENERGY_NAMESPACE = 'energy' as const;
const KUBECTL_TIMEOUT_MS = 15_000;

export const ALLOWED_AKS_ANALYST_QUERIES = [
  'pod-resources',
  'node-capacity',
  'deployment-replicas',
  'namespace-events',
  'service-endpoints-health',
] as const satisfies readonly AnalystAksQueryName[];

type KubectlExecutor = (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

export class AnalystKubeQueryService {
  constructor(private readonly executor: KubectlExecutor = execKubectl) {}

  async execute(queryName: string): Promise<AnalystAksQueryResponse> {
    assertAllowedAksQuery(queryName);

    const collectedAt = new Date().toISOString();
    const data = await this.collect(queryName);

    return {
      queryName,
      namespace: ENERGY_NAMESPACE,
      metadata: {
        source: `kubectl get (read-only) against namespace '${ENERGY_NAMESPACE}'`,
        collectedAt,
        limitations: [
          'Point-in-time Kubernetes API read; no watches, exec, logs, secrets, or remediation verbs are used.',
          'Data is scoped to the energy namespace except node capacity, which is cluster-level capacity needed to interpret energy pod allocation.',
          'Confidence describes observation completeness, not root cause or remediation certainty.',
        ],
        confidence: data.length > 0 ? 'medium' : 'none',
        status: 'complete',
        allowedVerb: 'get',
        allowlist: [...ALLOWED_AKS_ANALYST_QUERIES],
      },
      data,
    };
  }

  private async collect(queryName: AnalystAksQueryName): Promise<AnalystAksQueryResponse['data']> {
    switch (queryName) {
      case 'pod-resources':
        return this.getPodResources();
      case 'node-capacity':
        return this.getNodeCapacity();
      case 'deployment-replicas':
        return this.getDeploymentReplicas();
      case 'namespace-events':
        return this.getNamespaceEvents();
      case 'service-endpoints-health':
        return this.getServiceEndpointHealth();
      default:
        return assertNever(queryName);
    }
  }

  private async getPodResources(): Promise<AnalystPodResourceState[]> {
    const pods = await this.kubectlJson(['get', 'pods', '-n', ENERGY_NAMESPACE, '-o', 'json']);
    return (pods.items ?? []).map(toPodResourceState);
  }

  private async getNodeCapacity(): Promise<AnalystNodeAllocationSummary[]> {
    const [nodes, pods] = await Promise.all([
      this.kubectlJson(['get', 'nodes', '-o', 'json']),
      this.kubectlJson(['get', 'pods', '-n', ENERGY_NAMESPACE, '-o', 'json']),
    ]);

    const allocatedByNode = new Map<string, { requested: KubernetesResourceList; limited: KubernetesResourceList; podCount: number }>();
    for (const pod of pods.items ?? []) {
      const nodeName = pod.spec?.nodeName;
      if (!nodeName) continue;

      const current = allocatedByNode.get(nodeName) ?? { requested: {}, limited: {}, podCount: 0 };
      current.podCount += 1;
      for (const container of pod.spec?.containers ?? []) {
        addResources(current.requested, toResourceList(container.resources?.requests));
        addResources(current.limited, toResourceList(container.resources?.limits));
      }
      allocatedByNode.set(nodeName, current);
    }

    return (nodes.items ?? []).map((node: any) => {
      const allocated = allocatedByNode.get(node.metadata?.name) ?? { requested: {}, limited: {}, podCount: 0 };
      return {
        name: node.metadata?.name ?? '',
        capacity: toResourceList(node.status?.capacity),
        allocatable: toResourceList(node.status?.allocatable),
        requested: allocated.requested,
        limited: allocated.limited,
        podCount: allocated.podCount,
        conditions: (node.status?.conditions ?? []).map((condition: any) => ({
          type: condition.type ?? '',
          status: condition.status ?? '',
          reason: condition.reason,
          lastTransitionTime: condition.lastTransitionTime,
        })),
      } satisfies AnalystNodeAllocationSummary;
    });
  }

  private async getDeploymentReplicas(): Promise<AnalystDeploymentReplicaState[]> {
    const deployments = await this.kubectlJson(['get', 'deployments', '-n', ENERGY_NAMESPACE, '-o', 'json']);
    return (deployments.items ?? []).map((deployment: any) => {
      const desiredReplicas = deployment.spec?.replicas ?? 1;
      return {
        name: deployment.metadata?.name ?? '',
        namespace: ENERGY_NAMESPACE,
        desiredReplicas,
        readyReplicas: deployment.status?.readyReplicas ?? 0,
        updatedReplicas: deployment.status?.updatedReplicas ?? 0,
        availableReplicas: deployment.status?.availableReplicas ?? 0,
        observedGeneration: deployment.status?.observedGeneration,
        conditions: (deployment.status?.conditions ?? []).map((condition: any) => ({
          type: condition.type ?? '',
          status: condition.status ?? '',
          reason: condition.reason,
          message: redactSensitiveText(condition.message ?? ''),
          lastUpdateTime: condition.lastUpdateTime,
          lastTransitionTime: condition.lastTransitionTime,
        })),
      } satisfies AnalystDeploymentReplicaState;
    });
  }

  private async getNamespaceEvents(): Promise<KubeEvent[]> {
    const events = await this.kubectlJson(['get', 'events', '-n', ENERGY_NAMESPACE, '-o', 'json']);
    return (events.items ?? [])
      .map(toKubeEvent)
      .sort((a: KubeEvent, b: KubeEvent) => timestampMillis(b.timestamp) - timestampMillis(a.timestamp))
      .slice(0, 50);
  }

  private async getServiceEndpointHealth(): Promise<AnalystServiceEndpointsHealth[]> {
    const [services, endpoints, pods] = await Promise.all([
      this.kubectlJson(['get', 'services', '-n', ENERGY_NAMESPACE, '-o', 'json']),
      this.kubectlJson(['get', 'endpoints', '-n', ENERGY_NAMESPACE, '-o', 'json']),
      this.kubectlJson(['get', 'pods', '-n', ENERGY_NAMESPACE, '-o', 'json']),
    ]);

    const endpointCounts = new Map<string, { ready: number; notReady: number; total: number }>();
    for (const endpoint of endpoints.items ?? []) {
      let ready = 0;
      let notReady = 0;
      for (const subset of endpoint.subsets ?? []) {
        ready += (subset.addresses ?? []).length;
        notReady += (subset.notReadyAddresses ?? []).length;
      }
      endpointCounts.set(endpoint.metadata?.name ?? '', { ready, notReady, total: ready + notReady });
    }

    return (services.items ?? []).map((service: any) => {
      const selector = service.spec?.selector ?? {};
      const counts = endpointCounts.get(service.metadata?.name) ?? { ready: 0, notReady: 0, total: 0 };
      const matchingPods = (pods.items ?? []).filter((pod: any) => selectorMatches(pod.metadata?.labels ?? {}, selector)).length;
      return {
        serviceName: service.metadata?.name ?? '',
        namespace: ENERGY_NAMESPACE,
        type: service.spec?.type ?? 'ClusterIP',
        selector,
        readyEndpoints: counts.ready,
        notReadyEndpoints: counts.notReady,
        totalEndpoints: counts.total,
        matchingPods,
        ports: (service.spec?.ports ?? []).map(toServicePort),
      } satisfies AnalystServiceEndpointsHealth;
    });
  }

  private async kubectlJson(args: string[]): Promise<any> {
    assertReadOnlyKubectlArgs(args);
    const { stdout } = await this.executor(args, KUBECTL_TIMEOUT_MS);
    try {
      return JSON.parse(stdout);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new KubeClientError(`kubectl returned invalid JSON for analyst query: ${message}`, 502);
    }
  }
}

export function assertAllowedAksQuery(queryName: string): asserts queryName is AnalystAksQueryName {
  if (!ALLOWED_AKS_ANALYST_QUERIES.includes(queryName as AnalystAksQueryName)) {
    throw new KubeInputError(`AKS analyst query '${queryName}' is not allowlisted.`);
  }
}

export function assertReadOnlyKubectlArgs(args: string[]): void {
  const [verb] = args;
  const resource = args[1];
  const denied = ['apply', 'create', 'delete', 'edit', 'exec', 'patch', 'replace', 'rollout', 'run', 'scale', 'set', 'cordon', 'drain', 'taint', 'label', 'annotate', 'port-forward', 'cp'];

  if (verb !== 'get' || denied.includes(verb) || resource === 'secrets' || resource === 'secret') {
    throw new KubeInputError('Analyst Kubernetes access is read-only and fail-closed to allowlisted kubectl get queries.');
  }
}

async function execKubectl(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec('kubectl', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      throw new KubeClientError('kubectl is unavailable on PATH. Analyst AKS queries are unavailable.', 503);
    }
    const stderr = isExecError(err) ? err.stderr?.trim() : undefined;
    const stdout = isExecError(err) ? err.stdout?.trim() : undefined;
    const detail = stderr || stdout || (err instanceof Error ? err.message : String(err));
    throw new KubeClientError(`kubectl analyst query failed: ${redactSensitiveText(detail)}`, 503);
  }
}

function toPodResourceState(item: any): AnalystPodResourceState {
  const containerStatuses = item.status?.containerStatuses ?? [];
  const containers = (item.spec?.containers ?? []).map((container: any) => toContainerResources(container, containerStatuses));
  const totalCount = containers.length;
  const readyCount = containerStatuses.filter((container: any) => container.ready).length;

  return {
    name: item.metadata?.name ?? '',
    namespace: ENERGY_NAMESPACE,
    phase: item.status?.phase ?? 'Unknown',
    status: getPodStatus(item, containerStatuses),
    ready: totalCount > 0 && readyCount === totalCount,
    nodeName: item.spec?.nodeName,
    startTime: item.status?.startTime,
    labels: item.metadata?.labels ?? {},
    requests: sumContainerResources(containers, 'requests'),
    limits: sumContainerResources(containers, 'limits'),
    containers,
  };
}

function toContainerResources(container: any, statuses: any[]): AnalystPodContainerResources {
  const status = statuses.find((candidate: any) => candidate.name === container.name);
  return {
    name: container.name ?? '',
    ready: Boolean(status?.ready),
    restartCount: status?.restartCount ?? 0,
    state: getContainerState(status ?? {}),
    reason: getContainerReason(status ?? {}),
    requests: toResourceList(container.resources?.requests),
    limits: toResourceList(container.resources?.limits),
  };
}

function toResourceList(raw: any): KubernetesResourceList {
  return {
    cpuMillicores: parseCpuMillicores(raw?.cpu),
    memoryBytes: parseMemoryBytes(raw?.memory),
  };
}

function sumContainerResources(
  containers: AnalystPodContainerResources[],
  field: 'requests' | 'limits',
): KubernetesResourceList {
  const result: KubernetesResourceList = {};
  for (const container of containers) {
    addResources(result, container[field]);
  }
  return result;
}

function addResources(target: KubernetesResourceList, source: KubernetesResourceList): void {
  target.cpuMillicores = (target.cpuMillicores ?? 0) + (source.cpuMillicores ?? 0);
  target.memoryBytes = (target.memoryBytes ?? 0) + (source.memoryBytes ?? 0);
}

export function parseCpuMillicores(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (trimmed.endsWith('m')) return parseFiniteNumber(trimmed.slice(0, -1));
  const cores = parseFiniteNumber(trimmed);
  return cores === undefined ? undefined : Math.round(cores * 1000);
}

export function parseMemoryBytes(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)(Ei|Pi|Ti|Gi|Mi|Ki|E|P|T|G|M|K)?$/);
  if (!match) return undefined;

  const number = parseFiniteNumber(match[1]);
  if (number === undefined) return undefined;

  const suffix = match[2] ?? '';
  const multipliers: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
    '': 1,
  };
  return Math.round(number * multipliers[suffix]);
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getPodStatus(item: any, containers: any[]): string {
  const waiting = containers.find((container: any) => container.state?.waiting?.reason);
  if (waiting) return waiting.state.waiting.reason;
  const terminated = containers.find((container: any) => container.state?.terminated?.reason);
  if (terminated) return terminated.state.terminated.reason;
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
  };
}

function toServicePort(port: any): ServicePort {
  return {
    name: port.name,
    port: port.port,
    targetPort: port.targetPort,
    nodePort: port.nodePort,
    protocol: port.protocol ?? 'TCP',
    appProtocol: port.appProtocol,
  };
}

function selectorMatches(labels: Record<string, string>, selector: Record<string, string>): boolean {
  const entries = Object.entries(selector);
  if (entries.length === 0) return false;
  return entries.every(([key, value]) => labels[key] === value);
}

function timestampMillis(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(password|passwd|pwd|token|secret|api[_-]?key|client[_-]?secret|authorization)(\s*[:=]\s*)(["']?)[^\s"',;]+/gi, '$1$2$3[REDACTED]');
}

function assertNever(value: never): never {
  throw new KubeInputError(`Unhandled AKS analyst query '${String(value)}'.`);
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function isExecError(err: unknown): err is Error & { stderr?: string; stdout?: string } {
  return typeof err === 'object' && err !== null;
}
