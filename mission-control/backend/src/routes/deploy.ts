import type { FastifyInstance } from 'fastify';
import { JobManager } from '../services/JobManager.js';
import { resolvePwsh, getScriptPath } from '../utils/paths.js';

export const workloadLocations = ['eastus2', 'centralus', 'swedencentral', 'australiaeast'] as const;
export const sreAgentLocations = ['eastus2', 'swedencentral', 'australiaeast'] as const;

interface DeployRequest {
  location: string;
  sreAgentLocation: string;
  workloadName: string;
  skipRbac: boolean;
  skipSreAgent: boolean;
}

export function validateDeployLocations(location: string, sreAgentLocation: string): string | null {
  if (!workloadLocations.includes(location as typeof workloadLocations[number])) {
    return `Invalid workload location. Must be one of: ${workloadLocations.join(', ')}`;
  }
  if (!sreAgentLocations.includes(sreAgentLocation as typeof sreAgentLocations[number])) {
    return `Invalid SRE Agent location. Must be one of: ${sreAgentLocations.join(', ')}`;
  }
  return null;
}

export function resolveSreAgentLocation(location: string, sreAgentLocation?: string): string {
  return sreAgentLocation ?? (location === 'centralus' ? 'eastus2' : location);
}

export function buildDeployArgs(scriptPath: string, request: DeployRequest): string[] {
  const args = [
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-Location', request.location,
    '-SreAgentLocation', request.sreAgentLocation,
    '-WorkloadName', request.workloadName,
    '-Yes',
  ];
  if (request.skipRbac) args.push('-SkipRbac');
  if (request.skipSreAgent) args.push('-SkipSreAgent');
  return args;
}

export function registerDeployRoutes(app: FastifyInstance, jobManager: JobManager): void {
  app.post<{
    Body: {
      location?: string;
      sreAgentLocation?: string;
      workloadName?: string;
      skipRbac?: boolean;
      skipSreAgent?: boolean;
    };
  }>('/api/deploy', async (req, reply) => {
    const location = req.body?.location ?? 'eastus2';
    const sreAgentLocation = resolveSreAgentLocation(location, req.body?.sreAgentLocation);
    const {
      workloadName = 'srelab',
      skipRbac = false,
      skipSreAgent = false,
    } = req.body ?? {};

    const locationError = validateDeployLocations(location, sreAgentLocation);
    if (locationError) return reply.status(400).send({ error: locationError });

    const scriptPath = getScriptPath('deploy.ps1');
    const pwshCmd = await resolvePwsh(); // Robust resolution

    const args = buildDeployArgs(scriptPath, {
      location,
      sreAgentLocation,
      workloadName,
      skipRbac,
      skipSreAgent,
    });

    // Build verbose prelude logs
    const timestamp = new Date().toISOString();
    const preludeLogs = [
      '',
      '═══════════════════════════════════════════════════════════════════',
      '[Mission Control] Deploy request received',
      `[Mission Control] Timestamp: ${timestamp}`,
      '───────────────────────────────────────────────────────────────────',
      '[Mission Control] Configuration:',
      `  • Workload Location:  ${location}`,
      `  • SRE Agent Location: ${sreAgentLocation}`,
      `  • Workload Name:      ${workloadName}`,
      `  • Skip RBAC:          ${skipRbac}`,
      `  • Skip SRE Agent:     ${skipSreAgent}`,
      '───────────────────────────────────────────────────────────────────',
      '[Mission Control] Execution:',
      `  • Script Path:     ${scriptPath}`,
      `  • PowerShell Cmd:  ${pwshCmd}`,
      `  • Full Command:    ${pwshCmd} ${args.join(' ')}`,
      '───────────────────────────────────────────────────────────────────',
      '[Mission Control] Azure SRE Agent Information:',
      '  ℹ API Version: 2026-01-01 (pinned GA provider API)',
      '  ℹ Upgrade Channel: Stable (latest stable service releases)',
      '  ⚠ Supported Regions: eastus2, swedencentral, australiaeast',
      `  ℹ Workload region: ${location}`,
      `  ℹ SRE Agent region: ${sreAgentLocation}`,
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
