import type { FastifyInstance } from 'fastify';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getRepoRoot } from '../utils/paths.js';
import type { Scenario } from '../types/index.js';

const exec = promisify(execFile);

const SCENARIO_REGISTRY: Omit<Scenario, 'enabled'>[] = [
  { name: 'oom-killed', file: 'oom-killed.yaml', description: 'Meter service overwhelmed by smart meter data spike — OOMKilled' },
  { name: 'crash-loop', file: 'crash-loop.yaml', description: 'Asset service crash from invalid grid config — CrashLoopBackOff' },
  { name: 'image-pull-backoff', file: 'image-pull-backoff.yaml', description: 'Dispatch service botched image release — ImagePullBackOff' },
  { name: 'high-cpu', file: 'high-cpu.yaml', description: 'Grid frequency calculation overload — CPU contention' },
  { name: 'pending-pods', file: 'pending-pods.yaml', description: 'Substation monitor can\'t schedule — Pending pods' },
  { name: 'probe-failure', file: 'probe-failure.yaml', description: 'Grid health monitor misconfigured — Probe failure' },
  { name: 'network-block', file: 'network-block.yaml', description: 'Meter service isolated by bad security policy — Network block' },
  { name: 'missing-config', file: 'missing-config.yaml', description: 'Grid zone configuration missing — ConfigMap missing' },
  { name: 'mongodb-down', file: 'mongodb-down.yaml', description: 'Meter database outage — Cascading failure' },
  { name: 'service-mismatch', file: 'service-mismatch.yaml', description: 'Meter service routing failure after v2 upgrade — Selector mismatch' },
];

// Track which scenarios are currently enabled (in-memory)
const enabledScenarios = new Set<string>();

function getScenariosDir(): string {
  return join(getRepoRoot(), 'k8s', 'scenarios');
}

function getBaseManifest(): string {
  return join(getRepoRoot(), 'k8s', 'base', 'application.yaml');
}

export function registerScenarioRoutes(app: FastifyInstance): void {
  app.get('/api/scenarios', async (_req, reply) => {
    const scenarios: Scenario[] = SCENARIO_REGISTRY.map((s) => ({
      ...s,
      enabled: enabledScenarios.has(s.name),
    }));
    return reply.send({ scenarios });
  });

  app.post<{ Params: { name: string } }>('/api/scenarios/:name/enable', async (req, reply) => {
    const { name } = req.params;
    const scenario = SCENARIO_REGISTRY.find((s) => s.name === name);
    if (!scenario) return reply.status(404).send({ error: `Unknown scenario: ${name}` });

    const yamlPath = join(getScenariosDir(), scenario.file);
    if (!existsSync(yamlPath)) {
      return reply.status(404).send({ error: `Scenario file not found: ${scenario.file}` });
    }

    try {
      const { stdout } = await exec('kubectl', ['apply', '-f', yamlPath], { timeout: 30_000 });
      enabledScenarios.add(name);
      return reply.send({ enabled: true, name, output: stdout.trim() });
    } catch (err: any) {
      return reply.status(500).send({ error: err.stderr ?? err.message });
    }
  });

  app.post<{ Params: { name: string } }>('/api/scenarios/:name/disable', async (req, reply) => {
    const { name } = req.params;
    const scenario = SCENARIO_REGISTRY.find((s) => s.name === name);
    if (!scenario) return reply.status(404).send({ error: `Unknown scenario: ${name}` });

    // Revert by re-applying healthy base manifests
    const basePath = getBaseManifest();
    try {
      const { stdout } = await exec('kubectl', ['apply', '-f', basePath], { timeout: 30_000 });
      enabledScenarios.delete(name);
      return reply.send({ enabled: false, name, output: stdout.trim() });
    } catch (err: any) {
      return reply.status(500).send({ error: err.stderr ?? err.message });
    }
  });

  app.post('/api/scenarios/fix-all', async (_req, reply) => {
    const basePath = getBaseManifest();
    try {
      const { stdout } = await exec('kubectl', ['apply', '-f', basePath], { timeout: 30_000 });
      enabledScenarios.clear();
      return reply.send({ fixed: true, output: stdout.trim() });
    } catch (err: any) {
      return reply.status(500).send({ error: err.stderr ?? err.message });
    }
  });
}
