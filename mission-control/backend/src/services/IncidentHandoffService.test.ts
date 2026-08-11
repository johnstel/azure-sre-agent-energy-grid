import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acknowledgeIncident, getIncidents, parseActionGroupWebhook, resolveIncident, submitIncident } from './IncidentHandoffService.js';

async function withTempIncidentState<T>(operation: (statePath: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), 'incident-handoff-'));
  process.env['INCIDENT_HANDOFF_STATE_PATH'] = join(tempDir, 'incident-handoffs.json');

  try {
    return await operation(join(tempDir, 'incident-handoffs.json'));
  } finally {
    delete process.env['INCIDENT_HANDOFF_STATE_PATH'];
    await rm(tempDir, { recursive: true, force: true });
  }
}

test('deduplicates repeated incidents and tracks acknowledgement state', async () => {
  await withTempIncidentState(async () => {
    const first = await submitIncident({
      title: 'OOMKilled in meter-service',
      summary: 'The meter-service pod restarted after exhausting memory.',
      severity: 'critical',
      source: 'dashboard',
      scenarioName: 'oom-killed',
      evidence: ['Grafana panel: memory pressure'],
      operatorGuidance: ['Confirm the scenario before remediation.'],
    });
    assert.equal(first.deduped, false);

    const duplicate = await submitIncident({
      title: 'OOMKilled in meter-service',
      summary: 'The meter-service pod restarted after exhausting memory.',
      severity: 'critical',
      source: 'dashboard',
      scenarioName: 'oom-killed',
      evidence: ['Grafana panel: memory pressure'],
      operatorGuidance: ['Confirm the scenario before remediation.'],
    });
    assert.equal(duplicate.deduped, true);

    const incidents = await getIncidents();
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].status, 'open');

    const acknowledged = await acknowledgeIncident(incidents[0].id);
    assert.equal(acknowledged?.status, 'acknowledged');
  });
});

test('serializes concurrent incident mutations without losing updates', async () => {
  await withTempIncidentState(async () => {
    const first = await submitIncident({
      title: 'Concurrent update',
      summary: 'Initial submission',
      severity: 'warning',
      source: 'dashboard',
      scenarioName: 'oom-killed',
      evidence: ['Initial evidence'],
      operatorGuidance: ['Review the timeline.'],
    });

    const second = await submitIncident({
      title: 'Concurrent update',
      summary: 'Updated submission',
      severity: 'critical',
      source: 'dashboard',
      scenarioName: 'oom-killed',
      evidence: ['Updated evidence'],
      operatorGuidance: ['Confirm next steps.'],
    });

    const [acknowledged, resolved] = await Promise.all([
      acknowledgeIncident(first.incident.id),
      resolveIncident(second.incident.id),
    ]);

    const incidents = await getIncidents();
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].status, 'resolved');
    assert.equal(acknowledged?.status, 'acknowledged');
    assert.equal(resolved?.status, 'resolved');
    assert.ok(incidents[0].evidence.includes('Initial evidence'));
    assert.ok(incidents[0].evidence.includes('Updated evidence'));
  });
});

test('parses action-group payloads into operator-friendly incident handoffs', async () => {
  const payload = {
    data: {
      essentials: {
        alertRule: 'meter-service-memory-pressure',
        severity: 'Sev1',
        monitorCondition: 'Fired',
        firedDateTime: '2025-08-11T12:00:00Z',
      },
      alertContext: {
        monitoringService: 'Azure Monitor',
      },
    },
  };

  const parsed = parseActionGroupWebhook(payload);
  const evidence = parsed.evidence ?? [];
  assert.equal(parsed.source, 'action-group');
  assert.equal(parsed.severity, 'critical');
  assert.ok(evidence.some(entry => entry.includes('meter-service-memory-pressure')));
});
