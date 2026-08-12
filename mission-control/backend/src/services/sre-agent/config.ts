/**
 * Environment-driven configuration for the Azure SRE Agent MCP adapter.
 *
 * Nothing here is hardcoded to a specific tenant, subscription, or agent: an operator
 * configures the target through environment variables. When required configuration is
 * missing the adapter reports `configured: false` with actionable guidance instead of
 * guessing, so Mission Control can fail honestly to the portal handoff.
 *
 * Secrets are never read into this config. The adapter reuses the host Azure identity
 * (`az login`) exactly as Azure MCP Server documents, and no token ever reaches it.
 */

import { buildToolFilterArgs } from './operations.js';

export interface SreAgentConfig {
  /** True when the minimum configuration for a real agent target is present. */
  readonly configured: boolean;
  readonly enabled: boolean;
  readonly agentName?: string;
  readonly subscriptionId?: string;
  readonly resourceGroup?: string;
  readonly tenantId?: string;
  /** Executable used to launch the Azure MCP Server child process. */
  readonly command: string;
  readonly args: readonly string[];
  /** npm spec used for the child server, surfaced for supportability/version pinning. */
  readonly serverPackage: string;
  readonly portalUrl: string;
  readonly requestTimeoutMs: number;
  readonly investigationTimeoutMs: number;
  readonly maxIterations: number;
  readonly idleShutdownMs: number;
  readonly maxResponseChars: number;
  /** Optional AZURE_TOKEN_CREDENTIALS pin passed through to the child process. */
  readonly tokenCredential?: string;
  /** Reasons the adapter is not usable, in operator-actionable form. */
  readonly configurationIssues: readonly string[];
}

const DEFAULT_SERVER_PACKAGE = '@azure/mcp@latest';
const DEFAULT_PORTAL_URL = 'https://sre.azure.com';
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_INVESTIGATION_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_IDLE_SHUTDOWN_MS = 300_000;
const DEFAULT_MAX_RESPONSE_CHARS = 24_000;

const MIN_REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUEST_TIMEOUT_MS = 900_000;
const MIN_ITERATIONS = 1;
const MAX_ITERATIONS = 20;
const MAX_RESPONSE_CHARS_CEILING = 100_000;

/** Azure resource names: letters, digits, hyphens, underscores, periods. */
const AGENT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,88}[A-Za-z0-9_]$|^[A-Za-z0-9]$/;
const RESOURCE_GROUP_PATTERN = /^[A-Za-z0-9._()-]{1,90}$/;
const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type Env = Record<string, string | undefined>;

function readString(env: Env, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = env[key];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return undefined;
}

