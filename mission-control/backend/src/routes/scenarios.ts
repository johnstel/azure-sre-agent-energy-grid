import type { FastifyInstance } from 'fastify';
import { disableScenario, enableScenario, fixAllScenarios, getScenarios } from '../services/ScenarioService.js';

export function registerScenarioRoutes(app: FastifyInstance): void {
  app.get('/api/scenarios', async (_req, reply) => {
    return reply.send({ scenarios: getScenarios() });
  });

  app.post<{ Params: { name: string } }>('/api/scenarios/:name/enable', async (req, reply) => {
    const result = await enableScenario(req.params.name);
    if ('error' in result) return reply.status(result.statusCode).send({ error: result.error });
    return reply.send(result);
  });

  app.post<{ Params: { name: string } }>('/api/scenarios/:name/disable', async (req, reply) => {
    const result = await disableScenario(req.params.name);
    if ('error' in result) return reply.status(result.statusCode).send({ error: result.error });
    return reply.send(result);
  });

  app.post('/api/scenarios/fix-all', async (_req, reply) => {
    const result = await fixAllScenarios();
    if ('error' in result) return reply.status(result.statusCode).send({ error: result.error });
    return reply.send(result);
  });
}
