import type { FastifyInstance } from 'fastify';
import { JobManager } from '../services/JobManager.js';
import { resolvePwsh, getScriptPath } from '../utils/paths.js';

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

    const scriptPath = getScriptPath('deploy.ps1');
    const pwshCmd = await resolvePwsh(); // Robust resolution

    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Location', location,
      '-WorkloadName', workloadName,
      '-Yes',
    ];
    if (skipRbac) args.push('-SkipRbac');
    if (skipSreAgent) args.push('-SkipSreAgent');

    // Build verbose prelude logs
    const timestamp = new Date().toISOString();
    const preludeLogs = [
      '',
      '═══════════════════════════════════════════════════════════════════',
      '[Mission Control] Deploy request received',
      `[Mission Control] Timestamp: ${timestamp}`,
      '───────────────────────────────────────────────────────────────────',
      '[Mission Control] Configuration:',
      `  • Location:        ${location}`,
      `  • Workload Name:   ${workloadName}`,
      `  • Skip RBAC:       ${skipRbac}`,
      `  • Skip SRE Agent:  ${skipSreAgent}`,
      '───────────────────────────────────────────────────────────────────',
      '[Mission Control] Execution:',
      `  • Script Path:     ${scriptPath}`,
      `  • PowerShell Cmd:  ${pwshCmd}`,
      `  • Full Command:    ${pwshCmd} ${args.join(' ')}`,
      '───────────────────────────────────────────────────────────────────',
      '[Mission Control] Azure SRE Agent Information:',
      '  ⚠ Supported Regions: eastus2, swedencentral, australiaeast',
      '  ℹ Current deployment region: ' + location,
      '═══════════════════════════════════════════════════════════════════',
      '',
    ];

    try {
      const job = jobManager.start('deploy', pwshCmd, args, { preludeLogs });
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
