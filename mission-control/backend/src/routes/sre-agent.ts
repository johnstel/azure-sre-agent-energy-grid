/**
 * REST surface for the Azure SRE Agent MCP integration.
 *
 * Every failure path returns `SreAgentErrorResponse`, which explicitly records
 * `localAnalystSubstituted: false` and carries the portal handoff. Mission Control never
 * returns a success-shaped body when the real agent could not be reached.
 *
 * No Azure token, MCP environment value, or raw tool payload is ever placed in a
 * response body — only redacted, bounded fields defined by the typed contracts.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { PORTAL_VALIDATION_SCENARIOS, getScenarioDescription, getScenarioPrompt } from '../services/PortalValidationService.js';
import { SreAgentOperationDeniedError } from '../services/sre-agent/operations.js';
import { redactSensitiveText } from '../services/sre-agent/redaction.js';
import { collectSreAgentPreflight } from '../services/sre-agent/preflight.js';
import { SreAgentMcpError } from '../services/sre-agent/SreAgentMcpClient.js';
import {
  SreAgentNotConfiguredError,
  SreAgentProvenanceError,
  SreAgentService,
} from '../services/sre-agent/SreAgentService.js';
import type {
  ContinueSreAgentInvestigationRequest,
  PortalValidationScenarioName,
  SreAgentErrorResponse,
  SreAgentFailureKind,
  SreAgentScenarioPrompt,
  StartSreAgentInvestigationRequest,
} from '../types/index.js';

let sharedService: SreAgentService | undefined;

export function getSreAgentService(): SreAgentService {
  sharedService ??= new SreAgentService();
  return sharedService;
}

/** Test seam so integration tests can inject a fake-MCP-backed service. */
export function setSreAgentServiceForTesting(service: SreAgentService | undefined): void {
  sharedService = service;
}

export function registerSreAgentRoutes(app: FastifyInstance, service: SreAgentService = getSreAgentService()): void {
  app.get('/api/sre-agent/config', async (_req, reply) =>
    reply.send({
      configured: service.configuration.configured,
      enabled: service.configuration.enabled,
      configurationIssues: [...service.configuration.configurationIssues],
      target: service.targetSummary(),
      portalHandoff: service.portalHandoff(),
      scenarioPrompts: buildScenarioPrompts(),
    }),
  );

  app.get<{ Querystring: { skipMcpProbe?: string } }>('/api/sre-agent/preflight', async (req, reply) => {
    try {
      const skipMcpProbe = req.query?.skipMcpProbe === 'true';
      return reply.send(await collectSreAgentPreflight(service, { skipMcpProbe }));
    } catch (error) {
      return sendSreAgentError(reply, service, error);
    }
  });

  app.get('/api/sre-agent/agents', async (_req, reply) => {
    try {
      return reply.send(await service.discoverAgents());
    } catch (error) {
      return sendSreAgentError(reply, service, error);
    }
  });

  app.get('/api/sre-agent/threads', async (_req, reply) => {
    try {
      return reply.send({ threads: await service.listRecordedThreads() });
    } catch (error) {
      return sendSreAgentError(reply, service, error);
    }
  });

  app.post<{ Body: StartSreAgentInvestigationRequest }>('/api/sre-agent/investigations', async (req, reply) => {
    let prompt: string | undefined;
    try {
      const body = req.body ?? {};
      prompt = resolvePrompt(body);
      const investigation = await service.startInvestigation({ ...body, prompt });
      return reply.send(investigation);
    } catch (error) {
      return sendSreAgentError(reply, service, error, prompt);
    }
  });

  app.post<{ Body: ContinueSreAgentInvestigationRequest }>('/api/sre-agent/investigations/continue', async (req, reply) => {
    try {
      const body = req.body ?? ({} as ContinueSreAgentInvestigationRequest);
      return reply.send(await service.continueInvestigation(body));
    } catch (error) {
      return sendSreAgentError(reply, service, error, req.body?.prompt);
    }
  });

  app.get<{ Params: { threadId: string } }>('/api/sre-agent/investigations/:threadId', async (req, reply) => {
    try {
      return reply.send(await service.getThreadStatus(req.params.threadId));
    } catch (error) {
      return sendSreAgentError(reply, service, error);
    }
  });

  app.post<{ Body: { correlationId?: string } }>('/api/sre-agent/investigations/cancel', async (req, reply) => {
    const correlationId = req.body?.correlationId;
    if (typeof correlationId !== 'string' || !correlationId.trim()) {
      return reply.status(400).send(
        buildErrorResponse(service, 'denied', 'A correlationId is required to cancel an operation.', 'Send the correlationId returned when the investigation started.'),
      );
    }

    const cancelled = service.cancel(correlationId.trim());
    return reply.send({
      cancelled,
      correlationId: correlationId.trim(),
      message: cancelled
        ? 'Mission Control aborted the in-flight request and will not retry it.'
        : 'No matching in-flight Mission Control operation was found; it may have already completed.',
      limitation:
        'Azure MCP Server does not document a server-side stop for a running investigation. Agent-side work already started may continue; review the thread in the SRE Agent portal.',
      timestamp: new Date().toISOString(),
    });
  });
}

