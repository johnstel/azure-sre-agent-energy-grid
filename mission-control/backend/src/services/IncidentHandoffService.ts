import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type IncidentHandoffStatus = 'open' | 'acknowledged' | 'resolved';
export type IncidentHandoffSeverity = 'critical' | 'warning' | 'unknown';
export type IncidentHandoffSource = 'action-group' | 'dashboard' | 'manual';

export interface IncidentHandoff {
  id: string;
  key: string;
  status: IncidentHandoffStatus;
  title: string;
  summary: string;
  severity: IncidentHandoffSeverity;
  source: IncidentHandoffSource;
  scenarioName?: string;
  createdAt: string;
  updatedAt: string;
  evidence: string[];
  operatorGuidance: string[];
  notes?: string[];
}

export interface IncidentHandoffState {
  incidents: IncidentHandoff[];
  updatedAt: string;
}

export interface IncidentHandoffCreateRequest {
  title?: string;
  summary?: string;
  severity?: IncidentHandoffSeverity;
  source?: IncidentHandoffSource;
  scenarioName?: string;
  evidence?: string[];
  operatorGuidance?: string[];
  alertName?: string;
  alertRule?: string;
  rawPayload?: unknown;
}

export interface IncidentHandoffMutationResult {
  incident: IncidentHandoff;
  deduped: boolean;
}

const DEFAULT_OPERATOR_GUIDANCE = [
  'Review the Grafana timeline and evidence before changing the environment.',
  'Operator confirmation is required before applying remediations.',
];

let stateMutationQueue: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function inferSeverity(value?: string): IncidentHandoffSeverity {
  const normalized = (value ?? '').toLowerCase();
  if (normalized.includes('critical') || normalized.includes('sev1') || normalized.includes('sev 1')) return 'critical';
  if (normalized.includes('warning') || normalized.includes('warn') || normalized.includes('sev2') || normalized.includes('sev 2')) return 'warning';
  return 'unknown';
}

function normalizeEvidence(values?: string[]): string[] {
  return Array.from(new Set((values ?? []).map(value => value.trim()).filter(Boolean))).slice(-8);
}

function normalizeEvidenceFromOptionals(values: Array<string | undefined>): string[] {
  return normalizeEvidence(values.filter((value): value is string => typeof value === 'string'));
}

function normalizeGuidance(values?: string[]): string[] {
  const guidance = Array.from(new Set((values ?? []).map(value => value.trim()).filter(Boolean))).slice(-6);
  return guidance.length > 0 ? guidance : DEFAULT_OPERATOR_GUIDANCE;
}

function buildKey(request: IncidentHandoffCreateRequest): string {
  const scenario = request.scenarioName?.trim() || 'general';
  const alertName = request.alertName?.trim() || request.alertRule?.trim() || request.title?.trim() || 'incident';
  const source = request.source || 'manual';
  return `${source}:${scenario}:${alertName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildTitle(request: IncidentHandoffCreateRequest): string {
  const requestedTitle = request.title?.trim();
  if (requestedTitle) return requestedTitle;
  if (request.alertRule?.trim()) return request.alertRule.trim();
  if (request.alertName?.trim()) return request.alertName.trim();
  return 'Operator handoff';
}

function buildSummary(request: IncidentHandoffCreateRequest): string {
  const requestedSummary = request.summary?.trim();
  if (requestedSummary) return requestedSummary;
  if (request.alertRule?.trim()) {
    return `Alert rule ${request.alertRule.trim()} entered the incident queue.`;
  }
  return 'An incident handoff was captured for operator review.';
}

function getStatePath(): string {
  if (process.env['INCIDENT_HANDOFF_STATE_PATH']) {
    return process.env['INCIDENT_HANDOFF_STATE_PATH'];
  }
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, '..', '..', 'state', 'incident-handoffs.json');
}

async function ensureStateFile(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function withIncidentMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = stateMutationQueue;
  let release!: () => void;
  stateMutationQueue = new Promise<void>(resolve => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function writeIncidentStateAtomically(state: IncidentHandoffState): Promise<void> {
  const statePath = getStatePath();
  await ensureStateFile(statePath);
  const tempPath = join(dirname(statePath), `${basename(statePath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    await rename(tempPath, statePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function readIncidentState(): Promise<IncidentHandoffState> {
  const statePath = getStatePath();
  try {
    await ensureStateFile(statePath);
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<IncidentHandoffState>;
    return {
      incidents: Array.isArray(parsed.incidents) ? parsed.incidents as IncidentHandoff[] : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const initialState: IncidentHandoffState = { incidents: [], updatedAt: new Date().toISOString() };
      await writeIncidentState(initialState);
      return initialState;
    }
    throw error;
  }
}

export async function writeIncidentState(state: IncidentHandoffState): Promise<void> {
  await writeIncidentStateAtomically(state);
}

function mergeEvidence(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming])).slice(-8);
}

function mergeGuidance(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming])).slice(-6);
}

