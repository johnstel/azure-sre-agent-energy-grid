/**
 * REST surface for the Review-mode mitigation evidence flow (issue #80).
 *
 * Mission Control is READ-ONLY here. There is deliberately no local Approve/Deny endpoint:
 * Microsoft does not document a supported external approval operation, and issue #80 forbids
 * mirroring an approval button that does not invoke one. Approval happens in the Azure SRE Agent
 * portal, and Mission Control only observes the resulting audit telemetry.
 *
 * Design gate: docs/REVIEW-MODE-MITIGATION.md
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ReviewModeMitigationRequestError,
  ReviewModeMitigationService,
  buildGuardrails,
  normalizeMitigationRequest,
} from '../services/ReviewModeMitigationService.js';
import { redactSensitiveText } from '../services/sre-agent/redaction.js';

let sharedService: ReviewModeMitigationService | undefined;

export function getReviewModeMitigationService(): ReviewModeMitigationService {
  sharedService ??= new ReviewModeMitigationService();
  return sharedService;
}

/** Test seam so integration tests can inject deterministic fixtures. */
export function setReviewModeMitigationServiceForTesting(service: ReviewModeMitigationService | undefined): void {
  sharedService = service;
}

export function registerMitigationRoutes(
  app: FastifyInstance,
  service: ReviewModeMitigationService = getReviewModeMitigationService(),
): void {
  // Static, always-available description of the action design and enforcement boundary.
  app.get('/api/mitigation/guardrails', async (_req, reply) =>
    reply.send({
      scenario: 'MongoDBDown',
      guardrails: buildGuardrails(),
      approvalSurface: {
        missionControlCanApprove: false,
        reason:
          'Approve/Deny is performed by an SRE Agent Administrator in the Azure SRE Agent portal. Microsoft does not document a supported external approval operation, so Mission Control does not present a local approval control.',
        portalDocumentation: 'https://learn.microsoft.com/azure/sre-agent/run-modes',
      },
      designDocument: 'docs/REVIEW-MODE-MITIGATION.md',
    }),
  );

  app.get<{ Querystring: Record<string, unknown> }>('/api/mitigation/evidence', async (req, reply) => {
    try {
      const request = normalizeMitigationRequest(req.query ?? {});
      return reply.send(await service.getMitigationEvidence(request));
    } catch (error) {
      return sendMitigationError(reply, error);
    }
  });

  app.post<{ Body: unknown }>('/api/mitigation/evidence', async (req, reply) => {
    try {
      const request = normalizeMitigationRequest(req.body ?? {});
      return reply.send(await service.getMitigationEvidence(request));
    } catch (error) {
      return sendMitigationError(reply, error);
    }
  });
}

function sendMitigationError(reply: FastifyReply, error: unknown) {
  if (error instanceof ReviewModeMitigationRequestError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      kind: 'denied',
      remediation:
        'Supply only observed correlation identifiers (threadId, correlationId, incidentId, traceId) and an optional minutes window. Lifecycle state is always derived from audit telemetry.',
      timestamp: new Date().toISOString(),
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return reply.status(503).send({
    error: `The Review-mode mitigation evidence request failed: ${redactSensitiveText(message).slice(0, 500)}`,
    kind: 'unknown',
    remediation: 'Verify Azure sign-in, Log Analytics workspace configuration, and cluster access, then retry.',
    timestamp: new Date().toISOString(),
  });
}
