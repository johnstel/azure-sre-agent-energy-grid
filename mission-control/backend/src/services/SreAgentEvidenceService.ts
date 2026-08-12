import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  SreAgentEvidenceQueryRequest,
  SreAgentEvidenceQueryResponse,
  SreAgentEvidenceTemplateName,
} from '../types/index.js';
import { KubeInputError } from './KubeClient.js';

const exec = promisify(execFile);
const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 30 * 24 * 60; // Matches the documented Azure Monitor merge lookback (issue #76 spike, azure-monitor-alerts).
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const INCIDENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

// Documented Application Insights customEvents names emitted by Azure SRE Agent.
// Source: https://learn.microsoft.com/azure/sre-agent/audit-agent-actions
export const SRE_AGENT_EVENT_NAMES = {
  incidentActivitySnapshot: 'IncidentActivitySnapshot',
  agentExecution: 'AgentExecution',
  agentToolExecution: 'AgentToolExecution',
  approvalDecision: 'ApprovalDecision',
} as const;

export const SRE_AGENT_EVIDENCE_TEMPLATES = [
  'incident-activity-snapshot',
  'agent-execution-lifecycle',
  'agent-tool-execution',
  'approval-decisions',
  'incident-thread-timeline',
] as const satisfies readonly SreAgentEvidenceTemplateName[];

// Semantic-error phrases Azure Monitor / Log Analytics return when a KQL query references an
// unknown table or column. Used to distinguish "the agent hasn't emitted this event yet" (zero
// rows, low confidence) from "the deployed telemetry schema no longer matches this query" (a
// visible failure per docs/CAPABILITY-CONTRACTS.md SS8 SCHEMA_TBD rule and issue #76 acceptance
// criteria: "KQL queries use the documented audit event names and fail visibly on schema mismatch").
const SCHEMA_MISMATCH_PATTERNS = [
  /failed to resolve (table|column|scalar) (expression|name)/i,
  /semanticerror/i,
  /'customEvents' (does not have|has no) (a )?column/i,
  /the name '.*' does not refer to any/i,
];

