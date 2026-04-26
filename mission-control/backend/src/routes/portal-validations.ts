import type { FastifyInstance } from 'fastify';
import {
  getValidationState,
  getScenarioPrompt,
  getScenarioDescription,
  updateValidation,
  confirmValidation,
  resetValidation,
  resetAllValidations,
} from '../services/PortalValidationService.js';
import type { ConfirmPortalValidationRequest, PortalValidationScenarioName, UpdatePortalValidationRequest } from '../types/index.js';

const VALIDATION_SCENARIOS: PortalValidationScenarioName[] = ['OOMKilled', 'MongoDBDown', 'ServiceMismatch'];

function isValidationScenario(value: string): value is PortalValidationScenarioName {
  return VALIDATION_SCENARIOS.includes(value as PortalValidationScenarioName);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Portal validation request failed';
}

export function registerPortalValidationRoutes(app: FastifyInstance): void {
  // GET /api/portal-validations — Get all validations and status
  app.get('/api/portal-validations', async (_req, reply) => {
    const state = await getValidationState();
    return reply.send(state);
  });

  // GET /api/portal-validations/:scenarioName/prompt — Get the prepared prompt for a scenario
  app.get<{ Params: { scenarioName: string } }>(
    '/api/portal-validations/:scenarioName/prompt',
    async (req, reply) => {
      const { scenarioName } = req.params;
      if (!isValidationScenario(scenarioName)) {
        return reply.status(404).send({ error: `Unknown scenario: ${scenarioName}` });
      }
      const prompt = getScenarioPrompt(scenarioName);
      const description = getScenarioDescription(scenarioName);
      return reply.send({ scenarioName, prompt, description });
    }
  );

  // PATCH /api/portal-validations/:scenarioName — Update validation details
  app.patch<{ Params: { scenarioName: string }; Body: UpdatePortalValidationRequest }>(
    '/api/portal-validations/:scenarioName',
    async (req, reply) => {
      const { scenarioName } = req.params;
      if (!isValidationScenario(scenarioName)) {
        return reply.status(404).send({ error: `Unknown scenario: ${scenarioName}` });
      }

      try {
        const state = await updateValidation(scenarioName, {
          evidenceCaptured: req.body.evidenceCaptured,
          timestamp: req.body.timestamp,
          operatorInitials: req.body.operatorInitials,
          evidencePath: req.body.evidencePath,
          notes: req.body.notes,
          accuracy: req.body.accuracy,
        });
        return reply.send(state);
      } catch (error) {
        return reply.status(400).send({ error: getErrorMessage(error) });
      }
    }
  );

  // POST /api/portal-validations/:scenarioName/confirm — Mark as confirmed
  app.post<{ Params: { scenarioName: string }; Body: ConfirmPortalValidationRequest }>(
    '/api/portal-validations/:scenarioName/confirm',
    async (req, reply) => {
      const { scenarioName } = req.params;
      if (!isValidationScenario(scenarioName)) {
        return reply.status(404).send({ error: `Unknown scenario: ${scenarioName}` });
      }

      try {
        const state = await confirmValidation(
          scenarioName,
          req.body.timestamp,
          req.body.operatorInitials,
          req.body.accuracy
        );
        return reply.send(state);
      } catch (error) {
        return reply.status(400).send({ error: getErrorMessage(error) });
      }
    }
  );

  // POST /api/portal-validations/:scenarioName/reset — Reset to awaiting
  app.post<{ Params: { scenarioName: string } }>(
    '/api/portal-validations/:scenarioName/reset',
    async (req, reply) => {
      const { scenarioName } = req.params;
      if (!isValidationScenario(scenarioName)) {
        return reply.status(404).send({ error: `Unknown scenario: ${scenarioName}` });
      }

      try {
        const state = await resetValidation(scenarioName);
        return reply.send(state);
      } catch (error) {
        return reply.status(400).send({ error: getErrorMessage(error) });
      }
    }
  );

  // POST /api/portal-validations/reset-all — Reset all validations
  app.post('/api/portal-validations/reset-all', async (_req, reply) => {
    try {
      const state = await resetAllValidations();
      return reply.send(state);
    } catch (error) {
      return reply.status(500).send({ error: getErrorMessage(error) });
    }
  });
}
