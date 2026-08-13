/**
 * Builds the three structured verification probes required by issue #80 before a Review-mode
 * mitigation may be reported as recovered.
 *
 * Every probe carries source, observed value, timestamp, freshness and an evidence pointer.
 * A boolean is never sufficient, and a probe that cannot be observed is reported as `no-data`
 * or `stale` -- never silently omitted and never defaulted to `pass`.
 *
 * Contract: docs/REVIEW-MODE-MITIGATION.md §7
 */

import type { CustomerImpactResponse, InventoryResponse } from '../../types/index.js';
import { SLO_METER_INGEST_DEMO_THRESHOLDS } from '../CustomerImpactService.js';
import {
  MITIGATION_TARGET,
  type ResourceStateObservation,
  type VerificationProbeEvidence,
} from './mitigationLifecycle.js';

/** A probe observed longer ago than this cannot prove the current state. */
export const DEFAULT_PROBE_STALE_SECONDS = 5 * 60;

function freshnessSeconds(observedAt: string, now: Date): number | undefined {
  const parsed = Date.parse(observedAt);
  if (Number.isNaN(parsed)) return undefined;
  return Math.max(0, Math.round((now.getTime() - parsed) / 1_000));
}

function withStaleness(probe: VerificationProbeEvidence, staleSeconds: number): VerificationProbeEvidence {
  if (probe.status !== 'pass') return probe;
  if (probe.freshnessSeconds === undefined) {
    return { ...probe, status: 'stale', detail: 'The probe has no usable timestamp, so its freshness cannot be established.' };
  }
  if (probe.freshnessSeconds > staleSeconds) {
    return {
      ...probe,
      status: 'stale',
      detail: `Observed ${probe.freshnessSeconds}s ago, beyond the ${staleSeconds}s freshness budget.`,
    };
  }
  return probe;
}

/**
 * Probe 1 -- Kubernetes readiness for the mitigation target.
 * Passes only when the Deployment reports at least one ready AND one available replica.
 */
export function buildKubernetesReadinessProbe(
  inventory: InventoryResponse | undefined,
  now: Date,
  staleSeconds = DEFAULT_PROBE_STALE_SECONDS,
): VerificationProbeEvidence {
  const source = `kubectl get deployment ${MITIGATION_TARGET.name} -n ${MITIGATION_TARGET.namespace}`;
  const evidencePointer = `GET /api/inventory#deployments.${MITIGATION_TARGET.name}`;

  if (!inventory) {
    return {
      probe: 'kubernetes-readiness',
      status: 'no-data',
      source,
      observedValue: 'unavailable',
      evidencePointer,
      detail: 'Kubernetes inventory could not be read; readiness is unknown, not healthy.',
    };
  }

  const deployment = inventory.deployments.find(
    item => item.name === MITIGATION_TARGET.name && item.namespace === MITIGATION_TARGET.namespace,
  );

  if (!deployment) {
    return {
      probe: 'kubernetes-readiness',
      status: 'no-data',
      source,
      observedValue: `deployment ${MITIGATION_TARGET.resource} not found`,
      observedAt: inventory.updatedAt,
      freshnessSeconds: freshnessSeconds(inventory.updatedAt, now),
      evidencePointer,
      detail: 'The target Deployment was not present in the inventory snapshot.',
    };
  }

  const ready = deployment.readyPods ?? 0;
  const available = deployment.availableReplicas ?? 0;
  const passed = ready >= 1 && available >= 1;
  const observedAt = inventory.updatedAt;
  const deploymentConditionUpdatedAt = deployment.updatedAt;
  const deploymentDetail = deploymentConditionUpdatedAt && deploymentConditionUpdatedAt !== observedAt
    ? `Deployment condition last changed at ${deploymentConditionUpdatedAt}; inventory was observed at ${observedAt}.`
    : undefined;

  return withStaleness(
    {
      probe: 'kubernetes-readiness',
      status: passed ? 'pass' : 'fail',
      source,
      observedValue: `readyReplicas=${ready}, availableReplicas=${available}, desiredReplicas=${deployment.desiredReplicas}`,
      observedAt,
      freshnessSeconds: freshnessSeconds(observedAt, now),
      threshold: 'readyReplicas >= 1 and availableReplicas >= 1',
      evidencePointer,
      detail: passed
        ? deploymentDetail ?? undefined
        : [
            `Deployment reason: ${deployment.reason || 'not reported'}`,
            deploymentDetail,
          ].filter(Boolean).join(' '),
    },
    staleSeconds,
  );
}

