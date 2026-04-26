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

const enabledScenarios = new Set<string>();

function getScenariosDir(): string {
  return join(getRepoRoot(), 'k8s', 'scenarios');
}

function getBaseManifest(): string {
  return join(getRepoRoot(), 'k8s', 'base', 'application.yaml');
}

export function getScenarios(): Scenario[] {
  return SCENARIO_REGISTRY.map((scenario) => ({
    ...scenario,
    enabled: enabledScenarios.has(scenario.name),
  }));
}

export async function enableScenario(name: string): Promise<{ enabled: true; name: string; output: string } | { error: string; statusCode: number }> {
  const scenario = SCENARIO_REGISTRY.find((s) => s.name === name);
  if (!scenario) return { error: `Unknown scenario: ${name}`, statusCode: 404 };

  const yamlPath = join(getScenariosDir(), scenario.file);
  if (!existsSync(yamlPath)) {
    return { error: `Scenario file not found: ${scenario.file}`, statusCode: 404 };
  }

  try {
    const { stdout } = await exec('kubectl', ['apply', '-f', yamlPath], { timeout: 30_000 });
    enabledScenarios.add(name);
    return { enabled: true, name, output: stdout.trim() };
  } catch (err: any) {
    return { error: err.stderr ?? err.message, statusCode: 500 };
  }
}

export async function disableScenario(name: string): Promise<{ enabled: false; name: string; output: string } | { error: string; statusCode: number }> {
  const scenario = SCENARIO_REGISTRY.find((s) => s.name === name);
  if (!scenario) return { error: `Unknown scenario: ${name}`, statusCode: 404 };

  try {
    const { stdout } = await exec('kubectl', ['apply', '-f', getBaseManifest()], { timeout: 30_000 });
    enabledScenarios.delete(name);
    return { enabled: false, name, output: stdout.trim() };
  } catch (err: any) {
    return { error: err.stderr ?? err.message, statusCode: 500 };
  }
}

export async function fixAllScenarios(): Promise<{ fixed: true; output: string } | { error: string; statusCode: number }> {
  try {
    const { stdout } = await exec('kubectl', ['apply', '-f', getBaseManifest()], { timeout: 30_000 });
    enabledScenarios.clear();
    return { fixed: true, output: stdout.trim() };
  } catch (err: any) {
    return { error: err.stderr ?? err.message, statusCode: 500 };
  }
}
