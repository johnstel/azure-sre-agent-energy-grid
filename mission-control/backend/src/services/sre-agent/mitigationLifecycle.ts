/**
 * Review-mode mitigation lifecycle (issue #80).
 *
 * This module derives the mitigation lifecycle **exclusively from observed, runtime-validated
 * Azure SRE Agent audit telemetry**. It never accepts a lifecycle state, an approval, an execution,
 * or a verification result from a request body or any other caller assertion.
 *
 * Design gate, blast radius, permission boundary and rollback plan: docs/REVIEW-MODE-MITIGATION.md
 *
 * Hard rules enforced here:
 *  - Events join only on EXACT string equality of ThreadId / CorrelationId / IncidentId / TraceId.
 *    An identifier present on both sides that differs is a mismatch and the row is discarded.
 *  - `denied` requires an observed rejection AND before/after resource state proving no mutation.
 *    `applied` / `unknown` mutation is NEVER rewritten into `unchanged`.
 *  - `verification-passed` requires an observed approval, matching execution telemetry, and three
 *    structured probes that all post-date execution. Booleans alone are never sufficient.
 *  - An effective run mode other than `review` blocks the flow loudly.
 *  - Replayed, duplicated, future-dated and out-of-order rows are rejected with a stated reason.
 *
 * Telemetry field names come from
 * https://learn.microsoft.com/azure/sre-agent/audit-agent-actions. Fields Microsoft does not
 * itemise (ApprovalDecision outcome, AgentAzCliExecution dimensions) are marked SCHEMA_TBD per
 * docs/CAPABILITY-CONTRACTS.md §8 and resolve to `unknown` rather than a guess.
 */

import { redactSensitiveText } from './redaction.js';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Freshness budget for every observed row and probe, in seconds. */
export const DEFAULT_MITIGATION_STALE_SECONDS = 15 * 60;

/** Tolerated forward clock skew. Anything beyond this is treated as a fabricated future timestamp. */
export const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 120;

/** The single remediation the Energy Grid lab permits, plus its rollback. */
export const MITIGATION_TARGET = Object.freeze({
  namespace: 'energy',
  kind: 'Deployment',
  name: 'mongodb',
  resource: 'energy/mongodb',
  restoreReplicas: 1,
  rollbackReplicas: 0,
});

export const ALLOWLISTED_MITIGATION_COMMANDS: readonly string[] = Object.freeze([
  'kubectl scale deployment/mongodb -n energy --replicas=1',
  'kubectl scale deployment/mongodb -n energy --replicas=0',
]);

export const ALLOWLISTED_MITIGATION_TOOLS: readonly string[] = Object.freeze(['RunKubectlWriteCommand']);

export const ROLLBACK_COMMAND = 'kubectl scale deployment/mongodb -n energy --replicas=0';

