/**
 * Tolerant parser for Azure MCP Server `sreagent_*` tool responses.
 *
 * The Azure MCP Server documents the *operations* and their inputs, but not a stable
 * JSON schema for `threads_*` responses. This parser therefore probes a set of common
 * key spellings and falls back to plain text, while holding two hard rules:
 *
 *   1. Never invent a thread ID or agent identity. If provenance cannot be established
 *      from the payload, the caller must not claim the answer came from SRE Agent.
 *   2. Never invent citations. Absent citations are reported as absent.
 *
 * Because the shape is inferred rather than contractual, `schemaConfidence` records how
 * the values were obtained so the UI and docs can stay honest about it.
 */

export type SreAgentSchemaConfidence = 'structured' | 'inferred' | 'text-only';

export interface ParsedAgentSummary {
  readonly name?: string;
  readonly armId?: string;
  readonly resourceGroup?: string;
  readonly subscriptionId?: string;
  readonly location?: string;
  readonly provisioningState?: string;
  readonly endpointHost?: string;
}

export interface ParsedCitation {
  readonly label: string;
  readonly url?: string;
  readonly source?: string;
}

export interface ParsedThreadResponse {
  readonly threadId?: string;
  readonly messageText: string;
  readonly citations: ParsedCitation[];
  readonly approvalRequired: boolean;
  readonly approvalDetail?: string;
  readonly statusHint?: string;
  readonly schemaConfidence: SreAgentSchemaConfidence;
  readonly raw?: unknown;
}

const THREAD_ID_KEYS = ['threadId', 'thread_id', 'threadID', 'ThreadId', 'thread'];
const MESSAGE_KEYS = ['response', 'message', 'content', 'text', 'answer', 'result', 'output', 'summary'];
const CITATION_KEYS = ['citations', 'references', 'sources', 'links'];

/** GUID or opaque thread token; deliberately strict so prose cannot masquerade as an ID. */
const THREAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * Phrases indicating the agent paused at an approval gate. Standard investigation mode
 * pauses rather than acting, and Mission Control must surface that state prominently.
 */
const APPROVAL_PATTERNS: readonly RegExp[] = Object.freeze([
  /awaiting\s+(your\s+)?approval/i,
  /approval\s+(is\s+)?required/i,
  /requires?\s+(your\s+)?approval/i,
  /pending\s+approval/i,
  /approval\s+gate/i,
  /waiting\s+for\s+(human\s+)?(confirmation|approval)/i,
  /needs?\s+human\s+(confirmation|approval)/i,
  /please\s+(approve|confirm)\s+/i,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses JSON when the payload is JSON; otherwise returns undefined (text-only response). */
export function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** Azure MCP Server wraps payloads in envelopes such as `{ status, results, duration }`. */
function unwrapEnvelope(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) return current;
    const next = current['results'] ?? current['result'] ?? current['value'] ?? current['data'];
    if (next === undefined || next === null) return current;
    current = next;
  }
  return current;
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Depth-first search for a plausible thread identifier. */
function findThreadId(value: unknown, depth = 0): string | undefined {
  if (depth > 5) return undefined;

  if (isRecord(value)) {
    for (const key of THREAD_ID_KEYS) {
      const candidate = value[key];
      if (typeof candidate === 'string' && THREAD_ID_PATTERN.test(candidate.trim())) {
        return candidate.trim();
      }
      // `thread: { id }` shape
      if (isRecord(candidate) && typeof candidate['id'] === 'string' && THREAD_ID_PATTERN.test(candidate['id'].trim())) {
        return candidate['id'].trim();
      }
    }

    // A bare `id` only counts when the object is clearly thread-shaped, so an agent or
    // message ID is never mistaken for a thread ID.
    const bareId = value['id'];
    if (
      typeof bareId === 'string' &&
      THREAD_ID_PATTERN.test(bareId.trim()) &&
      Object.keys(value).some((key) => /thread|conversation|messages/i.test(key))
    ) {
      return bareId.trim();
    }

    for (const entry of Object.values(value)) {
      const found = findThreadId(entry, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 25)) {
      const found = findThreadId(entry, depth + 1);
      if (found) return found;
    }
  }

  return undefined;
}

function extractMessageText(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();

  if (isRecord(payload)) {
    const direct = firstString(payload, MESSAGE_KEYS);
    if (direct) return direct;

    // Conversation shape: prefer the newest assistant/agent turn.
    const messages = payload['messages'];
    if (Array.isArray(messages) && messages.length > 0) {
      const agentTurns = messages.filter((entry) => {
        if (!isRecord(entry)) return false;
        const role = String(entry['role'] ?? entry['sender'] ?? entry['author'] ?? '').toLowerCase();
        return role === 'assistant' || role === 'agent' || role === 'system';
      });
      const chosen = (agentTurns.length > 0 ? agentTurns : messages).at(-1);
      if (isRecord(chosen)) {
        const text = firstString(chosen, [...MESSAGE_KEYS, 'body']);
        if (text) return text;
      }
    }
  }

  if (Array.isArray(payload) && payload.length > 0) {
    const last = payload.at(-1);
    if (isRecord(last)) {
      const text = firstString(last, MESSAGE_KEYS);
      if (text) return text;
    }
  }

  return fallback.trim();
}

/**
 * Extracts citations only when the payload actually contains them.
 * Returns an empty array otherwise — the UI renders "no citations returned".
 */
function extractCitations(payload: unknown, depth = 0): ParsedCitation[] {
  if (depth > 4 || !isRecord(payload)) return [];

  for (const key of CITATION_KEYS) {
    const value = payload[key];
    if (!Array.isArray(value)) continue;

    const citations = value
      .map((entry): ParsedCitation | undefined => {
        if (typeof entry === 'string' && entry.trim()) {
          const trimmed = entry.trim();
          return /^https?:\/\//i.test(trimmed) ? { label: trimmed, url: trimmed } : { label: trimmed };
        }
        if (!isRecord(entry)) return undefined;

        const label = firstString(entry, ['label', 'title', 'name', 'displayName', 'text', 'description']);
        const url = firstString(entry, ['url', 'uri', 'link', 'href', 'portalUrl']);
        const source = firstString(entry, ['source', 'type', 'kind', 'provider', 'resourceType']);
        if (!label && !url) return undefined;

        return {
          label: label ?? url ?? 'Reference',
          ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
          ...(source ? { source } : {}),
        };
      })
      .filter((entry): entry is ParsedCitation => entry !== undefined);

    if (citations.length > 0) return citations.slice(0, 25);
  }

  for (const entry of Object.values(payload)) {
    const nested = extractCitations(entry, depth + 1);
    if (nested.length > 0) return nested;
  }

  return [];
}

function detectApproval(payload: unknown, text: string): { required: boolean; detail?: string } {
  if (isRecord(payload)) {
    for (const key of ['approvalRequired', 'requiresApproval', 'awaitingApproval', 'pendingApproval', 'needsApproval']) {
      if (payload[key] === true) {
        const detail = firstString(payload, ['approvalMessage', 'approvalDetail', 'approvalPrompt', 'pendingAction']);
        return { required: true, ...(detail ? { detail } : {}) };
      }
    }

    const status = firstString(payload, ['status', 'state', 'threadStatus']);
    if (status && /approval|awaiting|paused|blocked/i.test(status)) {
      return { required: true, detail: `Agent reported status '${status}'.` };
    }

    const pending = payload['pendingApprovals'] ?? payload['approvals'];
    if (Array.isArray(pending) && pending.length > 0) {
      return { required: true, detail: `${pending.length} pending approval request(s) reported by the agent.` };
    }
  }

  for (const pattern of APPROVAL_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 120);
      return { required: true, detail: text.slice(start, match.index + 200).trim() };
    }
  }

  return { required: false };
}

