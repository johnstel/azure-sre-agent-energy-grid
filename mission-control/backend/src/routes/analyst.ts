import type { FastifyInstance, FastifyReply } from 'fastify';
import { ALLOWED_AKS_ANALYST_QUERIES, AnalystKubeQueryService } from '../services/AnalystKubeQueryService.js';
import { configuredWorkspaceId, LogAnalyticsQueryError, LogAnalyticsQueryService, normalizeLogAnalyticsRequest } from '../services/LogAnalyticsQueryService.js';
import { KubeClientError, KubeInputError } from '../services/KubeClient.js';

const aksQueries = new AnalystKubeQueryService();
const logAnalytics = new LogAnalyticsQueryService();
const ENERGY_NAMESPACE = 'energy' as const;
const DEFAULT_LOG_ANALYTICS_MINUTES = 30;
const DEFAULT_LOG_ANALYTICS_TIMEOUT_MS = 15_000;
const LOG_SOURCE = 'Azure Monitor Log Analytics query via governed canned template';
const AKS_SOURCE = `kubectl get (read-only) against namespace '${ENERGY_NAMESPACE}'`;

export function registerAnalystRoutes(app: FastifyInstance): void {
  app.get<{ Params: { queryName: string } }>('/api/analyst/aks/:queryName', async (req, reply) => {
    try {
      return reply.send(await aksQueries.execute(req.params.queryName));
    } catch (err) {
      return sendAksAnalystError(reply, req.params.queryName, err);
    }
  });

  app.get<{ Params: { templateName: string }; Querystring: Record<string, unknown> }>('/api/analyst/logs/:templateName', async (req, reply) => {
    try {
      return reply.send(await logAnalytics.execute(req.params.templateName, req.query));
    } catch (err) {
      return sendLogAnalystError(reply, req.params.templateName, req.query, err);
    }
  });
}

function sendAksAnalystError(reply: FastifyReply, queryName: string, err: unknown) {
  if (err instanceof KubeInputError) {
    return reply.status(400).send(buildAksErrorResponse(queryName, err.message, 'denied'));
  }

  if (err instanceof KubeClientError) {
    return reply.status(err.statusCode).send(buildAksErrorResponse(queryName, err.message, 'unavailable'));
  }

  const message = err instanceof Error ? err.message : String(err);
  return reply.status(500).send(buildAksErrorResponse(queryName, message, 'unavailable'));
}

function sendLogAnalystError(
  reply: FastifyReply,
  templateName: string,
  query: Record<string, unknown>,
  err: unknown,
) {
  if (err instanceof KubeInputError) {
    return reply.status(400).send(buildLogAnalyticsErrorResponse(templateName, query, err.message, 'denied'));
  }

  if (err instanceof LogAnalyticsQueryError) {
    return reply.status(err.statusCode).send(buildLogAnalyticsErrorResponse(templateName, query, err.message, 'unavailable'));
  }

  const message = err instanceof Error ? err.message : String(err);
  return reply.status(500).send(buildLogAnalyticsErrorResponse(templateName, query, message, 'unavailable'));
}

export function buildAksErrorResponse(queryName: string, error: string, status: 'denied' | 'unavailable') {
  const limitations = status === 'denied'
    ? ['Local Analyst uses an explicit AKS query allowlist and rejects unknown, broad, secret, or write-like requests.']
    : ['No inference is made from missing, timed-out, or unavailable governed AKS data.'];

  return {
    error,
    queryName,
    namespace: ENERGY_NAMESPACE,
    status,
    data: [],
    metadata: {
      source: AKS_SOURCE,
      collectedAt: new Date().toISOString(),
      limitations,
      confidence: 'none',
      status,
      allowedVerb: 'get',
      allowlist: [...ALLOWED_AKS_ANALYST_QUERIES],
    },
  };
}

export function buildLogAnalyticsErrorResponse(
  templateName: string,
  query: Record<string, unknown>,
  error: string,
  status: 'denied' | 'unavailable',
) {
  const normalized = tryNormalizeLogAnalyticsRequest(templateName, query);
  const now = new Date();
  const minutes = normalized?.minutes ?? DEFAULT_LOG_ANALYTICS_MINUTES;
  const timeoutMs = normalized?.timeoutMs ?? DEFAULT_LOG_ANALYTICS_TIMEOUT_MS;
  const from = new Date(now.getTime() - minutes * 60_000);
  const limitations = status === 'denied'
    ? ['Local Analyst uses canned Log Analytics templates only; unknown templates, freeform KQL, workspace overrides, and invalid parameters are rejected.']
    : ['No inference is made from missing, timed-out, or unavailable governed Log Analytics data.'];

  return {
    error,
    templateName,
    workspace: configuredWorkspaceId() ?? 'not configured',
    status,
    timeRange: {
      from: from.toISOString(),
      to: now.toISOString(),
      minutes,
    },
    rowCount: 0,
    rows: [],
    metadata: {
      source: LOG_SOURCE,
      collectedAt: new Date().toISOString(),
      limitations,
      confidence: 'none',
      status,
      partial: false,
      timeoutMs,
      partialBehavior: 'Partial or timed-out query results are not accepted as complete evidence; Local Analyst must treat this response as unavailable or denied.',
    },
  };
}

function tryNormalizeLogAnalyticsRequest(templateName: string, query: Record<string, unknown>) {
  try {
    return normalizeLogAnalyticsRequest(templateName, query);
  } catch {
    return undefined;
  }
}
