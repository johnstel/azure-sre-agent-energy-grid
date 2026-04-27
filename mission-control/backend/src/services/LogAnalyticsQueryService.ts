import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  LogAnalyticsQueryRequest,
  LogAnalyticsQueryResponse,
  LogAnalyticsTemplateName,
} from '../types/index.js';
import { KubeInputError } from './KubeClient.js';

const exec = promisify(execFile);
const ENERGY_NAMESPACE = 'energy' as const;
const DEFAULT_MINUTES = 30;
const MAX_MINUTES = 24 * 60;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const DNS_LABEL_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const POD_NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;

export const LOG_ANALYTICS_TEMPLATES = [
  'pod-restarts-lifecycle',
  'service-log-excerpts',
  'application-exceptions-errors',
] as const satisfies readonly LogAnalyticsTemplateName[];

type AzureMonitorExecutor = (args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

export class LogAnalyticsQueryError extends Error {
  constructor(message: string, public readonly statusCode = 503) {
    super(message);
    this.name = 'LogAnalyticsQueryError';
  }
}

export class LogAnalyticsQueryService {
  constructor(private readonly executor: AzureMonitorExecutor = execAzureMonitorQuery) {}

  async execute(templateName: string, rawParams: Record<string, unknown>): Promise<LogAnalyticsQueryResponse> {
    const request = normalizeLogAnalyticsRequest(templateName, rawParams);
    const workspace = configuredWorkspaceId();
    if (!workspace) {
      throw new LogAnalyticsQueryError('Log Analytics workspace is not configured. Set LOG_ANALYTICS_WORKSPACE_ID or AZURE_LOG_ANALYTICS_WORKSPACE_ID.', 503);
    }

    const now = new Date();
    const from = new Date(now.getTime() - request.minutes * 60_000);
    const kql = buildKqlTemplate(request, from, now);
    const result = await this.executor([
      'monitor', 'log-analytics', 'query',
      '--workspace', workspace,
      '--analytics-query', kql,
      '--timespan', `PT${request.minutes}M`,
      '--output', 'json',
    ], request.timeoutMs);

    const rows = mapAzureQueryRows(result.stdout).slice(0, request.limit).map(redactRow);

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
        source: 'Azure Monitor Log Analytics query via governed canned template',
        collectedAt: new Date().toISOString(),
        limitations: [
          'Only canned parameterized templates are supported; arbitrary KQL is rejected.',
          'Rows are bounded, redacted, and time-window limited before returning to Local Analyst.',
          'Timeout or command failure is treated as unavailable; Local Analyst must not infer missing results.',
        ],
        confidence: rows.length > 0 ? 'medium' : 'low',
        status: 'complete',
        partial: false,
        timeoutMs: request.timeoutMs,
        partialBehavior: 'Partial or timed-out query results are not accepted as complete evidence; the route returns an unavailable error instead of guessed rows.',
      },
    };
  }
}

export function normalizeLogAnalyticsRequest(
  templateName: string,
  rawParams: Record<string, unknown>,
): LogAnalyticsQueryRequest {
  assertAllowedTemplate(templateName);
  rejectUnknownParams(templateName, rawParams);

  const minutes = parseBoundedInteger(rawParams.minutes, DEFAULT_MINUTES, 1, MAX_MINUTES, 'minutes');
  const limit = parseBoundedInteger(rawParams.limit, DEFAULT_LIMIT, 1, MAX_LIMIT, 'limit');
  const timeoutMs = parseBoundedInteger(rawParams.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS, 'timeoutMs');
  const service = optionalString(rawParams.service, 63);
  const pod = optionalString(rawParams.pod, 253);

  if (service && !DNS_LABEL_PATTERN.test(service)) {
    throw new KubeInputError('service must be a valid Kubernetes DNS label.');
  }
  if (pod && !POD_NAME_PATTERN.test(pod)) {
    throw new KubeInputError('pod must be a valid Kubernetes pod name.');
  }

  if (templateName === 'service-log-excerpts' && !service && !pod) {
    throw new KubeInputError('service-log-excerpts requires service or pod.');
  }
  if (templateName === 'application-exceptions-errors' && !service) {
    throw new KubeInputError('application-exceptions-errors requires a service filter to avoid broad workspace reads.');
  }

  return {
    templateName,
    minutes,
    limit,
    service,
    pod,
    namespace: ENERGY_NAMESPACE,
    timeoutMs,
  };
}

