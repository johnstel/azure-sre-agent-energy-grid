import type { FastifyInstance } from 'fastify';
import { detectTools } from '../services/ToolDetector.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PreflightCheck } from '../types/index.js';

const exec = promisify(execFile);

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/api/health', async (_req, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/preflight', async (_req, reply) => {
    const tools = await detectTools();
    const checks: PreflightCheck[] = [];

    // Tool availability checks
    for (const tool of tools) {
      checks.push({
        name: `${tool.name} available`,
        status: tool.available ? 'pass' : 'fail',
        message: tool.available ? `${tool.name} ${tool.version}` : `${tool.name} not found`,
      });
    }

    // Azure subscription check
    try {
      const { stdout } = await exec('az', ['account', 'show', '--output', 'json'], { timeout: 10_000 });
      const account = JSON.parse(stdout);
      checks.push({
        name: 'Azure subscription',
        status: 'pass',
        message: `${account.name} (${account.id})`,
      });
    } catch {
      checks.push({
        name: 'Azure subscription',
        status: 'fail',
        message: 'Not logged in — run: az login',
      });
    }

    // Kube context check
    try {
      const { stdout } = await exec('kubectl', ['config', 'current-context'], { timeout: 5_000 });
      checks.push({
        name: 'Kubernetes context',
        status: 'pass',
        message: stdout.trim(),
      });
    } catch {
      checks.push({
        name: 'Kubernetes context',
        status: 'warn',
        message: 'No cluster configured (needed for monitoring/scenarios)',
      });
    }

    const allPassed = checks.every((c) => c.status !== 'fail');
    return reply.send({ ready: allPassed, checks, tools });
  });
}
