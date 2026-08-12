/**
 * Orchestrates the Review-mode mitigation evidence flow (issue #80).
 *
 * Responsibilities:
 *  1. Query the governed, canned SRE Agent evidence templates for the correlated incident.
 *  2. Observe live Kubernetes + customer-impact signals and turn them into structured probes.
 *  3. Hand everything to the pure derivation in `mitigationLifecycle.ts`.
 *
 * This service NEVER accepts a lifecycle state, approval, execution result, or verification
 * outcome from the caller. The request may only supply OBSERVED correlation identifiers and
 * query bounds; unknown keys are rejected outright.
 *
 * Design gate: docs/REVIEW-MODE-MITIGATION.md
 */

import { KubeInputError } from './KubeClient.js';
import { KubeClient } from './KubeClient.js';
import { CustomerImpactService } from './CustomerImpactService.js';
import { SreAgentEvidenceQueryError, SreAgentEvidenceService } from './SreAgentEvidenceService.js';
import {
  ALLOWLISTED_MITIGATION_COMMANDS,
  MITIGATION_TARGET,
  ROLLBACK_COMMAND,
  correlateRawRow,
  deriveMitigationLifecycle,
  parseApprovalDecisionRows,
  type MitigationCorrelationKey,
  type ResourceStateObservation,
  type ReviewModeMitigationEvidence,
} from './sre-agent/mitigationLifecycle.js';
import {
  buildVerificationProbes,
  observeMitigationResourceState,
} from './sre-agent/mitigationProbes.js';
import type { CustomerImpactResponse, InventoryResponse } from '../types/index.js';

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;
const DEFAULT_WINDOW_MINUTES = 60;
const MAX_WINDOW_MINUTES = 24 * 60;

/** Every key a caller may send. Anything else is rejected rather than silently ignored. */
export const MITIGATION_REQUEST_KEYS = Object.freeze([
  'threadId',
  'correlationId',
  'incidentId',
  'traceId',
  'minutes',
]);

export interface ReviewModeMitigationRequest {
  threadId?: string;
  correlationId?: string;
  incidentId?: string;
  traceId?: string;
  minutes?: number;
}

export interface ReviewModeMitigationGuardrails {
  policyDocument: string;
  allowlistedCommands: readonly string[];
  rollbackCommand: string;
  targetResource: string;
  /** Loud, non-suppressible disclosures about permission breadth (docs §4). */
  disclosures: string[];
  references: string[];
}

export interface ReviewModeMitigationResponse {
  scenario: 'MongoDBDown';
  evidence: ReviewModeMitigationEvidence;
  guardrails: ReviewModeMitigationGuardrails;
  evidenceSources: string[];
  collectedAt: string;
}

export class ReviewModeMitigationRequestError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'ReviewModeMitigationRequestError';
  }
}

/**
 * Validates the request body/query. Rejects unknown keys, and rejects any attempt to assert
 * lifecycle data (a forged `state`, `approved`, `verification`, ... key is a 400, not a silent drop).
 */
export function normalizeMitigationRequest(raw: unknown): ReviewModeMitigationRequest {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ReviewModeMitigationRequestError('The mitigation evidence request must be an object.');
  }

  const bag = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(bag).filter(key => !MITIGATION_REQUEST_KEYS.includes(key));
  if (unknownKeys.length > 0) {
    throw new ReviewModeMitigationRequestError(
      `Unknown request field(s): ${unknownKeys.join(', ')}. Mission Control derives the mitigation lifecycle from observed audit telemetry only; callers may supply correlation identifiers and a query window, never lifecycle state, approval, execution, or verification results.`,
    );
  }

  const request: ReviewModeMitigationRequest = {};
  for (const key of ['threadId', 'correlationId', 'incidentId', 'traceId'] as const) {
    const value = bag[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || !ID_PATTERN.test(value.trim())) {
      throw new ReviewModeMitigationRequestError(`'${key}' must be a short identifier matching ${ID_PATTERN}.`);
    }
    request[key] = value.trim();
  }

  if (bag.minutes !== undefined && bag.minutes !== null) {
    const minutes = typeof bag.minutes === 'number' ? bag.minutes : Number.parseInt(String(bag.minutes), 10);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_WINDOW_MINUTES) {
      throw new ReviewModeMitigationRequestError(`'minutes' must be an integer between 1 and ${MAX_WINDOW_MINUTES}.`);
    }
    request.minutes = Math.trunc(minutes);
  }

  return request;
}

export const REVIEW_MODE_MITIGATION_CACHE_MS = 15_000;

export interface ReviewModeMitigationDependencies {
  evidence: Pick<SreAgentEvidenceService, 'execute'>;
  kube: Pick<KubeClient, 'getInventory'>;
  customerImpact: Pick<CustomerImpactService, 'getCustomerImpact'>;
  now: () => Date;
  cacheTtlMs?: number;
  /** Injected so tests can supply a captured pre-action observation. */
  resourceStateBefore?: () => ResourceStateObservation | undefined;
}

