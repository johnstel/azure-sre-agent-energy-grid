/**
 * Tests for the structured verification probes (issue #80 §7).
 *
 * The contract these enforce: a probe never defaults to `pass`, always carries source/value/
 * timestamp/freshness/pointer, and reports missing or stale data honestly.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CustomerImpactResponse, InventoryResponse } from '../../types/index.js';
import {
  buildGoldenTransactionProbe,
  buildKubernetesReadinessProbe,
  buildServiceEndpointProbe,
  buildVerificationProbes,
  observeMitigationResourceState,
} from './mitigationProbes.js';
import { MITIGATION_TARGET, REQUIRED_VERIFICATION_PROBES } from './mitigationLifecycle.js';

const NOW = new Date('2026-05-01T12:00:00.000Z');
const FRESH = new Date(NOW.getTime() - 30_000).toISOString();
const OLD = new Date(NOW.getTime() - 3_600_000).toISOString();

function inventory(overrides: Partial<InventoryResponse['deployments'][number]> = {}, updatedAt = FRESH): InventoryResponse {
  return {
    namespace: 'energy',
    updatedAt,
    pods: [],
    orphanPods: [],
    services: [],
    events: [],
    deployments: [
      {
        name: MITIGATION_TARGET.name,
        namespace: MITIGATION_TARGET.namespace,
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
        age: '5m',
        updatedAt,
        labels: {},
        annotations: {},
        selectorLabels: {},
        pods: [],
        services: [],
        endpointReadiness: [{ serviceName: MITIGATION_TARGET.name, ready: 1, notReady: 0, total: 1, addresses: [] }],
        recentEvents: [],
        ...overrides,
      },
    ],
  } as InventoryResponse;
}

function impact(overrides: Partial<CustomerImpactResponse> = {}): CustomerImpactResponse {
  return {
    journey: 'meter-ingest',
    status: 'healthy',
    kubernetesDataStatus: 'available',
    evidenceSources: ['synthetic'],
    affectedStage: 'ingest',
    recoveryCondition: 'success rate restored',
    collectedAt: FRESH,
    telemetry: {
      dataStatus: 'available',
      source: 'synthetic meter ingest',
      runCount: 20,
      successCount: 20,
      failureCount: 0,
      successRatePct: 100,
      lastSuccess: FRESH,
      lastSuccessAgeSeconds: 30,
    },
    ...overrides,
  } as CustomerImpactResponse;
}

describe('kubernetes readiness probe', () => {
  it('passes only when ready and available replicas are both at least one', () => {
    const probe = buildKubernetesReadinessProbe(inventory(), NOW);
    assert.equal(probe.status, 'pass');
    assert.match(probe.observedValue, /readyReplicas=1/);
    assert.ok(probe.source && probe.observedAt && probe.evidencePointer && probe.threshold);
  });

  it('fails when the deployment reports zero ready replicas', () => {
    const probe = buildKubernetesReadinessProbe(inventory({ readyPods: 0, availableReplicas: 0, reason: 'ScaledToZero' }), NOW);
    assert.equal(probe.status, 'fail');
    assert.match(probe.detail ?? '', /ScaledToZero/);
  });

  it('reports no-data rather than pass when inventory is unavailable', () => {
    assert.equal(buildKubernetesReadinessProbe(undefined, NOW).status, 'no-data');
  });

  it('reports no-data when the target deployment is absent', () => {
    const empty = { ...inventory(), deployments: [] } as InventoryResponse;
    assert.equal(buildKubernetesReadinessProbe(empty, NOW).status, 'no-data');
  });

  it('downgrades an otherwise-passing probe to stale when the observation is old', () => {
    const probe = buildKubernetesReadinessProbe(inventory({}, OLD), NOW);
    assert.equal(probe.status, 'stale');
  });

  it('anchors freshness to the fresh inventory observation even when deployment conditions are stale', () => {
    const probe = buildKubernetesReadinessProbe(inventory({ updatedAt: OLD }, FRESH), NOW);
    assert.equal(probe.status, 'pass');
    assert.equal(probe.observedAt, FRESH);
    assert.equal(probe.freshnessSeconds, 30);
    assert.match(probe.detail ?? '', /last changed at/i);
  });

  it('keeps stale inventory blocked even when the deployment condition is fresh', () => {
    const probe = buildKubernetesReadinessProbe(inventory({ updatedAt: FRESH }, OLD), NOW);
    assert.equal(probe.status, 'stale');
    assert.equal(probe.observedAt, OLD);
  });
});

describe('service endpoint probe', () => {
  it('passes with at least one ready endpoint', () => {
    assert.equal(buildServiceEndpointProbe(inventory(), NOW).status, 'pass');
  });

  it('anchors endpoint freshness to the fresh inventory observation even when Deployment conditions are stale', () => {
    const probe = buildServiceEndpointProbe(inventory({ updatedAt: OLD }, FRESH), NOW);
    assert.equal(probe.status, 'pass');
    assert.equal(probe.observedAt, FRESH);
    assert.equal(probe.freshnessSeconds, 30);
  });

  it('fails when no endpoint is ready even though the pod exists', () => {
    const probe = buildServiceEndpointProbe(
      inventory({ endpointReadiness: [{ serviceName: MITIGATION_TARGET.name, ready: 0, notReady: 1, total: 1, addresses: [] }] }),
      NOW,
    );
    assert.equal(probe.status, 'fail');
  });

  it('reports no-data when endpoint readiness is missing', () => {
    assert.equal(buildServiceEndpointProbe(inventory({ endpointReadiness: [] }), NOW).status, 'no-data');
    assert.equal(buildServiceEndpointProbe(undefined, NOW).status, 'no-data');
  });
});

describe('golden transaction probe', () => {
  it('passes when the synthetic journey has recovered', () => {
    const probe = buildGoldenTransactionProbe(impact(), NOW);
    assert.equal(probe.status, 'pass');
    assert.match(probe.observedValue, /successRatePct=100/);
  });

  it('fails when the success rate is below the SLO threshold', () => {
    const probe = buildGoldenTransactionProbe(
      impact({ telemetry: { ...impact().telemetry, successRatePct: 40 } }),
      NOW,
    );
    assert.equal(probe.status, 'fail');
    assert.match(probe.detail ?? '', /successRatePct=40/);
  });

  it('fails when the journey status is critical even with a good rate', () => {
    const probe = buildGoldenTransactionProbe(impact({ status: 'critical' }), NOW);
    assert.equal(probe.status, 'fail');
  });

  it('fails when the last success is outside the freshness budget', () => {
    const probe = buildGoldenTransactionProbe(
      impact({ telemetry: { ...impact().telemetry, lastSuccessAgeSeconds: 4_000, lastSuccess: OLD } }),
      NOW,
    );
    assert.notEqual(probe.status, 'pass');
  });

  it('reports no-data, never pass, when telemetry is empty', () => {
    const probe = buildGoldenTransactionProbe(
      impact({ telemetry: { dataStatus: 'no-data', source: 'synthetic' } }),
      NOW,
    );
    assert.equal(probe.status, 'no-data');
  });

  it('reports error when the query itself was unavailable', () => {
    const probe = buildGoldenTransactionProbe(
      impact({ telemetry: { dataStatus: 'unavailable', source: 'synthetic', error: 'workspace not configured' } }),
      NOW,
    );
    assert.equal(probe.status, 'error');
    assert.match(probe.detail ?? '', /workspace not configured/);
  });

  it('reports no-data when the whole impact response is missing', () => {
    assert.equal(buildGoldenTransactionProbe(undefined, NOW).status, 'no-data');
  });
});

describe('probe set and resource observation', () => {
  it('always returns exactly the three required probes', () => {
    const probes = buildVerificationProbes(inventory(), impact(), NOW);
    assert.deepEqual(probes.map(item => item.probe).sort(), [...REQUIRED_VERIFICATION_PROBES].sort());
  });

  it('still returns all three probes when every source is unavailable', () => {
    const probes = buildVerificationProbes(undefined, undefined, NOW);
    assert.equal(probes.length, 3);
    assert.ok(probes.every(item => item.status !== 'pass'));
  });

  it('observes resource state for the deny proof', () => {
    const observation = observeMitigationResourceState(inventory({ desiredReplicas: 0, readyPods: 0 }), 'before');
    assert.equal(observation?.resource, MITIGATION_TARGET.resource);
    assert.equal(observation?.specReplicas, 0);
    assert.ok(observation?.evidencePointer.includes('before'));
  });

  it('records the inventory observation time as authoritative while preserving Deployment condition timing', () => {
    const observation = observeMitigationResourceState(inventory({ updatedAt: OLD }, FRESH), 'after');
    assert.equal(observation?.observedAt, FRESH);
    assert.equal(observation?.deploymentConditionUpdatedAt, OLD);
  });

  it('returns undefined rather than inventing an observation', () => {
    assert.equal(observeMitigationResourceState(undefined, 'after'), undefined);
    const empty = { ...inventory(), deployments: [] } as InventoryResponse;
    assert.equal(observeMitigationResourceState(empty, 'after'), undefined);
  });
});
