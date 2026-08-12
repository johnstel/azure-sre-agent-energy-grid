import type { CustomerImpactResponse, CustomerImpactStatus, InventoryResponse, Scenario } from '../types/index.js';
import { LogAnalyticsQueryService } from './LogAnalyticsQueryService.js';
import { KubeClient } from './KubeClient.js';
import { getScenarios } from './ScenarioService.js';

export const SLO_METER_INGEST_DEMO_THRESHOLDS = {
  successRatePct: 95,
  p95LatencyMs: 30_000,
  freshnessMs: 5 * 60_000,
  queryWindowMinutes: 10,
} as const;

// The wallboard refreshes every five seconds, while Azure CLI queries can take
// fifteen. Caching plus in-flight deduplication prevents overlapping queries.
export const CUSTOMER_IMPACT_CACHE_MS = 15_000;

export interface SyntheticTransaction {
  correlationId: string;
  success: boolean;
  durationMs?: number;
  timeGenerated: string;
  failureStage?: string;
}

export interface CustomerImpactTelemetry {
  dataStatus: 'available' | 'no-data' | 'unavailable';
  source: string;
  runCount?: number;
  successCount?: number;
  failureCount?: number;
  successRatePct?: number;
  p95LatencyMs?: number;
  lastSuccess?: string;
  lastSuccessAgeSeconds?: number;
  latestCriticalFailure?: string;
  failureStages?: string[];
  error?: string;
}

export interface ScenarioImpactEvidence {
  kind: 'MongoDBDown' | 'ServiceMismatch';
  evidence: string;
}

export interface CustomerImpactDependencies {
  logAnalytics: Pick<LogAnalyticsQueryService, 'executeSloMeterIngest'>;
  kube: Pick<KubeClient, 'getInventory'>;
  scenarios: () => Scenario[];
  now: () => Date;
  cacheTtlMs?: number;
}

const DEFAULT_DEPENDENCIES: CustomerImpactDependencies = {
  logAnalytics: new LogAnalyticsQueryService(),
  kube: new KubeClient(),
  scenarios: getScenarios,
  now: () => new Date(),
};

export class CustomerImpactService {
  private cachedResult?: { expiresAtMs: number; response: CustomerImpactResponse };
  private inFlight?: Promise<CustomerImpactResponse>;

  constructor(private readonly dependencies: CustomerImpactDependencies = DEFAULT_DEPENDENCIES) {}

  async getCustomerImpact(): Promise<CustomerImpactResponse> {
    const now = this.dependencies.now();
    if (this.cachedResult && now.getTime() < this.cachedResult.expiresAtMs) {
      return this.cachedResult.response;
    }
    if (this.inFlight) return this.inFlight;

    const request = this.collectCustomerImpact(now);
    this.inFlight = request;
    try {
      const response = await request;
      const cacheTtlMs = Math.max(0, this.dependencies.cacheTtlMs ?? CUSTOMER_IMPACT_CACHE_MS);
      if (cacheTtlMs > 0) {
        this.cachedResult = {
          expiresAtMs: now.getTime() + cacheTtlMs,
          response,
        };
      }
      return response;
    } finally {
      if (this.inFlight === request) this.inFlight = undefined;
    }
  }

  private async collectCustomerImpact(now: Date): Promise<CustomerImpactResponse> {
    const [telemetryResult, inventoryResult] = await Promise.allSettled([
      this.dependencies.logAnalytics.executeSloMeterIngest(SLO_METER_INGEST_DEMO_THRESHOLDS.queryWindowMinutes),
      this.dependencies.kube.getInventory(),
    ]);

    const telemetry = telemetryResult.status === 'fulfilled'
      ? telemetryFromRows(telemetryResult.value.rows, telemetryResult.value.source, now)
      : unavailableTelemetry(telemetryResult.reason);
    const scenarios = this.dependencies.scenarios();
    const scenarioImpact = inventoryResult.status === 'fulfilled'
      ? detectScenarioImpact(inventoryResult.value, scenarios)
      : undefined;
    const kubernetesDataStatus = inventoryResult.status === 'fulfilled' ? 'available' : 'unavailable';

    const status = deriveCustomerImpactStatus({
      telemetry,
      scenarioImpact,
      kubernetesDataStatus,
      now,
    });

    return {
      journey: 'Smart meter ingestion',
      status,
      telemetry,
      kubernetesDataStatus,
      evidenceSources: [
        telemetry.source,
        inventoryResult.status === 'fulfilled'
          ? 'Kubernetes inventory (read-only)'
          : 'Kubernetes inventory unavailable',
      ],
      affectedStage: affectedStage(telemetry, scenarioImpact),
      recoveryCondition: recoveryCondition(status, telemetry, scenarioImpact),
      ...(scenarioImpact ? { scenarioImpact } : {}),
      collectedAt: now.toISOString(),
    };
  }
}

