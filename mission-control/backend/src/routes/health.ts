import type { FastifyInstance } from 'fastify';
import { collectPreflight } from '../services/PreflightService.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/preflight', async (_req, reply) => {
    return reply.send(await collectPreflight());
  });
}
