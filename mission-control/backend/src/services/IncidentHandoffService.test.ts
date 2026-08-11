import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acknowledgeIncident, getIncidents, parseActionGroupWebhook, resetIncidentState, submitIncident } from './IncidentHandoffService.js';

test('deduplicates repeated incidents and tracks acknowledgement state', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'incident-handoff-'));
  process.env['INCIDENT_HANDOFF_STATE_PATH'] = join(tempDir, 'incident-handoffs.json');

  try {
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
  } finally {
    delete process.env['INCIDENT_HANDOFF_STATE_PATH'];
    await rm(tempDir, { recursive: true, force: true });
  }
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

await resetIncidentState();
