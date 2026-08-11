import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRehearsalGateStatus, formatPhaseLabel } from './rehearsalWorkflow.js';

test('evaluateRehearsalGateStatus blocks customer-ready evidence when redactions are present', () => {
  const status = evaluateRehearsalGateStatus({
    complete: true,
    evidencePath: 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png',
    manifestPath: 'docs/evidence/wave1-live/oom-killed/manifest.json',
    redactionFindings: ['tenant-id'],
  });

  assert.equal(status, 'REDACTION_BLOCKED');
});

test('evaluateRehearsalGateStatus returns pass once evidence is complete and redaction-free', () => {
  const status = evaluateRehearsalGateStatus({
    complete: true,
    evidencePath: 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png',
    manifestPath: 'docs/evidence/wave1-live/oom-killed/manifest.json',
    redactionFindings: [],
  });

  assert.equal(status, 'PASS');
});

test('formatPhaseLabel renders phase names for the UI', () => {
  assert.equal(formatPhaseLabel('recovery_verification'), 'recovery verification');
});
