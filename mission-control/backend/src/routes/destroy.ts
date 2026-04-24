import type { FastifyInstance } from 'fastify';
import { JobManager } from '../services/JobManager.js';
import { getPwshCommand, getScriptPath } from '../utils/paths.js';

export function registerDestroyRoutes(app: FastifyInstance, jobManager: JobManager): void {
  app.post<{
    Body: { resourceGroupName?: string; confirmation?: string };
  }>('/api/destroy', async (req, reply) => {
    const { resourceGroupName = 'rg-srelab-eastus2', confirmation } = req.body ?? {};

    // Safety gate: require explicit DELETE confirmation
    if (confirmation !== 'DELETE') {
      return reply.status(400).send({
        error: 'Destruction requires confirmation. Send { "confirmation": "DELETE" }',
      });
    }

    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', getScriptPath('destroy.ps1'),
      '-ResourceGroupName', resourceGroupName,
      '-Force',
    ];

    try {
      const job = jobManager.start('destroy', getPwshCommand(), args);
      return reply.status(202).send(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: message });
    }
  });
}
