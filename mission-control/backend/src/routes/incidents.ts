import type { FastifyInstance } from 'fastify';
import {
  acknowledgeIncident,
  getIncidents,
  parseActionGroupWebhook,
  resolveIncident,
  submitIncident,
} from '../services/IncidentHandoffService.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Incident handoff request failed';
}

export function registerIncidentRoutes(app: FastifyInstance): void {
  app.get('/api/incidents', async (_req, reply) => {
    const incidents = await getIncidents();
    return reply.send({ incidents });
  });

  app.post('/api/incidents', async (req, reply) => {
    try {
      const payload = req.body as unknown;
      const hasStructuredFields = typeof payload === 'object' && payload !== null && (
        'title' in payload || 'summary' in payload || 'severity' in payload || 'source' in payload || 'scenarioName' in payload || 'evidence' in payload || 'operatorGuidance' in payload || 'alertName' in payload || 'alertRule' in payload
      );
      const normalized = hasStructuredFields
        ? payload as { title?: string; summary?: string; severity?: string; source?: string; scenarioName?: string; evidence?: string[]; operatorGuidance?: string[]; alertName?: string; alertRule?: string; rawPayload?: unknown }
        : parseActionGroupWebhook(payload);

      const result = await submitIncident({
        title: normalized.title,
        summary: normalized.summary,
        severity: normalized.severity as 'critical' | 'warning' | 'unknown' | undefined,
        source: normalized.source as 'action-group' | 'dashboard' | 'manual' | undefined,
        scenarioName: normalized.scenarioName,
        evidence: normalized.evidence,
        operatorGuidance: normalized.operatorGuidance,
        alertName: normalized.alertName,
        alertRule: normalized.alertRule,
        rawPayload: normalized.rawPayload,
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post<{ Params: { incidentId: string } }>('/api/incidents/:incidentId/acknowledge', async (req, reply) => {
    try {
      const incident = await acknowledgeIncident(req.params.incidentId);
      if (!incident) {
        return reply.status(404).send({ error: 'Incident not found' });
      }
      return reply.send({ incident });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post<{ Params: { incidentId: string } }>('/api/incidents/:incidentId/resolve', async (req, reply) => {
    try {
      const incident = await resolveIncident(req.params.incidentId);
      if (!incident) {
        return reply.status(404).send({ error: 'Incident not found' });
      }
      return reply.send({ incident });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });
}