function readBoundedInt(env: Env, keys: string[], fallback: number, min: number, max: number): number {
  const raw = readString(env, keys);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function readBoolean(env: Env, keys: string[], fallback: boolean): boolean {
  const raw = readString(env, keys)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
}

/**
 * Splits an operator-supplied argv override on whitespace. Deliberately simple: the
 * child process is spawned without a shell, so there is no shell-injection surface,
 * and complex quoting is not a supported configuration.
 *
 * Tool-exposure flags are stripped so an override cannot widen the child server's tool
 * surface past the allowlist appended by `loadSreAgentConfig`.
 */
function parseArgs(raw: string | undefined): { args: string[]; removed: string[] } | undefined {
  if (!raw) return undefined;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;

  const args: string[] = [];
  const removed: string[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    const flag = part.split('=')[0]!.toLowerCase();

    if (TOOL_SURFACE_FLAGS.has(flag)) {
      removed.push(part);
      // Drop a following value token too (e.g. `--tool sreagent_threads_investigate_yolo`).
      if (!part.includes('=') && parts[index + 1] && !parts[index + 1]!.startsWith('-')) {
        removed.push(parts[index + 1]!);
        index += 1;
      }
      continue;
    }

    args.push(part);
  }

  return { args, removed };
}

/** Flags that control which tools the child MCP server exposes. */
const TOOL_SURFACE_FLAGS = new Set(['--tool', '--namespace', '--mode', '-t', '-n']);

export function loadSreAgentConfig(env: Env = process.env): SreAgentConfig {
  const issues: string[] = [];

  const agentName = readString(env, ['SRE_AGENT_NAME', 'AZURE_SRE_AGENT_NAME']);
  const subscriptionId = readString(env, [
    'SRE_AGENT_SUBSCRIPTION_ID',
    'AZURE_SUBSCRIPTION_ID',
    'SRE_AGENT_SUBSCRIPTION',
  ]);
  const resourceGroup = readString(env, ['SRE_AGENT_RESOURCE_GROUP', 'AZURE_SRE_AGENT_RESOURCE_GROUP']);
  const tenantId = readString(env, ['SRE_AGENT_TENANT_ID', 'AZURE_TENANT_ID']);

  if (!agentName) {
    issues.push('Set SRE_AGENT_NAME to the Microsoft.App/agents resource name Mission Control should target.');
  } else if (!AGENT_NAME_PATTERN.test(agentName)) {
    issues.push('SRE_AGENT_NAME must be a valid Azure resource name (letters, digits, hyphen, underscore, period).');
  }

  if (!subscriptionId) {
    issues.push('Set SRE_AGENT_SUBSCRIPTION_ID (or AZURE_SUBSCRIPTION_ID) to the subscription that contains the SRE Agent.');
  } else if (!GUID_PATTERN.test(subscriptionId)) {
    issues.push('SRE_AGENT_SUBSCRIPTION_ID must be a subscription GUID.');
  }

  if (resourceGroup && !RESOURCE_GROUP_PATTERN.test(resourceGroup)) {
    issues.push('SRE_AGENT_RESOURCE_GROUP must be a valid Azure resource group name.');
  }

  if (tenantId && !GUID_PATTERN.test(tenantId)) {
    issues.push('SRE_AGENT_TENANT_ID must be a tenant GUID.');
  }

  const serverPackage = readString(env, ['SRE_AGENT_MCP_PACKAGE']) ?? DEFAULT_SERVER_PACKAGE;
  const command = readString(env, ['SRE_AGENT_MCP_COMMAND']) ?? 'npx';
  const override = parseArgs(readString(env, ['SRE_AGENT_MCP_ARGS']));

  // Advisory, not blocking: the flags are stripped, so the configuration is still safe.
  const advisories: string[] =
    override && override.removed.length > 0
      ? [
          `SRE_AGENT_MCP_ARGS may not set tool-exposure flags; ignored: ${override.removed.join(' ')}. Mission Control always pins the child server to its six allowlisted tools.`,
        ]
      : [];

  // Always append the tool filter so the child server cannot expose investigate_yolo,
  // even when an operator overrides the base argv (tool-exposure flags are stripped above).
  const baseArgs = override?.args ?? ['-y', serverPackage, 'server', 'start'];
  const args = [...baseArgs, ...buildToolFilterArgs()];

  const requestTimeoutMs = readBoundedInt(
    env,
    ['SRE_AGENT_REQUEST_TIMEOUT_MS'],
    DEFAULT_REQUEST_TIMEOUT_MS,
    MIN_REQUEST_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS,
  );
  const investigationTimeoutMs = readBoundedInt(
    env,
    ['SRE_AGENT_INVESTIGATION_TIMEOUT_MS'],
    DEFAULT_INVESTIGATION_TIMEOUT_MS,
    MIN_REQUEST_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS,
  );

  const configured = issues.length === 0;
  const enabled = readBoolean(env, ['SRE_AGENT_MCP_ENABLED', 'SRE_AGENT_ENABLED'], true);

  if (configured && !enabled) {
    issues.push('SRE Agent MCP integration is disabled by SRE_AGENT_MCP_ENABLED=false.');
  }

  return {
    configured,
    enabled,
    agentName,
    subscriptionId,
    resourceGroup,
    tenantId,
    command,
    args,
    serverPackage,
    portalUrl: readString(env, ['SRE_AGENT_PORTAL_URL']) ?? DEFAULT_PORTAL_URL,
    requestTimeoutMs,
    investigationTimeoutMs,
    maxIterations: readBoundedInt(env, ['SRE_AGENT_MAX_ITERATIONS'], DEFAULT_MAX_ITERATIONS, MIN_ITERATIONS, MAX_ITERATIONS),
    idleShutdownMs: readBoundedInt(env, ['SRE_AGENT_IDLE_SHUTDOWN_MS'], DEFAULT_IDLE_SHUTDOWN_MS, 10_000, 3_600_000),
    maxResponseChars: readBoundedInt(
      env,
      ['SRE_AGENT_MAX_RESPONSE_CHARS'],
      DEFAULT_MAX_RESPONSE_CHARS,
      1_000,
      MAX_RESPONSE_CHARS_CEILING,
    ),
    tokenCredential: readString(env, ['AZURE_TOKEN_CREDENTIALS']),
    configurationIssues: Object.freeze([...issues, ...advisories]),
  };
}

/** True when the adapter may attempt a real MCP call. */
export function isSreAgentUsable(config: SreAgentConfig): boolean {
  return config.configured && config.enabled;
}

/**
 * Builds the child-process environment.
 *
 * The Azure MCP Server authenticates with the host Azure identity, so the child inherits
 * the parent environment. We deliberately do not inject client secrets or tokens.
 */
export function buildChildEnv(config: SreAgentConfig, env: Env = process.env): Record<string, string> {
  const childEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') childEnv[key] = value;
  }

  if (config.subscriptionId) childEnv['AZURE_SUBSCRIPTION_ID'] = config.subscriptionId;
  if (config.tenantId) childEnv['AZURE_TENANT_ID'] = config.tenantId;
  if (config.tokenCredential) childEnv['AZURE_TOKEN_CREDENTIALS'] = config.tokenCredential;

  return childEnv;
}
