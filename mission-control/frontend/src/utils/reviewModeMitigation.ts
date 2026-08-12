/**
 * Presentation helpers for the Review-mode mitigation lifecycle (issue #80).
 *
 * Every backend state has an explicit label, tone and operator meaning. The mapping is exhaustive:
 * `assertNever` makes an unhandled state a compile-time error, and the accompanying test asserts
 * union parity with the backend so a new state can never silently render as "unknown".
 *
 * Nothing here infers state. It only formats what the backend derived from observed telemetry.
 */

import type {
  MitigationMutationState,
  MitigationRunMode,
  ReviewModeMitigationEvidence,
  ReviewModeMitigationState,
  VerificationProbeEvidence,
  VerificationProbeStatus,
} from '../types/api';

export type MitigationTone = 'neutral' | 'pending' | 'success' | 'warning' | 'danger';

export interface MitigationStatePresentation {
  label: string;
  tone: MitigationTone;
  /** What the operator should understand from this state -- never a claim beyond the evidence. */
  meaning: string;
  /** True when the state must be visually loud (blocked demo, security finding, deny violation). */
  loud: boolean;
}

/** Full, ordered list of states the UI must handle. Kept in sync with the backend by test. */
export const REVIEW_MODE_MITIGATION_STATES: readonly ReviewModeMitigationState[] = Object.freeze([
  'no-evidence',
  'blocked-run-mode',
  'ambiguous',
  'proposed',
  'denied',
  'denied-with-unverified-state',
  'deny-violation',
  'approved',
  'executing',
  'execution-blocked',
  'execution-failed',
  'verification-passed',
  'verification-failed',
  'rolled-back',
]);

function assertNever(value: never): never {
  throw new Error(`Unhandled Review-mode mitigation state: ${String(value)}`);
}

export function describeMitigationState(state: ReviewModeMitigationState): MitigationStatePresentation {
  switch (state) {
    case 'no-evidence':
      return {
        label: 'No evidence',
        tone: 'neutral',
        loud: false,
        meaning: 'No usable audit telemetry was observed. This is not a claim that the agent is idle or the system is healthy.',
      };
    case 'blocked-run-mode':
      return {
        label: 'Blocked — run mode',
        tone: 'danger',
        loud: true,
        meaning: 'The effective agent autonomy level is not Review. The demonstration is blocked because the approval gate did not apply.',
      };
    case 'ambiguous':
      return {
        label: 'Ambiguous correlation',
        tone: 'warning',
        loud: true,
        meaning: 'No precise identifier was available, so no mitigation evidence was attached to this incident.',
      };
    case 'proposed':
      return {
        label: 'Proposed',
        tone: 'pending',
        loud: false,
        meaning: 'A mitigation is awaiting an operator decision in the Azure SRE Agent portal. No decision has been observed.',
      };
    case 'denied':
      return {
        label: 'Denied — no change',
        tone: 'neutral',
        loud: false,
        meaning: 'A rejection was observed and before/after resource state proves the target was not mutated.',
      };
    case 'denied-with-unverified-state':
      return {
        label: 'Denied — state unverified',
        tone: 'warning',
        loud: true,
        meaning: 'A rejection was observed, but there is no fresh before/after pair proving the resource was left untouched.',
      };
    case 'deny-violation':
      return {
        label: 'DENY VIOLATION',
        tone: 'danger',
        loud: true,
        meaning: 'The proposal was rejected but the resource changed anyway. Investigate the policy and RBAC boundary immediately.',
      };
    case 'approved':
      return {
        label: 'Approved',
        tone: 'pending',
        loud: false,
        meaning: 'An approval was observed. No correlated allowlisted execution telemetry has appeared yet.',
      };
    case 'executing':
      return {
        label: 'Executing',
        tone: 'pending',
        loud: false,
        meaning: 'The approved action has started. No completion event has been observed yet.',
      };
    case 'execution-blocked':
      return {
        label: 'Execution blocked',
        tone: 'warning',
        loud: true,
        meaning: 'The enforcement boundary refused the call. No mitigation was applied — this is the guardrail working.',
      };
    case 'execution-failed':
      return {
        label: 'Execution failed',
        tone: 'danger',
        loud: true,
        meaning: 'The action did not complete successfully, or executed outside the expected approval order. The incident stays unresolved.',
      };
    case 'verification-passed':
      return {
        label: 'Verified recovery',
        tone: 'success',
        loud: false,
        meaning: 'Approval, execution and all three post-execution probes were observed and correlated. The incident is resolved.',
      };
    case 'verification-failed':
      return {
        label: 'Verification failed',
        tone: 'danger',
        loud: true,
        meaning: 'Recovery is unproven. The incident remains unresolved and rollback/escalation guidance applies.',
      };
    case 'rolled-back':
      return {
        label: 'Rolled back',
        tone: 'warning',
        loud: false,
        meaning: 'The allowlisted rollback was executed and verified. The scenario is back at its broken baseline.',
      };
    default:
      return assertNever(state);
  }
}

