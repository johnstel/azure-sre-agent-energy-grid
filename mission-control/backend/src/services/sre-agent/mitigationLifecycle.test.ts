/**
 * Adversarial tests for the Review-mode mitigation lifecycle (issue #80).
 *
 * These tests exist because the previous attempt (closed PR #85) accepted caller-supplied lifecycle
 * types: success could be fabricated, deny was asserted without evidence, and identifiers were never
 * compared. Every test below attacks one of those failure modes with deterministic fixtures.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALLOWLISTED_MITIGATION_COMMANDS,
  MITIGATION_TARGET,
  ROLLBACK_COMMAND,
  correlateRow,
  deriveMitigationLifecycle,
  extractToolCommand,
  isAllowlistedMitigationCommand,
  normalizeMitigationCommand,
  parseApprovalDecisionRows,
  parseAzCliExecutionRows,
  parseToolExecutionRows,
  resolveEffectiveRunMode,
  resolveMutationState,
  selectPreDecisionObservation,
  type MitigationCorrelationKey,
  type ResourceStateObservation,
  type VerificationProbeEvidence,
} from './mitigationLifecycle.js';

// -----------------------------------------------------------------------------
// Deterministic fixtures
// -----------------------------------------------------------------------------

const NOW = new Date('2026-05-01T12:00:00.000Z');
const T = (offsetSeconds: number) => new Date(NOW.getTime() + offsetSeconds * 1000).toISOString();

const THREAD_ID = 'thread-aaaabbbb-0000-cccc-1111';
const CORRELATION_ID = 'corr-7f3a19';
const INCIDENT_ID = 'INC0PL8K7AL0J';
const TRACE_ID = 'trace-2b9c44de';

const KEY: MitigationCorrelationKey = {
  threadId: THREAD_ID,
  correlationId: CORRELATION_ID,
  incidentId: INCIDENT_ID,
  traceId: TRACE_ID,
};

const RESTORE_COMMAND = ALLOWLISTED_MITIGATION_COMMANDS[0]!;

function approvalRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: T(-300),
    ThreadId: THREAD_ID,
    CorrelationId: CORRELATION_ID,
    IncidentId: INCIDENT_ID,
    TraceId: TRACE_ID,
    RawDimensions: { Decision: 'Approved' },
    ...overrides,
  };
}

function toolRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: T(-240),
    EventType: 'ToolStart',
    ToolName: 'RunKubectlWriteCommand',
    ToolInput: JSON.stringify({ command: RESTORE_COMMAND }),
    CallId: 'call_0001',
    ThreadId: THREAD_ID,
    CorrelationId: CORRELATION_ID,
    IncidentId: INCIDENT_ID,
    TraceId: TRACE_ID,
    ...overrides,
  };
}

function toolEndRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return toolRow({
    timestamp: T(-200),
    EventType: 'ToolEnd',
    ToolOutput: 'deployment.apps/mongodb scaled',
    CallId: 'call_0002',
    ...overrides,
  });
}

function probe(
  name: VerificationProbeEvidence['probe'],
  status: VerificationProbeEvidence['status'] = 'pass',
  observedAt = T(-60),
): VerificationProbeEvidence {
  return {
    probe: name,
    status,
    source: `fixture:${name}`,
    observedValue: `${name}=${status}`,
    observedAt,
    freshnessSeconds: 60,
    evidencePointer: `fixture://${name}`,
  };
}

function passingProbes(observedAt = T(-60)): VerificationProbeEvidence[] {
  return [
    probe('kubernetes-readiness', 'pass', observedAt),
    probe('service-endpoint-health', 'pass', observedAt),
    probe('golden-transaction', 'pass', observedAt),
  ];
}

function state(observedAt: string, specReplicas: number, generation?: number): ResourceStateObservation {
  return {
    source: 'fixture',
    resource: MITIGATION_TARGET.resource,
    observedAt,
    specReplicas,
    readyReplicas: specReplicas,
    observedGeneration: generation,
    evidencePointer: 'fixture://state',
  };
}

function derive(overrides: Partial<Parameters<typeof deriveMitigationLifecycle>[0]> = {}) {
  return deriveMitigationLifecycle({
    now: NOW,
    correlation: KEY,
    observedAutonomyLevel: 'review',
    ...overrides,
  });
}

// -----------------------------------------------------------------------------
// Command allowlist
// -----------------------------------------------------------------------------

describe('mitigation command allowlist', () => {
  it('accepts the exact restore and rollback commands', () => {
    assert.equal(isAllowlistedMitigationCommand(RESTORE_COMMAND), true);
    assert.equal(isAllowlistedMitigationCommand(ROLLBACK_COMMAND), true);
  });

  it('accepts documented equivalent spellings without widening the boundary', () => {
    assert.equal(isAllowlistedMitigationCommand('kubectl  scale   deployment/mongodb --namespace energy --replicas 1'), true);
    assert.equal(isAllowlistedMitigationCommand('kubectl scale deployment mongodb -n energy --replicas=1'), true);
    assert.equal(normalizeMitigationCommand('kubectl scale deployment/mongodb --replicas=1 -n energy'), RESTORE_COMMAND);
  });

  it('rejects out-of-scope resources, namespaces and replica counts', () => {
    for (const command of [
      'kubectl scale deployment/meter-service -n energy --replicas=1',
      'kubectl scale deployment/mongodb -n kube-system --replicas=1',
      'kubectl scale deployment/mongodb -n energy --replicas=99',
      'kubectl delete deployment/mongodb -n energy',
      'kubectl exec -it mongodb -n energy -- sh',
      'kubectl scale deployment/mongodb --all-namespaces --replicas=1',
    ]) {
      assert.equal(isAllowlistedMitigationCommand(command), false, `expected reject: ${command}`);
    }
  });

  it('rejects shell-chained bypass attempts that would otherwise normalise into the allowlist', () => {
    for (const command of [
      'kubectl scale deployment/mongodb -n energy --replicas=1; kubectl delete ns energy',
      'kubectl scale deployment/mongodb -n energy --replicas=1 && rm -rf /',
      'kubectl scale deployment/mongodb -n energy --replicas=1 | tee /tmp/x',
      'kubectl scale deployment/mongodb -n energy --replicas=1 `whoami`',
      'kubectl scale deployment/mongodb -n energy --replicas=1 $(id)',
      'kubectl scale deployment/mongodb -n energy --replicas=1\nkubectl delete pod --all',
    ]) {
      assert.equal(isAllowlistedMitigationCommand(command), false, `expected reject: ${command}`);
    }
  });

  it('rejects argument-smuggling payloads that carry the required tokens plus extras', () => {
    // Security regression: an earlier lookahead-based normaliser accepted every one of these,
    // because it only checked that `-n energy` and `--replicas=N` appeared somewhere and then
    // rebuilt a canonical string, discarding all other arguments.
    for (const command of [
      'kubectl scale deployment/mongodb deployment/grid-api statefulset/vault -n energy --replicas=0',
      'kubectl scale deployment/mongodb -n energy --replicas=1 --server https://evil.example.com --token abc123 --insecure-skip-tls-verify',
      'kubectl scale deployment/mongodb -n energy --replicas=1 --kubeconfig /attacker/kubeconfig',
      'kubectl scale deployment/mongodb -n energy --replicas=1 --as system:masters',
      'kubectl scale deployment/mongodb -n energy --replicas=1 --all-namespaces',
      'kubectl scale deployment/mongodb -n energy --replicas=1 -A',
      'kubectl scale deployment/mongodb -n energy --replicas=1 --context attacker',
      'kubectl scale --all-namespaces deployment/mongodb -n energy --replicas=1',
      'kubectl scale deployment/mongodb -n energy -n kube-system --replicas=1',
      'kubectl scale deployment/mongodb -n energy --replicas=1 --replicas=9',
    ]) {
      assert.equal(isAllowlistedMitigationCommand(command), false, `expected reject: ${command}`);
      assert.notEqual(normalizeMitigationCommand(command), RESTORE_COMMAND, `must not normalise into the allowlist: ${command}`);
    }
  });

  it('does not let a smuggled command reach verification-passed', () => {
    const smuggled = JSON.stringify({
      command: 'kubectl scale deployment/mongodb deployment/grid-api -n energy --replicas=1 --server https://evil.example.com',
    });
    const evidence = derive({
      approvalRows: [approvalRow({ RawDimensions: { Decision: 'Approved' } })],
      toolExecutionRows: [toolRow({ ToolInput: smuggled }), toolEndRow({ ToolInput: smuggled })],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.notEqual(evidence.state, 'verification-passed');
    assert.equal(evidence.incidentResolved, false);
    assert.equal(evidence.execution, undefined);
    assert.ok(evidence.securityFindings.some(finding => /Out-of-scope tool call/.test(finding)));
  });

  it('rejects a scale of a different resource kind or a non-numeric replica count', () => {
    for (const command of [
      'kubectl scale statefulset/mongodb -n energy --replicas=1',
      'kubectl scale deployment/mongodb -n energy --replicas=one',
      'kubectl scale deployment/mongodb --replicas=1',
      'kubectl scale deployment/mongodb -n energy',
      'kubectl get deployment/mongodb -n energy --replicas=1',
      'kubectl scale',
    ]) {
      assert.equal(isAllowlistedMitigationCommand(command), false, `expected reject: ${command}`);
    }
  });

  it('rejects non-string and oversized input', () => {
    assert.equal(isAllowlistedMitigationCommand(undefined), false);
    assert.equal(isAllowlistedMitigationCommand(42), false);
    assert.equal(isAllowlistedMitigationCommand(`${RESTORE_COMMAND} ${'x'.repeat(600)}`), false);
  });

  it('extracts the command from JSON and bare tool inputs', () => {
    assert.equal(extractToolCommand(JSON.stringify({ command: RESTORE_COMMAND })), RESTORE_COMMAND);
    assert.equal(extractToolCommand(RESTORE_COMMAND), RESTORE_COMMAND);
    assert.equal(extractToolCommand(undefined), undefined);
  });
});

// -----------------------------------------------------------------------------
// Runtime parsers
// -----------------------------------------------------------------------------

describe('runtime parsers', () => {
  it('drops rows with missing or unparsable timestamps rather than substituting now', () => {
    assert.equal(parseApprovalDecisionRows([{ ThreadId: THREAD_ID }]).length, 0);
    assert.equal(parseApprovalDecisionRows([approvalRow({ timestamp: 'not-a-date' })]).length, 0);
    assert.equal(parseToolExecutionRows([toolRow({ timestamp: undefined })]).length, 0);
    assert.equal(parseAzCliExecutionRows([{ timestamp: '' }]).length, 0);
  });

  it('reads outcomes from nested and flattened dimension bags', () => {
    assert.equal(parseApprovalDecisionRows([approvalRow()])[0]!.outcome, 'approved');
    assert.equal(parseApprovalDecisionRows([approvalRow({ RawDimensions: { Outcome: 'Rejected' } })])[0]!.outcome, 'rejected');
    assert.equal(parseApprovalDecisionRows([approvalRow({ RawDimensions: JSON.stringify({ Decision: 'deny' }) })])[0]!.outcome, 'rejected');
  });

  it('resolves an unrecognised approval outcome to unknown, never approved', () => {
    const parsed = parseApprovalDecisionRows([approvalRow({ RawDimensions: { Something: 'maybe' } })]);
    assert.equal(parsed[0]!.outcome, 'unknown');
    assert.equal(parsed[0]!.outcomeSource, undefined);
  });

  it('classifies allowlisted, blocked and failed tool rows', () => {
    const [allowed] = parseToolExecutionRows([toolRow()]);
    assert.equal(allowed!.allowlisted, true);
    assert.equal(allowed!.blocked, false);

    const [outOfScope] = parseToolExecutionRows([toolRow({ ToolInput: JSON.stringify({ command: 'kubectl delete ns energy' }) })]);
    assert.equal(outOfScope!.allowlisted, false);

    const [blocked] = parseToolExecutionRows([
      toolEndRow({ ToolOutput: 'Error from server (Forbidden): deployments.apps "mongodb" is forbidden' }),
    ]);
    assert.equal(blocked!.blocked, true);

    const [wrongTool] = parseToolExecutionRows([toolRow({ ToolName: 'RunShellCommand' })]);
    assert.equal(wrongTool!.allowlisted, false);
  });

  it('redacts secrets out of tool input and output', () => {
    const [row] = parseToolExecutionRows([
      toolRow({
        ToolInput: 'kubectl scale deployment/mongodb -n energy --replicas=1 --token=supersecretvalue123',
        ToolOutput: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payloadpayload.signaturesig',
      }),
    ]);
    assert.ok(!row!.toolInput!.includes('supersecretvalue123'), 'token must be redacted');
    assert.ok(!row!.toolOutput!.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT must be redacted');
    assert.ok(row!.toolOutput!.includes('REDACTED'));
  });

  it('redacts quoted secret values that contain spaces', () => {
    // Security regression: the value pattern previously stopped at the first space inside quotes,
    // leaking the remainder of the secret into the response body.
    const [row] = parseToolExecutionRows([
      toolRow({
        ToolInput: 'az login -u svc --password "Winter 2026 Grid!" --admin-password \'Correct Horse Battery\'',
        ToolOutput: 'az storage blob list --sas-token "sv=2021 sig=AAAABBBBCCCC"',
      }),
    ]);
    for (const leaked of ['2026', 'Grid!', 'Horse', 'Battery', 'sig=AAAABBBBCCCC']) {
      assert.ok(!row!.toolInput!.includes(leaked) || !row!.toolOutput!.includes(leaked), `leaked '${leaked}'`);
    }
    assert.ok(!row!.toolInput!.includes('Winter'), 'password must be redacted');
    assert.ok(!row!.toolInput!.includes('Correct'), 'admin-password must be redacted');
    assert.ok(!row!.toolOutput!.includes('sig=AAAABBBBCCCC'), 'sas-token must be redacted');
  });

  it('redacts az cli commands', () => {
    const [row] = parseAzCliExecutionRows([
      { timestamp: T(-100), ThreadId: THREAD_ID, RawDimensions: { Command: 'az login --password hunter2secretpw' } },
    ]);
    assert.ok(!row!.command!.includes('hunter2secretpw'));
  });
});

// -----------------------------------------------------------------------------
// Correlation
// -----------------------------------------------------------------------------

describe('exact identifier correlation', () => {
  it('matches only on exact equality', () => {
    assert.equal(correlateRow({ threadId: THREAD_ID }, KEY), 'match');
    assert.equal(correlateRow({ threadId: `${THREAD_ID} ` }, KEY), 'mismatch');
    assert.equal(correlateRow({ threadId: THREAD_ID.toUpperCase() }, KEY), 'mismatch');
  });

  it('treats a differing shared identifier as a mismatch even when another matches', () => {
    assert.equal(correlateRow({ threadId: THREAD_ID, incidentId: 'INC-OTHER' }, KEY), 'mismatch');
  });

  it('never guesses when no identifier overlaps', () => {
    assert.equal(correlateRow({}, KEY), 'insufficient');
    assert.equal(correlateRow({ spanId: 'span-1' } as never, KEY), 'insufficient');
  });
});

// -----------------------------------------------------------------------------
// Run mode gate
// -----------------------------------------------------------------------------

describe('effective run mode gate', () => {
  it('parses documented autonomy values', () => {
    assert.equal(resolveEffectiveRunMode('review'), 'review');
    assert.equal(resolveEffectiveRunMode('Review'), 'review');
    assert.equal(resolveEffectiveRunMode('autonomous'), 'autonomous');
    assert.equal(resolveEffectiveRunMode(undefined), 'unknown');
    assert.equal(resolveEffectiveRunMode('something-new'), 'unknown');
  });

  it('blocks loudly when the effective mode is autonomous', () => {
    const evidence = derive({
      observedAutonomyLevel: 'autonomous',
      approvalRows: [approvalRow()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'blocked-run-mode');
    assert.equal(evidence.runModeBlocked, true);
    assert.equal(evidence.incidentResolved, false);
    assert.ok(evidence.securityFindings.some(finding => /AUTONOMOUS/i.test(finding)));
  });

  it('blocks when the effective mode cannot be observed', () => {
    const evidence = derive({ observedAutonomyLevel: undefined, approvalRows: [approvalRow()] });
    assert.equal(evidence.state, 'blocked-run-mode');
    assert.equal(evidence.effectiveRunMode, 'unknown');
  });
});

// -----------------------------------------------------------------------------
// Correlation preconditions and schema drift
// -----------------------------------------------------------------------------

describe('preconditions', () => {
  it('refuses to attach evidence without any correlation identifier', () => {
    const evidence = derive({ correlation: {}, approvalRows: [approvalRow()] });
    assert.equal(evidence.state, 'ambiguous');
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports schema drift instead of a lifecycle state', () => {
    const evidence = derive({ schemaMismatch: true, approvalRows: [approvalRow()], probes: passingProbes() });
    assert.equal(evidence.state, 'no-evidence');
    assert.equal(evidence.schemaMismatch, true);
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports `proposed` when nothing has been decided yet', () => {
    const evidence = derive({});
    assert.equal(evidence.state, 'proposed');
    assert.equal(evidence.incidentResolved, false);
  });
});

// -----------------------------------------------------------------------------
// Forgery, replay, ordering
// -----------------------------------------------------------------------------

describe('evidence forgery resistance', () => {
  it('discards an approval whose identifiers belong to a different incident', () => {
    const evidence = derive({
      approvalRows: [approvalRow({ ThreadId: 'thread-attacker', CorrelationId: 'corr-attacker', IncidentId: 'INC-OTHER', TraceId: 'trace-other' })],
      toolExecutionRows: [toolRow(), toolEndRow()],
      probes: passingProbes(),
    });
    assert.equal(evidence.approval, undefined);
    assert.notEqual(evidence.state, 'verification-passed');
    assert.ok(evidence.rejectedEvidence.some(reason => /ApprovalDecision.*mismatch/i.test(reason)));
  });

  it('rejects future-dated events beyond the clock-skew budget', () => {
    const evidence = derive({
      approvalRows: [approvalRow({ timestamp: T(3600) })],
      probes: passingProbes(),
    });
    assert.equal(evidence.approval, undefined);
    assert.ok(evidence.rejectedEvidence.some(reason => /future/i.test(reason)));
  });

  it('deduplicates replayed events', () => {
    const replayed = approvalRow({ RawDimensions: { Decision: 'Approved' }, CallId: 'call_dup' });
    const evidence = derive({
      approvalRows: [replayed, { ...replayed }, { ...replayed }],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.ok(evidence.rejectedEvidence.some(reason => /duplicate\/replayed/i.test(reason)));
    assert.equal(evidence.state, 'verification-passed');
  });

  it('flags execution that precedes approval as a governance failure', () => {
    const evidence = derive({
      approvalRows: [approvalRow({ timestamp: T(-100) })],
      toolExecutionRows: [toolRow({ timestamp: T(-500) }), toolEndRow({ timestamp: T(-450) })],
      resourceStateBefore: state(T(-600), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'execution-failed');
    assert.ok(evidence.securityFindings.some(finding => /Ordering violation/i.test(finding)));
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports execution without approval as a failure, never a mitigation', () => {
    const evidence = derive({
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'execution-failed');
    assert.ok(evidence.securityFindings.some(finding => /no correlated ApprovalDecision/i.test(finding)));
  });

  it('does not trust IncidentMitigatedByAgent without approval or execution telemetry', () => {
    const evidence = derive({ incidentMitigatedByAgent: true, probes: passingProbes() });
    assert.equal(evidence.state, 'proposed');
    assert.equal(evidence.incidentResolved, false);
    assert.ok(evidence.securityFindings.some(finding => /IncidentMitigatedByAgent=true/.test(finding)));
  });
});

// -----------------------------------------------------------------------------
// Deny path
// -----------------------------------------------------------------------------

describe('deny path', () => {
  const rejection = () => approvalRow({ RawDimensions: { Decision: 'Rejected' } });

  it('reports `denied` only with a rejection AND proof of no mutation', () => {
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateBefore: state(T(-400), 0, 3),
      resourceStateAfter: state(T(-30), 0, 3),
    });
    assert.equal(evidence.state, 'denied');
    assert.equal(evidence.resourceState?.mutation, 'unchanged');
    assert.equal(evidence.incidentResolved, false);
  });

  it('never reports `denied` without before/after evidence', () => {
    const evidence = derive({ approvalRows: [rejection()] });
    assert.equal(evidence.state, 'denied-with-unverified-state');
    assert.equal(evidence.resourceState?.mutation, 'unknown');
  });

  it('never rewrites a partial observation into `unchanged`', () => {
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: undefined,
    });
    assert.equal(evidence.state, 'denied-with-unverified-state');
    assert.equal(evidence.resourceState?.mutation, 'unknown');
  });

  it('raises a deny violation when the resource mutated after a rejection', () => {
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
    });
    assert.equal(evidence.state, 'deny-violation');
    assert.ok(evidence.securityFindings.some(finding => /DENY VIOLATION/.test(finding)));
    assert.equal(evidence.incidentResolved, false);
  });

  it('anchors the before reading at or before the decision, not at the previous poll', () => {
    // Regression: a mutation that has already settled must not be masked by two later readings.
    // History spans the decision; the pre-decision reading is 0, the current reading is 1.
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateHistory: [state(T(-600), 0), state(T(-500), 0), state(T(-120), 1), state(T(-60), 1)],
      resourceStateAfter: state(T(-30), 1),
    });
    assert.equal(evidence.state, 'deny-violation');
    assert.equal(evidence.resourceState?.mutation, 'applied');
  });

  it('reports unverified state when the history contains nothing older than the decision', () => {
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateHistory: [state(T(-120), 1), state(T(-60), 1)],
      resourceStateAfter: state(T(-30), 1),
    });
    assert.equal(evidence.state, 'denied-with-unverified-state');
    assert.equal(evidence.resourceState?.mutation, 'unknown');
  });

  it('discards an explicit before reading that post-dates the decision', () => {
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateBefore: state(T(-10), 0),
      resourceStateAfter: state(T(-5), 0),
    });
    assert.equal(evidence.state, 'denied-with-unverified-state');
    assert.ok(evidence.rejectedEvidence.some(reason => /post-dates the decision/.test(reason)));
  });

  it('selectPreDecisionObservation never returns a post-decision reading', () => {
    const history = [state(T(-600), 0), state(T(-120), 1), state(T(-60), 1)];
    const decisionMs = Date.parse(T(-300));
    assert.equal(selectPreDecisionObservation(history, decisionMs)?.observedAt, T(-600));
    assert.equal(selectPreDecisionObservation(history, Date.parse(T(-700))), undefined);
    assert.equal(selectPreDecisionObservation([], decisionMs), undefined);
    assert.equal(selectPreDecisionObservation(history, undefined), undefined);
  });

  it('treats stale before/after evidence as unverified', () => {
    const evidence = derive({
      approvalRows: [rejection()],
      resourceStateBefore: state(T(-7200), 0),
      resourceStateAfter: state(T(-3600), 0),
    });
    assert.equal(evidence.state, 'denied-with-unverified-state');
  });

  it('rejects an out-of-order before/after pair', () => {
    const mutation = resolveMutationState(state(T(-30), 0), state(T(-400), 0), NOW.getTime(), 900);
    assert.equal(mutation.mutation, 'unknown');
    assert.match(mutation.reason, /out of order/i);
  });

  it('refuses to compare observations of a different resource', () => {
    const foreign: ResourceStateObservation = { ...state(T(-30), 0), resource: 'energy/meter-service' };
    const mutation = resolveMutationState(state(T(-400), 0), foreign, NOW.getTime(), 900);
    assert.equal(mutation.mutation, 'unknown');
  });

  it('detects mutation via observedGeneration even when replicas match', () => {
    const mutation = resolveMutationState(state(T(-400), 0, 3), state(T(-30), 0, 4), NOW.getTime(), 900);
    assert.equal(mutation.mutation, 'applied');
  });
});

// -----------------------------------------------------------------------------
// Approve / execute / verify path
// -----------------------------------------------------------------------------

describe('approve, execute and verify path', () => {
  const approved = () => approvalRow({ RawDimensions: { Decision: 'Approved' } });

  it('reports `approved` when execution telemetry has not appeared', () => {
    const evidence = derive({ approvalRows: [approved()], probes: passingProbes() });
    assert.equal(evidence.state, 'approved');
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports `executing` while only a ToolStart is observed', () => {
    const evidence = derive({ approvalRows: [approved()], toolExecutionRows: [toolRow()], probes: passingProbes() });
    assert.equal(evidence.state, 'executing');
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports `execution-blocked` when the enforcement boundary refused the call', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow({ ToolOutput: 'Error from server (Forbidden): RBAC: access denied' })],
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'execution-blocked');
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports `verification-failed` when a probe is missing', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: [probe('kubernetes-readiness'), probe('service-endpoint-health')],
    });
    assert.equal(evidence.state, 'verification-failed');
    assert.deepEqual(evidence.verification.missingProbes, ['golden-transaction']);
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports `verification-failed` when the functional probe has no data', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: [probe('kubernetes-readiness'), probe('service-endpoint-health'), probe('golden-transaction', 'no-data')],
    });
    assert.equal(evidence.state, 'verification-failed');
    assert.ok(evidence.guidance.rollbackCommand);
    assert.equal(evidence.guidance.rollbackCommand, ROLLBACK_COMMAND);
  });

  it('reports `verification-failed` when a probe is stale', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: [probe('kubernetes-readiness'), probe('service-endpoint-health'), probe('golden-transaction', 'stale')],
    });
    assert.equal(evidence.state, 'verification-failed');
  });

  it('rejects verification collected BEFORE the execution completed', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow({ timestamp: T(-100) })],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(T(-500)),
    });
    assert.equal(evidence.state, 'verification-failed');
    assert.equal(evidence.verification.postDatesExecution, false);
  });

  it('rejects probes with no timestamp', () => {
    const untimed = passingProbes().map(item => ({ ...item, observedAt: undefined, freshnessSeconds: undefined }));
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: untimed,
    });
    assert.equal(evidence.state, 'verification-failed');
  });

  it('cannot be padded with duplicate passing probes', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: [probe('kubernetes-readiness'), probe('kubernetes-readiness'), probe('kubernetes-readiness')],
    });
    assert.equal(evidence.state, 'verification-failed');
    assert.equal(evidence.verification.probes.length, 1);
  });

  it('refuses to claim recovery when the resource never actually changed', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 1),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'verification-failed');
  });

  it('reports `verification-passed` only for the complete, ordered, fresh chain', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow()],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'verification-passed');
    assert.equal(evidence.incidentResolved, true);
    assert.equal(evidence.verification.allProbesPassed, true);
    assert.equal(evidence.verification.postDatesExecution, true);
    assert.equal(evidence.approval?.outcome, 'approved');
    assert.equal(evidence.execution?.allowlisted, true);
    // Structured evidence, not booleans.
    for (const item of evidence.verification.probes) {
      assert.ok(item.source && item.observedValue && item.observedAt && item.evidencePointer);
    }
  });

  it('classifies the allowlisted rollback as `rolled-back`, not recovery', () => {
    const rollbackInput = JSON.stringify({ command: ROLLBACK_COMMAND });
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow({ ToolInput: rollbackInput }), toolEndRow({ ToolInput: rollbackInput })],
      resourceStateBefore: state(T(-400), 1),
      resourceStateAfter: state(T(-30), 0),
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'rolled-back');
    assert.equal(evidence.incidentResolved, false);
  });

  it('reports `execution-failed` when the approved action errored', () => {
    const evidence = derive({
      approvalRows: [approved()],
      toolExecutionRows: [toolRow(), toolEndRow({ ToolOutput: 'error: timed out waiting for the condition' })],
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'execution-failed');
    assert.equal(evidence.guidance.rollbackCommand, ROLLBACK_COMMAND);
  });

  it('reports `proposed` when the approval outcome is unreadable (SCHEMA_TBD)', () => {
    const evidence = derive({ approvalRows: [approvalRow({ RawDimensions: { Note: 'n/a' } })] });
    assert.equal(evidence.state, 'proposed');
    assert.equal(evidence.approval?.outcome, 'unknown');
  });
});

// -----------------------------------------------------------------------------
// Allowlist bypass at the evidence boundary
// -----------------------------------------------------------------------------

describe('allowlist enforcement at the evidence boundary', () => {
  it('records an out-of-scope tool call as a security finding and never as progress', () => {
    const evidence = derive({
      approvalRows: [approvalRow({ RawDimensions: { Decision: 'Approved' } })],
      toolExecutionRows: [toolRow({ ToolInput: JSON.stringify({ command: 'kubectl delete deployment/mongodb -n energy' }) })],
      probes: passingProbes(),
    });
    assert.ok(evidence.securityFindings.some(finding => /Out-of-scope tool call/.test(finding)));
    assert.equal(evidence.state, 'approved');
    assert.equal(evidence.incidentResolved, false);
  });

  it('does not let an out-of-scope execution satisfy the execution requirement', () => {
    const bad = JSON.stringify({ command: 'kubectl scale deployment/meter-service -n energy --replicas=5' });
    const evidence = derive({
      approvalRows: [approvalRow({ RawDimensions: { Decision: 'Approved' } })],
      toolExecutionRows: [toolRow({ ToolInput: bad }), toolEndRow({ ToolInput: bad })],
      resourceStateBefore: state(T(-400), 0),
      resourceStateAfter: state(T(-30), 1),
      probes: passingProbes(),
    });
    assert.equal(evidence.state, 'approved');
    assert.equal(evidence.execution, undefined);
  });
});
