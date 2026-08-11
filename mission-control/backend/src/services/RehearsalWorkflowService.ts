import { existsSync, statSync } from 'node:fs';
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitIncident } from './IncidentHandoffService.js';
import type {
  AdvanceRehearsalRunRequest,
  CreateRehearsalRunRequest,
  InterruptRehearsalRunRequest,
  RehearsalAttachmentChecksum,
  RehearsalEvidencePackage,
  RehearsalGateStatus,
  RehearsalPhase,
  RehearsalReplayResponse,
  RehearsalReplayStep,
  RehearsalRun,
  RehearsalScenarioName,
  RehearsalState,
  RehearsalStatus,
  ResumeRehearsalRunRequest,
  UpdateRehearsalEvidenceRequest,
} from '../types/index.js';

const REHEARSAL_PHASES: RehearsalPhase[] = [
  'preflight',
  'baseline',
  'injection',
  'detection',
  'prompt_gate',
  'diagnosis_gate',
  'restore',
  'recovery_verification',
  'evidence_package',
  'completed',
];

const REHEARSAL_SCENARIOS: RehearsalScenarioName[] = ['OOMKilled', 'MongoDBDown', 'ServiceMismatch'];
const DEFAULT_SENSITIVE_PATTERNS = [
  'subscription-id',
  'tenant-id',
  'principal-id',
  'resource-id',
  'secret',
  'password',
  'token',
  'sas',
  'client secret',
];
const DEFAULT_ARTIFACT_ROOT = 'docs/evidence/mission-control';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '..', '..', '.data');
const REHEARSAL_STATE_PATH = join(STORAGE_DIR, 'rehearsal-runs.json');
const REHEARSAL_REPOSITORY_ROOT_ENV = 'REHEARSAL_REPOSITORY_ROOT';
let rehearsalMutationQueue = Promise.resolve();

function getStatePath(): string {
  if (process.env['REHEARSAL_STATE_PATH']) {
    return process.env['REHEARSAL_STATE_PATH'];
  }
  return REHEARSAL_STATE_PATH;
}

function getRepositoryRoot(): string {
  const configuredRoot = process.env[REHEARSAL_REPOSITORY_ROOT_ENV];
  if (configuredRoot) {
    if (!isAbsolute(configuredRoot)) {
      throw new Error(`${REHEARSAL_REPOSITORY_ROOT_ENV} must be an absolute path`);
    }
    const resolvedRoot = resolve(configuredRoot);
    if (!existsSync(resolvedRoot) || !statSync(resolvedRoot).isDirectory()) {
      throw new Error(`${REHEARSAL_REPOSITORY_ROOT_ENV} must point to an existing directory`);
    }
    return resolvedRoot;
  }

  let currentDir = __dirname;
  while (true) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error('Unable to locate the repository root for rehearsal evidence paths');
}