export function parseActionGroupWebhook(payload: unknown): IncidentHandoffCreateRequest {
  if (!isRecord(payload)) {
    return { title: 'Incident handoff', summary: 'Azure Monitor action-group webhook received.', source: 'action-group' };
  }

  const data = isRecord(payload.data) ? payload.data : undefined;
  const essentials = isRecord(data?.essentials) ? data.essentials : undefined;
  const alertContext = isRecord(data?.alertContext) ? data.alertContext : undefined;
  const alertRule = toString(essentials?.alertRule) ?? toString(alertContext?.name) ?? toString(alertContext?.alertRuleName) ?? toString(payload.alertRuleName) ?? toString(payload.alertName);
  const severity = inferSeverity(toString(essentials?.severity) ?? toString(alertContext?.severity));
  const title = toString(alertRule) ?? toString(payload.title) ?? 'Incident handoff';
  const summary = toString(payload.summary) ?? toString(essentials?.description) ?? `Action group webhook reported ${title}.`;
  const monitorCondition = toString(essentials?.monitorCondition);
  const firedDateTime = toString(essentials?.firedDateTime);
  const monitoringService = toString(alertContext?.monitoringService);
  const evidence = normalizeEvidenceFromOptionals([
    title ? `Alert rule: ${title}` : undefined,
    monitorCondition ? `Condition: ${monitorCondition}` : undefined,
    firedDateTime ? `Fired: ${firedDateTime}` : undefined,
    monitoringService ? `Monitoring service: ${monitoringService}` : undefined,
  ]);

  return {
    title,
    summary,
    severity,
    source: 'action-group',
    alertName: alertRule,
    alertRule,
    evidence,
    operatorGuidance: DEFAULT_OPERATOR_GUIDANCE,
    rawPayload: payload,
  };
}

export async function submitIncident(request: IncidentHandoffCreateRequest): Promise<IncidentHandoffMutationResult> {
  return withIncidentMutationLock(async () => {
    const normalized = {
      title: buildTitle(request),
      summary: buildSummary(request),
      severity: request.severity ?? 'unknown',
      source: request.source ?? 'manual',
      scenarioName: request.scenarioName?.trim(),
      evidence: normalizeEvidence(request.evidence),
      operatorGuidance: normalizeGuidance(request.operatorGuidance),
      alertName: request.alertName?.trim(),
      alertRule: request.alertRule?.trim(),
      rawPayload: request.rawPayload,
    };

    const state = await readIncidentState();
    const key = buildKey(normalized);
    const now = new Date().toISOString();
    const existing = state.incidents.find(candidate => candidate.key === key && candidate.status !== 'resolved');

    if (existing) {
      existing.title = normalized.title;
      existing.summary = normalized.summary;
      existing.severity = normalized.severity;
      existing.source = normalized.source;
      existing.scenarioName = normalized.scenarioName;
      existing.evidence = mergeEvidence(existing.evidence, normalized.evidence);
      existing.operatorGuidance = mergeGuidance(existing.operatorGuidance, normalized.operatorGuidance);
      existing.updatedAt = now;
      existing.notes = [...(existing.notes ?? []), ...(normalized.evidence.length > 0 ? [`Updated from ${normalized.source}`] : [])].slice(-4);
      state.updatedAt = now;
      await writeIncidentState(state);
      return { incident: existing, deduped: true };
    }

    const incident: IncidentHandoff = {
      id: randomUUID(),
      key,
      status: 'open',
      title: normalized.title,
      summary: normalized.summary,
      severity: normalized.severity,
      source: normalized.source,
      scenarioName: normalized.scenarioName,
      createdAt: now,
      updatedAt: now,
      evidence: normalized.evidence,
      operatorGuidance: normalized.operatorGuidance,
      notes: normalized.evidence.length > 0 ? [`Captured from ${normalized.source}`] : [],
    };

    state.incidents.push(incident);
    state.updatedAt = now;
    await writeIncidentState(state);
    return { incident, deduped: false };
  });
}

export async function getIncidents(): Promise<IncidentHandoff[]> {
  const state = await readIncidentState();
  return [...state.incidents].sort((left, right) => {
    const severityRank = (severity: IncidentHandoffSeverity) => severity === 'critical' ? 3 : severity === 'warning' ? 2 : 1;
    return severityRank(right.severity) - severityRank(left.severity) || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export async function acknowledgeIncident(id: string): Promise<IncidentHandoff | undefined> {
  return withIncidentMutationLock(async () => {
    const state = await readIncidentState();
    const incident = state.incidents.find(candidate => candidate.id === id);
    if (!incident) return undefined;
    incident.status = 'acknowledged';
    incident.updatedAt = new Date().toISOString();
    state.updatedAt = incident.updatedAt;
    await writeIncidentState(state);
    return incident;
  });
}

export async function resolveIncident(id: string): Promise<IncidentHandoff | undefined> {
  return withIncidentMutationLock(async () => {
    const state = await readIncidentState();
    const incident = state.incidents.find(candidate => candidate.id === id);
    if (!incident) return undefined;
    incident.status = 'resolved';
    incident.updatedAt = new Date().toISOString();
    state.updatedAt = incident.updatedAt;
    await writeIncidentState(state);
    return incident;
  });
}

export async function resetIncidentState(): Promise<IncidentHandoffState> {
  return withIncidentMutationLock(async () => {
    const initialState: IncidentHandoffState = { incidents: [], updatedAt: new Date().toISOString() };
    await writeIncidentState(initialState);
    return initialState;
  });
}