type AzureMonitorExecutor = (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

export class SreAgentEvidenceQueryError extends Error {
  constructor(message: string, public readonly statusCode = 503, public readonly schemaMismatch = false) {
    super(message);
    this.name = 'SreAgentEvidenceQueryError';
  }
}

export class SreAgentEvidenceService {
  constructor(private readonly executor: AzureMonitorExecutor = execAzureMonitorQuery) {}

  async execute(templateName: string, rawParams: Record<string, unknown>): Promise<SreAgentEvidenceQueryResponse> {
    const request = normalizeSreAgentEvidenceRequest(templateName, rawParams);
    const workspace = configuredSreAgentWorkspaceId();
    if (!workspace) {
      throw new SreAgentEvidenceQueryError(
        'Log Analytics workspace is not configured for SRE Agent evidence. Set LOG_ANALYTICS_WORKSPACE_ID, AZURE_LOG_ANALYTICS_WORKSPACE_ID, or SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID.',
        503,
      );
    }

    const now = new Date();
    const from = new Date(now.getTime() - request.minutes * 60_000);
    const kql = buildSreAgentEvidenceKql(request, from, now);

    let result: { stdout: string; stderr: string };
    try {
      result = await this.executor([
        'monitor', 'log-analytics', 'query',
        '--workspace', workspace,
        '--analytics-query', kql,
        '--timespan', `PT${request.minutes}M`,
        '--output', 'json',
      ], request.timeoutMs);
    } catch (err) {
      if (err instanceof SreAgentEvidenceQueryError) throw err;
      throw normalizeSreAgentMonitorError(err);
    }

    const rows = mapSreAgentQueryRows(result.stdout).slice(0, request.limit).map(redactRow);

    return {
      templateName: request.templateName,
      workspace,
      timeRange: {
        from: from.toISOString(),
        to: now.toISOString(),
        minutes: request.minutes,
      },
      rowCount: rows.length,
      rows,
      metadata: {
        source: `Azure SRE Agent Application Insights customEvents (${SRE_AGENT_EVENT_NAMES.incidentActivitySnapshot}/${SRE_AGENT_EVENT_NAMES.agentExecution}/${SRE_AGENT_EVENT_NAMES.agentToolExecution}/${SRE_AGENT_EVENT_NAMES.approvalDecision}) via governed canned template`,
        collectedAt: new Date().toISOString(),
        limitations: evidenceLimitations(request.templateName, rows.length),
        confidence: rows.length > 0 ? 'medium' : 'low',
        status: 'complete',
        partial: false,
        timeoutMs: request.timeoutMs,
        partialBehavior: 'Partial or timed-out query results are not accepted as complete evidence; the route returns an unavailable error instead of guessed rows.',
        schemaMismatch: false,
      },
    };
  }
}

function evidenceLimitations(templateName: SreAgentEvidenceTemplateName, rowCount: number): string[] {
  const limitations = [
    'Only canned parameterized templates are supported; arbitrary KQL is rejected.',
    'Rows are bounded, redacted, and time-window limited before returning to Mission Control.',
    'Zero rows means no native telemetry was observed in this window -- this is reported as unknown/pending evidence, never as a healthy or mitigated incident.',
  ];
  if (templateName === 'agent-execution-lifecycle' || templateName === 'approval-decisions') {
    limitations.push('SCHEMA_TBD: AgentExecution and ApprovalDecision field names beyond the shared correlation fields are not individually enumerated in Microsoft Learn as of this implementation; only documented shared fields plus a raw customDimensions projection are returned. See docs/CAPABILITY-CONTRACTS.md SS8.');
  }
  if (rowCount === 0) {
    limitations.push('No rows may mean the response plan has not fired yet, the agent is not connected to Azure Monitor as an incident platform, or the correlation filter (threadId/incidentId/impactedService) did not match -- not that the agent is idle or healthy.');
  }
  return limitations;
}

export function normalizeSreAgentEvidenceRequest(
  templateName: string,
  rawParams: Record<string, unknown>,
): SreAgentEvidenceQueryRequest {
  assertAllowedTemplate(templateName);
  rejectUnknownParams(templateName, rawParams);

  const minutes = parseBoundedInteger(rawParams.minutes, DEFAULT_MINUTES, 1, MAX_MINUTES, 'minutes');
  const limit = parseBoundedInteger(rawParams.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, 'limit');
  const timeoutMs = parseBoundedInteger(rawParams.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS, 'timeoutMs');
  const threadId = optionalPatternString(rawParams.threadId, THREAD_ID_PATTERN, 'threadId');
  const incidentId = optionalPatternString(rawParams.incidentId, INCIDENT_ID_PATTERN, 'incidentId');
  const impactedService = optionalString(rawParams.impactedService, 63);

  if (templateName === 'incident-thread-timeline' && !threadId) {
    throw new KubeInputError('incident-thread-timeline requires threadId.');
  }

  return {
    templateName,
    minutes,
    limit,
    threadId,
    incidentId,
    impactedService,
    timeoutMs,
  };
}

export function buildSreAgentEvidenceKql(request: SreAgentEvidenceQueryRequest, from: Date, to: Date): string {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const limit = request.limit;
  const windowFilter = `| where timestamp between (datetime(${fromIso}) .. datetime(${toIso}))`;

  switch (request.templateName) {
    case 'incident-activity-snapshot': {
      const filters = [`name == "${SRE_AGENT_EVENT_NAMES.incidentActivitySnapshot}"`];
      if (request.incidentId) filters.push(`tostring(customDimensions.IncidentId) == ${kqlString(request.incidentId)}`);
      if (request.impactedService) filters.push(`tostring(customDimensions.IncidentImpactedService) has ${kqlString(request.impactedService)}`);
      return [
        'customEvents',
        `| where ${filters.join(' and ')}`,
        windowFilter,
        '| project timestamp,',
        '    IncidentId = tostring(customDimensions.IncidentId),',
        '    IncidentTitle = tostring(customDimensions.IncidentTitle),',
        '    IncidentSeverity = tostring(customDimensions.IncidentSeverity),',
        '    IncidentStatus = tostring(customDimensions.IncidentStatus),',
        '    IncidentPlatform = tostring(customDimensions.IncidentPlatform),',
        '    IncidentMitigatedByAgent = tostring(customDimensions.IncidentMitigatedByAgent),',
        '    IncidentAssistedByAgent = tostring(customDimensions.IncidentAssistedByAgent),',
        '    AgentAutonomyLevel = tostring(customDimensions.AgentAutonomyLevel),',
        '    ResponsePlanId = tostring(customDimensions.ResponsePlanId),',
        '    ResponsePlanCustom = tostring(customDimensions.ResponsePlanCustom),',
        '    IncidentImpactedService = tostring(customDimensions.IncidentImpactedService),',
        '    IncidentCreatedOn = tostring(customDimensions.IncidentCreatedOn),',
        '    IncidentHandledOn = tostring(customDimensions.IncidentHandledOn),',
        '    IncidentMitigatedOn = tostring(customDimensions.IncidentMitigatedOn),',
        '    ThreadId = tostring(customDimensions.ThreadId),',
        '    CorrelationId = tostring(customDimensions.CorrelationId),',
        '    AgentName = tostring(customDimensions["gen_ai.agent.name"]),',
        '    AgentResourceId = tostring(customDimensions["gen_ai.agent.id"])',
        '| order by timestamp desc',
        `| take ${limit}`,
      ].join('\n');
    }
    case 'agent-tool-execution': {
      const filters = [`name == "${SRE_AGENT_EVENT_NAMES.agentToolExecution}"`];
      if (request.threadId) filters.push(`tostring(customDimensions.ThreadId) == ${kqlString(request.threadId)}`);
      return [
        'customEvents',
        `| where ${filters.join(' and ')}`,
        windowFilter,
        '| project timestamp,',
        '    EventType = tostring(customDimensions.EventType),',
        '    ToolName = tostring(customDimensions.ToolName),',
        '    ToolInput = tostring(customDimensions.ToolInput),',
        '    ToolOutput = tostring(customDimensions.ToolOutput),',
        '    SubAgentName = tostring(customDimensions.SubAgentName),',
        '    CallId = tostring(customDimensions.CallId),',
        '    ThreadId = tostring(customDimensions.ThreadId),',
        '    CorrelationId = tostring(customDimensions.CorrelationId)',
        '| order by timestamp desc',
        `| take ${limit}`,
      ].join('\n');
    }
    case 'agent-execution-lifecycle': {
      // SCHEMA_TBD: Microsoft Learn documents AgentExecution only as "session start/end lifecycle"
      // without enumerating dimension names (docs/CAPABILITY-CONTRACTS.md SS8). Project shared
      // correlation fields plus the raw bag so the caller can inspect without us inventing fields.
      const filters = [`name == "${SRE_AGENT_EVENT_NAMES.agentExecution}"`];
      if (request.threadId) filters.push(`tostring(customDimensions.ThreadId) == ${kqlString(request.threadId)}`);
      return [
        'customEvents',
        `| where ${filters.join(' and ')}`,
        windowFilter,
        '| project timestamp,',
        '    ThreadId = tostring(customDimensions.ThreadId),',
        '    CorrelationId = tostring(customDimensions.CorrelationId),',
        '    TraceId = tostring(customDimensions.TraceId),',
        '    AgentName = tostring(customDimensions["gen_ai.agent.name"]),',
        '    AgentResourceId = tostring(customDimensions["gen_ai.agent.id"]),',
        '    RawDimensions = customDimensions',
        '| order by timestamp desc',
        `| take ${limit}`,
      ].join('\n');
    }
    case 'approval-decisions': {
      // SCHEMA_TBD: Microsoft Learn shows only `project timestamp, customDimensions` for
      // ApprovalDecision without an itemized field table (docs/CAPABILITY-CONTRACTS.md SS8).
      const filters = [`name == "${SRE_AGENT_EVENT_NAMES.approvalDecision}"`];
      if (request.threadId) filters.push(`tostring(customDimensions.ThreadId) == ${kqlString(request.threadId)}`);
      return [
        'customEvents',
        `| where ${filters.join(' and ')}`,
        windowFilter,
        '| project timestamp,',
        '    ThreadId = tostring(customDimensions.ThreadId),',
        '    CorrelationId = tostring(customDimensions.CorrelationId),',
        '    RawDimensions = customDimensions',
        '| order by timestamp desc',
        `| take ${limit}`,
      ].join('\n');
    }
    case 'incident-thread-timeline': {
      const threadId = requiredThreadId(request);
      return [
        'customEvents',
        `| where name in ("${SRE_AGENT_EVENT_NAMES.incidentActivitySnapshot}", "${SRE_AGENT_EVENT_NAMES.agentExecution}", "${SRE_AGENT_EVENT_NAMES.agentToolExecution}", "${SRE_AGENT_EVENT_NAMES.approvalDecision}")`,
        `| where tostring(customDimensions.ThreadId) == ${kqlString(threadId)}`,
        windowFilter,
        '| project timestamp,',
        '    Event = name,',
        '    EventType = tostring(customDimensions.EventType),',
        '    Tool = tostring(customDimensions.ToolName),',
        '    IncidentStatus = tostring(customDimensions.IncidentStatus),',
        '    ThreadId = tostring(customDimensions.ThreadId),',
        '    CorrelationId = tostring(customDimensions.CorrelationId)',
        '| order by timestamp asc',
        `| take ${limit}`,
      ].join('\n');
    }
    default:
      throw new KubeInputError(`SRE Agent evidence template '${String(request.templateName)}' is not allowlisted.`);
  }
}

function requiredThreadId(request: SreAgentEvidenceQueryRequest): string {
  if (!request.threadId) {
    throw new KubeInputError('incident-thread-timeline requires threadId.');
  }
  return request.threadId;
}

export function mapSreAgentQueryRows(stdout: string): Record<string, unknown>[] {
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SreAgentEvidenceQueryError(`Azure Monitor returned invalid JSON: ${message}`, 502);
  }

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.value)) return parsed.value;
  const table = parsed?.tables?.[0];
  if (!table) return [];
  const columns = (table.columns ?? []).map((column: any) => column.name);
  return (table.rows ?? []).map((row: unknown[]) => Object.fromEntries(columns.map((column: string, index: number) => [column, row[index]])));
}