async function ensureStorageDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  await ensureStorageDir(filePath);
  const tempPath = join(dirname(filePath), `${basename(filePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, content, 'utf8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function writeStateAtomically(state: RehearsalState): Promise<void> {
  const statePath = getStatePath();
  await writeFileAtomically(statePath, JSON.stringify(state, null, 2));
}

async function readState(): Promise<RehearsalState> {
  const statePath = getStatePath();
  try {
    await ensureStorageDir(statePath);
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RehearsalState>;
    return {
      runs: Array.isArray(parsed.runs) ? (parsed.runs as RehearsalRun[]) : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const initialState: RehearsalState = { runs: [], updatedAt: new Date().toISOString() };
      await writeStateAtomically(initialState);
      return initialState;
    }
    throw error;
  }
}

async function saveState(state: RehearsalState): Promise<void> {
  const nextState: RehearsalState = { ...state, updatedAt: new Date().toISOString() };
  await writeStateAtomically(nextState);
}

function withRehearsalMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const nextOperation = rehearsalMutationQueue.then(operation, operation);
  rehearsalMutationQueue = nextOperation.then(() => undefined, () => undefined);
  return nextOperation;
}

function normalizeScenarioName(scenarioName: string): RehearsalScenarioName {
  if (REHEARSAL_SCENARIOS.includes(scenarioName as RehearsalScenarioName)) {
    return scenarioName as RehearsalScenarioName;
  }
  throw new Error(`Unsupported rehearsal scenario: ${scenarioName}`);
}

function buildPrompt(scenarioName: RehearsalScenarioName): string {
  const prompts: Record<RehearsalScenarioName, string> = {
    OOMKilled: 'Investigate the OOMKilled failure and explain the recovery path to the operator.',
    MongoDBDown: 'Investigate the MongoDBDown failure and verify the recovery path before customer-ready handoff.',
    ServiceMismatch: 'Investigate the ServiceMismatch failure and verify endpoint routing before customer-ready handoff.',
  };
  return prompts[scenarioName];
}

function normalizeRepoPath(candidatePath: string): string {
  return candidatePath.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function validateEvidencePath(candidatePath: string | undefined): string[] {
  const errors: string[] = [];
  if (!candidatePath) {
    return errors;
  }
  const normalized = normalizeRepoPath(candidatePath);
  if (/^https?:\/\//i.test(normalized)) {
    errors.push(`Evidence path must be a local path, not a URL: ${candidatePath}`);
  }
  if (normalized.startsWith('/')) {
    errors.push(`Evidence path must be repo-relative, not absolute: ${candidatePath}`);
  }
  if (normalized.includes('..')) {
    errors.push(`Evidence path must not traverse parent directories: ${candidatePath}`);
  }
  if (!normalized.startsWith('docs/evidence/')) {
    errors.push(`Evidence path must live under docs/evidence/: ${candidatePath}`);
  }
  return errors;
}

async function resolveEvidencePath(candidatePath: string | undefined): Promise<string | undefined> {
  if (!candidatePath) {
    return undefined;
  }

  const normalized = normalizeRepoPath(candidatePath);
  const errors = validateEvidencePath(normalized);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const repositoryRoot = getRepositoryRoot();
  const absolutePath = resolve(repositoryRoot, normalized);
  const realRepositoryRoot = await realpath(repositoryRoot).catch(() => repositoryRoot);
  let currentPath = absolutePath;
  while (true) {
    try {
      const realCurrentPath = await realpath(currentPath);
      const relativePath = relative(realRepositoryRoot, realCurrentPath);
      if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        throw new Error(`Evidence path escapes repository root: ${candidatePath}`);
      }
      return absolutePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const parentDirectory = dirname(currentPath);
      if (parentDirectory === currentPath) {
        break;
      }
      currentPath = parentDirectory;
    }
  }

  return absolutePath;
}

function normalizeArtifactDirectory(scenarioName: RehearsalScenarioName, artifactDirectory?: string): string {
  const normalized = artifactDirectory ? normalizeRepoPath(artifactDirectory) : `${DEFAULT_ARTIFACT_ROOT}/${scenarioName.toLowerCase()}`;
  const errors = validateEvidencePath(normalized);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  return normalized;
}

function normalizeSensitivePatterns(patterns?: string[]): string[] {
  const merged = new Set(DEFAULT_SENSITIVE_PATTERNS);
  for (const pattern of patterns ?? []) {
    const trimmed = pattern.trim();
    if (trimmed) {
      merged.add(trimmed);
    }
  }
  return Array.from(merged);
}

function mergeEvidencePackage(existing: RehearsalEvidencePackage, updates: Partial<RehearsalEvidencePackage>): RehearsalEvidencePackage {
  const checksumMap = new Map<string, RehearsalAttachmentChecksum>();
  for (const checksum of [...existing.attachmentChecksums, ...(updates.attachmentChecksums ?? [])]) {
    checksumMap.set(checksum.path, checksum);
  }
  return {
    ...existing,
    ...updates,
    attachmentChecksums: Array.from(checksumMap.values()),
    redactionFindings: Array.from(new Set([...(existing.redactionFindings ?? []), ...(updates.redactionFindings ?? [])])),
    sensitivePatterns: Array.from(new Set([...(existing.sensitivePatterns ?? []), ...(updates.sensitivePatterns ?? [])])),
  };
}

function detectSensitivePatterns(values: Array<string | undefined>, configuredPatterns: string[]): string[] {
  const findings = new Set<string>();
  const normalizedPatterns = configuredPatterns.map((pattern) => pattern.toLowerCase());
  for (const value of values.filter((candidate): candidate is string => Boolean(candidate))) {
    const haystack = value.toLowerCase();
    for (const pattern of normalizedPatterns) {
      if (pattern && haystack.includes(pattern)) {
        findings.add(pattern);
      }
    }
  }
  return Array.from(findings);
}

function buildRunManifest(run: RehearsalRun): RehearsalRun['runManifest'] {
  const evidencePaths = [
    run.evidencePackage.evidencePath,
    run.evidencePackage.manifestPath,
    run.evidencePackage.configDiffPath,
    run.evidencePackage.inventoryPath,
    run.evidencePackage.eventsPath,
    run.evidencePackage.logsPath,
    run.evidencePackage.alertHistoryPath,
    run.evidencePackage.kqlExportPath,
    run.evidencePackage.recoveryCheckPath,
    run.evidencePackage.summaryPath,
  ].filter((value): value is string => Boolean(value));

  return {
    scenarioName: run.scenarioName,
    generatedAt: new Date().toISOString(),
    phases: REHEARSAL_PHASES.slice(0, REHEARSAL_PHASES.indexOf(run.phase) + 1),
    evidencePaths: Array.from(new Set(evidencePaths)),
  };
}

function calculateGateStatus(run: RehearsalRun): RehearsalGateStatus {
  if (run.evidencePackage.redactionFindings.length > 0) {
    return 'REDACTION_BLOCKED';
  }
  const hasPortalEvidence = Boolean(run.evidencePackage.evidencePath && run.evidencePackage.manifestPath);
  if (run.evidencePackage.complete && hasPortalEvidence) {
    return 'PASS';
  }
  return 'PASS_WITH_PENDING_HUMAN_PORTAL';
}

function calculateDurations(run: RehearsalRun): Pick<RehearsalRun, 'automatedScenarioDurationMs' | 'humanTimingMs' | 'sreAgentAssistedTimingMs'> {
  const timestamps = run.timestamps;
  const automatedStart = timestamps.t0 ? Date.parse(timestamps.t0) : undefined;
  const automatedEnd = timestamps.t3 ? Date.parse(timestamps.t3) : undefined;
  const humanEnd = timestamps.t4 ? Date.parse(timestamps.t4) : undefined;
  const sreEnd = timestamps.t5 ? Date.parse(timestamps.t5) : undefined;

  return {
    automatedScenarioDurationMs: automatedStart && automatedEnd ? automatedEnd - automatedStart : undefined,
    humanTimingMs: automatedEnd && humanEnd ? humanEnd - automatedEnd : undefined,
    sreAgentAssistedTimingMs: humanEnd && sreEnd ? sreEnd - humanEnd : undefined,
  };
}

function createSeedRun(scenarioName: RehearsalScenarioName, prompt: string, diagnosisSummary?: string): RehearsalRun {
  const now = new Date().toISOString();
  return {
    scenarioName,
    phase: 'preflight',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    prompt,
    diagnosisSummary,
    timestamps: {},
    evidencePackage: {
      attachmentChecksums: [],
      redactionFindings: [],
      sensitivePatterns: [],
      complete: false,
    },
    customerReady: false,
    gateStatus: 'PASS_WITH_PENDING_HUMAN_PORTAL',
    runManifest: {
      scenarioName,
      generatedAt: now,
      phases: ['preflight'],
      evidencePaths: [],
    },
  };
}

async function ensureEvidenceFile(candidatePath: string): Promise<void> {
  const normalizedPath = normalizeRepoPath(candidatePath);
  const errors = validateEvidencePath(normalizedPath);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  const resolvedPath = await resolveEvidencePath(normalizedPath);
  if (!resolvedPath) {
    throw new Error(`Unable to resolve evidence path: ${candidatePath}`);
  }
  await mkdir(dirname(resolvedPath), { recursive: true });
  try {
    await access(resolvedPath);
  } catch {
    await writeFile(resolvedPath, 'Mission Control rehearsal placeholder evidence.\n', 'utf8');
  }
}

async function computeFileChecksum(candidatePath: string): Promise<string> {
  const normalizedPath = normalizeRepoPath(candidatePath);
  await ensureEvidenceFile(normalizedPath);
  const resolvedPath = await resolveEvidencePath(normalizedPath);
  if (!resolvedPath) {
    throw new Error(`Unable to resolve evidence path: ${candidatePath}`);
  }
  const content = await readFile(resolvedPath, 'utf8');
  return createHash('sha256').update(content).digest('hex');
}

function buildManifestContent(run: RehearsalRun): Record<string, unknown> {
  return {
    scenarioName: run.scenarioName,
    phase: run.phase,
    gateStatus: run.gateStatus,
    generatedAt: new Date().toISOString(),
    timestamps: run.timestamps,
    evidencePaths: {
      evidence: run.evidencePackage.evidencePath,
      manifest: run.evidencePackage.manifestPath,
      configDiff: run.evidencePackage.configDiffPath,
      inventory: run.evidencePackage.inventoryPath,
      events: run.evidencePackage.eventsPath,
      logs: run.evidencePackage.logsPath,
      alertHistory: run.evidencePackage.alertHistoryPath,
      kqlExport: run.evidencePackage.kqlExportPath,
      recoveryCheck: run.evidencePackage.recoveryCheckPath,
      summary: run.evidencePackage.summaryPath,
    },
    attachmentChecksums: run.evidencePackage.attachmentChecksums,
    redactionFindings: run.evidencePackage.redactionFindings,
    sensitivePatterns: run.evidencePackage.sensitivePatterns,
    boundedEvidence: {
      maxEvents: 50,
      maxLogLines: 50,
      maxAlertHistoryEntries: 50,
      maxKqlRows: 50,
    },
    notes: run.notes,
  };
}

function buildSummaryContent(run: RehearsalRun): string {
  const lines = [
    `# Mission Control rehearsal summary for ${run.scenarioName}`,
    '',
    `- Phase: ${run.phase}`,
    `- Gate: ${run.gateStatus}`,
    `- Customer ready: ${run.customerReady ? 'yes' : 'no'}`,
    `- Automated duration: ${run.automatedScenarioDurationMs ?? 'n/a'} ms`,
    `- Human timing: ${run.humanTimingMs ?? 'n/a'} ms`,
    `- SRE agent timing: ${run.sreAgentAssistedTimingMs ?? 'n/a'} ms`,
    '',
    '## Evidence package',
    `- Evidence: ${run.evidencePackage.evidencePath ?? 'pending'}`,
    `- Manifest: ${run.evidencePackage.manifestPath ?? 'pending'}`,
    `- Summary: ${run.evidencePackage.summaryPath ?? 'pending'}`,
    `- Redaction findings: ${run.evidencePackage.redactionFindings.length > 0 ? run.evidencePackage.redactionFindings.join(', ') : 'none'}`,
    '',
    '## Timing',
    `- T0: ${run.timestamps.t0 ?? 'pending'}`,
    `- T1: ${run.timestamps.t1 ?? 'pending'}`,
    `- T2: ${run.timestamps.t2 ?? 'pending'}`,
    `- T3: ${run.timestamps.t3 ?? 'pending'}`,
    `- T4: ${run.timestamps.t4 ?? 'pending'}`,
    `- T5: ${run.timestamps.t5 ?? 'pending'}`,
  ];
  return `${lines.join('\n')}\n`;
}

