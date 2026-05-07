import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { getRepoRoot } from '../utils/paths.js';
import type { Scenario, ScenarioNarration, ScenarioNarrationCatalog } from '../types/index.js';

const exec = promisify(execFile);

type ScenarioDefinition = Omit<Scenario, 'enabled'>;

interface KubernetesResourceRef {
  resource: string;
  name: string;
  namespace: string;
}

interface ScenarioRepairPlan {
  applyBase: boolean;
  deleteResources: KubernetesResourceRef[];
}

const ENERGY_NAMESPACE = 'energy';

const SCENARIO_REGISTRY: ScenarioDefinition[] = [
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

const SCENARIO_REPAIR_PLANS: Record<string, ScenarioRepairPlan> = {
  'oom-killed': { applyBase: true, deleteResources: [] },
  'crash-loop': { applyBase: true, deleteResources: [] },
  'image-pull-backoff': { applyBase: true, deleteResources: [] },
  'high-cpu': {
    applyBase: false,
    deleteResources: [{ resource: 'deployment', name: 'frequency-calc-overload', namespace: ENERGY_NAMESPACE }],
  },
  'pending-pods': {
    applyBase: false,
    deleteResources: [{ resource: 'deployment', name: 'substation-monitor', namespace: ENERGY_NAMESPACE }],
  },
  'probe-failure': {
    applyBase: false,
    deleteResources: [{ resource: 'deployment', name: 'grid-health-monitor', namespace: ENERGY_NAMESPACE }],
  },
  'network-block': {
    applyBase: false,
    deleteResources: [{ resource: 'networkpolicy', name: 'deny-meter-service', namespace: ENERGY_NAMESPACE }],
  },
  'missing-config': {
    applyBase: false,
    deleteResources: [{ resource: 'deployment', name: 'grid-zone-config', namespace: ENERGY_NAMESPACE }],
  },
  'mongodb-down': { applyBase: true, deleteResources: [] },
  'service-mismatch': { applyBase: true, deleteResources: [] },
};

const enabledScenarios = new Set<string>();

type ManifestApplier = (manifestPath: string) => Promise<string>;
type KubectlRunner = (args: string[]) => Promise<string>;

async function defaultApplyManifest(manifestPath: string): Promise<string> {
  const { stdout } = await exec('kubectl', ['apply', '-f', manifestPath], { timeout: 30_000 });
  return stdout.trim();
}

async function defaultRunKubectl(args: string[]): Promise<string> {
  const { stdout } = await exec('kubectl', args, { timeout: 30_000 });
  return stdout.trim();
}

let applyManifest: ManifestApplier = defaultApplyManifest;
let runKubectl: KubectlRunner = defaultRunKubectl;

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

export function getScenarioManifestFile(name: string): string | undefined {
  return getScenario(name)?.file;
}

export function setManifestApplierForTests(applier?: ManifestApplier, kubectlRunner?: KubectlRunner): void {
  applyManifest = applier ?? defaultApplyManifest;
  runKubectl = kubectlRunner ?? defaultRunKubectl;
  enabledScenarios.clear();
}

function getScenario(name: string): ScenarioDefinition | undefined {
  return SCENARIO_REGISTRY.find((scenario) => scenario.name === name);
}

function getScenarioManifestPath(scenario: ScenarioDefinition): string {
  return join(getScenariosDir(), scenario.file);
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
  const scenario = getScenario(name);
  if (!scenario) return { error: `Unknown scenario: ${name}`, statusCode: 404 };

  const yamlPath = getScenarioManifestPath(scenario);
  if (!existsSync(yamlPath)) {
    return { error: `Scenario file not found: ${scenario.file}`, statusCode: 404 };
  }

  try {
    const stdout = await applyManifest(yamlPath);
    enabledScenarios.add(name);
    return { enabled: true, name, output: stdout };
  } catch (error: unknown) {
    return { error: getErrorOutput(error), statusCode: 500 };
  }
}

export async function disableScenario(name: string): Promise<{ enabled: false; name: string; output: string } | { error: string; statusCode: number }> {
  const scenario = getScenario(name);
  if (!scenario) return { error: `Unknown scenario: ${name}`, statusCode: 404 };

  try {
    const outputs = await repairScenario(name);
    if (SCENARIO_REPAIR_PLANS[name].applyBase) {
      await reapplyEnabledScenariosExcept(name, outputs);
    }
    enabledScenarios.delete(name);
    return { enabled: false, name, output: joinCommandOutput(outputs) };
  } catch (error: unknown) {
    return { error: getErrorOutput(error), statusCode: 500 };
  }
}

export async function fixAllScenarios(): Promise<{ fixed: true; output: string } | { error: string; statusCode: number }> {
  try {
    const outputs = [await applyManifest(getBaseManifest())];
    await deleteAllExtraScenarioResources(outputs);
    enabledScenarios.clear();
    return { fixed: true, output: joinCommandOutput(outputs) };
  } catch (error: unknown) {
    return { error: getErrorOutput(error), statusCode: 500 };
  }
}

async function repairScenario(name: string): Promise<string[]> {
  const plan = SCENARIO_REPAIR_PLANS[name];
  if (!plan) {
    throw new Error(`Missing repair plan for scenario: ${name}`);
  }

  const outputs: string[] = [];
  if (plan.applyBase) {
    outputs.push(await applyManifest(getBaseManifest()));
  }

  for (const resource of plan.deleteResources) {
    outputs.push(await deleteResource(resource));
  }

  return outputs;
}

async function reapplyEnabledScenariosExcept(disabledName: string, outputs: string[]): Promise<void> {
  for (const scenario of SCENARIO_REGISTRY) {
    if (scenario.name === disabledName || !enabledScenarios.has(scenario.name)) continue;
    outputs.push(await applyManifest(getScenarioManifestPath(scenario)));
  }
}

async function deleteAllExtraScenarioResources(outputs: string[]): Promise<void> {
  for (const scenario of SCENARIO_REGISTRY) {
    const plan = SCENARIO_REPAIR_PLANS[scenario.name];
    for (const resource of plan.deleteResources) {
      outputs.push(await deleteResource(resource));
    }
  }
}

async function deleteResource(resource: KubernetesResourceRef): Promise<string> {
  return runKubectl([
    'delete',
    resource.resource,
    resource.name,
    '-n',
    resource.namespace,
    '--ignore-not-found=true',
  ]);
}

function joinCommandOutput(outputs: string[]): string {
  return outputs.filter(output => output.length > 0).join('\n');
}

function getErrorOutput(error: unknown): string {
  if (isRecord(error)) {
    if (typeof error.stderr === 'string' && error.stderr.trim().length > 0) {
      return error.stderr;
    }
    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message;
    }
  }
  return String(error);
}
