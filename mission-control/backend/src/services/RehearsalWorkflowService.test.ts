import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
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

test('concurrent advances and evidence updates preserve both mutations', async () => {
  await withTempState(async () => {
    await createRehearsalRun({ scenarioName: 'OOMKilled' });
    const [advanced, evidenceUpdated] = await Promise.all([
      advanceRehearsalRun('OOMKilled', { notes: 'phase update' }),
      updateRehearsalEvidence({
        scenarioName: 'OOMKilled',
        evidencePath: 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png',
        manifestPath: 'docs/evidence/wave1-live/oom-killed/manifest.json',
        attachmentChecksums: [{ path: 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png', checksum: 'placeholder' }],
        complete: true,
        notes: 'evidence update',
      }),
    ]);
    assert.equal(advanced.phase, 'baseline');
    assert.equal(evidenceUpdated.phase, 'baseline');
    assert.equal(evidenceUpdated.evidencePackage.evidencePath, 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png');
    assert.equal(evidenceUpdated.evidencePackage.attachmentChecksums[0]?.checksum, 'placeholder');
  });
});

test('advance and resume reject interrupted, reset, and completed runs', async () => {
  await withTempState(async () => {
    await createRehearsalRun({ scenarioName: 'ServiceMismatch' });
    await interruptRehearsalRun({ scenarioName: 'ServiceMismatch', reason: 'Pause for operator review' });
    await assert.rejects(() => advanceRehearsalRun('ServiceMismatch'), /interrupted/i);

    await resumeRehearsalRun({ scenarioName: 'ServiceMismatch' });
    await resetRehearsalRun('ServiceMismatch');
    await assert.rejects(() => advanceRehearsalRun('ServiceMismatch'), /reset/i);
    await assert.rejects(() => resumeRehearsalRun({ scenarioName: 'ServiceMismatch' }), /interrupted/i);

    let completedRun = await createRehearsalRun({ scenarioName: 'OOMKilled' });
    for (let index = 0; index < 9; index += 1) {
      completedRun = await advanceRehearsalRun('OOMKilled');
    }
    assert.equal(completedRun.status, 'completed');
    await assert.rejects(() => advanceRehearsalRun('OOMKilled'), /already complete/i);
    await assert.rejects(() => resumeRehearsalRun({ scenarioName: 'OOMKilled' }), /interrupted/i);
  });
});

test('evidence paths resolve from the configured repository root when cwd changes', async () => {
  await withTempState(async (stateDir) => {
    const repositoryRoot = join(stateDir, 'repo');
    const nestedDir = join(repositoryRoot, 'nested');
    await mkdir(nestedDir, { recursive: true });
    const previousCwd = process.cwd();
    process.env['REHEARSAL_REPOSITORY_ROOT'] = repositoryRoot;
    process.chdir(nestedDir);
    try {
      await createRehearsalRun({ scenarioName: 'OOMKilled' });
      await updateRehearsalEvidence({
        scenarioName: 'OOMKilled',
        evidencePath: 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png',
        manifestPath: 'docs/evidence/wave1-live/oom-killed/manifest.json',
        complete: true,
      });
      assert.ok(existsSync(join(repositoryRoot, 'docs/evidence/wave1-live/oom-killed/sre-agent/portal.png')));
    } finally {
      process.chdir(previousCwd);
      delete process.env['REHEARSAL_REPOSITORY_ROOT'];
    }
  });
});

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