export function normalizeSreAgentMonitorError(err: unknown): SreAgentEvidenceQueryError {
  if (isNodeError(err) && err.code === 'ENOENT') {
    return new SreAgentEvidenceQueryError('Azure CLI is unavailable on PATH. SRE Agent evidence templates are unavailable.', 503);
  }

  const message = err instanceof Error ? err.message : String(err);
  const isTimeout = /timed out|timeout/i.test(message);
  const stderr = isExecError(err) ? err.stderr?.trim() : undefined;
  const stdout = isExecError(err) ? err.stdout?.trim() : undefined;
  const detail = redactSensitiveText(stderr || stdout || message);
  const isSchemaMismatch = SCHEMA_MISMATCH_PATTERNS.some(pattern => pattern.test(detail));

  if (isSchemaMismatch) {
    return new SreAgentEvidenceQueryError(
      `Azure SRE Agent evidence query failed schema validation -- the deployed telemetry schema may no longer match the documented event/field names: ${detail}`,
      502,
      true,
    );
  }

  return new SreAgentEvidenceQueryError(`Azure SRE Agent evidence query ${isTimeout ? 'timed out' : 'failed'}: ${detail}`, isTimeout ? 504 : 503);
}

async function execAzureMonitorQuery(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec('az', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    throw normalizeSreAgentMonitorError(err);
  }
}

