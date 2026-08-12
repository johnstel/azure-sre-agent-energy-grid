import assert from 'node:assert/strict';
import test from 'node:test';
import type { InventoryResponse, Scenario } from '../types/index.js';
import {
  CustomerImpactService,
  deduplicateSyntheticTransactions,
  deriveCustomerImpactStatus,
  detectScenarioImpact,
  telemetryFromRows,
} from './CustomerImpactService.js';
import { buildSloMeterIngestKql } from './LogAnalyticsQueryService.js';

const NOW = new Date('2026-08-12T16:00:00.000Z');
const SOURCE = 'Azure Monitor Log Analytics AppRequests';

test('healthy requires fresh, successful AppRequests telemetry and Kubernetes evidence', () => {
  const inputTelemetry = telemetry({ successRatePct: 100, p95LatencyMs: 1000, lastSuccess: '2026-08-12T15:59:00.000Z' });
  assert.equal(deriveCustomerImpactStatus({ telemetry: inputTelemetry, kubernetesDataStatus: 'available', now: NOW }), 'healthy');
});

test('MongoDBDown is critical from marked unavailable MongoDB evidence', () => {
  const inventory = inventoryWith({ mongoDown: true });
  const impact = detectScenarioImpact(inventory, scenarios('mongodb-down'));
  assert.equal(impact?.kind, 'MongoDBDown');
  assert.equal(deriveCustomerImpactStatus({
    telemetry: unavailableTelemetry(),
    scenarioImpact: impact,
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'critical');
});

test('ServiceMismatch is critical while meter-service pods are ready', () => {
  const impact = detectScenarioImpact(inventoryWith({ serviceMismatch: true }), scenarios('service-mismatch'));
  assert.equal(impact?.kind, 'ServiceMismatch');
  assert.equal(deriveCustomerImpactStatus({
    telemetry: telemetry(),
    scenarioImpact: impact,
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'critical');
});

test('ingress-stage actual all-failure telemetry is critical', () => {
  assert.equal(deriveCustomerImpactStatus({
    telemetry: telemetry({ successCount: 0, failureCount: 4, successRatePct: 0, lastSuccess: undefined, failureStages: ['ingress'] }),
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'critical');
});

test('a critical failure stage remains critical until a newer successful transaction exists', () => {
  const now = new Date('2026-08-12T16:02:00.000Z');
  const afterFailure = telemetry({
    runCount: 20,
    successCount: 19,
    failureCount: 1,
    successRatePct: 95,
    lastSuccess: '2026-08-12T16:00:00.000Z',
    latestCriticalFailure: '2026-08-12T16:01:00.000Z',
    failureStages: ['ingress'],
  });
  assert.equal(deriveCustomerImpactStatus({
    telemetry: afterFailure,
    kubernetesDataStatus: 'available',
    now,
  }), 'critical');

  assert.equal(deriveCustomerImpactStatus({
    telemetry: {
      ...afterFailure,
      lastSuccess: '2026-08-12T16:01:30.000Z',
    },
    kubernetesDataStatus: 'available',
    now,
  }), 'healthy');
});

test('high p95 with actual successes is degraded', () => {
  assert.equal(deriveCustomerImpactStatus({
    telemetry: telemetry({ p95LatencyMs: 30_001 }),
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'degraded');
});

test('repeat correlation IDs do not inflate logical failure count', () => {
  const transactions = deduplicateSyntheticTransactions([
    { correlationId: 'same-run', success: false, durationMs: 100, timeGenerated: '2026-08-12T15:58:00.000Z', failureStage: 'ingress' },
    { correlationId: 'same-run', success: true, durationMs: 200, timeGenerated: '2026-08-12T15:59:00.000Z' },
    { correlationId: 'failed-run', success: false, durationMs: 300, timeGenerated: '2026-08-12T15:59:30.000Z', failureStage: 'mongodb' },
  ]);
  assert.equal(transactions.length, 2);
  assert.equal(transactions.filter((transaction) => !transaction.success).length, 1);
  assert.match(buildSloMeterIngestKql(15), /LogicalSuccess=max\(RequestSuccess\).*by CorrelationId/s);
});

test('stale or missing last success is critical when actual runs exist', () => {
  assert.equal(deriveCustomerImpactStatus({
    telemetry: telemetry({ lastSuccess: '2026-08-12T15:54:59.000Z' }),
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'critical');
  assert.equal(deriveCustomerImpactStatus({
    telemetry: telemetry({ lastSuccess: undefined }),
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'critical');
});

test('no data and unavailable queries stay distinct and cannot become green', () => {
  assert.equal(deriveCustomerImpactStatus({
    telemetry: { dataStatus: 'no-data', source: SOURCE },
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'no-data');
  assert.equal(deriveCustomerImpactStatus({
    telemetry: unavailableTelemetry(),
    kubernetesDataStatus: 'available',
    now: NOW,
  }), 'unknown');
});

test('recovery requires a successful transaction after persisted failure evidence', async () => {
  let currentNow = new Date('2026-08-12T16:00:00.000Z');
  let activeScenarios = scenarios('mongodb-down');
  const resultRows = [
    queryRow('2026-08-12T15:59:00.000Z'),
    queryRow('2026-08-12T15:59:00.000Z', '2026-08-12T16:00:00.000Z'),
    queryRow('2026-08-12T16:02:00.000Z', '2026-08-12T16:00:00.000Z'),
  ];
  const service = new CustomerImpactService({
    logAnalytics: {
      executeSloMeterIngest: async () => {
        const row = resultRows.shift();
        return { rows: row ? [row] : [], source: SOURCE, workspace: 'workspace' };
      },
    },
    kube: { getInventory: async () => inventoryWith({ mongoDown: activeScenarios.length > 0 }) },
    scenarios: () => activeScenarios,
    now: () => currentNow,
    cacheTtlMs: 0,
  });

  const duringImpact = await service.getCustomerImpact();
  assert.equal(duringImpact.status, 'critical');
  activeScenarios = [];
  currentNow = new Date('2026-08-12T16:01:00.000Z');
  const onlyOldSuccess = await service.getCustomerImpact();
  assert.equal(onlyOldSuccess.status, 'critical');
  currentNow = new Date('2026-08-12T16:03:00.000Z');
  const subsequentSuccess = await service.getCustomerImpact();
  assert.equal(subsequentSuccess.status, 'healthy');
});

test('query rows with zero runs produce no-data without fabricated values', () => {
  assert.deepEqual(telemetryFromRows([{ runCount: 0, successCount: 0 }], SOURCE, NOW), {
    dataStatus: 'no-data',
    source: SOURCE,
  });
});

test('customer impact caches the read-only aggregate to avoid repeated Azure CLI queries', async () => {
  let currentNow = new Date('2026-08-12T16:00:00.000Z');
  let queryCalls = 0;
  let inventoryCalls = 0;
  const service = new CustomerImpactService({
    logAnalytics: {
      executeSloMeterIngest: async () => {
        queryCalls += 1;
        return { rows: [queryRow('2026-08-12T15:59:00.000Z')], source: SOURCE, workspace: 'workspace' };
      },
    },
    kube: {
      getInventory: async () => {
        inventoryCalls += 1;
        return inventoryWith({});
      },
    },
    scenarios: () => [],
    now: () => currentNow,
    cacheTtlMs: 60_000,
  });

  await service.getCustomerImpact();
  await service.getCustomerImpact();
  assert.equal(queryCalls, 1);
  assert.equal(inventoryCalls, 1);

  currentNow = new Date('2026-08-12T16:01:01.000Z');
  await service.getCustomerImpact();
  assert.equal(queryCalls, 2);
  assert.equal(inventoryCalls, 2);
});

function telemetry(overrides: Partial<ReturnType<typeof telemetryFromRows>> = {}) {
  return {
    dataStatus: 'available' as const,
    source: SOURCE,
    runCount: 4,
    successCount: 4,
    failureCount: 0,
    successRatePct: 100,
    p95LatencyMs: 1_000,
    lastSuccess: '2026-08-12T15:59:00.000Z',
    ...overrides,
  };
}

function unavailableTelemetry() {
  return { dataStatus: 'unavailable' as const, source: `${SOURCE} unavailable` };
}

function queryRow(lastSuccess: string, latestCriticalFailure?: string) {
  return {
    runCount: 1,
    successCount: 1,
    failureCount: 0,
    successRatePct: 100,
    p95LatencyMs: 1_000,
    lastSuccess,
    ...(latestCriticalFailure ? { latestCriticalFailure } : {}),
  };
}

function scenarios(...names: string[]): Scenario[] {
  return names.map((name) => ({ name, file: `${name}.yaml`, description: name, enabled: true }));
}

function inventoryWith(options: { mongoDown?: boolean; serviceMismatch?: boolean }): InventoryResponse {
  const mongoDown = options.mongoDown ?? false;
  const serviceMismatch = options.serviceMismatch ?? false;
  const meterService = {
    name: 'meter-service',
    namespace: 'energy',
    type: 'ClusterIP',
    clusterIP: '10.0.0.1',
    ports: '3000/TCP',
    selector: { app: serviceMismatch ? 'meter-service-v2' : 'meter-service' },
    ...(serviceMismatch ? { labels: { scenario: 'service-mismatch' } } : {}),
  };
  return {
    namespace: 'energy',
    updatedAt: NOW.toISOString(),
    deployments: [
      {
        name: 'mongodb',
        namespace: 'energy',
        desiredReplicas: mongoDown ? 0 : 1,
        readyPods: mongoDown ? 0 : 1,
        runningPods: mongoDown ? 0 : 1,
        replicas: mongoDown ? 0 : 1,
        updatedReplicas: mongoDown ? 0 : 1,
        availableReplicas: mongoDown ? 0 : 1,
        severity: mongoDown ? 'critical' : 'healthy',
        status: mongoDown ? 'critical' : 'healthy',
        reason: '',
        restarts: 0,
        age: '',
        updatedAt: '',
        labels: mongoDown ? { scenario: 'mongodb-down', 'sre-demo': 'breakable' } : { app: 'mongodb' },
        annotations: mongoDown ? { 'sre.scenario': 'mongodb-down' } : {},
        selectorLabels: { app: 'mongodb' },
        pods: [],
        services: [],
        endpointReadiness: [],
        recentEvents: [],
      },
      {
        name: 'meter-service',
        namespace: 'energy',
        desiredReplicas: 1,
        readyPods: 1,
        runningPods: 1,
        replicas: 1,
        updatedReplicas: 1,
        availableReplicas: 1,
        severity: 'healthy',
        status: 'healthy',
        reason: '',
        restarts: 0,
        age: '',
        updatedAt: '',
        labels: { app: 'meter-service' },
        annotations: {},
        selectorLabels: { app: 'meter-service' },
        pods: [],
        services: [meterService],
        endpointReadiness: [{ serviceName: 'meter-service', ready: serviceMismatch ? 0 : 1, notReady: 0, total: serviceMismatch ? 0 : 1, addresses: [] }],
        recentEvents: [],
      },
    ],
    orphanPods: [],
    services: [meterService],
    events: [],
  };
}