/**
 * Probe 2 -- Service endpoint health.
 * Passes only when the `mongodb` Service has at least one READY endpoint address, which is what
 * actually proves dependent services can reach the database again.
 */
export function buildServiceEndpointProbe(
  inventory: InventoryResponse | undefined,
  now: Date,
  staleSeconds = DEFAULT_PROBE_STALE_SECONDS,
): VerificationProbeEvidence {
  const source = `kubectl get endpoints ${MITIGATION_TARGET.name} -n ${MITIGATION_TARGET.namespace}`;
  const evidencePointer = `GET /api/inventory#deployments.${MITIGATION_TARGET.name}.endpointReadiness`;

  if (!inventory) {
    return {
      probe: 'service-endpoint-health',
      status: 'no-data',
      source,
      observedValue: 'unavailable',
      evidencePointer,
      detail: 'Kubernetes inventory could not be read; endpoint health is unknown, not healthy.',
    };
  }

  const deployment = inventory.deployments.find(
    item => item.name === MITIGATION_TARGET.name && item.namespace === MITIGATION_TARGET.namespace,
  );
  const summaries = deployment?.endpointReadiness ?? [];
  const summary = summaries.find(entry => entry.serviceName === MITIGATION_TARGET.name) ?? summaries[0];

  if (!summary) {
    return {
      probe: 'service-endpoint-health',
      status: 'no-data',
      source,
      observedValue: `no endpoint summary for service ${MITIGATION_TARGET.name}`,
      observedAt: inventory.updatedAt,
      freshnessSeconds: freshnessSeconds(inventory.updatedAt, now),
      evidencePointer,
      detail: 'No endpoint readiness data was observed for the target Service.',
    };
  }

  const passed = summary.ready >= 1;
  const observedAt = inventory.updatedAt;
  const deploymentConditionUpdatedAt = deployment?.updatedAt;
  const deploymentDetail = deploymentConditionUpdatedAt && deploymentConditionUpdatedAt !== observedAt
    ? `Deployment condition last changed at ${deploymentConditionUpdatedAt}; inventory was observed at ${observedAt}.`
    : undefined;

  return withStaleness(
    {
      probe: 'service-endpoint-health',
      status: passed ? 'pass' : 'fail',
      source,
      observedValue: `readyEndpoints=${summary.ready}, notReady=${summary.notReady}, total=${summary.total}`,
      observedAt,
      freshnessSeconds: freshnessSeconds(observedAt, now),
      threshold: 'readyEndpoints >= 1',
      evidencePointer,
      detail: passed
        ? deploymentDetail ?? undefined
        : [
            'No ready endpoint address; dependent services still cannot reach the database.',
            deploymentDetail,
          ].filter(Boolean).join(' '),
    },
    staleSeconds,
  );
}

/**
 * Probe 3 -- the PR #84 synthetic golden transaction / customer-impact recovery signal.
 * This is the scenario-relevant functional check: Kubernetes can report a healthy pod while the
 * customer journey is still broken, so readiness alone is never accepted as recovery.
 */
