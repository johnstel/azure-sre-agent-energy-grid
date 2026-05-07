import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDeployment, isServiceRelatedToDeployment } from './KubeClient.js';
import type { Deployment, InventoryPodSummary, KubeEvent, Pod, Service, ServiceEndpointSummary } from '../types/index.js';

const noPods: InventoryPodSummary[] = [];
const noEvents: KubeEvent[] = [];

test('Kube inventory marks scenario deployment scaled to zero as critical', () => {
  const result = classifyDeployment(
    deployment({ desiredReplicas: 0, labels: { scenario: 'mongodb-down', 'sre-demo': 'breakable' } }),
    noPods,
    [endpoint('mongodb', 0, 0)],
    noEvents,
  );

  assert.equal(result.severity, 'critical');
  assert.equal(result.reason, 'Scenario mongodb-down scaled deployment to zero; service mongodb has no endpoints');
});

test('Kube inventory keeps non-scenario deployment scaled to zero healthy', () => {
  const result = classifyDeployment(deployment({ desiredReplicas: 0 }), noPods, [endpoint('optional-worker', 0, 0)], noEvents);

  assert.deepEqual(result, { severity: 'healthy', reason: 'Deployment scaled to zero' });
});

test('Kube inventory uses scenario annotations when labels are absent', () => {
  const result = classifyDeployment(
    deployment({ desiredReplicas: 0, annotations: { 'sre.scenario': 'annotated-outage' } }),
    noPods,
    [],
    noEvents,
  );

  assert.equal(result.severity, 'critical');
  assert.equal(result.reason, 'Scenario annotated-outage scaled deployment to zero');
});

test('Kube inventory relates same-name service even when selector is mismatched', () => {
  assert.equal(
    isServiceRelatedToDeployment(
      service({ name: 'meter-service', selector: { app: 'meter-service-v2' } }),
      deployment({ name: 'meter-service', labels: { app: 'meter-service' }, selectorLabels: { app: 'meter-service' } }),
      [pod({ labels: { app: 'meter-service' } })],
    ),
    true,
  );
});

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    name: 'mongodb',
    namespace: 'energy',
    desiredReplicas: 1,
    readyReplicas: 1,
    replicas: 1,
    updatedReplicas: 1,
    availableReplicas: 1,
    labels: {},
    annotations: {},
    selectorLabels: { app: 'mongodb' },
    age: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function endpoint(serviceName: string, ready: number, notReady: number): ServiceEndpointSummary {
  return {
    serviceName,
    ready,
    notReady,
    total: ready + notReady,
    addresses: [],
  };
}

function service(overrides: Partial<Service> = {}): Service {
  return {
    name: 'meter-service',
    namespace: 'energy',
    type: 'ClusterIP',
    clusterIP: '10.1.0.1',
    ports: '3000/TCP',
    selector: { app: 'meter-service' },
    ...overrides,
  };
}

function pod(overrides: Partial<Pod> = {}): Pod {
  return {
    name: 'meter-service-abc',
    namespace: 'energy',
    status: 'Running',
    ready: true,
    restarts: 0,
    age: '2026-01-01T00:00:00Z',
    labels: { app: 'meter-service' },
    phase: 'Running',
    ...overrides,
  };
}