export function describeRunMode(mode: MitigationRunMode): MitigationStatePresentation {
  switch (mode) {
    case 'review':
      return { label: 'Review', tone: 'success', loud: false, meaning: 'Observed agent autonomy level is Review; every Azure write requires an approval.' };
    case 'autonomous':
      return { label: 'Autonomous', tone: 'danger', loud: true, meaning: 'Observed agent autonomy level is Autonomous. This demonstration must not proceed.' };
    case 'unknown':
      return { label: 'Unknown', tone: 'danger', loud: true, meaning: 'The effective run mode could not be observed, so the approval gate cannot be proven.' };
    default:
      return assertNever(mode);
  }
}

export function describeMutation(mutation: MitigationMutationState): MitigationStatePresentation {
  switch (mutation) {
    case 'unchanged':
      return { label: 'Unchanged', tone: 'success', loud: false, meaning: 'Before/after observations are equal; the resource was not mutated.' };
    case 'applied':
      return { label: 'Changed', tone: 'warning', loud: false, meaning: 'The resource changed between the before and after observations.' };
    case 'unknown':
      return { label: 'Unknown', tone: 'warning', loud: true, meaning: 'Mutation cannot be determined; the before/after pair is missing, stale, or out of order.' };
    default:
      return assertNever(mutation);
  }
}

export function describeProbeStatus(status: VerificationProbeStatus): MitigationStatePresentation {
  switch (status) {
    case 'pass':
      return { label: 'Pass', tone: 'success', loud: false, meaning: 'The probe met its threshold within the freshness budget.' };
    case 'fail':
      return { label: 'Fail', tone: 'danger', loud: true, meaning: 'The probe was observed and did not meet its threshold.' };
    case 'no-data':
      return { label: 'No data', tone: 'warning', loud: true, meaning: 'The probe could not be observed. Absence is never treated as success.' };
    case 'stale':
      return { label: 'Stale', tone: 'warning', loud: true, meaning: 'The observation is outside the freshness budget and cannot prove the current state.' };
    case 'error':
      return { label: 'Error', tone: 'danger', loud: true, meaning: 'The probe query itself failed.' };
    default:
      return assertNever(status);
  }
}

export const PROBE_LABELS: Record<VerificationProbeEvidence['probe'], string> = {
  'kubernetes-readiness': 'Kubernetes readiness',
  'service-endpoint-health': 'Service endpoint health',
  'golden-transaction': 'Golden transaction (customer impact)',
};

/** Formats freshness for display without ever rendering an unknown age as "0s". */
export function formatFreshness(seconds: number | undefined): string {
  if (seconds === undefined) return 'unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3_600)}h ago`;
}

/** True when the panel must render a loud banner rather than a quiet badge. */
export function requiresLoudBanner(evidence: ReviewModeMitigationEvidence): boolean {
  return (
    describeMitigationState(evidence.state).loud ||
    evidence.runModeBlocked ||
    evidence.securityFindings.length > 0 ||
    evidence.schemaMismatch
  );
}

/** Ordered rows for the correlation timeline; only identifiers that were actually observed. */
export function correlationRows(evidence: ReviewModeMitigationEvidence): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const { threadId, correlationId, incidentId, traceId } = evidence.correlation;
  if (threadId) rows.push({ label: 'ThreadId', value: threadId });
  if (correlationId) rows.push({ label: 'CorrelationId', value: correlationId });
  if (incidentId) rows.push({ label: 'IncidentId', value: incidentId });
  if (traceId) rows.push({ label: 'TraceId', value: traceId });
  return rows;
}
