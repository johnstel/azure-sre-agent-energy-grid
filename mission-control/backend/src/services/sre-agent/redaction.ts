/**
 * Redaction and output-bounding for everything the SRE Agent adapter returns or logs.
 *
 * Azure MCP Server already strips common credential patterns server-side, but Mission
 * Control must not depend on an upstream control for its own safety guarantees. Every
 * string that leaves the adapter — toward the browser, the audit log, or an evidence
 * bundle — passes through `redactSensitiveText`, and every payload is length-bounded so
 * a hostile or runaway response cannot exhaust the UI or the log.
 */

/** Ordered so that broader patterns cannot mask narrower, higher-value ones. */
const REDACTION_RULES: ReadonlyArray<{
  pattern: RegExp;
  replacement: string | ((substring: string, ...args: string[]) => string);
}> = Object.freeze([
  // Bearer / auth headers
  { pattern: /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: '$1 [REDACTED]' },
  // JWTs anywhere in free text
  { pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, replacement: '[REDACTED-JWT]' },
  // key=value secrets
  {
    pattern:
      /\b(password|passwd|pwd|token|access[_-]?token|id[_-]?token|refresh[_-]?token|secret|client[_-]?secret|api[_-]?key|apikey|subscription[_-]?key|sas[_-]?token|authorization|connectionstring)(\s*[:=]\s*)(["']?)[^\s"',;}]+/gi,
    replacement: '$1$2$3[REDACTED]',
  },
  // Space-separated CLI secret flags, e.g. `az login --password hunter2` or `--client-secret abc`.
  // The key=value rule above cannot see these because there is no `:` or `=` separator, and agent
  // telemetry (AgentAzCliExecution / AgentToolExecution ToolInput) carries exactly this shape.
  // A quoted value is consumed to its matching closing quote, so a secret containing spaces
  // (`--password "Winter 2026 Grid!"`) is redacted whole rather than only up to the first space.
  {
    pattern:
      /(--?(?:password|passwd|pwd|token|access[_-]?token|id[_-]?token|refresh[_-]?token|secret|client[_-]?secret|api[_-]?key|apikey|subscription[_-]?key|sas[_-]?token|account[_-]?key|admin[_-]?password|certificate[_-]?password|connection[_-]?string)\b)(\s+)("[^"]*"|'[^']*'|[^\s"']+)/gi,
    replacement: (_match: string, flag: string, gap: string, value: string) => {
      const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : '';
      return `${flag}${gap}${quote}[REDACTED]${quote}`;
    },
  },
  // Storage / service connection string fragments
  { pattern: /\b(AccountKey|SharedAccessSignature|SharedAccessKey)=[^;\s"']+/gi, replacement: '$1=[REDACTED]' },
  // SAS query strings
  { pattern: /\b(sig|sv|se|st|skoid|sktid)=[A-Za-z0-9%._~+/-]{8,}/gi, replacement: '$1=[REDACTED]' },
  // PEM blocks. The END marker is optional so an already-truncated or malformed block
  // still has its key material stripped rather than leaking the remainder.
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    replacement: '[REDACTED-PRIVATE-KEY]',
  },
]);

export function redactSensitiveText(value: string): string {
  let output = value;
  for (const { pattern, replacement } of REDACTION_RULES) {
    output = typeof replacement === 'string'
      ? output.replace(pattern, replacement)
      : output.replace(pattern, replacement);
  }
  return output;
}

export interface BoundedText {
  readonly text: string;
  readonly truncated: boolean;
  readonly originalLength: number;
}

/** Redacts, then truncates to `maxChars`, marking truncation explicitly rather than silently. */
export function boundText(value: string, maxChars: number): BoundedText {
  const redacted = redactSensitiveText(value);
  if (redacted.length <= maxChars) {
    return { text: redacted, truncated: false, originalLength: redacted.length };
  }

  return {
    text: `${redacted.slice(0, maxChars)}\n\n[Mission Control truncated this response at ${maxChars} characters.]`,
    truncated: true,
    originalLength: redacted.length,
  };
}

/**
 * Masks a subscription/tenant GUID for display: keeps the first and last group so an
 * operator can correlate it with the portal without publishing the full identifier.
 */
export function maskGuid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const match = /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})$/.exec(trimmed);
  if (!match) return '[redacted]';
  return `${match[1]}-****-****-****-${match[5]!.slice(-6)}`;
}

