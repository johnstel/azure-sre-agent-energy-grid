import type { FastifyInstance } from 'fastify';
import type { JobManager } from '../services/JobManager.js';
import { AssistantUnavailableError, askMissionControlAssistant } from '../services/AssistantService.js';
import type { AssistantAskRequest, AssistantClientContext, AssistantConversationMessage, KubeSeverity } from '../types/index.js';

const MAX_QUESTION_LENGTH = 1_000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_MESSAGE_LENGTH = 2_000;
const MAX_CONTEXT_STRING_LENGTH = 240;
const MAX_CONTEXT_ARRAY_ITEMS = 8;
let activeAssistantRequests = 0;

function normalizeQuestion(body: AssistantAskRequest | undefined): string | undefined {
  if (!body || typeof body.question !== 'string') return undefined;
  const question = body.question.trim();
  return question.length > 0 ? question : undefined;
}

function normalizeHistory(body: AssistantAskRequest | undefined): { history: AssistantConversationMessage[]; error?: string } {
  if (!body || body.history === undefined) return { history: [] };
  if (!Array.isArray(body.history)) return { history: [], error: 'Conversation history must be an array.' };
  if (body.history.length > MAX_HISTORY_MESSAGES) {
    return { history: [], error: `Conversation history must include ${MAX_HISTORY_MESSAGES} messages or fewer.` };
  }

  const history: AssistantConversationMessage[] = [];
  for (const message of body.history) {
    if (!message || typeof message !== 'object') {
      return { history: [], error: 'Conversation history messages must be objects.' };
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      return { history: [], error: 'Conversation history message role must be user or assistant.' };
    }
    if (typeof message.content !== 'string') {
      return { history: [], error: 'Conversation history message content must be a string.' };
    }

    const content = message.content.trim();
    if (!content) continue;
    if (content.length > MAX_HISTORY_MESSAGE_LENGTH) {
      return { history: [], error: `Conversation history messages must be ${MAX_HISTORY_MESSAGE_LENGTH} characters or fewer.` };
    }
    history.push({ role: message.role, content });
  }

  return { history };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, maxLength = MAX_CONTEXT_STRING_LENGTH): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function severityValue(value: unknown): KubeSeverity | undefined {
  return value === 'critical' || value === 'warning' || value === 'healthy' || value === 'unknown' ? value : undefined;
}

function stringArray(value: unknown, maxItems = MAX_CONTEXT_ARRAY_ITEMS): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.map(item => stringValue(item)).filter((item): item is string => Boolean(item)).slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : undefined;
}

