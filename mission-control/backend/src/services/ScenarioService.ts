import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { getRepoRoot } from '../utils/paths.js';
import type { Scenario, ScenarioNarration, ScenarioNarrationCatalog } from '../types/index.js';

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

export const FORBIDDEN_NARRATION_RESPONSE_FIELDS = [
  'expectedAgentResponse',
  'expectedDiagnosis',
  'rootCauseAnswer',
  'sampleTranscript',
  'agentWillSay',
  'successCriteriaForAgentText',
] as const;

const narrationByScenarioName = loadNarrationCatalog();

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
    ...(narrationByScenarioName.has(scenario.name) ? { narration: narrationByScenarioName.get(scenario.name) } : {}),
  }));
}

function getNarrationCatalogPath(): string {
  return join(getRepoRoot(), 'docs', 'scenario-narration.json');
}

function loadNarrationCatalog(): Map<string, ScenarioNarration> {
  try {
    const catalog = JSON.parse(readFileSync(getNarrationCatalogPath(), 'utf8')) as unknown;
    const forbiddenField = findForbiddenNarrationField(catalog);
    if (forbiddenField) {
      throw new Error(`Narration catalog contains forbidden response field "${forbiddenField}"`);
    }
    if (!isNarrationCatalog(catalog)) {
      throw new Error('Narration catalog shape is invalid');
    }

    const scenarioNames = new Set(SCENARIO_REGISTRY.map((scenario) => scenario.name));
    const narration = new Map<string, ScenarioNarration>();
    for (const item of catalog.scenarios) {
      if (!scenarioNames.has(item.scenarioName)) {
        console.warn(`[ScenarioService] Ignoring narration for unknown scenario "${item.scenarioName}"`);
        continue;
      }
      narration.set(item.scenarioName, item);
    }

    for (const scenario of SCENARIO_REGISTRY) {
      if (!narration.has(scenario.name)) {
        console.warn(`[ScenarioService] Missing narration metadata for scenario "${scenario.name}"`);
      }
    }

    return narration;
  } catch (error) {
    console.warn(`[ScenarioService] Scenario narration unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return new Map();
  }
}

function findForbiddenNarrationField(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenNarrationField(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    if ((FORBIDDEN_NARRATION_RESPONSE_FIELDS as readonly string[]).includes(key)) return key;
    const found = findForbiddenNarrationField(nested);
    if (found) return found;
  }
  return null;
}

function isNarrationCatalog(value: unknown): value is ScenarioNarrationCatalog {
  return (
    isRecord(value) &&
    typeof value.schemaVersion === 'number' &&
    isRecord(value.contentContract) &&
    typeof value.contentContract.purpose === 'string' &&
    typeof value.contentContract.agentResponseContent === 'string' &&
    typeof value.contentContract.safeLanguageSource === 'string' &&
    Array.isArray(value.scenarios) &&
    value.scenarios.every(isScenarioNarration)
  );
}

function isScenarioNarration(value: unknown): value is ScenarioNarration {
  if (!isRecord(value)) return false;
  return (
    typeof value.scenarioName === 'string' &&
    typeof value.title === 'string' &&
    (value.demoTier === 'core' || value.demoTier === 'extended') &&
    (value.order === undefined || typeof value.order === 'number') &&
    isStringArray(value.hook) &&
    isStringArray(value.observe) &&
    isRecord(value.suggestedPrompt) &&
    (value.suggestedPrompt.stage === 'open-ended' ||
      value.suggestedPrompt.stage === 'direct' ||
      value.suggestedPrompt.stage === 'specific' ||
      value.suggestedPrompt.stage === 'remediation') &&
    typeof value.suggestedPrompt.text === 'string' &&
    typeof value.suggestedPrompt.source === 'string' &&
    isRecord(value.restorePath) &&
    typeof value.restorePath.label === 'string' &&
    (value.restorePath.command === undefined || typeof value.restorePath.command === 'string') &&
    (value.restorePath.missionControlAction === undefined ||
      value.restorePath.missionControlAction === 'repair-scenario' ||
      value.restorePath.missionControlAction === 'repair-all') &&
    Array.isArray(value.sourceRefs) &&
    value.sourceRefs.every(isSourceRef) &&
    isStringArray(value.safetyNotes)
  );
}

function isSourceRef(value: unknown): value is ScenarioNarration['sourceRefs'][number] {
  return (
    isRecord(value) &&
    typeof value.label === 'string' &&
    typeof value.path === 'string' &&
    (value.section === undefined || typeof value.section === 'string')
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