/** Shell metacharacters that must never appear in an allowlisted command. */
const SHELL_METACHARACTERS = /[;&|`$><\n\r\\]|\$\(/;

/**
 * Candidate dimension keys that may carry the ApprovalDecision outcome.
 * SCHEMA_TBD: Microsoft Learn publishes only `project timestamp, customDimensions` for
 * ApprovalDecision, so the exact key is unknown. We scan a bounded candidate list and report
 * `unknown` when none matches -- never a default of "approved".
 */
const APPROVAL_OUTCOME_KEYS = Object.freeze([
  'Decision', 'ApprovalDecision', 'Outcome', 'Approved', 'Action', 'Status', 'Result', 'UserDecision',
]);

const APPROVED_TOKENS = Object.freeze(['approve', 'approved', 'accept', 'accepted', 'allow', 'allowed', 'yes', 'true', 'confirm', 'confirmed']);
const REJECTED_TOKENS = Object.freeze(['deny', 'denied', 'reject', 'rejected', 'decline', 'declined', 'no', 'false', 'cancel', 'cancelled', 'canceled']);

/** Signals in tool output that indicate the call was blocked rather than executed. */
const BLOCKED_OUTPUT_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bforbidden\b/i,
  /\bis not allowed\b/i,
  /\bdenied by (policy|tool access policy)\b/i,
  /\bblocked by (policy|tool access policy)\b/i,
  /\bcannot (get|list|update|patch|scale) resource\b/i,
  /\buser .* cannot \w+ resource\b/i,
  /\bRBAC: access denied\b/i,
  /\bnot authorized\b/i,
  /\berror from server \(forbidden\)/i,
]);

const FAILED_OUTPUT_PATTERNS: readonly RegExp[] = Object.freeze([
  /\berror\b/i,
  /\bfailed\b/i,
  /\btimed out\b/i,
  /\bunable to\b/i,
]);

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type ReviewModeMitigationState =
  | 'no-evidence'
  | 'blocked-run-mode'
  | 'ambiguous'
  | 'proposed'
  | 'denied'
  | 'denied-with-unverified-state'
  | 'deny-violation'
  | 'approved'
  | 'executing'
  | 'execution-blocked'
  | 'execution-failed'
  | 'verification-passed'
  | 'verification-failed'
  | 'rolled-back';

export type MitigationRunMode = 'review' | 'autonomous' | 'unknown';
export type MitigationApprovalOutcome = 'approved' | 'rejected' | 'unknown';
export type MitigationMutationState = 'unchanged' | 'applied' | 'unknown';

export type VerificationProbeName = 'kubernetes-readiness' | 'service-endpoint-health' | 'golden-transaction';
export type VerificationProbeStatus = 'pass' | 'fail' | 'no-data' | 'stale' | 'error';

export const REQUIRED_VERIFICATION_PROBES: readonly VerificationProbeName[] = Object.freeze([
  'kubernetes-readiness',
  'service-endpoint-health',
  'golden-transaction',
]);

/**
 * Structured verification evidence. Deliberately NOT a boolean: every probe must state where the
 * value came from, what the value was, when it was observed, how fresh it is, and how to find the
 * underlying evidence.
 */
export interface VerificationProbeEvidence {
  probe: VerificationProbeName;
  status: VerificationProbeStatus;
  source: string;
  observedValue: string;
  observedAt?: string;
  freshnessSeconds?: number;
  threshold?: string;
  evidencePointer: string;
  correlationId?: string;
  detail?: string;
}

/** A point-in-time observation of the target resource, used to prove mutation or its absence. */
export interface ResourceStateObservation {
  source: string;
  resource: string;
  observedAt: string;
  specReplicas?: number;
  readyReplicas?: number;
  observedGeneration?: number;
  evidencePointer: string;
}

/** Exact identifiers a row must match to be admitted as evidence. */
export interface MitigationCorrelationKey {
  threadId?: string;
  correlationId?: string;
  incidentId?: string;
  traceId?: string;
}

export interface ParsedApprovalDecisionRow {
  observedAt: string;
  outcome: MitigationApprovalOutcome;
  outcomeSource?: string;
  threadId?: string;
  correlationId?: string;
  incidentId?: string;
  traceId?: string;
  spanId?: string;
  callId?: string;
}

export interface ParsedToolExecutionRow {
  observedAt: string;
  eventType: 'ToolStart' | 'ToolEnd' | 'unknown';
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  callId?: string;
  subAgentName?: string;
  threadId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  allowlisted: boolean;
  blocked: boolean;
  failed: boolean;
}

export interface ParsedAzCliExecutionRow {
  observedAt: string;
  command?: string;
  exitCode?: number;
  succeeded?: boolean;
  callId?: string;
  threadId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
}

export interface MitigationApprovalEvidence {
  outcome: MitigationApprovalOutcome;
  observedAt: string;
  outcomeSource?: string;
  threadId?: string;
  correlationId?: string;
  incidentId?: string;
  traceId?: string;
  freshnessSeconds: number;
  stale: boolean;
}

export interface MitigationExecutionEvidence {
  toolName: string;
  command?: string;
  startedAt?: string;
  completedAt?: string;
  callId?: string;
  threadId?: string;
  correlationId?: string;
  traceId?: string;
  allowlisted: boolean;
  blocked: boolean;
  failed: boolean;
  azCliCorrelated: boolean;
  freshnessSeconds: number;
  stale: boolean;
}

export interface MitigationResourceStateEvidence {
  before?: ResourceStateObservation;
  after?: ResourceStateObservation;
  mutation: MitigationMutationState;
  reason: string;
}

export interface MitigationVerificationEvidence {
  probes: VerificationProbeEvidence[];
  missingProbes: VerificationProbeName[];
  allProbesPassed: boolean;
  earliestProbeAt?: string;
  postDatesExecution: boolean;
}

export interface MitigationGuidance {
  rollbackCommand?: string;
  rollbackRationale?: string;
  escalation?: string;
}

export interface ReviewModeMitigationEvidence {
  state: ReviewModeMitigationState;
  /** True only for `verification-passed`. Every other state leaves the incident unresolved. */
  incidentResolved: boolean;
  effectiveRunMode: MitigationRunMode;
  runModeBlocked: boolean;
  scenario: 'MongoDBDown';
  targetResource: string;
  proposedCommand: string;
  correlation: MitigationCorrelationKey;
  approval?: MitigationApprovalEvidence;
  execution?: MitigationExecutionEvidence;
  resourceState?: MitigationResourceStateEvidence;
  verification: MitigationVerificationEvidence;
  guidance: MitigationGuidance;
  observedAt?: string;
  stale: boolean;
  schemaMismatch: boolean;
  securityFindings: string[];
  rejectedEvidence: string[];
  limitations: string[];
}

// -----------------------------------------------------------------------------
// Primitive coercion helpers (shared discipline: never substitute a value we did not observe)
// -----------------------------------------------------------------------------

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toTimestampMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function toOptionalInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Reads a customDimensions-style bag whether it arrived flattened or nested. */
function readDimension(row: Record<string, unknown>, key: string): unknown {
  if (row[key] !== undefined) return row[key];
  const raw = row.RawDimensions ?? row.customDimensions;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return (raw as Record<string, unknown>)[key];
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return (parsed as Record<string, unknown>)[key];
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readSharedIds(row: Record<string, unknown>) {
  return {
    threadId: toOptionalString(readDimension(row, 'ThreadId')),
    correlationId: toOptionalString(readDimension(row, 'CorrelationId')),
    incidentId: toOptionalString(readDimension(row, 'IncidentId')),
    traceId: toOptionalString(readDimension(row, 'TraceId')),
    spanId: toOptionalString(readDimension(row, 'SpanId')),
  };
}

// -----------------------------------------------------------------------------
// Command allowlist (re-checked at Mission Control's own boundary, not trusted upstream)
// -----------------------------------------------------------------------------

/**
 * Canonicalises a kubectl command so that documented equivalent spellings compare equal, without
 * ever loosening the boundary.
 *
 * This is a strict tokeniser, deliberately NOT a regex over the whole string. An earlier
 * lookahead-based implementation only checked that `-n energy` and `--replicas=N` appeared
 * *somewhere* and then rebuilt a canonical string, silently discarding every other argument -- so
 * `kubectl scale deployment/mongodb deployment/grid-api -n energy --replicas=1 --server https://evil
 * --as system:masters` normalised into an allowlisted command. Every token must now be recognised;
 * anything unexpected rejects the whole command.
 */
export function normalizeMitigationCommand(raw: string): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return undefined;
  if (SHELL_METACHARACTERS.test(trimmed)) return undefined;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2 || tokens[0] !== 'kubectl' || tokens[1] !== 'scale') return undefined;

  let target: string | undefined;
  let namespace: string | undefined;
  let replicas: string | undefined;

  for (let index = 2; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token === '-n' || token === '--namespace') {
      if (namespace !== undefined) return undefined; // repeated flag
      const value = tokens[index + 1];
      if (!value || value.startsWith('-')) return undefined;
      namespace = value;
      index += 1;
      continue;
    }

    const namespaceInline = /^--namespace=(.+)$/.exec(token);
    if (namespaceInline) {
      if (namespace !== undefined) return undefined;
      namespace = namespaceInline[1]!;
      continue;
    }

    if (token === '--replicas') {
      if (replicas !== undefined) return undefined;
      const value = tokens[index + 1];
      if (!value || value.startsWith('-')) return undefined;
      replicas = value;
      index += 1;
      continue;
    }

    const replicasInline = /^--replicas=(.+)$/.exec(token);
    if (replicasInline) {
      if (replicas !== undefined) return undefined;
      replicas = replicasInline[1]!;
      continue;
    }

    // `kubectl scale deployment mongodb ...` -- the space-separated resource spelling.
    if (target === undefined && /^deployments?(?:\.apps)?$/.test(token)) {
      const value = tokens[index + 1];
      if (!value || value.startsWith('-')) return undefined;
      target = `deployment/${value}`;
      index += 1;
      continue;
    }

    // Any other flag is unrecognised. This is what rejects --server, --token, --kubeconfig,
    // --as, --context, --insecure-skip-tls-verify, --all-namespaces and -A.
    if (token.startsWith('-')) return undefined;

    // At most one positional resource. A second one (e.g. another deployment) is a smuggled target.
    if (target !== undefined) return undefined;
    target = token;
  }

  if (target === undefined || namespace === undefined || replicas === undefined) return undefined;
  if (!/^\d+$/.test(replicas)) return undefined;

  const canonicalTarget = /^deployments?(?:\.apps)?\/(.+)$/.exec(target);
  const normalizedTarget = canonicalTarget ? `deployment/${canonicalTarget[1]!}` : target;

  return `kubectl scale ${normalizedTarget} -n ${namespace} --replicas=${replicas}`;
}

/** True only for the exact allowlisted restore/rollback commands. */
export function isAllowlistedMitigationCommand(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const normalized = normalizeMitigationCommand(raw);
  if (!normalized) return false;
  return ALLOWLISTED_MITIGATION_COMMANDS.includes(normalized);
}

/** Extracts the command string from a `ToolInput` payload, which may be JSON or a bare string. */
export function extractToolCommand(toolInput: string | undefined): string | undefined {
  if (!toolInput) return undefined;
  const trimmed = toolInput.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const bag = parsed as Record<string, unknown>;
      for (const key of ['command', 'Command', 'cmd', 'script', 'input', 'arguments', 'args']) {
        const value = bag[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

// -----------------------------------------------------------------------------
// Correlation
// -----------------------------------------------------------------------------

export type CorrelationVerdict = 'match' | 'mismatch' | 'insufficient';

/**
 * Compares a row's identifiers against the correlation key using exact string equality.
 *
 *  - Any identifier present on BOTH sides that differs => `mismatch` (hard reject; this is how a
 *    forged or cross-incident row is caught).
 *  - At least one identifier present on both sides and equal => `match`.
 *  - No identifier present on both sides => `insufficient` (never assumed to match).
 */
export function correlateRow(
  row: { threadId?: string; correlationId?: string; incidentId?: string; traceId?: string },
  key: MitigationCorrelationKey,
): CorrelationVerdict {
  const fields: (keyof MitigationCorrelationKey)[] = ['threadId', 'correlationId', 'incidentId', 'traceId'];
  let matched = false;
  for (const field of fields) {
    const expected = key[field];
    const actual = row[field];
    if (!expected || !actual) continue;
    if (expected !== actual) return 'mismatch';
    matched = true;
  }
  return matched ? 'match' : 'insufficient';
}

/**
 * Correlates a RAW telemetry row (as returned by SreAgentEvidenceService) using the same strict
 * rules as `correlateRow`.
 *
 * Callers must use this rather than an ad-hoc `row.IncidentId === x || row.ThreadId === y` check.
 * An OR short-circuits: with a matching IncidentId it would never compare ThreadId, so a snapshot
 * belonging to a DIFFERENT agent thread of the same incident would be accepted -- which matters
 * most for the run-mode gate, where it could present an ungated autonomous write as a
 * human-approved Review-mode mitigation.
 */
export function correlateRawRow(row: Record<string, unknown>, key: MitigationCorrelationKey): CorrelationVerdict {
  return correlateRow(readSharedIds(row), key);
}

// -----------------------------------------------------------------------------
// Row parsers -- each drops malformed rows instead of coercing them into something usable
// -----------------------------------------------------------------------------

function resolveApprovalOutcome(row: Record<string, unknown>): { outcome: MitigationApprovalOutcome; source?: string } {
  for (const key of APPROVAL_OUTCOME_KEYS) {
    const raw = readDimension(row, key);
    if (raw === undefined || raw === null) continue;
    const token = String(raw).trim().toLowerCase();
    if (!token) continue;
    if (APPROVED_TOKENS.includes(token)) return { outcome: 'approved', source: key };
    if (REJECTED_TOKENS.includes(token)) return { outcome: 'rejected', source: key };
  }
  // SCHEMA_TBD: a decision row exists but no recognised outcome key. Report unknown, never guess.
  return { outcome: 'unknown' };
}

export function parseApprovalDecisionRows(rawRows: Record<string, unknown>[]): ParsedApprovalDecisionRow[] {
  const parsed: ParsedApprovalDecisionRow[] = [];
  for (const row of rawRows) {
    const observedAt = toOptionalString(row.timestamp) ?? toOptionalString(readDimension(row, 'LogTimestamp'));
    if (!observedAt || toTimestampMs(observedAt) === undefined) continue;
    const ids = readSharedIds(row);
    const { outcome, source } = resolveApprovalOutcome(row);
    parsed.push({
      observedAt,
      outcome,
      outcomeSource: source,
      ...ids,
      callId: toOptionalString(readDimension(row, 'CallId')),
    });
  }
  return parsed;
}

export function parseToolExecutionRows(rawRows: Record<string, unknown>[]): ParsedToolExecutionRow[] {
  const parsed: ParsedToolExecutionRow[] = [];
  for (const row of rawRows) {
    const observedAt = toOptionalString(row.timestamp) ?? toOptionalString(readDimension(row, 'LogTimestamp'));
    if (!observedAt || toTimestampMs(observedAt) === undefined) continue;

    const rawEventType = toOptionalString(readDimension(row, 'EventType'));
    const eventType: ParsedToolExecutionRow['eventType'] =
      rawEventType === 'ToolStart' || rawEventType === 'ToolEnd' ? rawEventType : 'unknown';

    const toolName = toOptionalString(readDimension(row, 'ToolName'));
    const toolInput = toOptionalString(readDimension(row, 'ToolInput'));
    const toolOutput = toOptionalString(readDimension(row, 'ToolOutput'));
    const command = extractToolCommand(toolInput);

    const allowlisted =
      !!toolName && ALLOWLISTED_MITIGATION_TOOLS.includes(toolName) && isAllowlistedMitigationCommand(command);
    const blocked = !!toolOutput && BLOCKED_OUTPUT_PATTERNS.some(pattern => pattern.test(toolOutput));
    const failed = !blocked && !!toolOutput && FAILED_OUTPUT_PATTERNS.some(pattern => pattern.test(toolOutput));

    parsed.push({
      observedAt,
      eventType,
      toolName,
      // Redact before the value can reach a response body, a log, or an evidence bundle.
      toolInput: toolInput ? redactSensitiveText(toolInput).slice(0, 2_000) : undefined,
      toolOutput: toolOutput ? redactSensitiveText(toolOutput).slice(0, 2_000) : undefined,
      callId: toOptionalString(readDimension(row, 'CallId')),
      subAgentName: toOptionalString(readDimension(row, 'SubAgentName')),
      ...readSharedIds(row),
      allowlisted,
      blocked,
      failed,
    });
  }
  return parsed;
}

export function parseAzCliExecutionRows(rawRows: Record<string, unknown>[]): ParsedAzCliExecutionRow[] {
  const parsed: ParsedAzCliExecutionRow[] = [];
  for (const row of rawRows) {
    const observedAt = toOptionalString(row.timestamp) ?? toOptionalString(readDimension(row, 'LogTimestamp'));
    if (!observedAt || toTimestampMs(observedAt) === undefined) continue;
    // SCHEMA_TBD: Microsoft names the AgentAzCliExecution event but does not itemise its fields.
    const rawCommand = toOptionalString(readDimension(row, 'Command')) ?? toOptionalString(readDimension(row, 'AzCliCommand'));
    const exitCode = toOptionalInteger(readDimension(row, 'ExitCode'));
    const succeededRaw = toOptionalString(readDimension(row, 'Succeeded'));
    parsed.push({
      observedAt,
      command: rawCommand ? redactSensitiveText(rawCommand).slice(0, 1_000) : undefined,
      exitCode,
      succeeded: succeededRaw === undefined ? undefined : succeededRaw.toLowerCase() === 'true',
      callId: toOptionalString(readDimension(row, 'CallId')),
      ...readSharedIds(row),
    });
  }
  return parsed;
}

// -----------------------------------------------------------------------------
// Temporal integrity
// -----------------------------------------------------------------------------

interface TemporalFilterResult<T> {
  accepted: T[];
  rejections: string[];
}

/**
 * Rejects rows that are future-dated beyond the tolerated clock skew, and de-duplicates replayed
 * rows. A replay is the same identity tuple (callId|spanId|correlationId + observedAt + kind)
 * appearing more than once.
 */
function filterTemporalIntegrity<T extends { observedAt: string; callId?: string; spanId?: string; correlationId?: string }>(
  rows: T[],
  kind: string,
  nowMs: number,
  maxSkewSeconds: number,
): TemporalFilterResult<T> {
  const accepted: T[] = [];
  const rejections: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const ms = toTimestampMs(row.observedAt);
    if (ms === undefined) {
      rejections.push(`${kind} row rejected: unparsable timestamp.`);
      continue;
    }
    if (ms - nowMs > maxSkewSeconds * 1_000) {
      rejections.push(
        `${kind} row rejected: timestamp ${row.observedAt} is more than ${maxSkewSeconds}s in the future, which indicates a fabricated or clock-skewed event.`,
      );
      continue;
    }
    const identity = `${kind}|${row.callId ?? ''}|${row.spanId ?? ''}|${row.correlationId ?? ''}|${row.observedAt}`;
    if (seen.has(identity)) {
      rejections.push(`${kind} row rejected: duplicate/replayed event with identity already observed at ${row.observedAt}.`);
      continue;
    }
    seen.add(identity);
    accepted.push(row);
  }

  return { accepted, rejections };
}

function freshness(observedAt: string, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - (toTimestampMs(observedAt) ?? nowMs)) / 1_000));
}

// -----------------------------------------------------------------------------
// Run mode
// -----------------------------------------------------------------------------

/**
 * Resolves the EFFECTIVE run mode from observed telemetry. A response plan's configured mode is not
 * trusted; only `AgentAutonomyLevel` as it was actually recorded for this incident counts.
 */
export function resolveEffectiveRunMode(autonomyLevel: string | undefined): MitigationRunMode {
  const token = (autonomyLevel ?? '').trim().toLowerCase();
  if (token === 'review') return 'review';
  if (token === 'autonomous' || token === 'auto') return 'autonomous';
  return 'unknown';
}

// -----------------------------------------------------------------------------
// Resource state / mutation
// -----------------------------------------------------------------------------

/**
 * Decides whether the target resource mutated between two observations.
 * Returns `unknown` whenever the pair is incomplete or stale -- it NEVER downgrades an unknown or
 * applied mutation into `unchanged`, because that is precisely how a denial could be faked.
 */
export function resolveMutationState(
  before: ResourceStateObservation | undefined,
  after: ResourceStateObservation | undefined,
  nowMs: number,
  staleSeconds: number,
): MitigationResourceStateEvidence {
  if (!before || !after) {
    return {
      before,
      after,
      mutation: 'unknown',
      reason: 'Before/after resource-state observations are incomplete, so no claim about mutation can be made.',
    };
  }

  if (before.resource !== MITIGATION_TARGET.resource || after.resource !== MITIGATION_TARGET.resource) {
    return {
      before,
      after,
      mutation: 'unknown',
      reason: `Resource-state observations do not both target ${MITIGATION_TARGET.resource}; refusing to compare unrelated resources.`,
    };
  }

  const beforeMs = toTimestampMs(before.observedAt);
  const afterMs = toTimestampMs(after.observedAt);
  if (beforeMs === undefined || afterMs === undefined) {
    return { before, after, mutation: 'unknown', reason: 'A resource-state observation has an unusable timestamp.' };
  }
  if (afterMs < beforeMs) {
    return { before, after, mutation: 'unknown', reason: 'The "after" observation predates the "before" observation; the pair is out of order.' };
  }
  if (freshness(after.observedAt, nowMs) > staleSeconds) {
    return { before, after, mutation: 'unknown', reason: 'The "after" resource-state observation is stale; it cannot prove the current state.' };
  }
  if (before.specReplicas === undefined || after.specReplicas === undefined) {
    return { before, after, mutation: 'unknown', reason: 'spec.replicas was not observed on both sides, so mutation cannot be determined.' };
  }

  const replicasChanged = before.specReplicas !== after.specReplicas;
  const generationChanged =
    before.observedGeneration !== undefined &&
    after.observedGeneration !== undefined &&
    before.observedGeneration !== after.observedGeneration;

  if (replicasChanged || generationChanged) {
    return {
      before,
      after,
      mutation: 'applied',
      reason: `Resource changed between observations (spec.replicas ${before.specReplicas} -> ${after.specReplicas}${generationChanged ? `, observedGeneration ${before.observedGeneration} -> ${after.observedGeneration}` : ''}).`,
    };
  }

  return {
    before,
    after,
    mutation: 'unchanged',
    reason: `Resource unchanged between observations (spec.replicas remained ${before.specReplicas}).`,
  };
}

// -----------------------------------------------------------------------------
// Verification
// -----------------------------------------------------------------------------

function summarizeVerification(
  probes: VerificationProbeEvidence[],
  executionCompletedAtMs: number | undefined,
): MitigationVerificationEvidence {
  const byName = new Map<VerificationProbeName, VerificationProbeEvidence>();
  for (const probe of probes) {
    // Last writer wins per probe name so a caller cannot pad the array with a duplicate pass.
    byName.set(probe.probe, probe);
  }
  const present = [...byName.values()];
  const missingProbes = REQUIRED_VERIFICATION_PROBES.filter(name => !byName.has(name));

  const probeTimes = present
    .map(probe => toTimestampMs(probe.observedAt))
    .filter((value): value is number => value !== undefined);
  const earliest = probeTimes.length > 0 ? Math.min(...probeTimes) : undefined;

  const postDatesExecution =
    executionCompletedAtMs !== undefined &&
    earliest !== undefined &&
    probeTimes.length === present.length &&
    earliest > executionCompletedAtMs;

  const allProbesPassed =
    missingProbes.length === 0 && present.length > 0 && present.every(probe => probe.status === 'pass');

  return {
    probes: present.sort((a, b) => a.probe.localeCompare(b.probe)),
    missingProbes,
    allProbesPassed,
    earliestProbeAt: earliest !== undefined ? new Date(earliest).toISOString() : undefined,
    postDatesExecution,
  };
}

// -----------------------------------------------------------------------------
// Lifecycle derivation
// -----------------------------------------------------------------------------

export interface DeriveMitigationLifecycleInput {
  now?: Date;
  /** Correlation identifiers previously OBSERVED for this incident (never operator-invented). */
  correlation: MitigationCorrelationKey;
  /** `AgentAutonomyLevel` as observed on the correlated IncidentActivitySnapshot row. */
  observedAutonomyLevel?: string;
  /** Whether the incident snapshot itself reported agent mitigation. */
  incidentMitigatedByAgent?: boolean;
  approvalRows?: Record<string, unknown>[];
  toolExecutionRows?: Record<string, unknown>[];
  azCliRows?: Record<string, unknown>[];
  /**
   * Explicit pre-decision observation. When omitted, one is selected from `resourceStateHistory`.
   * Supplying this directly is intended for tests and for a caller that captured a genuine
   * pre-decision reading.
   */
  resourceStateBefore?: ResourceStateObservation;
  /**
   * Time-ordered observations of the target resource. The "before" reading is chosen as the newest
   * entry AT OR BEFORE the observed decision timestamp.
   *
   * This matters: using "the previous poll" instead would let the comparison window slide past a
   * mutation. Once a mutation had settled, two later polls would both read the mutated value, and a
   * rejected proposal that DID change the resource would be reported as a clean `denied`.
   */
  resourceStateHistory?: ResourceStateObservation[];
  resourceStateAfter?: ResourceStateObservation;
  probes?: VerificationProbeEvidence[];
  staleSeconds?: number;
  maxClockSkewSeconds?: number;
  schemaMismatch?: boolean;
}

/**
 * Picks the newest observation at or before `decisionAtMs`. Returns undefined when the history
 * contains nothing old enough, so the caller reports `unknown` rather than comparing two
 * post-decision readings.
 */
export function selectPreDecisionObservation(
  history: ResourceStateObservation[] | undefined,
  decisionAtMs: number | undefined,
): ResourceStateObservation | undefined {
  if (!history || history.length === 0 || decisionAtMs === undefined) return undefined;
  let best: ResourceStateObservation | undefined;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const observation of history) {
    const ms = toTimestampMs(observation.observedAt);
    if (ms === undefined || ms > decisionAtMs) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = observation;
    }
  }
  return best;
}

/* eslint-disable-next-line complexity -- a single auditable decision table is safer here than
   scattering the lifecycle rules across helpers that could drift apart. */
export function deriveMitigationLifecycle(input: DeriveMitigationLifecycleInput): ReviewModeMitigationEvidence {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const staleSeconds = input.staleSeconds ?? DEFAULT_MITIGATION_STALE_SECONDS;
  const maxSkew = input.maxClockSkewSeconds ?? DEFAULT_MAX_CLOCK_SKEW_SECONDS;

  const rejectedEvidence: string[] = [];
  const securityFindings: string[] = [];
  const limitations: string[] = [
    'Every lifecycle state below is derived from observed Azure SRE Agent audit telemetry; Mission Control never accepts a lifecycle state, approval, or execution result asserted by a caller.',
    'ApprovalDecision outcome fields are SCHEMA_TBD (docs/CAPABILITY-CONTRACTS.md §8); an unrecognised outcome resolves to `unknown`, never to `approved`.',
  ];

  const base = {
    scenario: 'MongoDBDown' as const,
    targetResource: MITIGATION_TARGET.resource,
    proposedCommand: ALLOWLISTED_MITIGATION_COMMANDS[0]!,
    correlation: input.correlation,
    schemaMismatch: !!input.schemaMismatch,
  };

  const emptyVerification: MitigationVerificationEvidence = {
    probes: [],
    missingProbes: [...REQUIRED_VERIFICATION_PROBES],
    allProbesPassed: false,
    postDatesExecution: false,
  };

  if (input.schemaMismatch) {
    return {
      ...base,
      state: 'no-evidence',
      incidentResolved: false,
      effectiveRunMode: 'unknown',
      runModeBlocked: true,
      verification: emptyVerification,
      guidance: {
        escalation: 'The audit telemetry schema no longer matches the documented event/field names. Re-validate against https://learn.microsoft.com/azure/sre-agent/audit-agent-actions before running the demo.',
      },
      stale: false,
      securityFindings,
      rejectedEvidence,
      limitations: [...limitations, 'The evidence query failed schema validation, so no lifecycle state can be derived.'],
    };
  }

  const hasCorrelationKey = Object.values(input.correlation).some(value => typeof value === 'string' && value.trim().length > 0);
  if (!hasCorrelationKey) {
    return {
      ...base,
      state: 'ambiguous',
      incidentResolved: false,
      effectiveRunMode: resolveEffectiveRunMode(input.observedAutonomyLevel),
      runModeBlocked: true,
      verification: emptyVerification,
      guidance: { escalation: 'Provide an observed ThreadId, CorrelationId, IncidentId, or TraceId. Mission Control refuses to attach mitigation evidence without a precise identifier.' },
      stale: false,
      securityFindings,
      rejectedEvidence: [...rejectedEvidence, 'No correlation identifier was supplied; all candidate evidence was discarded rather than matched heuristically.'],
      limitations,
    };
  }

  // --- Run-mode gate: must be observed as Review, loudly blocking otherwise. -------------------
  const effectiveRunMode = resolveEffectiveRunMode(input.observedAutonomyLevel);
  if (effectiveRunMode !== 'review') {
    const detail =
      effectiveRunMode === 'autonomous'
        ? 'The response plan executed in AUTONOMOUS mode. Issue #80 forbids demonstrating autonomous execution; the approval gate did not apply.'
        : 'The effective run mode could not be observed. Mission Control will not present an approval narrative it cannot prove.';
    securityFindings.push(`Run-mode gate failed: effective mode is '${effectiveRunMode}', expected 'review'. ${detail}`);
    return {
      ...base,
      state: 'blocked-run-mode',
      incidentResolved: false,
      effectiveRunMode,
      runModeBlocked: true,
      verification: emptyVerification,
      guidance: {
        escalation: 'Set the response plan Agent autonomy level to Review (https://learn.microsoft.com/azure/sre-agent/run-modes), re-run the scenario, and confirm AgentAutonomyLevel == "review" in IncidentActivitySnapshot before demonstrating this flow.',
      },
      stale: false,
      securityFindings,
      rejectedEvidence,
      limitations,
    };
  }

  // --- Parse + temporal integrity -------------------------------------------------------------
  const approvalsParsed = filterTemporalIntegrity(parseApprovalDecisionRows(input.approvalRows ?? []), 'ApprovalDecision', nowMs, maxSkew);
  const toolsParsed = filterTemporalIntegrity(parseToolExecutionRows(input.toolExecutionRows ?? []), 'AgentToolExecution', nowMs, maxSkew);
  const azCliParsed = filterTemporalIntegrity(parseAzCliExecutionRows(input.azCliRows ?? []), 'AgentAzCliExecution', nowMs, maxSkew);
  rejectedEvidence.push(...approvalsParsed.rejections, ...toolsParsed.rejections, ...azCliParsed.rejections);

  // --- Exact-identifier correlation -----------------------------------------------------------
  const approvals: ParsedApprovalDecisionRow[] = [];
  for (const row of approvalsParsed.accepted) {
    const verdict = correlateRow(row, input.correlation);
    if (verdict === 'match') approvals.push(row);
    else rejectedEvidence.push(`ApprovalDecision row at ${row.observedAt} rejected: identifier ${verdict} against the incident correlation key.`);
  }

  const tools: ParsedToolExecutionRow[] = [];
  for (const row of toolsParsed.accepted) {
    const verdict = correlateRow(row, input.correlation);
    if (verdict === 'match') tools.push(row);
    else rejectedEvidence.push(`AgentToolExecution row at ${row.observedAt} rejected: identifier ${verdict} against the incident correlation key.`);
  }

  const azCli: ParsedAzCliExecutionRow[] = [];
  for (const row of azCliParsed.accepted) {
    if (correlateRow(row, input.correlation) === 'match') azCli.push(row);
  }

  // --- Out-of-scope / blocked attempts are security findings, never progress -------------------
  //
  // Every non-allowlisted row is reported regardless of EventType. Excluding `ToolEnd` (as an
  // earlier revision did) meant a disallowed operation that SUCCEEDED and was represented only by
  // its ToolEnd row produced no security finding at all -- the completion of a forbidden action was
  // quieter than its attempt. Start/End pairs for the same call are deduped by CallId (falling back
  // to SpanId, then the command text) so one attempt yields one finding.
  const outOfScopeByCall = new Map<string, ParsedToolExecutionRow>();
  for (const row of tools) {
    if (row.allowlisted) continue;
    const command = extractToolCommand(row.toolInput);
    const identity = row.callId ?? row.spanId ?? `${row.toolName ?? 'unknown'}|${command ?? 'unknown'}`;
    const existing = outOfScopeByCall.get(identity);
    // Prefer the ToolEnd row: it carries the outcome, which is the more serious evidence.
    if (!existing || (existing.eventType !== 'ToolEnd' && row.eventType === 'ToolEnd')) {
      outOfScopeByCall.set(identity, row);
    }
  }
  for (const row of outOfScopeByCall.values()) {
    const command = extractToolCommand(row.toolInput);
    const outcome = row.eventType === 'ToolEnd'
      ? (row.blocked ? 'It was blocked at the enforcement boundary.' : 'It COMPLETED -- treat this as a policy bypass until proven otherwise.')
      : 'It must not have executed.';
    securityFindings.push(
      `Out-of-scope tool call observed at ${row.observedAt} (${row.eventType}): tool='${row.toolName ?? 'unknown'}' command='${(command ?? 'unknown').slice(0, 200)}'. It is outside the allowlist in docs/REVIEW-MODE-MITIGATION.md §3. ${outcome}`,
    );
  }
  const blockedRows = tools.filter(row => row.blocked);
  for (const row of blockedRows) {
    securityFindings.push(`Tool call at ${row.observedAt} was blocked by policy or the Kubernetes API server, as designed.`);
  }

  // --- Approval -------------------------------------------------------------------------------
  const sortedApprovals = [...approvals].sort((a, b) => (toTimestampMs(b.observedAt) ?? 0) - (toTimestampMs(a.observedAt) ?? 0));
  const latestApproval = sortedApprovals[0];
  const approvalEvidence: MitigationApprovalEvidence | undefined = latestApproval
    ? {
        outcome: latestApproval.outcome,
        observedAt: latestApproval.observedAt,
        outcomeSource: latestApproval.outcomeSource,
        threadId: latestApproval.threadId,
        correlationId: latestApproval.correlationId,
        incidentId: latestApproval.incidentId,
        traceId: latestApproval.traceId,
        freshnessSeconds: freshness(latestApproval.observedAt, nowMs),
        stale: freshness(latestApproval.observedAt, nowMs) > staleSeconds,
      }
    : undefined;

  // --- Execution ------------------------------------------------------------------------------
  const allowlistedTools = tools.filter(row => row.allowlisted);
  const executionStart = allowlistedTools.filter(row => row.eventType === 'ToolStart').sort((a, b) => (toTimestampMs(a.observedAt) ?? 0) - (toTimestampMs(b.observedAt) ?? 0))[0];
  const executionEnd = allowlistedTools.filter(row => row.eventType === 'ToolEnd').sort((a, b) => (toTimestampMs(b.observedAt) ?? 0) - (toTimestampMs(a.observedAt) ?? 0))[0];
  const executionAnchor = executionEnd ?? executionStart;

  const executionEvidence: MitigationExecutionEvidence | undefined = executionAnchor
    ? {
        toolName: executionAnchor.toolName ?? 'unknown',
        command: extractToolCommand(executionAnchor.toolInput),
        startedAt: executionStart?.observedAt,
        completedAt: executionEnd?.observedAt,
        callId: executionAnchor.callId,
        threadId: executionAnchor.threadId,
        correlationId: executionAnchor.correlationId,
        traceId: executionAnchor.traceId,
        allowlisted: executionAnchor.allowlisted,
        blocked: executionAnchor.blocked || (executionEnd?.blocked ?? false),
        failed: executionEnd?.failed ?? false,
        azCliCorrelated: azCli.length > 0,
        freshnessSeconds: freshness(executionAnchor.observedAt, nowMs),
        stale: freshness(executionAnchor.observedAt, nowMs) > staleSeconds,
      }
    : undefined;

  const executionCompletedAtMs = executionEnd ? toTimestampMs(executionEnd.observedAt) : undefined;

  // The "before" reading must predate the decision. An explicit one is trusted; otherwise select
  // the newest historical observation at or before the decision, so the comparison window cannot
  // slide past a mutation and turn a real change into a false `unchanged`.
  const decisionAtMs = latestApproval ? toTimestampMs(latestApproval.observedAt) : undefined;
  const selectedBefore = selectPreDecisionObservation(input.resourceStateHistory, decisionAtMs);
  let resourceStateBefore = input.resourceStateBefore ?? selectedBefore;

  if (resourceStateBefore && decisionAtMs !== undefined) {
    const beforeMs = toTimestampMs(resourceStateBefore.observedAt);
    if (beforeMs === undefined || beforeMs > decisionAtMs) {
      rejectedEvidence.push(
        `Resource-state "before" observation at ${resourceStateBefore.observedAt} post-dates the decision at ${latestApproval!.observedAt}; it cannot prove the pre-decision state and was discarded.`,
      );
      resourceStateBefore = undefined;
    }
  }

  // --- Ordering integrity ---------------------------------------------------------------------
  const approvalMs = latestApproval ? toTimestampMs(latestApproval.observedAt) : undefined;
  const executionStartMs = executionStart ? toTimestampMs(executionStart.observedAt) : undefined;
  const executionPrecedesApproval =
    approvalMs !== undefined && executionStartMs !== undefined && executionStartMs < approvalMs;
  if (executionPrecedesApproval) {
    securityFindings.push(
      `Ordering violation: an allowlisted execution started at ${executionStart!.observedAt}, before the approval recorded at ${latestApproval!.observedAt}. Execution must never precede approval in Review mode.`,
    );
  }

  const resourceState = resolveMutationState(resourceStateBefore, input.resourceStateAfter, nowMs, staleSeconds);
  const verification = summarizeVerification(input.probes ?? [], executionCompletedAtMs);

  const observedAt = [latestApproval?.observedAt, executionAnchor?.observedAt]
    .filter((value): value is string => !!value)
    .sort((a, b) => (toTimestampMs(b) ?? 0) - (toTimestampMs(a) ?? 0))[0];
  const stale = observedAt ? freshness(observedAt, nowMs) > staleSeconds : false;

  const rollbackGuidance: MitigationGuidance = {
    rollbackCommand: ROLLBACK_COMMAND,
    rollbackRationale: `Returns ${MITIGATION_TARGET.resource} to the scenario's broken baseline. It is inside the same allowlist, so the rollback is itself gated and audited.`,
    escalation: 'Leave the incident unresolved, capture the correlated ThreadId/CorrelationId timeline, and escalate to the platform owner before retrying.',
  };

  const result = (state: ReviewModeMitigationState, guidance: MitigationGuidance, extraLimitations: string[] = []): ReviewModeMitigationEvidence => ({
    ...base,
    state,
    incidentResolved: state === 'verification-passed',
    effectiveRunMode,
    runModeBlocked: false,
    approval: approvalEvidence,
    execution: executionEvidence,
    resourceState,
    verification,
    guidance,
    observedAt,
    stale,
    securityFindings,
    rejectedEvidence,
    limitations: [...limitations, ...extraLimitations],
  });

  // --- Decision table -------------------------------------------------------------------------

  if (executionPrecedesApproval) {
    return result('execution-failed', rollbackGuidance, ['An execution was observed before its approval; the flow is not a valid Review-mode demonstration.']);
  }

  // Denial path. Requires BOTH an observed rejection AND proof of no mutation.
  if (approvalEvidence?.outcome === 'rejected') {
    if (resourceState.mutation === 'applied') {
      securityFindings.push(
        `DENY VIOLATION: the approval was rejected at ${approvalEvidence.observedAt}, but ${MITIGATION_TARGET.resource} still changed. ${resourceState.reason}`,
      );
      return result('deny-violation', rollbackGuidance, ['A rejected proposal must never mutate the resource. Investigate the tool access policy and RBAC boundary immediately.']);
    }
    if (resourceState.mutation !== 'unchanged' || approvalEvidence.stale) {
      return result('denied-with-unverified-state', {
        escalation: 'A rejection was observed, but the before/after resource state does not prove the resource was left untouched. Capture a fresh before/after pair before presenting the deny path.',
      }, [
        approvalEvidence.stale
          ? 'The rejection event is stale, so it cannot describe the current state.'
          : resourceState.reason,
        'Mission Control will not report `denied` without proof of no mutation; it never rewrites `applied` or `unknown` into `unchanged`.',
      ]);
    }
    return result('denied', {
      escalation: 'No action was taken. Re-propose the mitigation to demonstrate the approve path.',
    }, [resourceState.reason]);
  }

  // Blocked execution: an allowlisted call that the policy or API server refused.
  if (executionEvidence?.blocked) {
    return result('execution-blocked', rollbackGuidance, ['The execution was blocked at the enforcement boundary; no mitigation was applied.']);
  }

  // Approve path.
  if (approvalEvidence?.outcome === 'approved') {
    if (!executionEvidence) {
      return result('approved', {
        escalation: 'An approval was observed but no matching allowlisted execution telemetry has appeared yet. Do not report the mitigation as applied.',
      }, ['Approval without correlated execution telemetry is reported as `approved`, never as executed or verified.']);
    }
    if (executionEvidence.failed) {
      return result('execution-failed', rollbackGuidance, ['The approved action executed but reported a failure.']);
    }
    if (!executionEvidence.completedAt) {
      return result('executing', {
        escalation: 'Execution has started but no ToolEnd event has been observed. Wait for completion before verifying.',
      }, ['No ToolEnd event was observed, so the execution is still in flight.']);
    }
    if (verification.probes.length === 0) {
      return result('verification-failed', rollbackGuidance, ['No verification probes were collected, so recovery is unproven and the incident stays unresolved.']);
    }
    if (!verification.postDatesExecution) {
      return result('verification-failed', rollbackGuidance, [
        'At least one verification probe is missing a timestamp or does not post-date the execution. A probe collected before the fix cannot prove the fix worked.',
      ]);
    }
    if (!verification.allProbesPassed) {
      const failing = verification.probes.filter(probe => probe.status !== 'pass').map(probe => `${probe.probe}=${probe.status}`);
      return result('verification-failed', rollbackGuidance, [
        `Verification did not pass (${[...failing, ...verification.missingProbes.map(name => `${name}=missing`)].join(', ') || 'incomplete probe set'}). The incident remains unresolved.`,
      ]);
    }
    if (resourceState.mutation === 'unchanged') {
      return result('verification-failed', rollbackGuidance, [
        'Verification probes passed, but the before/after resource state shows no change was applied. Refusing to report a mitigation that did not mutate the target.',
      ]);
    }
    if (stale) {
      return result('verification-failed', rollbackGuidance, ['The newest correlated evidence is stale; recovery cannot be claimed from it.']);
    }

    // Rollback is the same allowlisted command with --replicas=0.
    const wasRollback = executionEvidence.command
      ? normalizeMitigationCommand(executionEvidence.command) === ROLLBACK_COMMAND
      : false;
    if (wasRollback) {
      return result('rolled-back', {
        escalation: 'The rollback command executed and was verified. The scenario is back at its broken baseline.',
      }, ['The executed command was the allowlisted rollback, not the restore.']);
    }

    return result('verification-passed', {}, [
      'Recovery is evidenced by three structured probes (Kubernetes readiness, service endpoint health, and the synthetic golden transaction), each carrying source, observed value, timestamp and freshness.',
    ]);
  }

  // An execution without any correlated approval is a governance failure.
  if (executionEvidence) {
    securityFindings.push(
      `Execution observed at ${executionEvidence.completedAt ?? executionEvidence.startedAt ?? 'unknown time'} with no correlated ApprovalDecision. In Review mode every write must be preceded by a recorded approval.`,
    );
    return result('execution-failed', rollbackGuidance, ['Execution telemetry exists without a correlated approval; this is reported as a failure, not as a successful mitigation.']);
  }

  if (approvalEvidence && approvalEvidence.outcome === 'unknown') {
    return result('proposed', {
      escalation: 'An ApprovalDecision event was observed but its outcome could not be read from the documented schema. Confirm the decision in the SRE Agent portal before proceeding.',
    }, ['ApprovalDecision outcome is SCHEMA_TBD; presence alone is never treated as approval.']);
  }

  if (input.incidentMitigatedByAgent) {
    securityFindings.push(
      'IncidentActivitySnapshot reports IncidentMitigatedByAgent=true, but no correlated ApprovalDecision or allowlisted execution was observed. Do not present this as an approved mitigation.',
    );
  }

  return result('proposed', {
    escalation: 'No approval decision has been recorded yet. The proposal is awaiting an operator decision in the SRE Agent portal.',
  }, ['No ApprovalDecision row was correlated, so the mitigation is still awaiting a decision.']);
}
