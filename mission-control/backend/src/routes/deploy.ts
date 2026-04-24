import type { FastifyInstance } from 'fastify';
import { JobManager } from '../services/JobManager.js';
import { getPwshCommand, getScriptPath } from '../utils/paths.js';

export function registerDeployRoutes(app: FastifyInstance, jobManager: JobManager): void {
  app.post<{
    Body: { location?: string; workloadName?: string; skipRbac?: boolean; skipSreAgent?: boolean };
  }>('/api/deploy', async (req, reply) => {
    const {
      location = 'eastus2',
      workloadName = 'srelab',
      skipRbac = false,
      skipSreAgent = false,
    } = req.body ?? {};

    const validLocations = ['eastus2', 'swedencentral', 'australiaeast'];
    if (!validLocations.includes(location)) {
      return reply.status(400).send({
        error: `Invalid location. Must be one of: ${validLocations.join(', ')}`,
      });
    }

    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', getScriptPath('deploy.ps1'),
      '-Location', location,
      '-WorkloadName', workloadName,
      '-Yes',
    ];
    if (skipRbac) args.push('-SkipRbac');
    if (skipSreAgent) args.push('-SkipSreAgent');

    try {
      const job = jobManager.start('deploy', getPwshCommand(), args);
      return reply.status(202).send(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = jobManager.getStatus(req.params.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    return reply.send(job);
  });

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) => {
    const cancelled = jobManager.cancel(req.params.id);
    if (!cancelled) return reply.status(404).send({ error: 'Job not found or not running' });
    return reply.send({ cancelled: true });
  });
}
