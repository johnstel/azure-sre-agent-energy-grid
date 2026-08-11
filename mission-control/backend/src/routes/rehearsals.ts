import type { FastifyInstance } from 'fastify';
import {
  advanceRehearsalRun,
  createRehearsalRun,
  getRehearsalScenarioNames,
  getRehearsalState,
  interruptRehearsalRun,
  resetRehearsalRun,
  replayRehearsalRun,
  resumeRehearsalRun,
  updateRehearsalEvidence,
} from '../services/RehearsalWorkflowService.js';
import type {
  AdvanceRehearsalRunRequest,
  CreateRehearsalRunRequest,
  InterruptRehearsalRunRequest,
  ResumeRehearsalRunRequest,
  UpdateRehearsalEvidenceRequest,
} from '../types/index.js';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Rehearsal operation failed';
}

export function registerRehearsalRoutes(app: FastifyInstance): void {
  app.get('/api/rehearsals', async (_req, reply) => {
    const state = await getRehearsalState();
    return reply.send(state);
  });

  app.get('/api/rehearsals/scenarios', async (_req, reply) => {
    return reply.send({ scenarios: getRehearsalScenarioNames() });
  });

  app.post<{ Body: CreateRehearsalRunRequest }>('/api/rehearsals', async (req, reply) => {
    try {
      const run = await createRehearsalRun(req.body);
      return reply.send({ run });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post<{ Params: { scenarioName: string }; Body: AdvanceRehearsalRunRequest }>('/api/rehearsals/:scenarioName/advance', async (req, reply) => {
    try {
      const run = await advanceRehearsalRun(req.params.scenarioName as CreateRehearsalRunRequest['scenarioName'], req.body);
      return reply.send({ run });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.get<{ Params: { scenarioName: string } }>('/api/rehearsals/:scenarioName/replay', async (req, reply) => {
    try {
      const replay = await replayRehearsalRun(req.params.scenarioName as CreateRehearsalRunRequest['scenarioName']);
      return reply.send({ replay });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post<{ Body: InterruptRehearsalRunRequest }>('/api/rehearsals/interrupt', async (req, reply) => {
    try {
      const run = await interruptRehearsalRun(req.body);
      return reply.send({ run });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post<{ Body: ResumeRehearsalRunRequest }>('/api/rehearsals/resume', async (req, reply) => {
    try {
      const run = await resumeRehearsalRun(req.body);
      return reply.send({ run });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.post<{ Params: { scenarioName: string } }>('/api/rehearsals/:scenarioName/reset', async (req, reply) => {
    try {
      const run = await resetRehearsalRun(req.params.scenarioName as CreateRehearsalRunRequest['scenarioName']);
      return reply.send({ run });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });

  app.patch<{ Body: UpdateRehearsalEvidenceRequest }>('/api/rehearsals/evidence', async (req, reply) => {
    try {
      const run = await updateRehearsalEvidence(req.body);
      return reply.send({ run });
    } catch (error) {
      return reply.status(400).send({ error: getErrorMessage(error) });
    }
  });
}
