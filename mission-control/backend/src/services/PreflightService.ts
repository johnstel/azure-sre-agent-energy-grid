import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectTools } from './ToolDetector.js';
import type { PreflightCheck, PreflightResult } from '../types/index.js';

const exec = promisify(execFile);

export async function collectPreflight(): Promise<PreflightResult> {
  const tools = await detectTools();
  const checks: PreflightCheck[] = [];

  for (const tool of tools) {
    checks.push({
      name: `${tool.name} available`,
      status: tool.available ? 'pass' : 'fail',
      message: tool.available ? `${tool.name} ${tool.version}` : `${tool.name} not found`,
    });
  }

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

  return {
    ready: checks.every((c) => c.status !== 'fail'),
    checks,
    tools,
  };
}
