// Reconciles local Action Group -> Mission Control incident handoffs (IncidentHandoffService.ts)
// with native Azure SRE Agent evidence observed in Application Insights customEvents
// (SreAgentEvidenceService.ts). Pure/no-I/O so it stays cheap to unit test.
//
// Contract (issue #76):
// - Never fabricate an incident/thread/response-plan ID. Only report values that were observed in
//   a queried row.
// - Zero observed rows -> 'evidence-unavailable' (if there's no local fallback either) or
//   'local-fallback-only' (if the Action Group webhook already created a local card). Never infer
//   a healthy/mitigated state from missing telemetry.
// - Duplicate IncidentActivitySnapshot rows for the same IncidentId are lifecycle updates, not
//   separate incidents (per https://learn.microsoft.com/azure/sre-agent/audit-agent-actions) --
//   the latest row by timestamp wins.
// - Evidence older than `staleMinutes` is flagged `stale: true` but still returned; it is not
//   discarded, because a stale "native-mitigated" is still more informative than nothing.
// - `withinCooldown` is an informational, client-side estimate of the documented reinvestigation
//   cooldown window (default 3h, https://learn.microsoft.com/azure/sre-agent/response-plan). The
//   real merge decision is made by Azure SRE Agent itself; Mission Control does not claim to
//   control or guarantee it.
import type { NativeApprovalDecisionState, NativeIncidentEvidence, NativeIncidentEvidenceState } from '../types/index.js';

export const DEFAULT_REINVESTIGATION_COOLDOWN_HOURS = 3; // Documented Azure Monitor response-plan default.
export const DEFAULT_STALE_MINUTES = 30;

export interface ParsedIncidentActivitySnapshot {
  observedAt: string;
  incidentId: string;
  incidentTitle?: string;
  incidentStatus?: string;
  incidentMitigatedByAgent: boolean;
  incidentAssistedByAgent: boolean;
  agentAutonomyLevel?: string;
  responsePlanId?: string;
  responsePlanCustom?: boolean;
  incidentImpactedService?: string;
  incidentCreatedOn?: string;
  incidentHandledOn?: string;
  incidentMitigatedOn?: string;
  threadId?: string;
  correlationId?: string;
}