export function buildKqlTemplate(request: LogAnalyticsQueryRequest, from: Date, to: Date): string {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const namespace = kqlString(ENERGY_NAMESPACE);
  const limit = request.limit;

  switch (request.templateName) {
    case 'pod-restarts-lifecycle':
      return [
        'KubePodInventory',
        `| where TimeGenerated between (datetime(${fromIso}) .. datetime(${toIso}))`,
        `| where Namespace == ${namespace}`,
        '| summarize RestartCount=max(ContainerRestartCount), LastStatus=max(ContainerStatus), LastSeen=max(TimeGenerated) by PodName, ContainerName',
        '| where RestartCount > 0 or LastStatus !in ("running", "completed")',
        '| order by LastSeen desc',
        `| take ${limit}`,
      ].join('\n');
    case 'service-log-excerpts': {
      const filters = [`TimeGenerated between (datetime(${fromIso}) .. datetime(${toIso}))`, `Namespace == ${namespace}`];
      if (request.pod) filters.push(`PodName == ${kqlString(request.pod)}`);
      if (request.service) filters.push(`PodName has ${kqlString(request.service)}`);
      return [
        'ContainerLogV2',
        `| where ${filters.join(' and ')}`,
        '| project TimeGenerated, PodName, ContainerName, LogLevel, LogMessage',
        '| order by TimeGenerated desc',
        `| take ${limit}`,
      ].join('\n');
    }
    case 'application-exceptions-errors':
      return [
        'union isfuzzy=true AppExceptions, AppTraces, exceptions, traces',
        `| where TimeGenerated between (datetime(${fromIso}) .. datetime(${toIso}))`,
        `| extend RoleName=tostring(coalesce(cloud_RoleName, appName, cloud_RoleInstance, AppRoleName))`,
        `| where RoleName has ${kqlString(requiredServiceFilter(request))}`,
        '| where SeverityLevel >= 3 or tostring(type) != "" or message has_any ("error", "exception", "failed")',
        '| project TimeGenerated, ProblemId=coalesce(problemId, problemId_s, type), SeverityLevel, Message=coalesce(message, innermostMessage, outerMessage), OperationName=operation_Name, CloudRoleName=RoleName',
        '| order by TimeGenerated desc',
        `| take ${limit}`,
      ].join('\n');
    default:
      throw new KubeInputError(`Log Analytics template '${String(request.templateName)}' is not allowlisted.`);
  }
}

function requiredServiceFilter(request: LogAnalyticsQueryRequest): string {
  if (!request.service) {
    throw new KubeInputError('application-exceptions-errors requires a service filter to avoid broad workspace reads.');
  }
  return request.service;
}

export function mapAzureQueryRows(stdout: string): Record<string, unknown>[] {
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LogAnalyticsQueryError(`Azure Monitor returned invalid JSON: ${message}`, 502);
  }

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.value)) return parsed.value;
  const table = parsed?.tables?.[0];
  if (!table) return [];
  const columns = (table.columns ?? []).map((column: any) => column.name);
  return (table.rows ?? []).map((row: unknown[]) => Object.fromEntries(columns.map((column: string, index: number) => [column, row[index]])));
}

export function normalizeAzureMonitorError(err: unknown): LogAnalyticsQueryError {
  if (isNodeError(err) && err.code === 'ENOENT') {
    return new LogAnalyticsQueryError('Azure CLI is unavailable on PATH. Log Analytics templates are unavailable.', 503);
  }

  const message = err instanceof Error ? err.message : String(err);
  const isTimeout = /timed out|timeout/i.test(message);
  const stderr = isExecError(err) ? err.stderr?.trim() : undefined;
  const stdout = isExecError(err) ? err.stdout?.trim() : undefined;
  const detail = redactSensitiveText(stderr || stdout || message);
  return new LogAnalyticsQueryError(`Azure Monitor Log Analytics query ${isTimeout ? 'timed out' : 'failed'}: ${detail}`, isTimeout ? 504 : 503);
}

async function execAzureMonitorQuery(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec('az', args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
  } catch (err) {
    throw normalizeAzureMonitorError(err);
  }
}

function assertAllowedTemplate(templateName: string): asserts templateName is LogAnalyticsTemplateName {
  if (!LOG_ANALYTICS_TEMPLATES.includes(templateName as LogAnalyticsTemplateName)) {
    throw new KubeInputError(`Log Analytics template '${templateName}' is not allowlisted.`);
  }
}

function rejectUnknownParams(templateName: LogAnalyticsTemplateName, rawParams: Record<string, unknown>): void {
  const base = new Set(['minutes', 'limit', 'timeoutMs']);
  const allowedByTemplate: Record<LogAnalyticsTemplateName, Set<string>> = {
    'pod-restarts-lifecycle': base,
    'service-log-excerpts': new Set([...base, 'service', 'pod']),
    'application-exceptions-errors': new Set([...base, 'service']),
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

export function configuredWorkspaceId(): string | undefined {
  return process.env.LOG_ANALYTICS_WORKSPACE_ID
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
