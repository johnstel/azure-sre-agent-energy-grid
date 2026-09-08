/**
 * Tests for the Review-mode mitigation orchestration and its REST surface (issue #80).
 *
 * The central guarantee: a caller can supply correlation identifiers and a query window, and
 * NOTHING else. Any attempt to assert lifecycle state, approval, execution, or verification is a
 * 400 -- never a silent drop, and never accepted.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import Fastify from 'fastify';

import {
  REVIEW_MODE_MITIGATION_CACHE_MAX_KEYS,
  ReviewModeMitigationRequestError,
  ReviewModeMitigationService,
  buildGuardrails,
  clearMitigationBaselines,
  normalizeMitigationRequest,
  type ReviewModeMitigationDependencies,
} from '../services/ReviewModeMitigationService.js';
import { registerMitigationRoutes } from './mitigation.js';
import { MITIGATION_TARGET } from '../services/sre-agent/mitigationLifecycle.js';
import type { CustomerImpactResponse, InventoryResponse } from '../types/index.js';

const NOW = new Date('2026-05-01T12:00:00.000Z');
const T = (offsetSeconds: number) => new Date(NOW.getTime() + offsetSeconds * 1000).toISOString();
const THREAD_ID = 'thread-aaaabbbb-0000-cccc-1111';
const INCIDENT_ID = 'INC0PL8K7AL0J';

function inventoryFixture(desiredReplicas: number, readyPods: number): InventoryResponse {
  return {
    namespace: 'energy',
    updatedAt: T(-20),
    pods: [],
    orphanPods: [],
    services: [],
    events: [],
    deployments: [
      {
        name: MITIGATION_TARGET.name,
        namespace: MITIGATION_TARGET.namespace,
        desiredReplicas,
        readyPods,
        runningPods: readyPods,
        replicas: desiredReplicas,
        updatedReplicas: desiredReplicas,
        availableReplicas: readyPods,
        severity: readyPods > 0 ? 'healthy' : 'critical',
        status: readyPods > 0 ? 'healthy' : 'critical',
        reason: readyPods > 0 ? '' : 'ScaledToZero',
        restarts: 0,
        age: '5m',
        updatedAt: T(-20),
        labels: {},
        annotations: {},
        selectorLabels: {},
        pods: [],
        services: [],
        endpointReadiness: [
          { serviceName: MITIGATION_TARGET.name, ready: readyPods, notReady: 0, total: Math.max(readyPods, 1), addresses: [] },
        ],
        recentEvents: [],
      },
    ],
  } as InventoryResponse;
}

function impactFixture(healthy: boolean): CustomerImpactResponse {
  return {
    journey: 'meter-ingest',
    status: healthy ? 'healthy' : 'critical',
    kubernetesDataStatus: 'available',
    evidenceSources: ['synthetic'],
    affectedStage: 'ingest',
    recoveryCondition: 'success rate restored',
    collectedAt: T(-20),
    telemetry: {
      dataStatus: 'available',
      source: 'synthetic meter ingest',
      runCount: 20,
      successCount: healthy ? 20 : 2,
      failureCount: healthy ? 0 : 18,
      successRatePct: healthy ? 100 : 10,
      lastSuccess: T(-20),
      lastSuccessAgeSeconds: 20,
    },
  } as CustomerImpactResponse;
}

interface FixtureRows {
  incident?: Record<string, unknown>[];
  approval?: Record<string, unknown>[];
  tool?: Record<string, unknown>[];
  azCli?: Record<string, unknown>[];
}

function makeDependencies(
  rows: FixtureRows,
  inventory: InventoryResponse | undefined,
  impact: CustomerImpactResponse | undefined,
  before?: ReturnType<NonNullable<ReviewModeMitigationDependencies['resourceStateBefore']>>,
): ReviewModeMitigationDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    now: () => NOW,
    resourceStateBefore: before ? () => before : undefined,
    evidence: {
      async execute(templateName: string, params: Record<string, unknown>) {
        calls.push(`${templateName}:${JSON.stringify(params)}`);
        const map: Record<string, Record<string, unknown>[]> = {
          'incident-activity-snapshot': rows.incident ?? [],
          'approval-decisions': rows.approval ?? [],
          'agent-tool-execution': rows.tool ?? [],
          'agent-az-cli-execution': rows.azCli ?? [],
        };
        const selected = map[templateName] ?? [];
        return { templateName, rowCount: selected.length, rows: selected } as never;
      },
    },
    kube: {
      async getInventory() {
        if (!inventory) throw new Error('kubectl unavailable');
        return inventory;
      },
    },
    customerImpact: {
      async getCustomerImpact() {
        if (!impact) throw new Error('log analytics unavailable');
        return impact;
      },
    },
  };
}

function cacheKeyFor(
  correlation: { threadId?: string; correlationId?: string; incidentId?: string; traceId?: string },
  minutes = 60,
): string {
  return JSON.stringify({
    threadId: correlation.threadId ?? '',
    correlationId: correlation.correlationId ?? '',
    incidentId: correlation.incidentId ?? '',
    traceId: correlation.traceId ?? '',
    minutes,
  });
}

const reviewIncidentRow = {
  timestamp: T(-600),
  IncidentId: INCIDENT_ID,
  ThreadId: THREAD_ID,
  AgentAutonomyLevel: 'review',
  IncidentMitigatedByAgent: 'False',
};

beforeEach(() => clearMitigationBaselines());

// -----------------------------------------------------------------------------
// Request validation
// -----------------------------------------------------------------------------

describe('mitigation request validation', () => {
  it('accepts only observed correlation identifiers and a window', () => {
    const request = normalizeMitigationRequest({ threadId: THREAD_ID, incidentId: INCIDENT_ID, minutes: 30 });
    assert.deepEqual(request, { threadId: THREAD_ID, incidentId: INCIDENT_ID, minutes: 30 });
  });

  it('rejects forged lifecycle assertions rather than dropping them silently', () => {
    for (const forged of [
      { state: 'verification-passed' },
      { approval: { outcome: 'approved' } },
      { execution: { completedAt: T(0) } },
      { verification: { allProbesPassed: true } },
      { incidentResolved: true },
      { probes: [] },
      { resourceStateAfter: {} },
      { effectiveRunMode: 'review' },
    ]) {
      assert.throws(
        () => normalizeMitigationRequest({ threadId: THREAD_ID, ...forged }),
        (error: unknown) => error instanceof ReviewModeMitigationRequestError && /Unknown request field/.test((error as Error).message),
        `expected rejection for ${JSON.stringify(forged)}`,
      );
    }
  });

  it('rejects malformed identifiers and out-of-range windows', () => {
    assert.throws(() => normalizeMitigationRequest({ threadId: 'bad id with spaces' }), ReviewModeMitigationRequestError);
    assert.throws(() => normalizeMitigationRequest({ threadId: 'x'.repeat(200) }), ReviewModeMitigationRequestError);
    assert.throws(() => normalizeMitigationRequest({ minutes: 0 }), ReviewModeMitigationRequestError);
    assert.throws(() => normalizeMitigationRequest({ minutes: 99999 }), ReviewModeMitigationRequestError);
    assert.throws(() => normalizeMitigationRequest([1, 2, 3]), ReviewModeMitigationRequestError);
  });

  it('treats an empty request as valid but correlation-free', () => {
    assert.deepEqual(normalizeMitigationRequest({}), {});
    assert.deepEqual(normalizeMitigationRequest(undefined), {});
  });
});

// -----------------------------------------------------------------------------
// Orchestration
// -----------------------------------------------------------------------------

describe('mitigation orchestration', () => {
  it('passes only template-supported parameters to each evidence template', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(0, 0), impactFixture(false));
    await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });

    // agent-tool-execution filters by BOTH identifiers so an incident-only correlation cannot
    // degrade into a workspace-wide top-N query.
    const toolCall = deps.calls.find(call => call.startsWith('agent-tool-execution'))!;
    assert.ok(toolCall.includes('incidentId'), 'agent-tool-execution must filter by incidentId when available');
    assert.ok(toolCall.includes('threadId'), 'agent-tool-execution must filter by threadId when available');

    const snapshotCall = deps.calls.find(call => call.startsWith('incident-activity-snapshot'))!;
    assert.ok(!snapshotCall.includes('threadId'), 'incident-activity-snapshot does not filter by threadId');
  });

  it('filters tool execution by incidentId when no threadId is known', async () => {
    // Regression: the primary UI path can supply an incidentId without a threadId.
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(0, 0), impactFixture(false));
    await new ReviewModeMitigationService(deps).getMitigationEvidence({ incidentId: INCIDENT_ID });

    const toolCall = deps.calls.find(call => call.startsWith('agent-tool-execution'))!;
    assert.ok(toolCall.includes('incidentId'), 'incident-only correlation must still filter tool rows');
    assert.ok(!toolCall.includes('threadId'), 'no threadId was observed, so none is sent');
  });

  it('correlates the incident-only path exactly despite concurrent-thread noise', async () => {
    // The server-side filter narrows to this incident; post-query correlation must still reject
    // rows from a different incident that the query may have returned.
    const command = JSON.stringify({ command: 'kubectl scale deployment/mongodb -n energy --replicas=1' });
    const noise = { timestamp: T(-240), EventType: 'ToolEnd', ToolName: 'RunKubectlWriteCommand', ToolInput: command, IncidentId: 'INC-OTHER', ThreadId: 'thread-other', CallId: 'noise' };

    const deps = makeDependencies(
      {
        incident: [{ ...reviewIncidentRow, ThreadId: undefined }],
        approval: [{ timestamp: T(-300), IncidentId: INCIDENT_ID, RawDimensions: { Decision: 'Approved' } }],
        tool: [
          noise,
          { timestamp: T(-250), EventType: 'ToolStart', ToolName: 'RunKubectlWriteCommand', ToolInput: command, IncidentId: INCIDENT_ID, CallId: 'c1' },
          { timestamp: T(-200), EventType: 'ToolEnd', ToolName: 'RunKubectlWriteCommand', ToolInput: command, ToolOutput: 'deployment.apps/mongodb scaled', IncidentId: INCIDENT_ID, CallId: 'c2' },
        ],
      },
      inventoryFixture(1, 1),
      impactFixture(true),
      {
        source: 'fixture',
        resource: MITIGATION_TARGET.resource,
        observedAt: T(-400),
        specReplicas: 0,
        readyReplicas: 0,
        evidencePointer: 'fixture://before',
      },
    );

    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ incidentId: INCIDENT_ID });
    assert.equal(result.evidence.state, 'verification-passed');
    // The foreign row was rejected, not counted as this incident's execution.
    assert.ok(result.evidence.rejectedEvidence.some(reason => /AgentToolExecution.*mismatch/i.test(reason)));
    assert.equal(result.evidence.execution?.callId, 'c2');
  });

  it('blocks the flow when the observed run mode is autonomous', async () => {
    const deps = makeDependencies(
      { incident: [{ ...reviewIncidentRow, AgentAutonomyLevel: 'autonomous' }] },
      inventoryFixture(1, 1),
      impactFixture(true),
    );
    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    assert.equal(result.evidence.state, 'blocked-run-mode');
    assert.equal(result.evidence.incidentResolved, false);
  });

  it('reads the run mode only from a strictly correlated snapshot row', async () => {
    // Security regression: an OR over IncidentId/ThreadId short-circuited on IncidentId, so the
    // autonomy level could be read from a DIFFERENT agent thread of the same incident -- which
    // would present an ungated autonomous write as a human-approved Review-mode mitigation.
    const reviewThreadRow = { ...reviewIncidentRow, ThreadId: 'thread-review-0000', AgentAutonomyLevel: 'review' };
    const autonomousThreadRow = { ...reviewIncidentRow, ThreadId: THREAD_ID, AgentAutonomyLevel: 'autonomous' };

    const deps = makeDependencies(
      { incident: [reviewThreadRow, autonomousThreadRow] },
      inventoryFixture(1, 1),
      impactFixture(true),
    );
    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({
      threadId: THREAD_ID,
      incidentId: INCIDENT_ID,
    });

    assert.equal(result.evidence.effectiveRunMode, 'autonomous');
    assert.equal(result.evidence.state, 'blocked-run-mode');
    assert.equal(result.evidence.incidentResolved, false);
  });

  it('blocks when no snapshot row strictly correlates', async () => {
    const foreign = { ...reviewIncidentRow, ThreadId: 'thread-other', IncidentId: 'INC-OTHER' };
    const deps = makeDependencies({ incident: [foreign] }, inventoryFixture(1, 1), impactFixture(true));
    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID });
    assert.equal(result.evidence.effectiveRunMode, 'unknown');
    assert.equal(result.evidence.state, 'blocked-run-mode');
  });

  it('short-circuits to ambiguous without correlation before any executor or kubectl query', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({});
    assert.equal(result.evidence.state, 'ambiguous');
    assert.equal(result.evidence.incidentResolved, false);
    assert.equal(deps.calls.length, 0);
  });

  it('reuses one evidence batch for repeated identical calls within the cache TTL', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const service = new ReviewModeMitigationService({ ...deps, cacheTtlMs: 30_000 });

    const first = await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    const second = await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });

    assert.equal(first, second);
    assert.equal(deps.calls.length, 4);
  });

  it('caps the evidence cache and evicts the oldest keys while keeping the newest active key', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const service = new ReviewModeMitigationService({ ...deps, cacheTtlMs: 30_000 });

    for (let i = 0; i < REVIEW_MODE_MITIGATION_CACHE_MAX_KEYS + 6; i += 1) {
      await service.getMitigationEvidence({
        threadId: `thread-${i.toString().padStart(4, '0')}`,
        incidentId: `INC-${i.toString().padStart(4, '0')}`,
      });
    }

    const cache = (service as any).cache as Map<string, { expiresAtMs: number }>;
    assert.equal(cache.size, REVIEW_MODE_MITIGATION_CACHE_MAX_KEYS);
    assert.ok(!cache.has(cacheKeyFor({ threadId: 'thread-0000', incidentId: 'INC-0000' })));
    assert.ok(cache.has(cacheKeyFor({ threadId: `thread-${(REVIEW_MODE_MITIGATION_CACHE_MAX_KEYS + 5).toString().padStart(4, '0')}`, incidentId: `INC-${(REVIEW_MODE_MITIGATION_CACHE_MAX_KEYS + 5).toString().padStart(4, '0')}` })));
  });

  it('evicts expired evidence entries while keeping the most recent key fresh', async () => {
    let nowMs = 0;
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const service = new ReviewModeMitigationService({
      ...deps,
      now: () => new Date(nowMs),
      cacheTtlMs: 1_000,
    });

    await service.getMitigationEvidence({ threadId: 'thread-0', incidentId: 'INC-0' });
    nowMs = 500;
    await service.getMitigationEvidence({ threadId: 'thread-1', incidentId: 'INC-1' });
    nowMs = 1_500;
    await service.getMitigationEvidence({ threadId: 'thread-2', incidentId: 'INC-2' });

    const cache = (service as any).cache as Map<string, { expiresAtMs: number }>;
    assert.ok(!cache.has(cacheKeyFor({ threadId: 'thread-0', incidentId: 'INC-0' })));
    assert.ok(!cache.has(cacheKeyFor({ threadId: 'thread-1', incidentId: 'INC-1' })));
    assert.ok(cache.has(cacheKeyFor({ threadId: 'thread-2', incidentId: 'INC-2' })));
  });

  it('deduplicates concurrent identical requests instead of running overlapping batches', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const service = new ReviewModeMitigationService({ ...deps, cacheTtlMs: 30_000 });

    const results = await Promise.all([
      service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID }),
      service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID }),
      service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID }),
    ]);

    assert.equal(results.length, 3);
    assert.equal(deps.calls.length, 4);
    assert.ok(results.every(result => result === results[0]));
  });

  it('keeps cache entries scoped to the specific incident/thread/window', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const service = new ReviewModeMitigationService({ ...deps, cacheTtlMs: 30_000 });

    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    await service.getMitigationEvidence({ threadId: 'thread-other-1234', incidentId: INCIDENT_ID });
    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID, minutes: 5 });

    assert.equal(deps.calls.length, 12);
  });

  it('expires cached evidence after the configured TTL', async () => {
    let nowMs = 0;
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    const service = new ReviewModeMitigationService({
      ...deps,
      now: () => new Date(nowMs),
      cacheTtlMs: 1_000,
    });

    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    nowMs = 1_500;
    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });

    assert.equal(deps.calls.length, 8);
  });

  it('does not cache failed evidence and retries the query batch', async () => {
    let attempts = 0;
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(1, 1), impactFixture(true));
    deps.evidence.execute = async (templateName: string, params: Record<string, unknown>) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('transient evidence failure');
      }
      const selected = (templateName === 'incident-activity-snapshot' ? [reviewIncidentRow] : []) as Record<string, unknown>[];
      return { templateName, rowCount: selected.length, rows: selected } as never;
    };

    const service = new ReviewModeMitigationService({ ...deps, cacheTtlMs: 30_000 });
    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });

    assert.ok(attempts >= 8);
  });

  it('does not resolve the incident when Kubernetes and telemetry are unavailable', async () => {
    const deps = makeDependencies({ incident: [reviewIncidentRow] }, undefined, undefined);
    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    assert.equal(result.evidence.incidentResolved, false);
    assert.ok(result.evidenceSources.some(source => source.includes('unavailable')));
    assert.ok(result.evidence.verification.probes.every(probe => probe.status !== 'pass'));
  });

  it('derives verification-passed from a complete observed chain', async () => {
    const approval = {
      timestamp: T(-300),
      ThreadId: THREAD_ID,
      IncidentId: INCIDENT_ID,
      RawDimensions: { Decision: 'Approved' },
    };
    const command = JSON.stringify({ command: 'kubectl scale deployment/mongodb -n energy --replicas=1' });
    const deps = makeDependencies(
      {
        incident: [reviewIncidentRow],
        approval: [approval],
        tool: [
          { timestamp: T(-250), EventType: 'ToolStart', ToolName: 'RunKubectlWriteCommand', ToolInput: command, ThreadId: THREAD_ID, CallId: 'c1' },
          { timestamp: T(-200), EventType: 'ToolEnd', ToolName: 'RunKubectlWriteCommand', ToolInput: command, ToolOutput: 'deployment.apps/mongodb scaled', ThreadId: THREAD_ID, CallId: 'c2' },
        ],
      },
      inventoryFixture(1, 1),
      impactFixture(true),
      {
        source: 'fixture',
        resource: MITIGATION_TARGET.resource,
        observedAt: T(-400),
        specReplicas: 0,
        readyReplicas: 0,
        evidencePointer: 'fixture://before',
      },
    );

    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    assert.equal(result.evidence.state, 'verification-passed');
    assert.equal(result.evidence.incidentResolved, true);
    assert.equal(result.evidence.verification.probes.length, 3);
  });

  it('derives denied from an observed rejection plus an unchanged before/after pair', async () => {
    const deps = makeDependencies(
      {
        incident: [reviewIncidentRow],
        approval: [{ timestamp: T(-300), ThreadId: THREAD_ID, IncidentId: INCIDENT_ID, RawDimensions: { Decision: 'Rejected' } }],
      },
      inventoryFixture(0, 0),
      impactFixture(false),
      {
        source: 'fixture',
        resource: MITIGATION_TARGET.resource,
        observedAt: T(-400),
        specReplicas: 0,
        readyReplicas: 0,
        evidencePointer: 'fixture://before',
      },
    );

    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    assert.equal(result.evidence.state, 'denied');
    assert.equal(result.evidence.resourceState?.mutation, 'unchanged');
    assert.equal(result.evidence.incidentResolved, false);
  });

  it('reports denied-with-unverified-state when no earlier observation exists', async () => {
    const deps = makeDependencies(
      {
        incident: [reviewIncidentRow],
        approval: [{ timestamp: T(-300), ThreadId: THREAD_ID, IncidentId: INCIDENT_ID, RawDimensions: { Decision: 'Rejected' } }],
      },
      inventoryFixture(0, 0),
      impactFixture(false),
    );
    const result = await new ReviewModeMitigationService(deps).getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });
    assert.equal(result.evidence.state, 'denied-with-unverified-state');
  });

  it('does not mask a post-deny mutation across successive polls', async () => {
    // Regression for the sliding-window bug: poll while the resource is still 0, let a rejection be
    // recorded, then poll again after the resource has changed. The second poll must NOT compare
    // two post-decision readings and report a clean `denied`.
    const rejection = { timestamp: T(-300), ThreadId: THREAD_ID, IncidentId: INCIDENT_ID, RawDimensions: { Decision: 'Rejected' } };

    // First poll: pre-decision reading (replicas 0) enters the history.
    const before = makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(0, 0), impactFixture(false));
    before.now = () => new Date(NOW.getTime() - 400_000);
    const service = new ReviewModeMitigationService(before);
    await service.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });

    // Later poll: the resource has been mutated to 1 despite the rejection.
    const after = makeDependencies({ incident: [reviewIncidentRow], approval: [rejection] }, inventoryFixture(1, 1), impactFixture(true));
    const mutated = new ReviewModeMitigationService(after);
    const result = await mutated.getMitigationEvidence({ threadId: THREAD_ID, incidentId: INCIDENT_ID });

    assert.notEqual(result.evidence.state, 'denied');
    assert.equal(result.evidence.incidentResolved, false);
  });

  it('handles concurrent polls without cross-contaminating baselines', async () => {
    const service = new ReviewModeMitigationService(
      makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(0, 0), impactFixture(false)),
    );
    const results = await Promise.all([
      service.getMitigationEvidence({ threadId: THREAD_ID }),
      service.getMitigationEvidence({ threadId: 'thread-other-1111' }),
      service.getMitigationEvidence({ incidentId: INCIDENT_ID }),
    ]);
    assert.equal(results.length, 3);
    assert.ok(results.every(result => result.evidence.incidentResolved === false));
  });
});

// -----------------------------------------------------------------------------
// Guardrail disclosure
// -----------------------------------------------------------------------------

describe('guardrail disclosure', () => {
  it('always discloses the demo-only permission breadth and the read-only approval surface', () => {
    const guardrails = buildGuardrails();
    assert.ok(guardrails.disclosures.some(item => /DEMO-ONLY PERMISSION BREADTH/.test(item)));
    assert.ok(guardrails.disclosures.some(item => /READ-ONLY for approval/.test(item)));
    assert.ok(guardrails.disclosures.some(item => /does not trigger the native Review-mode/i.test(item)));
    assert.equal(guardrails.targetResource, MITIGATION_TARGET.resource);
    assert.equal(guardrails.allowlistedCommands.length, 2);
  });
});

// -----------------------------------------------------------------------------
// REST surface
// -----------------------------------------------------------------------------

describe('mitigation routes', () => {
  async function buildApp(deps: ReviewModeMitigationDependencies) {
    const app = Fastify();
    registerMitigationRoutes(app, new ReviewModeMitigationService(deps));
    await app.ready();
    return app;
  }

  it('exposes the guardrail contract and never advertises a local approval control', async () => {
    const app = await buildApp(makeDependencies({}, inventoryFixture(0, 0), impactFixture(false)));
    const response = await app.inject({ method: 'GET', url: '/api/mitigation/guardrails' });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.approvalSurface.missionControlCanApprove, false);
    assert.equal(body.designDocument, 'docs/REVIEW-MODE-MITIGATION.md');
    await app.close();
  });

  it('rejects forged lifecycle fields with 400', async () => {
    const app = await buildApp(makeDependencies({}, inventoryFixture(0, 0), impactFixture(false)));
    const response = await app.inject({
      method: 'POST',
      url: '/api/mitigation/evidence',
      payload: { threadId: THREAD_ID, state: 'verification-passed', incidentResolved: true },
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Unknown request field/);
    await app.close();
  });

  it('returns derived evidence for a valid query', async () => {
    const app = await buildApp(makeDependencies({ incident: [reviewIncidentRow] }, inventoryFixture(0, 0), impactFixture(false)));
    const response = await app.inject({ method: 'GET', url: `/api/mitigation/evidence?threadId=${THREAD_ID}&incidentId=${INCIDENT_ID}` });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.scenario, 'MongoDBDown');
    assert.equal(body.evidence.incidentResolved, false);
    assert.ok(Array.isArray(body.guardrails.disclosures));
    await app.close();
  });

  it('rejects an invalid identifier in the query string', async () => {
    const app = await buildApp(makeDependencies({}, inventoryFixture(0, 0), impactFixture(false)));
    const response = await app.inject({ method: 'GET', url: '/api/mitigation/evidence?threadId=has%20spaces' });
    assert.equal(response.statusCode, 400);
    await app.close();
  });
});
