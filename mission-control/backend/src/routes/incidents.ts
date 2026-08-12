import type { FastifyInstance } from 'fastify';
import {
  acknowledgeIncident,
  attachNativeEvidence,
  getIncidents,
  parseActionGroupWebhook,
  resolveIncident,
  submitIncident,
  type IncidentHandoff,
} from '../services/IncidentHandoffService.js';
import { reconcileNativeIncidentEvidence, selectRowsForCorrelation } from '../services/NativeIncidentReconciliationService.js';
import { SreAgentEvidenceQueryError, SreAgentEvidenceService } from '../services/SreAgentEvidenceService.js';
import { KubeInputError } from '../services/KubeClient.js';

const sreAgentEvidence = new SreAgentEvidenceService();

// Best-effort scenarioName -> IncidentImpactedService correlation keywords. This is a heuristic,
// NOT a documented Azure SRE Agent contract: the agent populates IncidentImpactedService from its
// own investigation, so a match is a hint, not proof. See docs/CAPABILITY-CONTRACTS.md scenario
// registry (SS3) for the source affected_services mapping this mirrors.
const SCENARIO_IMPACTED_SERVICE_HINTS: Record<string, string> = {
  'oom-killed': 'meter-service',
  'crash-loop': 'asset-service',
  'image-pull-backoff': 'dispatch-service',
  'high-cpu': 'frequency-calc-overload',
  'pending-pods': 'substation-monitor',
  'probe-failure': 'grid-health-monitor',
  'network-block': 'meter-service',
  'missing-config': 'grid-zone-config',
  'mongodb-down': 'mongodb',
  'service-mismatch': 'meter-service',
};

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

  // Reconciles one local incident handoff against native Azure SRE Agent evidence observed in
  // Application Insights customEvents (issue #76). Always returns 200 with an honest
  // `nativeEvidence` state -- 'evidence-unavailable' or 'local-fallback-only' are legitimate,
  // expected outcomes (no live environment, agent not connected yet, etc.), not errors. Any
  // unexpected internal failure is caught here too, so it never leaks a raw stack trace to the
  // client -- consistent with every other route in this file.
  app.post<{ Params: { incidentId: string }; Body: { threadId?: string; incidentId?: string; impactedService?: string; minutes?: number } }>(
    '/api/incidents/:incidentId/reconcile-native-evidence',
    async (req, reply) => {
      try {
        const incidents = await getIncidents();
        const incident = incidents.find(candidate => candidate.id === req.params.incidentId);
        if (!incident) {
          return reply.status(404).send({ error: 'Incident not found' });
        }

        const evidence = await reconcileOneIncident(incident, req.body ?? {});
        const updated = await attachNativeEvidence(incident.id, evidence);
        return reply.send({ incident: updated ?? { ...incident, nativeEvidence: evidence } });
      } catch (error) {
        return reply.status(500).send({ error: getErrorMessage(error) });
      }
    },
  );
}

async function reconcileOneIncident(
  incident: IncidentHandoff,
  overrides: { threadId?: string; incidentId?: string; impactedService?: string; minutes?: number },
) {
  const knownThreadId = overrides.threadId ?? incident.nativeEvidence?.threadId;
  const incidentId = overrides.incidentId ?? incident.nativeEvidence?.incidentId;
  const impactedService = overrides.impactedService
    ?? incident.nativeEvidence?.impactedService
    ?? (incident.scenarioName ? SCENARIO_IMPACTED_SERVICE_HINTS[incident.scenarioName] : undefined);
  const minutes = overrides.minutes ?? 60;

  try {
    const response = await sreAgentEvidence.execute('incident-activity-snapshot', {
      minutes,
      ...(incidentId ? { incidentId } : {}),
      ...(impactedService ? { impactedService } : {}),
    });

    const { rows, strongCorrelation } = selectRowsForCorrelation(response.rows, {
      knownThreadId,
      hasExplicitIncidentId: Boolean(incidentId),
    });

    const resolvedThreadId = knownThreadId ?? firstThreadId(rows);
    const approvalRows = resolvedThreadId ? await fetchApprovalRows(resolvedThreadId, minutes) : undefined;

    return reconcileNativeIncidentEvidence(rows, {
      hasLocalFallback: true,
      strongCorrelation,
      approvalRows,
    });
  } catch (error) {
    if (error instanceof SreAgentEvidenceQueryError) {
      return reconcileNativeIncidentEvidence([], {
        hasLocalFallback: true,
        schemaMismatch: error.schemaMismatch,
      });
    }
    if (error instanceof KubeInputError) {
      // Invalid correlation params (e.g. malformed threadId/incidentId carried over from a prior
      // reconciliation) -- treat as unavailable rather than fabricating evidence or crashing.
      return reconcileNativeIncidentEvidence([], { hasLocalFallback: true });
    }
    throw error;
  }
}

function firstThreadId(rows: Record<string, unknown>[]): string | undefined {
  const value = rows[0]?.ThreadId;
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

async function fetchApprovalRows(threadId: string, minutes: number): Promise<Record<string, unknown>[] | undefined> {
  try {
    const response = await sreAgentEvidence.execute('approval-decisions', { threadId, minutes });
    return response.rows;
  } catch {
    // Approval evidence is supplementary -- if it can't be queried, fall back to the conservative
    // 'pending' default inside reconcileNativeIncidentEvidence rather than failing reconciliation.
    return undefined;
  }
}