function buildScenarioPrompts(): SreAgentScenarioPrompt[] {
  return PORTAL_VALIDATION_SCENARIOS.map((scenarioName) => ({
    scenarioName,
    title: getScenarioDescription(scenarioName),
    prompt: getScenarioPrompt(scenarioName),
  }));
}

/**
 * Resolves the prompt from either an approved scenario starter or an explicit operator
 * prompt. Only the three validated scenarios may seed a prompt automatically.
 */
export function resolvePrompt(body: StartSreAgentInvestigationRequest): string {
  const explicit = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (explicit) return explicit;

  const scenarioName = body.scenarioName;
  if (!scenarioName) {
    throw new SreAgentOperationDeniedError('Provide a prompt or an approved scenarioName to start an investigation.');
  }

  if (!(PORTAL_VALIDATION_SCENARIOS as readonly string[]).includes(scenarioName)) {
    throw new SreAgentOperationDeniedError(
      `Scenario '${scenarioName}' is not an approved SRE Agent starter scenario (${PORTAL_VALIDATION_SCENARIOS.join(', ')}).`,
    );
  }

  return getScenarioPrompt(scenarioName as PortalValidationScenarioName);
}

export function buildErrorResponse(
  service: SreAgentService,
  kind: SreAgentFailureKind,
  error: string,
  remediation: string,
  prompt?: string,
): SreAgentErrorResponse {
  return {
    error,
    kind,
    remediation,
    investigationStarted: false,
    localAnalystSubstituted: false,
    portalHandoff: service.portalHandoff(prompt),
    correlationId: `mc-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
  };
}

export function sendSreAgentError(
  reply: FastifyReply,
  service: SreAgentService,
  error: unknown,
  prompt?: string,
) {
  if (error instanceof SreAgentNotConfiguredError) {
    return reply.status(error.statusCode).send(buildErrorResponse(service, 'not-configured', error.message, error.remediation, prompt));
  }

  if (error instanceof SreAgentOperationDeniedError) {
    return reply
      .status(error.statusCode)
      .send(
        buildErrorResponse(
          service,
          'denied',
          error.message,
          'Mission Control only permits agent discovery, standard investigation, follow-up, and status reads.',
          prompt,
        ),
      );
  }

  if (error instanceof SreAgentProvenanceError) {
    return reply.status(error.statusCode).send(buildErrorResponse(service, error.kind, error.message, error.remediation, prompt));
  }

  if (error instanceof SreAgentMcpError) {
    return reply.status(error.statusCode).send(buildErrorResponse(service, error.kind, error.message, error.remediation, prompt));
  }

  const message = error instanceof Error ? error.message : String(error);
  return reply
    .status(503)
    .send(
      buildErrorResponse(
        service,
        'unknown',
        // Defense in depth: this branch handles errors that bypassed normalization, so
        // redact and bound before the text reaches the browser.
        `The Azure SRE Agent request failed: ${redactSensitiveText(message).slice(0, 500)}`,
        'Verify Azure sign-in, RBAC, and network access, then retry. Use the portal handoff if the failure persists.',
        prompt,
      ),
    );
}
