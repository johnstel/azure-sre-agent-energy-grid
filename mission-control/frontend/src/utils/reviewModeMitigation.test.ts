/**
 * Frontend/backend union parity and presentation tests for the Review-mode mitigation lifecycle
 * (issue #80).
 *
 * The parity test reads the backend and frontend source files directly. If a backend state is added
 * without a matching frontend union member and label, this test fails -- which is what stops an
 * unhandled lifecycle state from silently rendering as a default badge.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  PROBE_LABELS,
  REVIEW_MODE_MITIGATION_STATES,
  buildMitigationEvidenceRequest,
  correlationRows,
  describeMitigationState,
  describeMutation,
  describeProbeStatus,
  describeRunMode,
  formatFreshness,
  hasObservedMitigationCorrelation,
  requiresLoudBanner,
} from './reviewModeMitigation.js';
import type { ReviewModeMitigationEvidence, ReviewModeMitigationState } from '../types/api';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_LIFECYCLE = resolve(HERE, '../../../backend/src/services/sre-agent/mitigationLifecycle.ts');
const FRONTEND_TYPES = resolve(HERE, '../types/api.ts');

/** Extracts the string-literal members of a named exported union from TypeScript source. */
function extractUnion(source: string, typeName: string): string[] {
  const pattern = new RegExp(`export type ${typeName}\\s*=([\\s\\S]*?);`, 'm');
  const match = pattern.exec(source);
  assert.ok(match, `could not find 'export type ${typeName}' in source`);
  return [...match![1]!.matchAll(/'([^']+)'/g)].map(item => item[1]!);
}

test('backend and frontend ReviewModeMitigationState unions are identical', () => {
  const backend = extractUnion(readFileSync(BACKEND_LIFECYCLE, 'utf8'), 'ReviewModeMitigationState');
  const frontend = extractUnion(readFileSync(FRONTEND_TYPES, 'utf8'), 'ReviewModeMitigationState');

  assert.ok(backend.length >= 14, `expected the backend union to be non-trivial, got ${backend.length}`);
  assert.deepEqual(
    [...frontend].sort(),
    [...backend].sort(),
    'frontend ReviewModeMitigationState drifted from the backend union',
  );
});

test('every backend state has an explicit presentation with no default fallthrough', () => {
  const backend = extractUnion(readFileSync(BACKEND_LIFECYCLE, 'utf8'), 'ReviewModeMitigationState');

  assert.deepEqual(
    [...REVIEW_MODE_MITIGATION_STATES].sort(),
    [...backend].sort(),
    'REVIEW_MODE_MITIGATION_STATES drifted from the backend union',
  );

  for (const state of backend as ReviewModeMitigationState[]) {
    const presentation = describeMitigationState(state);
    assert.ok(presentation.label.length > 0, `${state} has no label`);
    assert.ok(presentation.meaning.length > 0, `${state} has no operator meaning`);
    assert.ok(['neutral', 'pending', 'success', 'warning', 'danger'].includes(presentation.tone), `${state} has an invalid tone`);
  }
});

test('describeMitigationState throws instead of guessing for an unknown state', () => {
  assert.throws(
    () => describeMitigationState('totally-new-state' as ReviewModeMitigationState),
    /Unhandled Review-mode mitigation state/,
  );
});

test('only verification-passed is presented as success', () => {
  const successStates = REVIEW_MODE_MITIGATION_STATES.filter(state => describeMitigationState(state).tone === 'success');
  assert.deepEqual(successStates, ['verification-passed']);
});

test('security-critical states are marked loud', () => {
  for (const state of ['blocked-run-mode', 'deny-violation', 'execution-failed', 'verification-failed', 'denied-with-unverified-state'] as const) {
    assert.equal(describeMitigationState(state).loud, true, `${state} must be loud`);
  }
});

test('run mode presentation blocks anything that is not review', () => {
  assert.equal(describeRunMode('review').tone, 'success');
  assert.equal(describeRunMode('autonomous').loud, true);
  assert.equal(describeRunMode('unknown').loud, true);
});

test('mutation presentation never renders unknown as unchanged', () => {
  assert.equal(describeMutation('unchanged').tone, 'success');
  assert.equal(describeMutation('applied').tone, 'warning');
  assert.equal(describeMutation('unknown').loud, true);
  assert.notEqual(describeMutation('unknown').label, describeMutation('unchanged').label);
});

test('probe statuses other than pass are never presented as success', () => {
  assert.equal(describeProbeStatus('pass').tone, 'success');
  for (const status of ['fail', 'no-data', 'stale', 'error'] as const) {
    assert.notEqual(describeProbeStatus(status).tone, 'success');
    assert.equal(describeProbeStatus(status).loud, true);
  }
});

test('every probe name has a human label', () => {
  const backendProbes = extractUnion(readFileSync(BACKEND_LIFECYCLE, 'utf8'), 'VerificationProbeName');
  assert.deepEqual(Object.keys(PROBE_LABELS).sort(), [...backendProbes].sort());
});

test('freshness never renders an unknown age as a number', () => {
  assert.equal(formatFreshness(undefined), 'unknown');
  assert.equal(formatFreshness(30), '30s ago');
  assert.equal(formatFreshness(120), '2m ago');
  assert.equal(formatFreshness(7200), '2h ago');
});

function evidence(overrides: Partial<ReviewModeMitigationEvidence> = {}): ReviewModeMitigationEvidence {
  return {
    state: 'proposed',
    incidentResolved: false,
    effectiveRunMode: 'review',
    runModeBlocked: false,
    scenario: 'MongoDBDown',
    targetResource: 'energy/mongodb',
    proposedCommand: 'kubectl scale deployment/mongodb -n energy --replicas=1',
    correlation: { threadId: 'thread-1' },
    verification: { probes: [], missingProbes: [], allProbesPassed: false, postDatesExecution: false },
    guidance: {},
    stale: false,
    schemaMismatch: false,
    securityFindings: [],
    rejectedEvidence: [],
    limitations: [],
    ...overrides,
  };
}

test('a loud banner is required for security findings, blocked run mode and schema drift', () => {
  assert.equal(requiresLoudBanner(evidence()), false);
  assert.equal(requiresLoudBanner(evidence({ securityFindings: ['something'] })), true);
  assert.equal(requiresLoudBanner(evidence({ runModeBlocked: true })), true);
  assert.equal(requiresLoudBanner(evidence({ schemaMismatch: true })), true);
  assert.equal(requiresLoudBanner(evidence({ state: 'deny-violation' })), true);
});

test('no-correlation polls still build an empty request so the backend can return ambiguous evidence + guardrails', () => {
  assert.deepEqual(buildMitigationEvidenceRequest({}), {});
  assert.deepEqual(buildMitigationEvidenceRequest({ threadId: ' thread-1 ', incidentId: '  INC-1 ' }), { threadId: 'thread-1', incidentId: 'INC-1' });
  assert.equal(hasObservedMitigationCorrelation({}), false);
  assert.equal(hasObservedMitigationCorrelation({ threadId: 'thread-1' }), true);
});

test('correlation rows only include identifiers that were actually observed', () => {
  assert.deepEqual(correlationRows(evidence()), [{ label: 'ThreadId', value: 'thread-1' }]);
  assert.deepEqual(correlationRows(evidence({ correlation: {} })), []);
  assert.equal(correlationRows(evidence({ correlation: { threadId: 't', correlationId: 'c', incidentId: 'i', traceId: 'r' } })).length, 4);
});