export function parseThreadResponse(rawText: string, structuredContent?: unknown): ParsedThreadResponse {
  const parsedJson = structuredContent ?? tryParseJson(rawText);
  const payload = unwrapEnvelope(parsedJson);
  const hasStructure = payload !== undefined && (isRecord(payload) || Array.isArray(payload));

  const threadId = hasStructure ? findThreadId(payload) : undefined;
  const messageText = extractMessageText(payload, rawText);
  const citations = hasStructure ? extractCitations(isRecord(payload) ? payload : { payload }) : [];
  const approval = detectApproval(payload, messageText || rawText);
  const statusHint = isRecord(payload) ? firstString(payload, ['status', 'state', 'threadStatus']) : undefined;

  const schemaConfidence: SreAgentSchemaConfidence = !hasStructure
    ? 'text-only'
    : threadId
      ? 'structured'
      : 'inferred';

  return {
    ...(threadId ? { threadId } : {}),
    messageText: messageText || rawText.trim(),
    citations,
    approvalRequired: approval.required,
    ...(approval.detail ? { approvalDetail: approval.detail } : {}),
    ...(statusHint ? { statusHint } : {}),
    schemaConfidence,
    raw: parsedJson,
  };
}

/** Normalises one agent record from `sreagent_agents_list` / `sreagent_agents_get`. */
export function parseAgentSummary(value: unknown): ParsedAgentSummary | undefined {
  if (!isRecord(value)) return undefined;

  const name = firstString(value, ['name', 'agentName', 'agent']);
  const armId = firstString(value, ['id', 'armId', 'resourceId']);
  if (!name && !armId) return undefined;

  const endpoint = firstString(value, ['endpoint', 'agentEndpoint', 'dataPlaneEndpoint', 'endpointUrl']);
  let endpointHost: string | undefined;
  if (endpoint) {
    try {
      endpointHost = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`).host;
    } catch {
      endpointHost = undefined;
    }
  }

  const subscriptionFromArm = armId ? /\/subscriptions\/([0-9a-fA-F-]{36})/i.exec(armId)?.[1] : undefined;
  const resourceGroupFromArm = armId ? /\/resourceGroups\/([^/]+)/i.exec(armId)?.[1] : undefined;

  const resourceGroup = firstString(value, ['resourceGroup', 'resourceGroupName']) ?? resourceGroupFromArm;
  const subscriptionId = firstString(value, ['subscriptionId', 'subscription']) ?? subscriptionFromArm;
  const location = firstString(value, ['location', 'region']);
  const provisioningState = firstString(value, ['provisioningState', 'state', 'status']);

  return {
    ...(name ? { name } : {}),
    ...(armId ? { armId } : {}),
    ...(resourceGroup ? { resourceGroup } : {}),
    ...(subscriptionId ? { subscriptionId } : {}),
    ...(location ? { location } : {}),
    ...(provisioningState ? { provisioningState } : {}),
    ...(endpointHost ? { endpointHost } : {}),
  };
}

/** Extracts every agent record from a list-shaped response. */
export function parseAgentList(rawText: string, structuredContent?: unknown): ParsedAgentSummary[] {
  const payload = unwrapEnvelope(structuredContent ?? tryParseJson(rawText));

  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? (['agents', 'items', 'value', 'resources'] as const)
          .map((key) => payload[key])
          .find((entry): entry is unknown[] => Array.isArray(entry)) ?? [payload]
      : [];

  return candidates
    .map((entry) => parseAgentSummary(entry))
    .filter((entry): entry is ParsedAgentSummary => entry !== undefined);
}