function normalizeClientContext(body: AssistantAskRequest | undefined): { clientContext?: AssistantClientContext; error?: string } {
  const rawContext = body?.clientContext ?? body?.screenContext;
  if (rawContext === undefined) return {};
  if (!isRecord(rawContext)) return { error: 'Client context must be an object.' };

  const context: AssistantClientContext = {
    capturedAt: stringValue(rawContext.capturedAt),
    route: stringValue(rawContext.route),
  };

  if (isRecord(rawContext.viewport)) {
    context.viewport = {
      width: numberValue(rawContext.viewport.width),
      height: numberValue(rawContext.viewport.height),
    };
  }

  if (isRecord(rawContext.selected)) {
    const type = stringValue(rawContext.selected.type, 40);
    context.selected = {
      type: type === 'inventory' || type === 'pod' || type === 'service' || type === 'deployment' ? type : undefined,
      id: stringValue(rawContext.selected.id),
      name: stringValue(rawContext.selected.name),
      namespace: stringValue(rawContext.selected.namespace),
      deploymentName: stringValue(rawContext.selected.deploymentName),
      serviceName: stringValue(rawContext.selected.serviceName),
      podNames: stringArray(rawContext.selected.podNames),
    };
  }

  if (isRecord(rawContext.drawers)) {
    context.drawers = {
      analystOpen: booleanValue(rawContext.drawers.analystOpen),
      diagnosticsCollapsed: booleanValue(rawContext.drawers.diagnosticsCollapsed),
      controlPanelOpen: booleanValue(rawContext.drawers.controlPanelOpen),
      destroyConfirmOpen: booleanValue(rawContext.drawers.destroyConfirmOpen),
    };
  }

  if (isRecord(rawContext.activeControls)) {
    context.activeControls = {
      deployLocation: stringValue(rawContext.activeControls.deployLocation),
      deployWorkload: stringValue(rawContext.activeControls.deployWorkload),
      deploySkipRbac: booleanValue(rawContext.activeControls.deploySkipRbac),
      deploySkipSreAgent: booleanValue(rawContext.activeControls.deploySkipSreAgent),
      destroyResourceGroupSet: booleanValue(rawContext.activeControls.destroyResourceGroupSet),
      scenarioToggleInProgress: stringValue(rawContext.activeControls.scenarioToggleInProgress),
      fixingAll: booleanValue(rawContext.activeControls.fixingAll),
      refreshing: booleanValue(rawContext.activeControls.refreshing),
    };
  }

  if (Array.isArray(rawContext.visiblePublicServiceLinks)) {
    context.visiblePublicServiceLinks = rawContext.visiblePublicServiceLinks
      .filter(isRecord)
      .slice(0, 4)
      .map(link => ({
        name: stringValue(link.name, 80) ?? 'service',
        url: stringValue(link.url, 200) ?? '',
        address: stringValue(link.address, 120),
      }))
      .filter(link => link.url.length > 0);
  }
  if (isRecord(rawContext.inventorySummary)) {
    const severityCounts = isRecord(rawContext.inventorySummary.severityCounts)
      ? {
        critical: numberValue(rawContext.inventorySummary.severityCounts.critical),
        warning: numberValue(rawContext.inventorySummary.severityCounts.warning),
        healthy: numberValue(rawContext.inventorySummary.severityCounts.healthy),
        unknown: numberValue(rawContext.inventorySummary.severityCounts.unknown),
      }
      : undefined;
    const topResources = Array.isArray(rawContext.inventorySummary.topResources)
      ? rawContext.inventorySummary.topResources.filter(isRecord).slice(0, 6).map(resource => ({
        name: stringValue(resource.name, 120) ?? 'resource',
        namespace: stringValue(resource.namespace, 80),
        severity: severityValue(resource.severity),
        desiredReplicas: numberValue(resource.desiredReplicas),
        readyReplicas: numberValue(resource.readyReplicas),
        reason: stringValue(resource.reason),
      }))
      : undefined;
    context.inventorySummary = {
      source: stringValue(rawContext.inventorySummary.source, 80),
      total: numberValue(rawContext.inventorySummary.total),
      readyPods: numberValue(rawContext.inventorySummary.readyPods),
      totalPods: numberValue(rawContext.inventorySummary.totalPods),
      activeScenarios: numberValue(rawContext.inventorySummary.activeScenarios),
      mismatches: numberValue(rawContext.inventorySummary.mismatches),
      severityCounts,
      heartbeat: severityValue(rawContext.inventorySummary.heartbeat),
      topResources,
    };
  }

  if (Array.isArray(rawContext.incidents)) {
    context.incidents = rawContext.incidents.filter(isRecord).slice(0, 5).map(incident => ({
      name: stringValue(incident.name, 120) ?? 'incident',
      severity: severityValue(incident.severity),
      reason: stringValue(incident.reason),
      actualState: stringValue(incident.actualState),
      podNames: stringArray(incident.podNames),
    }));
  }

  if (isRecord(rawContext.diagnostics)) {
    context.diagnostics = {
      status: stringValue(rawContext.diagnostics.status, 40),
      error: stringValue(rawContext.diagnostics.error),
      selectedLogLineCount: numberValue(rawContext.diagnostics.selectedLogLineCount),
      selectedEventCount: numberValue(rawContext.diagnostics.selectedEventCount),
      selectedEndpointCount: numberValue(rawContext.diagnostics.selectedEndpointCount),
      endpointSummaries: stringArray(rawContext.diagnostics.endpointSummaries, 6),
    };
  }

  if (isRecord(rawContext.wallboardSections)) {
    context.wallboardSections = {
      inventory: stringValue(rawContext.wallboardSections.inventory, 40),
      activeIncidents: stringValue(rawContext.wallboardSections.activeIncidents, 40),
      runtime: stringValue(rawContext.wallboardSections.runtime, 40),
      diagnosticsDrawer: stringValue(rawContext.wallboardSections.diagnosticsDrawer, 40),
      controls: stringValue(rawContext.wallboardSections.controls, 40),
      analyst: stringValue(rawContext.wallboardSections.analyst, 40),
    };
  }

  return { clientContext: context };
}

export function registerAssistantRoutes(app: FastifyInstance, jobManager: JobManager): void {
  app.post<{ Body: AssistantAskRequest }>('/api/assistant/ask', async (req, reply) => {
    const question = normalizeQuestion(req.body);
    const { history, error: historyError } = normalizeHistory(req.body);
    const { clientContext, error: clientContextError } = normalizeClientContext(req.body);

    if (!question) {
      return reply.status(400).send({ error: 'Question is required.' });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return reply.status(400).send({ error: `Question must be ${MAX_QUESTION_LENGTH} characters or fewer.` });
    }

    if (historyError) {
      return reply.status(400).send({ error: historyError });
    }

    if (clientContextError) {
      return reply.status(400).send({ error: clientContextError });
    }

    if (activeAssistantRequests >= 1) {
      return reply.status(429).send({ error: 'Ask Copilot is already answering a question. Please retry after it finishes.' });
    }

    activeAssistantRequests += 1;
    try {
      const response = await askMissionControlAssistant(question, jobManager, history, clientContext);
      return reply.send(response);
    } catch (err) {
      if (err instanceof AssistantUnavailableError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    } finally {
      activeAssistantRequests -= 1;
    }
  });
}