function assertAllowedTemplate(templateName: string): asserts templateName is SreAgentEvidenceTemplateName {
  if (!SRE_AGENT_EVIDENCE_TEMPLATES.includes(templateName as SreAgentEvidenceTemplateName)) {
    throw new KubeInputError(`SRE Agent evidence template '${templateName}' is not allowlisted.`);
  }
}

function rejectUnknownParams(templateName: SreAgentEvidenceTemplateName, rawParams: Record<string, unknown>): void {
  const base = new Set(['minutes', 'limit', 'timeoutMs']);
  const allowedByTemplate: Record<SreAgentEvidenceTemplateName, Set<string>> = {
    'incident-activity-snapshot': new Set([...base, 'incidentId', 'impactedService']),
    'agent-execution-lifecycle': new Set([...base, 'threadId']),
    'agent-tool-execution': new Set([...base, 'threadId']),
    'approval-decisions': new Set([...base, 'threadId']),
    'incident-thread-timeline': new Set([...base, 'threadId']),
  };
  for (const key of Object.keys(rawParams)) {
    if (!allowedByTemplate[templateName].has(key)) {
      throw new KubeInputError(`Parameter '${key}' is not allowed for template '${templateName}'.`);
    }
  }
}

function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' && typeof raw !== 'number') throw new KubeInputError(`${name} must be an integer.`);
  if (!/^\d+$/.test(String(raw))) throw new KubeInputError(`${name} must be an integer.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new KubeInputError(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') throw new KubeInputError('String parameter has invalid type.');
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new KubeInputError('String parameter is too long.');
  return trimmed;
}

function optionalPatternString(value: unknown, pattern: RegExp, name: string): string | undefined {
  const trimmed = optionalString(value, 100);
  if (trimmed === undefined) return undefined;
  if (!pattern.test(trimmed)) {
    throw new KubeInputError(`${name} has an invalid format.`);
  }
  return trimmed;
}

export function configuredSreAgentWorkspaceId(): string | undefined {
  return process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID
    ?? process.env.LOG_ANALYTICS_WORKSPACE_ID
    ?? process.env.AZURE_LOG_ANALYTICS_WORKSPACE_ID
    ?? process.env.APPLICATIONINSIGHTS_WORKSPACE_ID;
}

function kqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === 'string' ? redactSensitiveText(value) : value,
  ]));
}

function redactSensitiveText(text: string): string {
  return text
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]')
    .replace(/\b(password|passwd|pwd|token|secret|api[_-]?key|client[_-]?secret|authorization)(\s*[:=]\s*)(["']?)[^\s"',;]+/gi, '$1$2$3[REDACTED]')
    .replace(/\b(AccountKey=)[^;\s]+/gi, '$1[REDACTED]');
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}

function isExecError(err: unknown): err is Error & { stderr?: string; stdout?: string } {
  return typeof err === 'object' && err !== null;
}
