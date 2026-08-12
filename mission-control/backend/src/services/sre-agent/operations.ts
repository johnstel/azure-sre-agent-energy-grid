/**
 * Strict operation allowlist for the Azure SRE Agent MCP adapter.
 *
 * Mission Control may only invoke the six Azure MCP Server tools named here. The
 * allowlist is enforced in three independent layers so that no single mistake can
 * widen the blast radius:
 *
 *   1. Server surface  — the Azure MCP Server child process is launched with one
 *                        `--tool <name>` flag per allowlisted tool, so unlisted
 *                        tools (including `sreagent_threads_investigate_yolo`) are
 *                        never registered on the server at all.
 *   2. Client mapping  — callers address operations by typed `SreAgentOperation`
 *                        names and can never pass a raw tool name.
 *   3. Denylist assert — an explicit blocked-pattern check rejects auto-approval
 *                        and destructive tool names even if layers 1 and 2 regress.
 *
 * Verified against Azure MCP Server 3.0.0-beta.34 (`sreagent` namespace).
 */

export const SRE_AGENT_OPERATIONS = [
  'discover-agents',
  'get-agent',
  'create-thread',
  'investigate',
  'follow-up',
  'thread-status',
] as const;

export type SreAgentOperation = (typeof SRE_AGENT_OPERATIONS)[number];

/** Typed operation -> exact Azure MCP Server tool name. This map is the only way to reach a tool. */
export const SRE_AGENT_OPERATION_TOOLS = {
  'discover-agents': 'sreagent_agents_list',
  'get-agent': 'sreagent_agents_get',
  'create-thread': 'sreagent_threads_create',
  investigate: 'sreagent_threads_investigate',
  'follow-up': 'sreagent_threads_send_message',
  'thread-status': 'sreagent_threads_get',
} as const satisfies Record<SreAgentOperation, string>;

export type SreAgentToolName = (typeof SRE_AGENT_OPERATION_TOOLS)[SreAgentOperation];

/** Every tool the child MCP server is permitted to expose, sorted for deterministic argv. */
export const ALLOWED_SRE_AGENT_TOOLS: readonly SreAgentToolName[] = Object.freeze(
  Object.values(SRE_AGENT_OPERATION_TOOLS).slice().sort(),
) as readonly SreAgentToolName[];

/** Operations that never mutate agent or Azure state. */
export const READ_ONLY_SRE_AGENT_OPERATIONS: readonly SreAgentOperation[] = Object.freeze([
  'discover-agents',
  'get-agent',
  'thread-status',
]);

/**
 * Tools that are permanently forbidden regardless of configuration.
 *
 * `sreagent_threads_investigate_yolo` auto-approves every approval gate — including
 * infrastructure mutation — and is explicitly out of scope for this demo. The rest are
 * destructive or configuration-mutating tools Mission Control has no reason to call.
 */
export const BLOCKED_SRE_AGENT_TOOLS: readonly string[] = Object.freeze([
  'sreagent_threads_investigate_yolo',
  'sreagent_threads_delete',
  'sreagent_agents_create',
  'sreagent_agents_delete',
  'sreagent_agents_tools_create',
  'sreagent_skills_create',
  'sreagent_skills_delete',
  'sreagent_connectors_create_kusto',
  'sreagent_connectors_create_mcp',
  'sreagent_connectors_delete',
  'sreagent_hooks_delete',
  'sreagent_hooks_thread_activate',
  'sreagent_hooks_thread_deactivate',
  'sreagent_workflows_apply',
  'sreagent_docs_memories_add',
  'sreagent_docs_memories_delete',
  'sreagent_commonprompts_create',
  'sreagent_commonprompts_delete',
  'sreagent_scheduledtasks_create',
  'sreagent_scheduledtasks_delete',
  'sreagent_incidents_setup_pagerduty',
  'sreagent_incidents_setup_servicenow',
]);

/**
 * Substrings that indicate an auto-approval or approval-bypassing capability.
 * Matched case-insensitively against any requested tool name.
 */
const BLOCKED_TOOL_PATTERNS: readonly RegExp[] = Object.freeze([
  /yolo/i,
  /auto[_-]?approve/i,
  /auto[_-]?approval/i,
  /approve[_-]?all/i,
  /bypass[_-]?approval/i,
  /no[_-]?confirm/i,
]);

export class SreAgentOperationDeniedError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = 'SreAgentOperationDeniedError';
  }
}

export function isSreAgentOperation(value: unknown): value is SreAgentOperation {
  return typeof value === 'string' && (SRE_AGENT_OPERATIONS as readonly string[]).includes(value);
}

export function isReadOnlySreAgentOperation(operation: SreAgentOperation): boolean {
  return READ_ONLY_SRE_AGENT_OPERATIONS.includes(operation);
}

/**
 * Fail-closed guard applied to every tool name immediately before dispatch.
 * Throws rather than returning a boolean so a missing check cannot silently pass.
 */
export function assertToolAllowed(toolName: string): asserts toolName is SreAgentToolName {
  const normalized = typeof toolName === 'string' ? toolName.trim() : '';

  if (!normalized) {
    throw new SreAgentOperationDeniedError('An empty SRE Agent tool name is not allowlisted.');
  }

  for (const pattern of BLOCKED_TOOL_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new SreAgentOperationDeniedError(
        `SRE Agent tool '${normalized}' is permanently blocked: Mission Control never runs auto-approval or approval-bypassing investigations.`,
      );
    }
  }

  if (BLOCKED_SRE_AGENT_TOOLS.includes(normalized)) {
    throw new SreAgentOperationDeniedError(
      `SRE Agent tool '${normalized}' is permanently blocked: Mission Control only performs discovery, standard investigation, follow-up, and status reads.`,
    );
  }

  if (!(ALLOWED_SRE_AGENT_TOOLS as readonly string[]).includes(normalized)) {
    throw new SreAgentOperationDeniedError(
      `SRE Agent tool '${normalized}' is not on the Mission Control allowlist (${ALLOWED_SRE_AGENT_TOOLS.join(', ')}).`,
    );
  }
}

/** Resolves a typed operation to its allowlisted tool name, or throws. */
export function resolveOperationTool(operation: string): SreAgentToolName {
  if (!isSreAgentOperation(operation)) {
    throw new SreAgentOperationDeniedError(
      `SRE Agent operation '${operation}' is not supported. Allowed operations: ${SRE_AGENT_OPERATIONS.join(', ')}.`,
    );
  }

  const toolName = SRE_AGENT_OPERATION_TOOLS[operation];
  assertToolAllowed(toolName);
  return toolName;
}

/** argv fragment that constrains the child MCP server to the allowlisted tools only. */
export function buildToolFilterArgs(): string[] {
  return ALLOWED_SRE_AGENT_TOOLS.flatMap((tool) => ['--tool', tool]);
}