async function persistEvidenceArtifacts(run: RehearsalRun): Promise<void> {
  const artifactDirectory = run.evidencePackage.artifactDirectory ?? normalizeArtifactDirectory(run.scenarioName);
  const summaryPath = run.evidencePackage.summaryPath ?? `${artifactDirectory}/summary.md`;
  const manifestPath = run.evidencePackage.manifestPath ?? `${artifactDirectory}/manifest.json`;

  const absoluteArtifactDirectory = await resolveEvidencePath(artifactDirectory);
  const absoluteSummaryPath = await resolveEvidencePath(summaryPath);
  const absoluteManifestPath = await resolveEvidencePath(manifestPath);

  if (!absoluteArtifactDirectory || !absoluteSummaryPath || !absoluteManifestPath) {
    throw new Error('Unable to resolve evidence artifact locations');
  }

  await mkdir(absoluteArtifactDirectory, { recursive: true });
  const manifestContent = buildManifestContent(run);
  const summaryContent = buildSummaryContent(run);

  await writeFile(absoluteManifestPath, `${JSON.stringify(manifestContent, null, 2)}\n`, 'utf8');
  await writeFile(absoluteSummaryPath, summaryContent, 'utf8');

  run.evidencePackage.artifactDirectory = artifactDirectory;
  run.evidencePackage.summaryPath = summaryPath;
  run.evidencePackage.manifestPath = manifestPath;
}