export function deriveCustomerImpactStatus(input: {
  telemetry: CustomerImpactTelemetry;
  scenarioImpact?: ScenarioImpactEvidence;
  kubernetesDataStatus: 'available' | 'unavailable';
  now: Date;
}): CustomerImpactStatus {
  const { telemetry, scenarioImpact, kubernetesDataStatus, now } = input;

  if (scenarioImpact) return 'critical';
  if (telemetry.dataStatus === 'unavailable') return 'unknown';
  if (telemetry.dataStatus === 'no-data') return 'no-data';
  if (!hasActualTelemetry(telemetry)) return 'no-data';

  if (telemetry.failureCount === telemetry.runCount || telemetry.successCount === 0) return 'critical';
  if (!telemetry.lastSuccess || !isFresh(telemetry.lastSuccess, now)) return 'critical';
  if (requiresFunctionalRecovery(telemetry)) return 'critical';
  if (kubernetesDataStatus === 'unavailable') return 'unknown';
  if (
    telemetry.successRatePct === undefined
    || telemetry.p95LatencyMs === undefined
    || telemetry.successRatePct < SLO_METER_INGEST_DEMO_THRESHOLDS.successRatePct
    || telemetry.p95LatencyMs > SLO_METER_INGEST_DEMO_THRESHOLDS.p95LatencyMs
  ) {
    return 'degraded';
  }
  return 'healthy';
}

export function telemetryFromRows(rows: Record<string, unknown>[], source: string, now: Date): CustomerImpactTelemetry {
  const row = rows[0];
  const runCount = numberValue(row?.runCount);
  if (!row || runCount === undefined || runCount <= 0) {
    return { dataStatus: 'no-data', source };
  }

  const lastSuccess = isoDateValue(row.lastSuccess);
  const successCount = numberValue(row.successCount);
  const failureCount = numberValue(row.failureCount);
  if (successCount === undefined || failureCount === undefined) {
    return {
      dataStatus: 'unavailable',
      source,
      error: 'Log Analytics returned incomplete synthetic transaction aggregates.',
    };
  }
  const telemetry: CustomerImpactTelemetry = {
    dataStatus: 'available',
    source,
    runCount,
    successCount,
    failureCount,
    successRatePct: numberValue(row.successRatePct),
    p95LatencyMs: numberValue(row.p95LatencyMs),
    lastSuccess,
    latestCriticalFailure: isoDateValue(row.latestCriticalFailure),
    failureStages: stringArray(row.failureStages),
  };
  if (lastSuccess) {
    telemetry.lastSuccessAgeSeconds = Math.max(0, Math.floor((now.getTime() - new Date(lastSuccess).getTime()) / 1000));
  }
  return omitUndefined(telemetry);
}

export function deduplicateSyntheticTransactions(transactions: SyntheticTransaction[]): SyntheticTransaction[] {
  const grouped = new Map<string, SyntheticTransaction[]>();
  for (const transaction of transactions) {
    grouped.set(transaction.correlationId, [...(grouped.get(transaction.correlationId) ?? []), transaction]);
  }

  return [...grouped.values()].map((attempts) => {
    const latest = attempts.reduce((latestAttempt, attempt) =>
      new Date(attempt.timeGenerated).getTime() > new Date(latestAttempt.timeGenerated).getTime() ? attempt : latestAttempt);
    const successfulAttempt = attempts
      .filter((attempt) => attempt.success)
      .sort((a, b) => new Date(b.timeGenerated).getTime() - new Date(a.timeGenerated).getTime())[0];
    return {
      ...latest,
      success: Boolean(successfulAttempt),
      ...(successfulAttempt ? { timeGenerated: successfulAttempt.timeGenerated } : {}),
      durationMs: Math.max(...attempts.map((attempt) => attempt.durationMs ?? 0)),
    };
  });
}