export interface ReconcileNativeEvidenceOptions {
  now?: Date;
  cooldownHours?: number;
  staleMinutes?: number;
  hasLocalFallback: boolean;
  schemaMismatch?: boolean;
  /**
   * True only when `rawRows` were filtered by an explicit, previously observed IncidentId or
   * ThreadId. False (default) when correlation relied on the best-effort impactedService
   * heuristic -- in that case, more than one distinct IncidentId surviving de-duplication is
   * treated as an ambiguous match rather than silently picking the newest.
   */
  strongCorrelation?: boolean;
  /** Raw ApprovalDecision rows correlated to the same thread/incident, if queried. */
  approvalRows?: Record<string, unknown>[];
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

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

/**
 * Parses raw `incident-activity-snapshot` query rows (Record<string, unknown> as returned by
 * SreAgentEvidenceService) into typed rows, dropping any row missing the fields required for
 * correlation (`timestamp`, `IncidentId`) or with an unparsable timestamp. Malformed/partial rows
 * are excluded rather than throwing, and an unparsable timestamp is never substituted with "now"
 * -- a row we cannot date is a row we cannot honestly call fresh.
 */
export function parseIncidentActivitySnapshotRows(rawRows: Record<string, unknown>[]): ParsedIncidentActivitySnapshot[] {
  const parsed: ParsedIncidentActivitySnapshot[] = [];
  for (const row of rawRows) {
    const observedAt = toOptionalString(row.timestamp);
    const incidentId = toOptionalString(row.IncidentId);
    if (!observedAt || !incidentId) continue; // Missing required correlation fields -- skip, don't fabricate.
    if (toTimestampMs(observedAt) === undefined) continue; // Unparsable timestamp -- skip rather than treat as "now".

    parsed.push({
      observedAt,
      incidentId,
      incidentTitle: toOptionalString(row.IncidentTitle),
      incidentStatus: toOptionalString(row.IncidentStatus),
      incidentMitigatedByAgent: toBoolean(row.IncidentMitigatedByAgent),
      incidentAssistedByAgent: toBoolean(row.IncidentAssistedByAgent),
      agentAutonomyLevel: toOptionalString(row.AgentAutonomyLevel),
      responsePlanId: toOptionalString(row.ResponsePlanId),
      responsePlanCustom: row.ResponsePlanCustom === undefined ? undefined : toBoolean(row.ResponsePlanCustom),
      incidentImpactedService: toOptionalString(row.IncidentImpactedService),
      incidentCreatedOn: toOptionalString(row.IncidentCreatedOn),
      incidentHandledOn: toOptionalString(row.IncidentHandledOn),
      incidentMitigatedOn: toOptionalString(row.IncidentMitigatedOn),
      threadId: toOptionalString(row.ThreadId),
      correlationId: toOptionalString(row.CorrelationId),
    });
  }
  return parsed;
}

/** Dedupes lifecycle updates for the same IncidentId, keeping only the most recent row per IncidentId. */
export function latestSnapshotPerIncident(rows: ParsedIncidentActivitySnapshot[]): ParsedIncidentActivitySnapshot[] {
  const byIncidentId = new Map<string, ParsedIncidentActivitySnapshot>();
  for (const row of rows) {
    const existing = byIncidentId.get(row.incidentId);
    if (!existing || (toTimestampMs(row.observedAt) ?? 0) >= (toTimestampMs(existing.observedAt) ?? 0)) {
      byIncidentId.set(row.incidentId, row);
    }
  }
  return [...byIncidentId.values()].sort((a, b) => (toTimestampMs(b.observedAt) ?? 0) - (toTimestampMs(a.observedAt) ?? 0));
}

export interface CorrelationSelection {
  rows: Record<string, unknown>[];
  strongCorrelation: boolean;
}

/**
 * Narrows raw `incident-activity-snapshot` rows (already server-side filtered by an optional
 * incidentId/impactedService) to the rows that should be handed to `reconcileNativeIncidentEvidence`,
 * and decides whether that correlation counts as "strong" (precise, safe to auto-resolve even with
 * multiple rows) or merely heuristic (ambiguous if more than one distinct incident remains).
 *
 * - An explicit `incidentId` (previously observed or operator-supplied) is always precise --
 *   the query itself already filtered to that IncidentId.
 * - A known `threadId` that actually matches a returned row is equally precise, even without an
 *   explicit incidentId, because a thread ID uniquely identifies one investigation.
 * - A known `threadId` that matches NOTHING and there is no other precise filter must never fall
 *   back to the full, unfiltered row set -- that would risk attributing a different incident's
 *   evidence to this card. It returns an empty selection instead.
 * - If neither an incidentId nor a matching threadId is available, the selection is only as
 *   precise as whatever server-side filter (e.g. the impactedService heuristic) already applied,
 *   so `strongCorrelation` is false and `reconcileNativeIncidentEvidence` itself decides whether
 *   the resulting set of distinct incidents is unambiguous enough to use.
 */
export function selectRowsForCorrelation(
  rows: Record<string, unknown>[],
  options: { knownThreadId?: string; hasExplicitIncidentId: boolean },
): CorrelationSelection {
  if (options.hasExplicitIncidentId) {
    return { rows, strongCorrelation: true };
  }

  if (options.knownThreadId) {
    const matching = rows.filter(row => row.ThreadId === options.knownThreadId);
    if (matching.length > 0) {
      return { rows: matching, strongCorrelation: true };
    }
    return { rows: [], strongCorrelation: false };
  }

  return { rows, strongCorrelation: false };
}

function resolveApprovalDecision(approvalRows: Record<string, unknown>[] | undefined): NativeApprovalDecisionState {
  // ApprovalDecision only logs "when you approve or reject a proposed agent action" (Microsoft
  // Learn), so no rows means no decision has been recorded yet -- genuinely pending.
  if (!approvalRows || approvalRows.length === 0) return 'pending';
  // A decision WAS recorded, but ApprovalDecision fields beyond the shared correlation fields are
  // SCHEMA_TBD (Microsoft Learn only shows a raw customDimensions projection), so we cannot
  // distinguish approved from rejected without a further-documented schema. Report 'unknown'
  // rather than guessing which way the human decided.
  return 'unknown';
}

/**
 * Reconciles the freshest matching native evidence into a typed, honest Mission Control state.
 * `rawRows` should already be correlated (via SreAgentEvidenceService threadId/incidentId/
 * impactedService filters) to the local incident being reconciled -- this function performs
 * de-duplication and staleness/cooldown scoring, not the initial correlation query.
 *
 * `strongCorrelation` MUST be true only when `rawRows` were filtered by an explicit, previously
 * observed IncidentId or ThreadId (a precise match). When correlation relied only on the
 * best-effort scenarioName -> IncidentImpactedService heuristic (see
 * `SCENARIO_IMPACTED_SERVICE_HINTS` in `routes/incidents.ts`), multiple distinct IncidentIds
 * surviving de-duplication means the match is ambiguous -- this function refuses to silently pick
 * "the newest one" in that case, since that could attribute a different incident's thread/plan/
 * mitigation status to this local card.
 */
export function reconcileNativeIncidentEvidence(
  rawRows: Record<string, unknown>[],
  options: ReconcileNativeEvidenceOptions,
): NativeIncidentEvidence {
  const now = options.now ?? new Date();
  const cooldownHours = options.cooldownHours ?? DEFAULT_REINVESTIGATION_COOLDOWN_HOURS;
  const staleMinutes = options.staleMinutes ?? DEFAULT_STALE_MINUTES;
  const strongCorrelation = options.strongCorrelation ?? false;

  if (options.schemaMismatch) {
    return {
      state: 'evidence-unavailable',
      stale: false,
      schemaMismatch: true,
      cooldownHours,
      withinCooldown: false,
      limitations: [
        'The native evidence query failed schema validation; the deployed Azure SRE Agent telemetry schema may no longer match the documented IncidentActivitySnapshot field names.',
        'Falling back to local Action Group -> Mission Control evidence only.',
      ],
    };
  }

  const parsed = latestSnapshotPerIncident(parseIncidentActivitySnapshotRows(rawRows));

  if (parsed.length === 0) {
    const observedButUnusable = rawRows.length > 0;
    return {
      state: options.hasLocalFallback ? 'local-fallback-only' : 'evidence-unavailable',
      stale: false,
      schemaMismatch: false,
      cooldownHours,
      withinCooldown: false,
      limitations: [
        observedButUnusable
          ? `${rawRows.length} IncidentActivitySnapshot row(s) were returned but none had a usable timestamp/IncidentId -- this can indicate the deployed telemetry schema no longer matches the documented field names; treat as a possible schema drift signal even though no query error was thrown.`
          : 'No IncidentActivitySnapshot rows were observed for this incident in the queried window.',
        options.hasLocalFallback
          ? 'Mission Control is showing the local Action Group webhook handoff only; this is not confirmation that Azure SRE Agent has or has not started a native investigation.'
          : 'No native or local evidence is available for this incident yet.',
      ],
    };
  }

  if (!strongCorrelation && parsed.length > 1) {
    return {
      state: options.hasLocalFallback ? 'local-fallback-only' : 'evidence-unavailable',
      stale: false,
      schemaMismatch: false,
      cooldownHours,
      withinCooldown: false,
      limitations: [
        `${parsed.length} distinct incidents matched the best-effort impactedService correlation heuristic; the match is ambiguous, so no native evidence is attached rather than guessing which incident belongs to this card.`,
        'Provide an explicit threadId or incidentId to correlate precisely.',
      ],
    };
  }

  const latest = parsed[0]!;
  const observedAtMs = toTimestampMs(latest.observedAt);
  if (observedAtMs === undefined) {
    // Defensive: parseIncidentActivitySnapshotRows already filters unparsable timestamps, so this
    // should be unreachable, but never substitute "now" for a date we can't trust.
    return {
      state: options.hasLocalFallback ? 'local-fallback-only' : 'evidence-unavailable',
      stale: false,
      schemaMismatch: false,
      cooldownHours,
      withinCooldown: false,
      limitations: ['The matched evidence row has an unusable timestamp; refusing to report freshness or state from it.'],
    };
  }
  const freshnessSeconds = Math.max(0, Math.round((now.getTime() - observedAtMs) / 1000));
  const stale = freshnessSeconds > staleMinutes * 60;

  const cooldownAnchor = toTimestampMs(latest.incidentMitigatedOn) ?? toTimestampMs(latest.incidentHandledOn);
  const withinCooldown = cooldownAnchor !== undefined && (now.getTime() - cooldownAnchor) < cooldownHours * 60 * 60 * 1000;

  const approvalDecision = resolveApprovalDecision(options.approvalRows);

  let state: NativeIncidentEvidenceState;
  if (latest.incidentMitigatedByAgent) {
    state = 'native-mitigated';
  } else if ((latest.agentAutonomyLevel ?? '').toLowerCase() === 'review' && approvalDecision === 'pending') {
    state = 'native-approval-required';
  } else {
    state = 'native-observed';
  }

  const limitations = [
    'Evidence reflects the most recent IncidentActivitySnapshot row observed for this IncidentId; earlier lifecycle updates are superseded.',
  ];
  if (stale) {
    limitations.push(`Evidence is stale (observed ${Math.round(freshnessSeconds / 60)} minutes ago, threshold ${staleMinutes} minutes) -- re-query before treating this as the current status.`);
  }
  if (!strongCorrelation) {
    limitations.push('This match came from the best-effort scenarioName -> IncidentImpactedService heuristic, not a confirmed threadId/incidentId; treat the correlation itself as provisional.');
  }
  if (approvalDecision === 'pending') {
    limitations.push('No ApprovalDecision event was correlated; approval state is inferred only from AgentAutonomyLevel and IncidentMitigatedByAgent, not from a confirmed approval/rejection record.');
  } else {
    limitations.push('An ApprovalDecision event was observed, but its specific outcome fields are SCHEMA_TBD (docs/CAPABILITY-CONTRACTS.md SS8); only its presence is used here.');
  }
  limitations.push('withinCooldown is a client-side estimate of the documented reinvestigation cooldown window, not a value read from the response plan itself.');

  return {
    state,
    stale,
    schemaMismatch: false,
    observedAt: latest.observedAt,
    freshnessSeconds,
    incidentId: latest.incidentId,
    incidentTitle: latest.incidentTitle,
    responsePlanId: latest.responsePlanId,
    responsePlanCustom: latest.responsePlanCustom,
    autonomyLevel: latest.agentAutonomyLevel,
    mitigatedByAgent: latest.incidentMitigatedByAgent,
    assistedByAgent: latest.incidentAssistedByAgent,
    impactedService: latest.incidentImpactedService,
    threadId: latest.threadId,
    correlationId: latest.correlationId,
    createdOn: latest.incidentCreatedOn,
    handledOn: latest.incidentHandledOn,
    mitigatedOn: latest.incidentMitigatedOn,
    approvalDecision,
    cooldownHours,
    withinCooldown,
    limitations,
  };
}