function defaultDependencies(): ReviewModeMitigationDependencies {
  return {
    evidence: new SreAgentEvidenceService(),
    kube: new KubeClient(),
    customerImpact: new CustomerImpactService(),
    now: () => new Date(),
    cacheTtlMs: REVIEW_MODE_MITIGATION_CACHE_MS,
  };
}

/**
 * Time-ordered observations of the target resource, per correlation key.
 *
 * A single rolling "previous reading" would be unsafe: once a mutation had settled, two later polls
 * would both read the mutated value and a rejected proposal that DID change the resource could be
 * reported as a clean `denied`. Keeping a short history lets the derivation anchor its "before"
 * reading at or before the decision timestamp instead.
 */
const resourceStateHistory = new Map<string, ResourceStateObservation[]>();
const HISTORY_MAX_KEYS = 64;
const HISTORY_MAX_ENTRIES = 32;

export function recordMitigationObservation(key: string, observation: ResourceStateObservation): void {
  if (!resourceStateHistory.has(key) && resourceStateHistory.size >= HISTORY_MAX_KEYS) {
    const oldest = resourceStateHistory.keys().next().value;
    if (oldest !== undefined) resourceStateHistory.delete(oldest);
  }
  const entries = resourceStateHistory.get(key) ?? [];
  // De-duplicate identical consecutive readings so the history spans a useful time range.
  const last = entries[entries.length - 1];
  if (last && last.observedAt === observation.observedAt) return;
  entries.push(observation);
  while (entries.length > HISTORY_MAX_ENTRIES) entries.shift();
  resourceStateHistory.set(key, entries);
}

export function getMitigationObservationHistory(key: string): ResourceStateObservation[] {
  return [...(resourceStateHistory.get(key) ?? [])];
}

export function clearMitigationBaselines(): void {
  resourceStateHistory.clear();
}

function baselineKey(correlation: MitigationCorrelationKey): string {
  return [correlation.threadId, correlation.correlationId, correlation.incidentId, correlation.traceId]
    .map(value => value ?? '')
    .join('|');
}

function hasObservedCorrelation(correlation: MitigationCorrelationKey): boolean {
  return Object.values(correlation).some(value => typeof value === 'string' && value.trim().length > 0);
}

function evidenceCacheKey(correlation: MitigationCorrelationKey, minutes: number): string {
  return JSON.stringify({
    threadId: correlation.threadId ?? '',
    correlationId: correlation.correlationId ?? '',
    incidentId: correlation.incidentId ?? '',
    traceId: correlation.traceId ?? '',
    minutes,
  });
}

export class ReviewModeMitigationService {
  private readonly cache = new Map<string, { expiresAtMs: number; response: ReviewModeMitigationResponse }>();
  private readonly inFlight = new Map<string, Promise<ReviewModeMitigationResponse>>();

  constructor(private readonly dependencies: ReviewModeMitigationDependencies = defaultDependencies()) {}

  async getMitigationEvidence(request: ReviewModeMitigationRequest): Promise<ReviewModeMitigationResponse> {
    const now = this.dependencies.now();
    const minutes = request.minutes ?? DEFAULT_WINDOW_MINUTES;
    const correlation: MitigationCorrelationKey = {
      threadId: request.threadId,
      correlationId: request.correlationId,
      incidentId: request.incidentId,
      traceId: request.traceId,
    };

    if (!hasObservedCorrelation(correlation)) {
      return {
        scenario: 'MongoDBDown',
        evidence: deriveMitigationLifecycle({
          now,
          correlation,
          resourceStateBefore: this.dependencies.resourceStateBefore?.(),
          resourceStateHistory: [],
        }),
        guardrails: buildGuardrails(),
        evidenceSources: ['No observed correlation identifiers; no Azure or Kubernetes queries were attempted.'],
        collectedAt: now.toISOString(),
      };
    }

    const cacheKey = evidenceCacheKey(correlation, minutes);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAtMs > now.getTime()) {
      return cached.response;
    }
    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const requestPromise = this.collectMitigationEvidence(correlation, minutes, now);
    this.inFlight.set(cacheKey, requestPromise);