export function buildGoldenTransactionProbe(
  impact: CustomerImpactResponse | undefined,
  now: Date,
  staleSeconds = DEFAULT_PROBE_STALE_SECONDS,
): VerificationProbeEvidence {
  const source = 'Synthetic meter-ingest golden transaction (customer-impact SLO, PR #84)';
  const evidencePointer = 'GET /api/customer-impact';
  const threshold = `successRatePct >= ${SLO_METER_INGEST_DEMO_THRESHOLDS.successRatePct}, freshness <= ${SLO_METER_INGEST_DEMO_THRESHOLDS.freshnessMs / 1000}s, journey status not critical`;

  if (!impact) {
    return {
      probe: 'golden-transaction',
      status: 'no-data',
      source,
      observedValue: 'unavailable',
      threshold,
      evidencePointer,
      detail: 'The customer-impact journey could not be evaluated; functional recovery is unproven.',
    };
  }

  const telemetry = impact.telemetry;

  if (telemetry.dataStatus !== 'available') {
    return {
      probe: 'golden-transaction',
      status: telemetry.dataStatus === 'no-data' ? 'no-data' : 'error',
      source: telemetry.source || source,
      observedValue: `dataStatus=${telemetry.dataStatus}`,
      observedAt: impact.collectedAt,
      freshnessSeconds: freshnessSeconds(impact.collectedAt, now),
      threshold,
      evidencePointer,
      detail: telemetry.error
        ? `Golden-transaction telemetry is unavailable: ${telemetry.error}`
        : 'No synthetic transaction runs were observed in the query window, so recovery is unproven.',
    };
  }

  const successRate = telemetry.successRatePct;
  const lastSuccessAge = telemetry.lastSuccessAgeSeconds;
  const meetsRate = successRate !== undefined && successRate >= SLO_METER_INGEST_DEMO_THRESHOLDS.successRatePct;
  const meetsFreshness =
    lastSuccessAge !== undefined && lastSuccessAge <= SLO_METER_INGEST_DEMO_THRESHOLDS.freshnessMs / 1_000;
  const journeyHealthy = impact.status === 'healthy' || impact.status === 'degraded';
  const passed = meetsRate && meetsFreshness && journeyHealthy && impact.status !== 'critical';

  const failureDetail: string[] = [];
  if (!meetsRate) failureDetail.push(`successRatePct=${successRate ?? 'unknown'}`);
  if (!meetsFreshness) failureDetail.push(`lastSuccessAgeSeconds=${lastSuccessAge ?? 'unknown'}`);
  if (!journeyHealthy || impact.status === 'critical') failureDetail.push(`journeyStatus=${impact.status}`);

  return withStaleness(
    {
      probe: 'golden-transaction',
      status: passed ? 'pass' : 'fail',
      source: telemetry.source || source,
      observedValue: `journey=${impact.journey}, status=${impact.status}, successRatePct=${successRate ?? 'unknown'}, runs=${telemetry.runCount ?? 0}, lastSuccessAgeSeconds=${lastSuccessAge ?? 'unknown'}`,
      observedAt: telemetry.lastSuccess ?? impact.collectedAt,
      freshnessSeconds: freshnessSeconds(telemetry.lastSuccess ?? impact.collectedAt, now),
      threshold,
      evidencePointer,
      detail: passed ? undefined : `Golden transaction has not recovered (${failureDetail.join(', ')}).`,
    },
    staleSeconds,
  );
}

/**
 * Observes the mitigation target's resource state for the deny / no-mutation proof.
 * Returns `undefined` when the Deployment cannot be observed, so the caller reports `unknown`
 * mutation rather than inventing an "unchanged" reading.
 */
export function observeMitigationResourceState(
  inventory: InventoryResponse | undefined,
  label: 'before' | 'after',
): ResourceStateObservation | undefined {
  if (!inventory) return undefined;
  const deployment = inventory.deployments.find(
    item => item.name === MITIGATION_TARGET.name && item.namespace === MITIGATION_TARGET.namespace,
  );
  if (!deployment) return undefined;

  const observedAt = inventory.updatedAt;
  const deploymentConditionUpdatedAt = deployment.updatedAt;

  return {
    source: `kubectl get deployment ${MITIGATION_TARGET.name} -n ${MITIGATION_TARGET.namespace} (${label})`,
    resource: MITIGATION_TARGET.resource,
    observedAt,
    ...(deploymentConditionUpdatedAt && deploymentConditionUpdatedAt !== observedAt
      ? { deploymentConditionUpdatedAt }
      : {}),
    specReplicas: deployment.desiredReplicas,
    readyReplicas: deployment.readyPods,
    observedGeneration: undefined,
    evidencePointer: `GET /api/inventory#deployments.${MITIGATION_TARGET.name} (${label})`,
  };
}

export function buildVerificationProbes(
  inventory: InventoryResponse | undefined,
  impact: CustomerImpactResponse | undefined,
  now: Date,
  staleSeconds = DEFAULT_PROBE_STALE_SECONDS,
): VerificationProbeEvidence[] {
  return [
    buildKubernetesReadinessProbe(inventory, now, staleSeconds),
    buildServiceEndpointProbe(inventory, now, staleSeconds),
    buildGoldenTransactionProbe(impact, now, staleSeconds),
  ];
}
