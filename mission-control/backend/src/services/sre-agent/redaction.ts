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
const REDACTION_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = Object.freeze([
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
    output = output.replace(pattern, replacement);
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