    return requestPromise.finally(() => {
      this.inFlight.delete(cacheKey);
    });
  }

  private async collectMitigationEvidence(
    correlation: MitigationCorrelationKey,
    minutes: number,
    now: Date,
  ): Promise<ReviewModeMitigationResponse> {
    const evidenceSources: string[] = [];
    let schemaMismatch = false;
    let hadFailure = false;

    const query = async (
      templateName: string,
      params: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> => {
      try {
        const scrubbed = Object.fromEntries(
          Object.entries({ minutes, ...params }).filter(([, value]) => value !== undefined),
        );
        const response = await this.dependencies.evidence.execute(templateName, scrubbed);
        evidenceSources.push(`${templateName} (${response.rowCount} row(s), window ${minutes}m)`);
        return response.rows;
      } catch (error) {
        hadFailure = true;
        if (error instanceof SreAgentEvidenceQueryError && error.schemaMismatch) {
          schemaMismatch = true;
        }
        evidenceSources.push(`${templateName} (unavailable: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown error'})`);
        return [];
      }
    };

    const cacheKey = evidenceCacheKey(correlation, minutes);
    const request = {
      threadId: correlation.threadId,
      correlationId: correlation.correlationId,
      incidentId: correlation.incidentId,
      traceId: correlation.traceId,
      minutes,
    };

    const [incidentRows, approvalRows, toolRows, azCliRows] = await Promise.all([
      query('incident-activity-snapshot', { incidentId: request.incidentId }),
      query('approval-decisions', { threadId: request.threadId, incidentId: request.incidentId }),
      query('agent-tool-execution', { threadId: request.threadId, incidentId: request.incidentId }),
      query('agent-az-cli-execution', { threadId: request.threadId, incidentId: request.incidentId }),
    ]);

    const matchedIncident = incidentRows.find(row => correlateRawRow(row, correlation) === 'match');

    const observedAutonomyLevel =
      typeof matchedIncident?.AgentAutonomyLevel === 'string' ? matchedIncident.AgentAutonomyLevel : undefined;
    const incidentMitigatedByAgent =
      typeof matchedIncident?.IncidentMitigatedByAgent === 'string'
        ? matchedIncident.IncidentMitigatedByAgent.toLowerCase() === 'true'
        : undefined;

    let inventory: InventoryResponse | undefined;
    try {
      inventory = await this.dependencies.kube.getInventory();
      evidenceSources.push('kubernetes inventory (live)');
    } catch {
      hadFailure = true;
      evidenceSources.push('kubernetes inventory (unavailable)');
    }

    let impact: CustomerImpactResponse | undefined;
    try {
      impact = await this.dependencies.customerImpact.getCustomerImpact();
      evidenceSources.push('customer-impact golden transaction (PR #84)');
    } catch {
      hadFailure = true;
      evidenceSources.push('customer-impact golden transaction (unavailable)');
    }

    const probes = buildVerificationProbes(inventory, impact, now);
    const after = observeMitigationResourceState(inventory, 'after');
    const key = baselineKey(correlation);
    const hasKey = key.replace(/\|/g, '').length > 0;

    const history = hasKey ? getMitigationObservationHistory(key) : [];
    if (after && hasKey) recordMitigationObservation(key, after);

    const evidence = deriveMitigationLifecycle({
      now,
      correlation,
      observedAutonomyLevel,
      incidentMitigatedByAgent,
      approvalRows,
      toolExecutionRows: toolRows,
      azCliRows,
      resourceStateBefore: this.dependencies.resourceStateBefore?.(),
      resourceStateHistory: history,
      resourceStateAfter: after,
      probes,
      schemaMismatch,
    });

    const response: ReviewModeMitigationResponse = {
      scenario: 'MongoDBDown',
      evidence,
      guardrails: buildGuardrails(),
      evidenceSources,
      collectedAt: now.toISOString(),
    };

    if (!hadFailure) {
      const ttlMs = this.dependencies.cacheTtlMs ?? REVIEW_MODE_MITIGATION_CACHE_MS;
      this.cache.set(cacheKey, { expiresAtMs: now.getTime() + ttlMs, response });
    }

    return response;
  }
}

export function buildGuardrails(): ReviewModeMitigationGuardrails {
  return {
    policyDocument: 'infra/sre-agent/tool-access-policy.json',
    allowlistedCommands: ALLOWLISTED_MITIGATION_COMMANDS,
    rollbackCommand: ROLLBACK_COMMAND,
    targetResource: MITIGATION_TARGET.resource,
    disclosures: [
      'DEMO-ONLY PERMISSION BREADTH: unless the deployment sets enableAgentKubernetesRbac = true, the agent obtains a cluster-user kubeconfig whose in-cluster authority is broader than the single Deployment this action needs. The tool access policy still constrains what the agent will run. See docs/REVIEW-MODE-MITIGATION.md §4.',
      'Mission Control is READ-ONLY for approval. Approve/Deny is performed in the Azure SRE Agent portal by an SRE Agent Administrator; no local approval button exists because Microsoft does not document a supported external approval operation.',
      'A Kubernetes write does not trigger the native Review-mode Approve/Deny button on its own. The approval gate here is a global Tool Access Policy `ask` rule combined with response-plan run mode Review. See docs/REVIEW-MODE-MITIGATION.md §1.',
    ],
    references: [
      'https://learn.microsoft.com/azure/sre-agent/run-modes',
      'https://learn.microsoft.com/azure/sre-agent/tool-access-policies',
      'https://learn.microsoft.com/azure/sre-agent/execute-mitigations',
      'https://learn.microsoft.com/azure/sre-agent/audit-agent-actions',
    ],
  };
}

/** Re-exported so the route layer can surface a consistent error for malformed identifiers. */
export { KubeInputError, parseApprovalDecisionRows };
