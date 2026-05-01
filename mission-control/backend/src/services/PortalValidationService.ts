import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScenarios } from './ScenarioService.js';
import type { PortalValidation, PortalValidationScenarioName, PortalValidationState, Scenario, ScenarioNarration } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '..', '..', '.data');
const VALIDATIONS_FILE = join(STORAGE_DIR, 'portal-validations.json');

export const PORTAL_VALIDATION_SCENARIOS = ['OOMKilled', 'MongoDBDown', 'ServiceMismatch'] as const satisfies readonly PortalValidationScenarioName[];

const PORTAL_VALIDATION_NARRATION_SCENARIOS: Record<PortalValidationScenarioName, string> = {
  OOMKilled: 'oom-killed',
  MongoDBDown: 'mongodb-down',
  ServiceMismatch: 'service-mismatch',
};

function getDefaultState(): PortalValidationState {
  return {
    validations: [
      {
        scenarioName: 'OOMKilled',
        status: 'awaiting',
        evidenceCaptured: false,
        timestamp: new Date().toISOString(),
        operatorInitials: '',
        evidencePath: '',
        notes: '',
      },
      {
        scenarioName: 'MongoDBDown',
        status: 'awaiting',
        evidenceCaptured: false,
        timestamp: new Date().toISOString(),
        operatorInitials: '',
        evidencePath: '',
        notes: '',
      },
      {
        scenarioName: 'ServiceMismatch',
        status: 'awaiting',
        evidenceCaptured: false,
        timestamp: new Date().toISOString(),
        operatorInitials: '',
        evidencePath: '',
        notes: '',
      },
    ],
    confirmedCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

async function ensureStorageDir(): Promise<void> {
  if (!existsSync(STORAGE_DIR)) {
    await mkdir(STORAGE_DIR, { recursive: true });
  }
}

async function loadState(): Promise<PortalValidationState> {
  await ensureStorageDir();

  if (!existsSync(VALIDATIONS_FILE)) {
    return getDefaultState();
  }

  const content = await readFile(VALIDATIONS_FILE, 'utf-8');
  return JSON.parse(content);
}

async function saveState(state: PortalValidationState): Promise<void> {
  await ensureStorageDir();
  await writeFile(VALIDATIONS_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function calculateConfirmedCount(validations: PortalValidation[]): number {
  return validations.filter((v) => v.status === 'confirmed').length;
}

export async function getValidationState(): Promise<PortalValidationState> {
  return await loadState();
}

export function getScenarioPrompt(scenarioName: PortalValidationScenarioName): string {
  return getSharedNarrationScenario(scenarioName).narration.suggestedPrompt.text;
}

export function getScenarioDescription(scenarioName: PortalValidationScenarioName): string {
  return getSharedNarrationScenario(scenarioName).narration.title;
}

function getSharedNarrationScenario(scenarioName: PortalValidationScenarioName): Scenario & { narration: ScenarioNarration } {
  const narrationScenarioName = PORTAL_VALIDATION_NARRATION_SCENARIOS[scenarioName];
  const scenario = getScenarios().find((item) => item.name === narrationScenarioName);
  if (!scenario?.narration) {
    throw new Error(`Shared narration metadata missing for portal validation scenario: ${scenarioName}`);
  }
  return scenario as Scenario & { narration: ScenarioNarration };
}

export async function updateValidation(
  scenarioName: PortalValidationScenarioName,
  updates: {
    evidenceCaptured?: boolean;
    timestamp?: string;
    operatorInitials?: string;
    evidencePath?: string;
    notes?: string;
    accuracy?: 'PASS' | 'FAIL' | 'PARTIAL';
  }
): Promise<PortalValidationState> {
  const state = await loadState();
  const validation = state.validations.find((v) => v.scenarioName === scenarioName);

  if (!validation) {
    throw new Error(`Validation not found: ${scenarioName}`);
  }

  if (updates.evidenceCaptured !== undefined) {
    validation.evidenceCaptured = updates.evidenceCaptured;
  }
  if (updates.timestamp !== undefined) {
    validation.timestamp = updates.timestamp;
  }
  if (updates.operatorInitials !== undefined) {
    validation.operatorInitials = updates.operatorInitials.toUpperCase();
  }
  if (updates.evidencePath !== undefined) {
    validation.evidencePath = updates.evidencePath;
  }
  if (updates.notes !== undefined) {
    validation.notes = updates.notes;
  }
  if (updates.accuracy !== undefined) {
    validation.accuracy = updates.accuracy;
  }

  state.confirmedCount = calculateConfirmedCount(state.validations);
  state.updatedAt = new Date().toISOString();

  await saveState(state);
  return state;
}

export async function confirmValidation(
  scenarioName: PortalValidationScenarioName,
  timestamp: string,
  operatorInitials: string,
  accuracy?: 'PASS' | 'FAIL' | 'PARTIAL'
): Promise<PortalValidationState> {
  const state = await loadState();
  const validation = state.validations.find((v) => v.scenarioName === scenarioName);

  if (!validation) {
    throw new Error(`Validation not found: ${scenarioName}`);
  }

  // Validate operator initials (2-4 letters)
  if (!/^[A-Za-z]{2,4}$/.test(operatorInitials)) {
    throw new Error('Operator initials must be 2-4 letters');
  }

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Timestamp must be a valid ISO-style date/time');
  }

  // Require evidence captured checkbox, timestamp, and evidence path
  if (!validation.evidenceCaptured) {
    throw new Error('Evidence captured checkbox must be checked before confirming');
  }
  if (!validation.evidencePath.trim()) {
    throw new Error('Evidence path is required before confirming');
  }

  validation.status = 'confirmed';
  validation.timestamp = timestamp;
  validation.operatorInitials = operatorInitials.toUpperCase();
  if (accuracy) {
    validation.accuracy = accuracy;
  }

  state.confirmedCount = calculateConfirmedCount(state.validations);
  state.updatedAt = new Date().toISOString();

  await saveState(state);
  return state;
}

export async function resetValidation(
  scenarioName: PortalValidationScenarioName
): Promise<PortalValidationState> {
  const state = await loadState();
  const validation = state.validations.find((v) => v.scenarioName === scenarioName);

  if (!validation) {
    throw new Error(`Validation not found: ${scenarioName}`);
  }

  validation.status = 'awaiting';
  validation.evidenceCaptured = false;
  validation.timestamp = new Date().toISOString();
  validation.operatorInitials = '';
  validation.evidencePath = '';
  validation.notes = '';

  state.confirmedCount = calculateConfirmedCount(state.validations);
  state.updatedAt = new Date().toISOString();

  await saveState(state);
  return state;
}

export async function resetAllValidations(): Promise<PortalValidationState> {
  const state = getDefaultState();
  await saveState(state);
  return state;
}