export function detectScenarioImpact(inventory: InventoryResponse, scenarios: Scenario[]): ScenarioImpactEvidence | undefined {
  const mongo = inventory.deployments.find((deployment) => deployment.name === 'mongodb');
  const meter = inventory.deployments.find((deployment) => deployment.name === 'meter-service');
  const activeScenarioNames = new Set(scenarios.filter((scenario) => scenario.enabled).map((scenario) => scenario.name));
  const mongoScenario = hasScenarioMarker(mongo, 'mongodb-down') || activeScenarioNames.has('mongodb-down');
  const mongoUnavailable = mongo !== undefined
    && (mongo.desiredReplicas === 0 || mongo.readyPods === 0 || mongo.availableReplicas === 0);
  if (mongoScenario && mongoUnavailable) {
    return { kind: 'MongoDBDown', evidence: 'MongoDB is marked for the mongodb-down scenario and has no available database replica.' };
  }

  const meterService = meter?.services.find((service) => service.name === 'meter-service')
    ?? inventory.services.find((service) => service.name === 'meter-service');
  const meterEndpoints = meter?.endpointReadiness.find((endpoint) => endpoint.serviceName === 'meter-service');
  const meterPodsReady = (meter?.readyPods ?? 0) > 0 && (meter?.runningPods ?? 0) > 0;
  const selectorMismatch = meterService !== undefined && meter?.selectorLabels !== undefined
    && Object.entries(meterService.selector ?? {}).some(([key, value]) => meter.selectorLabels?.[key] !== value);
  const mismatchScenario = hasScenarioMarker(meter, 'service-mismatch')
    || hasScenarioMarker(meterService, 'service-mismatch')
    || activeScenarioNames.has('service-mismatch');
  if (meterPodsReady && (meterEndpoints?.ready === 0 || selectorMismatch) && mismatchScenario) {
    return { kind: 'ServiceMismatch', evidence: 'Meter-service pods are ready but its service has no ready endpoints or a mismatched selector.' };
  }
  return undefined;
}

function unavailableTelemetry(reason: unknown): CustomerImpactTelemetry {
  const message = reason instanceof Error ? reason.message : String(reason);
  return {
    dataStatus: 'unavailable',
    source: 'Azure Monitor Log Analytics AppRequests unavailable',
    error: message,
  };
}

function hasActualTelemetry(telemetry: CustomerImpactTelemetry): telemetry is CustomerImpactTelemetry & Required<Pick<CustomerImpactTelemetry, 'runCount' | 'successCount' | 'failureCount'>> {
  return telemetry.runCount !== undefined && telemetry.runCount > 0
    && telemetry.successCount !== undefined && telemetry.failureCount !== undefined;
}

function isFresh(lastSuccess: string, now: Date): boolean {
  const timestamp = new Date(lastSuccess).getTime();
  return Number.isFinite(timestamp) && now.getTime() - timestamp <= SLO_METER_INGEST_DEMO_THRESHOLDS.freshnessMs;
}

function requiresFunctionalRecovery(telemetry: CustomerImpactTelemetry): boolean {
  if (!telemetry.latestCriticalFailure) return false;
  if (!telemetry.lastSuccess) return true;
  return new Date(telemetry.lastSuccess).getTime() <= new Date(telemetry.latestCriticalFailure).getTime();
}

function affectedStage(telemetry: CustomerImpactTelemetry, scenarioImpact?: ScenarioImpactEvidence): string {
  if (scenarioImpact?.kind === 'MongoDBDown') return 'Meter ingestion dependency: MongoDB';
  if (scenarioImpact?.kind === 'ServiceMismatch') return 'Meter-service routing';
  if (telemetry.failureStages?.[0]) return telemetry.failureStages[0];
  return 'Synthetic meter ingestion transaction';
}

function recoveryCondition(
  status: CustomerImpactStatus,
  telemetry: CustomerImpactTelemetry,
  scenarioImpact: ScenarioImpactEvidence | undefined,
): string {
  if (scenarioImpact) return 'Restore the affected dependency or meter-service route, then record a successful synthetic meter-ingest transaction.';
  if (telemetry.dataStatus === 'unavailable') return 'Restore read-only Log Analytics access and record a successful synthetic meter-ingest transaction.';
  if (telemetry.dataStatus === 'no-data') return 'Record a successful synthetic meter-ingest transaction; no telemetry is available for this window.';
  if (status === 'critical' || status === 'degraded') {
    if (requiresFunctionalRecovery(telemetry)) return 'Record a successful synthetic meter-ingest transaction after the latest critical failure, within the freshness window.';
    return 'Record fresh successful synthetic meter-ingest transactions meeting the demo SLO.';
  }
  return 'Continue recording fresh successful synthetic meter-ingest transactions.';
}

function hasScenarioMarker(value: { labels?: Record<string, string>; annotations?: Record<string, string> } | undefined, scenario: string): boolean {
  return value?.labels?.scenario === scenario || value?.annotations?.['sre.scenario'] === scenario;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function isoDateValue(value: unknown): string | undefined {
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) return undefined;
  return value;
}

function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return strings.length > 0 ? strings : undefined;
  }
  return undefined;
}

function omitUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