async function syncIncidentHandoff(run: RehearsalRun): Promise<void> {
  const evidence = [
    `Rehearsal phase: ${run.phase}`,
    `Gate status: ${run.gateStatus}`,
    run.evidencePackage.evidencePath ? `Evidence path: ${run.evidencePackage.evidencePath}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const incident = await submitIncident({
    title: `Mission Control rehearsal · ${run.scenarioName}`,
    summary: `Rehearsal workflow for ${run.scenarioName} is now ${run.phase}.`,
    severity: 'warning',
    source: 'dashboard',
    scenarioName: run.scenarioName,
    evidence,
    operatorGuidance: [
      'Review the rehearsal evidence package before customer-ready claims.',
      'Do not claim diagnosis without human portal evidence.',
    ],
  });
  run.incidentHandoffId = incident.incident.id;
}

function buildPreviewStep(nextPhase: RehearsalPhase, run: RehearsalRun): RehearsalReplayStep {
  const now = new Date().toISOString();
  const preview = { ...run, timestamps: { ...run.timestamps } } as RehearsalRun;
  preview.phase = nextPhase;
  preview.status = 'in_progress';
  preview.updatedAt = now;
  if (nextPhase === 'baseline') {
    preview.timestamps.t1 = now;
  } else if (nextPhase === 'injection') {
    preview.timestamps.t2 = now;
  } else if (nextPhase === 'detection') {
    preview.timestamps.t3 = now;
  } else if (nextPhase === 'diagnosis_gate') {
    preview.timestamps.t4 = now;
  } else if (nextPhase === 'evidence_package') {
    preview.timestamps.t5 = now;
  }
  const durations = calculateDurations(preview);
  preview.automatedScenarioDurationMs = durations.automatedScenarioDurationMs;
  preview.humanTimingMs = durations.humanTimingMs;
  preview.sreAgentAssistedTimingMs = durations.sreAgentAssistedTimingMs;
  preview.gateStatus = calculateGateStatus(preview);
  preview.runManifest = buildRunManifest(preview);
  if (nextPhase === 'completed') {
    preview.status = 'completed';
    preview.completedAt = now;
    preview.customerReady = preview.gateStatus === 'PASS';
  }
  return {
    phase: preview.phase,
    status: preview.status,
    gateStatus: preview.gateStatus,
    timestamps: preview.timestamps,
    notes: preview.notes,
  };
}

export async function getRehearsalState(): Promise<RehearsalState> {
  return await readState();
}

export async function createRehearsalRun(request: CreateRehearsalRunRequest): Promise<RehearsalRun> {
  return withRehearsalMutationLock(async () => {
    const state = await readState();
    const scenarioName = normalizeScenarioName(request.scenarioName);
    const existingRun = state.runs.find((candidate: RehearsalRun) => candidate.scenarioName === scenarioName);

    if (existingRun) {
      existingRun.status = 'in_progress';
      existingRun.phase = 'preflight';
      existingRun.updatedAt = new Date().toISOString();
      existingRun.startedAt = existingRun.startedAt ?? new Date().toISOString();
      existingRun.interruptedAt = undefined;
      existingRun.evidencePackage = {
        ...existingRun.evidencePackage,
        complete: false,
        redactionFindings: [],
        attachmentChecksums: [],
        sensitivePatterns: [],
      };
      existingRun.customerReady = false;
      existingRun.gateStatus = 'PASS_WITH_PENDING_HUMAN_PORTAL';
      existingRun.runManifest = buildRunManifest(existingRun);
      await saveState(state);
      return existingRun;
    }

    const prompt = request.prompt ?? buildPrompt(scenarioName);
    const run = createSeedRun(scenarioName, prompt, request.diagnosisSummary);
    run.status = 'in_progress';
    run.startedAt = new Date().toISOString();
    run.timestamps.t0 = new Date().toISOString();
    run.updatedAt = run.startedAt;
    state.runs.push(run);
    run.runManifest = buildRunManifest(run);
    run.gateStatus = calculateGateStatus(run);
    await syncIncidentHandoff(run);
    await saveState(state);
    return run;
  });
}

export async function advanceRehearsalRun(scenarioName: RehearsalScenarioName, request?: AdvanceRehearsalRunRequest): Promise<RehearsalRun> {
  return withRehearsalMutationLock(async () => {
    const state = await readState();
    const normalizedName = normalizeScenarioName(scenarioName);
    const run = state.runs.find((candidate: RehearsalRun) => candidate.scenarioName === normalizedName);
    if (!run) {
      throw new Error(`Rehearsal run not found: ${normalizedName}`);
    }

    if (run.status === 'interrupted') {
      throw new Error('Rehearsal run is interrupted; resume it before advancing');
    }
    if (run.status === 'reset') {
      throw new Error('Rehearsal run was reset; create a new run before advancing');
    }
    if (run.status === 'completed') {
      throw new Error('Rehearsal run is already complete');
    }

    const currentIndex = REHEARSAL_PHASES.indexOf(run.phase);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= REHEARSAL_PHASES.length) {
      throw new Error('Rehearsal run is already complete');
    }

    const nextPhase = REHEARSAL_PHASES[nextIndex];
    const now = new Date().toISOString();
    run.phase = nextPhase;
    run.status = 'in_progress';
    run.updatedAt = now;
    run.notes = request?.notes ?? run.notes;

    if (nextPhase === 'baseline') {
      run.timestamps.t1 = now;
    } else if (nextPhase === 'injection') {
      run.timestamps.t2 = now;
    } else if (nextPhase === 'detection') {
      run.timestamps.t3 = now;
    } else if (nextPhase === 'diagnosis_gate') {
      run.timestamps.t4 = now;
    } else if (nextPhase === 'evidence_package') {
      run.timestamps.t5 = now;
    }

    const durations = calculateDurations(run);
    run.automatedScenarioDurationMs = durations.automatedScenarioDurationMs;
    run.humanTimingMs = durations.humanTimingMs;
    run.sreAgentAssistedTimingMs = durations.sreAgentAssistedTimingMs;
    run.gateStatus = calculateGateStatus(run);
    run.runManifest = buildRunManifest(run);

    if (nextPhase === 'completed') {
      run.status = 'completed';
      run.completedAt = now;
      run.customerReady = run.gateStatus === 'PASS';
    }

    if (!request?.dryRun) {
      await saveState(state);
    }
    return run;
  });
}

export async function replayRehearsalRun(scenarioName: RehearsalScenarioName): Promise<RehearsalReplayResponse> {
  const normalizedName = normalizeScenarioName(scenarioName);
  const run = createSeedRun(normalizedName, buildPrompt(normalizedName));
  run.timestamps.t0 = new Date().toISOString();
  const steps: RehearsalReplayStep[] = [];
  let currentPhase: RehearsalPhase = 'preflight';
  run.phase = currentPhase;
  steps.push(buildPreviewStep(currentPhase, run));
  for (const nextPhase of REHEARSAL_PHASES.slice(1)) {
    const preview = buildPreviewStep(nextPhase, run);
    steps.push(preview);
    run.phase = nextPhase;
    run.timestamps = preview.timestamps;
    run.status = preview.status;
    run.gateStatus = preview.gateStatus;
    run.notes = preview.notes;
  }
  return {
    scenarioName: normalizedName,
    generatedAt: new Date().toISOString(),
    currentPhase,
    steps,
  };
}

export async function interruptRehearsalRun(request: InterruptRehearsalRunRequest): Promise<RehearsalRun> {
  return withRehearsalMutationLock(async () => {
    const state = await readState();
    const scenarioName = normalizeScenarioName(request.scenarioName);
    const run = state.runs.find((candidate: RehearsalRun) => candidate.scenarioName === scenarioName);
    if (!run) {
      throw new Error(`Rehearsal run not found: ${scenarioName}`);
    }
    run.status = 'interrupted';
    run.interruptedAt = new Date().toISOString();
    run.updatedAt = run.interruptedAt;
    run.notes = request.reason ?? run.notes;
    run.gateStatus = calculateGateStatus(run);
    run.runManifest = buildRunManifest(run);
    await saveState(state);
    return run;
  });
}

export async function resumeRehearsalRun(request: ResumeRehearsalRunRequest): Promise<RehearsalRun> {
  return withRehearsalMutationLock(async () => {
    const state = await readState();
    const scenarioName = normalizeScenarioName(request.scenarioName);
    const run = state.runs.find((candidate: RehearsalRun) => candidate.scenarioName === scenarioName);
    if (!run) {
      throw new Error(`Rehearsal run not found: ${scenarioName}`);
    }
    if (run.status !== 'interrupted') {
      throw new Error('Rehearsal run must be interrupted before it can be resumed');
    }
    run.status = 'in_progress';
    run.updatedAt = new Date().toISOString();
    run.interruptedAt = undefined;
    run.notes = `${run.notes ?? ''}\nResumed from interruption`.trim();
    run.gateStatus = calculateGateStatus(run);
    run.runManifest = buildRunManifest(run);
    await saveState(state);
    return run;
  });
}

export async function resetRehearsalRun(scenarioName: RehearsalScenarioName): Promise<RehearsalRun> {
  return withRehearsalMutationLock(async () => {
    const state = await readState();
    const normalizedName = normalizeScenarioName(scenarioName);
    const run = state.runs.find((candidate: RehearsalRun) => candidate.scenarioName === normalizedName);
    if (!run) {
      throw new Error(`Rehearsal run not found: ${normalizedName}`);
    }
    const resetRun = createSeedRun(normalizedName, run.prompt, run.diagnosisSummary);
    resetRun.status = 'reset';
    resetRun.updatedAt = new Date().toISOString();
    resetRun.notes = 'Reset to a fresh rehearsal state.';
    Object.assign(run, resetRun);
    run.runManifest = buildRunManifest(run);
    run.gateStatus = calculateGateStatus(run);
    await saveState(state);
    return run;
  });
}

export async function updateRehearsalEvidence(request: UpdateRehearsalEvidenceRequest): Promise<RehearsalRun> {
  return withRehearsalMutationLock(async () => {
    const state = await readState();
    const scenarioName = normalizeScenarioName(request.scenarioName);
    const run = state.runs.find((candidate: RehearsalRun) => candidate.scenarioName === scenarioName);
    if (!run) {
      throw new Error(`Rehearsal run not found: ${scenarioName}`);
    }

    const artifactDirectory = normalizeArtifactDirectory(scenarioName, request.artifactDirectory);
    const configuredPatterns = normalizeSensitivePatterns(request.sensitivePatterns);
    const sensitiveFindings = detectSensitivePatterns([
      request.evidencePath,
      request.manifestPath,
      request.configDiffPath,
      request.inventoryPath,
      request.eventsPath,
      request.logsPath,
      request.alertHistoryPath,
      request.kqlExportPath,
      request.recoveryCheckPath,
      request.notes,
    ], configuredPatterns);

    const nextPackage = mergeEvidencePackage(run.evidencePackage, {
      evidencePath: request.evidencePath,
      manifestPath: request.manifestPath,
      configDiffPath: request.configDiffPath,
      inventoryPath: request.inventoryPath,
      eventsPath: request.eventsPath,
      logsPath: request.logsPath,
      alertHistoryPath: request.alertHistoryPath,
      kqlExportPath: request.kqlExportPath,
      recoveryCheckPath: request.recoveryCheckPath,
      artifactDirectory,
      attachmentChecksums: request.attachmentChecksums ?? [],
      redactionFindings: [...(request.redactionFindings ?? []), ...sensitiveFindings],
      sensitivePatterns: configuredPatterns,
      complete: request.complete ?? run.evidencePackage.complete,
    });

    const inputErrors = [
      ...validateEvidencePath(nextPackage.evidencePath),
      ...validateEvidencePath(nextPackage.manifestPath),
      ...validateEvidencePath(nextPackage.configDiffPath),
      ...validateEvidencePath(nextPackage.inventoryPath),
      ...validateEvidencePath(nextPackage.eventsPath),
      ...validateEvidencePath(nextPackage.logsPath),
      ...validateEvidencePath(nextPackage.alertHistoryPath),
      ...validateEvidencePath(nextPackage.kqlExportPath),
      ...validateEvidencePath(nextPackage.recoveryCheckPath),
      ...validateEvidencePath(nextPackage.summaryPath),
    ];

    if (inputErrors.length > 0) {
      nextPackage.redactionFindings = Array.from(new Set([...nextPackage.redactionFindings, ...inputErrors]));
    }

    if (request.evidencePath) {
      await ensureEvidenceFile(request.evidencePath);
    }
    if (request.manifestPath) {
      await ensureEvidenceFile(request.manifestPath);
    }
    if (request.summaryPath) {
      await ensureEvidenceFile(request.summaryPath);
    }
    for (const checksumEntry of request.attachmentChecksums ?? []) {
      if (checksumEntry.path && checksumEntry.checksum) {
        const actualChecksum = await computeFileChecksum(checksumEntry.path);
        if (actualChecksum !== checksumEntry.checksum) {
          nextPackage.redactionFindings = Array.from(new Set([...nextPackage.redactionFindings, `Checksum mismatch for ${checksumEntry.path}`]));
        }
      }
    }

    run.evidencePackage = nextPackage;
    run.notes = request.notes ?? run.notes;
    run.updatedAt = new Date().toISOString();
    await persistEvidenceArtifacts(run);
    run.gateStatus = calculateGateStatus(run);
    run.customerReady = run.gateStatus === 'PASS';
    run.runManifest = buildRunManifest(run);
    await saveState(state);
    return run;
  });
}

export function getRehearsalScenarioNames(): RehearsalScenarioName[] {
  return [...REHEARSAL_SCENARIOS];
}
