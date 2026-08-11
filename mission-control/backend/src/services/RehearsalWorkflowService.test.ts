import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  advanceRehearsalRun,
  createRehearsalRun,
  interruptRehearsalRun,
  resetRehearsalRun,
  resumeRehearsalRun,
  updateRehearsalEvidence,
} from './RehearsalWorkflowService.js';

async function withTempState<T>(operation: (stateDir: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), 'rehearsal-workflow-'));
  const statePath = join(tempDir, 'rehearsal-runs.json');
  process.env['REHEARSAL_STATE_PATH'] = statePath;
  process.env['INCIDENT_HANDOFF_STATE_PATH'] = join(tempDir, 'incident-handoffs.json');
  try {
    return await operation(tempDir);
  } finally {
    delete process.env['REHEARSAL_STATE_PATH'];
    delete process.env['INCIDENT_HANDOFF_STATE_PATH'];
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('OOMKilled advances through the rehearsal phases and completes evidence packaging', async () => {
  await withTempState(async () => {
    const run = await createRehearsalRun({ scenarioName: 'OOMKilled' });
    assert.equal(run.phase, 'preflight');
    assert.ok(run.timestamps.t0);

    const baseline = await advanceRehearsalRun('OOMKilled', { notes: 'Baseline captured' });
    assert.equal(baseline.phase, 'baseline');
    assert.ok(baseline.timestamps.t1);

    const injection = await advanceRehearsalRun('OOMKilled');
    assert.equal(injection.phase, 'injection');
    const detection = await advanceRehearsalRun('OOMKilled');
    assert.equal(detection.phase, 'detection');
    assert.ok(detection.timestamps.t3);

    const promptGate = await advanceRehearsalRun('OOMKilled');
    assert.equal(promptGate.phase, 'prompt_gate');
    const diagnosisGate = await advanceRehearsalRun('OOMKilled');
    assert.equal(diagnosisGate.phase, 'diagnosis_gate');
    assert.ok(diagnosisGate.timestamps.t4);

    const restore = await advanceRehearsalRun('OOMKilled');
    assert.equal(restore.phase, 'restore');
    const recovery = await advanceRehearsalRun('OOMKilled');
    assert.equal(recovery.phase, 'recovery_verification');
    const evidencePackage = await advanceRehearsalRun('OOMKilled');
    assert.equal(evidencePackage.phase, 'evidence_package');
    assert.ok(evidencePackage.timestamps.t5);

    const completed = await updateRehearsalEvidence({
      scenarioName: 'OOMKilled',
      evidencePath: 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png',
      manifestPath: 'docs/evidence/wave1-live/oom-killed/manifest.json',
      complete: true,
      notes: 'Portal evidence archived locally.',
    });
    assert.equal(completed.gateStatus, 'PASS');
    assert.equal(completed.customerReady, true);
    assert.ok(completed.evidencePackage.complete);
  });
});

test('MongoDBDown records redaction findings and blocks customer-ready status', async () => {
  await withTempState(async () => {
    await createRehearsalRun({ scenarioName: 'MongoDBDown' });
    const updated = await updateRehearsalEvidence({
      scenarioName: 'MongoDBDown',
      evidencePath: 'docs/evidence/wave2-live/mongodb-down/sre-agent/tenant-id.png',
      manifestPath: 'docs/evidence/wave2-live/mongodb-down/manifest.json',
      notes: 'Captured tenant ID in the screenshot.',
      complete: true,
    });
    assert.equal(updated.gateStatus, 'REDACTION_BLOCKED');
    assert.equal(updated.customerReady, false);
    assert.ok(updated.evidencePackage.redactionFindings.includes('tenant-id'));
  });
});

test('ServiceMismatch supports interruption, resume, and reset while keeping portal semantics', async () => {
  await withTempState(async () => {
    await createRehearsalRun({ scenarioName: 'ServiceMismatch' });
    const interrupted = await interruptRehearsalRun({ scenarioName: 'ServiceMismatch', reason: 'Need to pause for operator review' });
    assert.equal(interrupted.status, 'interrupted');

    const resumed = await resumeRehearsalRun({ scenarioName: 'ServiceMismatch' });
    assert.equal(resumed.status, 'in_progress');

    const reset = await resetRehearsalRun('ServiceMismatch');
    assert.equal(reset.status, 'reset');
    assert.equal(reset.phase, 'preflight');
    assert.equal(reset.gateStatus, 'PASS_WITH_PENDING_HUMAN_PORTAL');
  });
});