/**
 * Redacts the subscription segment of an ARM resource ID while preserving the parts an
 * operator needs to identify the agent (resource group, provider, agent name).
 */
export function maskArmId(armId: string | undefined): string | undefined {
  if (!armId) return undefined;
  return armId.replace(/\/subscriptions\/([0-9a-fA-F-]{36})/i, (_full, sub: string) => `/subscriptions/${maskGuid(sub)}`);
}

/**
 * Masks Azure subscription/tenant identifiers inside free text.
 *
 * The SRE Agent routinely quotes ARM resource IDs in its prose, so identity-field
 * masking alone is not enough — the response body itself must be masked before it
 * reaches the browser or an evidence bundle.
 *
 * `known` lets the caller mask the exact configured identifiers wherever they appear,
 * which catches formats this function's patterns do not anticipate.
 */
export function maskIdentifiers(
  text: string,
  known: { subscriptionId?: string; tenantId?: string } = {},
): string {
  let output = text;

  // ARM paths: /subscriptions/<guid>, /tenants/<guid>
  output = output.replace(
    /(\/(?:subscriptions|tenants)\/)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/gi,
    (_full, prefix: string, guid: string) => `${prefix}${maskGuid(guid)}`,
  );

  // Labelled identifiers: "subscription id: <guid>", "tenantId=<guid>"
  output = output.replace(
    /\b(subscription|tenant)(\s*id)?(\s*[:=]\s*|\s+)([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/gi,
    (_full, label: string, idWord: string | undefined, sep: string, guid: string) =>
      `${label}${idWord ?? ''}${sep}${maskGuid(guid)}`,
  );

  // Exact configured identifiers, wherever they appear.
  for (const value of [known.subscriptionId, known.tenantId]) {
    if (!value || !GUID_TEXT_PATTERN.test(value)) continue;
    output = output.split(value).join(maskGuid(value) ?? '[redacted]');
  }

  return output;
}

const GUID_TEXT_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Recursively redacts a structure for audit logging, dropping deep or oversized branches. */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated-depth]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const redacted = redactSensitiveText(value);
    return redacted.length > 512 ? `${redacted.slice(0, 512)}…[truncated]` : redacted;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => redactForAudit(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/token|secret|password|credential|authorization|apikey|api_key|connectionstring/i.test(key)) {
        output[key] = '[REDACTED]';
        continue;
      }
      // Mission Control streams backend logs to an on-screen terminal during demos, so
      // subscription/tenant identifiers are masked in audit records too.
      if (/^(subscription|subscriptionid|tenant|tenantid)$/i.test(key) && typeof entry === 'string') {
        output[key] = maskGuid(entry) ?? '[redacted]';
        continue;
      }
      output[key] = redactForAudit(entry, depth + 1);
    }
    return output;
  }

  return '[unsupported]';
}

// ---------------------------------------------------------------------------
// Streaming redaction for child-process stderr
// ---------------------------------------------------------------------------

const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const PRIVATE_KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY-----/;

/**
 * Longest secret start-marker we must never split across a commit boundary.
 * `-----BEGIN OPENSSH PRIVATE KEY-----` is 35 characters; 96 gives ample headroom.
 */
const MARKER_GUARD = 96;

/**
 * Bounded, redaction-safe accumulator for a child process's stderr.
 *
 * A naive `raw = (raw + chunk).slice(-N)` rolling buffer is unsafe: for a secret
 * longer than N (a PEM private key is typically 1.7–3.2 KB) the `-----BEGIN …-----`
 * marker is evicted while key body survives. A later single `redactSensitiveText`
 * pass then has no marker to match, so raw key material can reach an error message
 * and the UI.
 *
 * This buffer removes that class of bug by construction:
 *
 *  1. **Redact before bounding.** `tail` only ever holds already-redacted text, so
 *     evicting from it can never expose a secret — the secret is already a
 *     placeholder.
 *  2. **Never split a marker.** Only whole lines are committed (secret markers and
 *     single-line secrets contain no newline). A pathological newline-free run is
 *     force-committed only up to a `MARKER_GUARD` raw window that is retained, so a
 *     marker straddling that boundary is still seen intact on the next chunk.
 *  3. **Carry state across segments.** An unterminated `BEGIN … PRIVATE KEY` sets a
 *     sticky "inside secret" flag, so continuation lines are dropped even after the
 *     marker itself has been committed and evicted — the case regex-per-pass misses.
 */
export class RedactedStreamBuffer {
  /** Always-redacted, bounded output. */
  private tail = '';
  /** Raw bytes not yet safe to commit (incomplete line / marker guard). */
  private carry = '';
  /** True while inside a private-key block whose END marker has not been seen. */
  private insideSecret = false;

  constructor(
    private readonly maxChars = 2_000,
    private readonly maxCarry = 4_096,
  ) {}

  append(chunk: string): void {
    const combined = this.carry + chunk;
    const lastNewline = combined.lastIndexOf('\n');

    let rest: string;
    if (lastNewline >= 0) {
      this.commit(combined.slice(0, lastNewline + 1));
      rest = combined.slice(lastNewline + 1);
    } else {
      rest = combined;
    }

    // A very long newline-free run still has to be bounded. Retain a marker-sized raw
    // window so a start marker cannot be split across this forced commit.
    if (rest.length > this.maxCarry) {
      this.commit(rest.slice(0, rest.length - MARKER_GUARD));
      rest = rest.slice(rest.length - MARKER_GUARD);
    }

    this.carry = rest;
  }

  /** Redacted, bounded view including the uncommitted carry. Does not mutate state. */
  snapshot(): string {
    const { text } = redactSegment(this.carry, this.insideSecret);
    return `${this.tail}${text}`.slice(-this.maxChars).trim();
  }

  reset(): void {
    this.tail = '';
    this.carry = '';
    this.insideSecret = false;
  }

  private commit(segment: string): void {
    if (!segment) return;
    const { text, insideSecret } = redactSegment(segment, this.insideSecret);
    this.insideSecret = insideSecret;
    // `tail` is already redacted, so bounding it here cannot reveal a secret.
    this.tail = `${this.tail}${text}`.slice(-this.maxChars);
  }
}

/**
 * Redacts one segment, honouring and returning the sticky private-key state.
 * Exported for direct testing of the state machine.
 */
export function redactSegment(
  segment: string,
  insideSecret: boolean,
): { text: string; insideSecret: boolean } {
  if (!segment) return { text: '', insideSecret };

  let working = segment;
  let state = insideSecret;

  if (state) {
    const end = PRIVATE_KEY_END.exec(working);
    // Still inside the key: drop the whole segment rather than emit body material.
    if (!end) return { text: '', insideSecret: true };
    working = working.slice(end.index + end[0].length);
    state = false;
  }

  // If the LAST begin marker has no matching end, suppress from there and stay sticky.
  const lastBegin = lastIndexOfPattern(working, PRIVATE_KEY_BEGIN);
  if (lastBegin >= 0) {
    const afterBegin = working.slice(lastBegin);
    const beginMatch = PRIVATE_KEY_BEGIN.exec(afterBegin);
    const afterMarker = beginMatch ? afterBegin.slice(beginMatch[0].length) : afterBegin;
    if (!PRIVATE_KEY_END.test(afterMarker)) {
      working = `${working.slice(0, lastBegin)}[REDACTED-PRIVATE-KEY]`;
      state = true;
    }
  }

  return { text: redactSensitiveText(working), insideSecret: state };
}

function lastIndexOfPattern(value: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  let index = -1;
  let match: RegExpExecArray | null;
  while ((match = global.exec(value)) !== null) {
    index = match.index;
    if (match.index === global.lastIndex) global.lastIndex += 1;
  }
  return index;
}
