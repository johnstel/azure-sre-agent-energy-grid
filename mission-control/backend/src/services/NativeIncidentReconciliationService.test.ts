import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REINVESTIGATION_COOLDOWN_HOURS,
  latestSnapshotPerIncident,
  parseIncidentActivitySnapshotRows,
  reconcileNativeIncidentEvidence,
  selectRowsForCorrelation,
} from './NativeIncidentReconciliationService.js';

function snapshotRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: '2026-01-01T00:00:00Z',
    IncidentId: 'INC-1',
    IncidentTitle: 'Meter service memory pressure',
    IncidentStatus: 'active',
    IncidentMitigatedByAgent: 'False',
    IncidentAssistedByAgent: 'True',
    AgentAutonomyLevel: 'review',
    ResponsePlanId: 'energy-grid-response-plan',
    ResponsePlanCustom: 'True',
    IncidentImpactedService: 'meter-service',
    IncidentCreatedOn: '2026-01-01T00:00:00Z',
    IncidentHandledOn: '2026-01-01T00:01:00Z',
    ThreadId: 'thread-1',
    CorrelationId: 'corr-1',
    ...overrides,
  };
}

test('missing path: no rows and no local fallback reports evidence-unavailable, never fabricated', () => {
  const evidence = reconcileNativeIncidentEvidence([], { hasLocalFallback: false });
  assert.equal(evidence.state, 'evidence-unavailable');
  assert.equal(evidence.incidentId, undefined);
  assert.equal(evidence.schemaMismatch, false);
});

test('fallback path: no native rows but a local Action Group card exists reports local-fallback-only', () => {
  const evidence = reconcileNativeIncidentEvidence([], { hasLocalFallback: true });
  assert.equal(evidence.state, 'local-fallback-only');
  assert.ok(evidence.limitations.some(limitation => limitation.includes('Action Group webhook handoff')));
});

test('schema path: a schema mismatch is reported distinctly and does not fabricate state', () => {
  const evidence = reconcileNativeIncidentEvidence([snapshotRow()], { hasLocalFallback: true, schemaMismatch: true });
  assert.equal(evidence.state, 'evidence-unavailable');
  assert.equal(evidence.schemaMismatch, true);
  assert.equal(evidence.incidentId, undefined, 'rows must be ignored entirely once a schema mismatch is flagged');
});

test('missing-fields path: rows without IncidentId or timestamp are dropped, not guessed', () => {
  const rows = [
    { IncidentId: 'INC-2' }, // missing timestamp
    { timestamp: '2026-01-01T00:00:00Z' }, // missing IncidentId
    snapshotRow({ IncidentId: 'INC-3' }),
  ];
  const parsed = parseIncidentActivitySnapshotRows(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.incidentId, 'INC-3');
});

test('duplicate path: repeated snapshots for the same IncidentId dedupe to the latest by timestamp', () => {
  const rows = [
    snapshotRow({ IncidentStatus: 'active', timestamp: '2026-01-01T00:00:00Z' }),
    snapshotRow({ IncidentStatus: 'mitigated', IncidentMitigatedByAgent: 'True', timestamp: '2026-01-01T00:05:00Z' }),
  ];
  const deduped = latestSnapshotPerIncident(parseIncidentActivitySnapshotRows(rows));
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.incidentStatus, 'mitigated');
  assert.equal(deduped[0]?.incidentMitigatedByAgent, true);

  const evidence = reconcileNativeIncidentEvidence(rows, { hasLocalFallback: true, now: new Date('2026-01-01T00:06:00Z') });
  assert.equal(evidence.state, 'native-mitigated');
  assert.equal(evidence.incidentId, 'INC-1');
});

test('stale path: evidence older than the freshness threshold is flagged stale but still returned', () => {
  const now = new Date('2026-01-01T02:00:00Z'); // 2 hours after the snapshot's timestamp
  const evidence = reconcileNativeIncidentEvidence([snapshotRow()], { hasLocalFallback: true, now, staleMinutes: 30 });
  assert.equal(evidence.stale, true);
  assert.equal(evidence.state, 'native-approval-required');
  assert.ok(evidence.limitations.some(limitation => limitation.includes('stale')));
});

test('fresh path: evidence within the freshness threshold is not flagged stale', () => {
  const now = new Date('2026-01-01T00:05:00Z');
  const evidence = reconcileNativeIncidentEvidence([snapshotRow()], { hasLocalFallback: true, now, staleMinutes: 30 });
  assert.equal(evidence.stale, false);
});

test('review autonomy without a mitigation or approval decision reports native-approval-required', () => {
  const evidence = reconcileNativeIncidentEvidence([snapshotRow()], {
    hasLocalFallback: true,
    now: new Date('2026-01-01T00:02:00Z'),
  });
  assert.equal(evidence.state, 'native-approval-required');
  assert.equal(evidence.approvalDecision, 'pending');
});

test('an observed ApprovalDecision event moves autonomy-review incidents out of native-approval-required', () => {
  const evidence = reconcileNativeIncidentEvidence([snapshotRow()], {
    hasLocalFallback: true,
    now: new Date('2026-01-01T00:02:00Z'),
    approvalRows: [{ timestamp: '2026-01-01T00:01:30Z', ThreadId: 'thread-1' }],
  });
  assert.equal(evidence.state, 'native-observed');
  assert.equal(evidence.approvalDecision, 'unknown');
});

test('mitigated incidents report native-mitigated regardless of autonomy level', () => {
  const evidence = reconcileNativeIncidentEvidence(
    [snapshotRow({ IncidentMitigatedByAgent: 'True', IncidentMitigatedOn: '2026-01-01T00:10:00Z' })],
    { hasLocalFallback: true, now: new Date('2026-01-01T00:11:00Z') },
  );
  assert.equal(evidence.state, 'native-mitigated');
  assert.equal(evidence.mitigatedByAgent, true);
});

test('cooldown window defaults to the documented 3 hours and is computed from handled/mitigated timestamps', () => {
  assert.equal(DEFAULT_REINVESTIGATION_COOLDOWN_HOURS, 3);

  const withinCooldown = reconcileNativeIncidentEvidence(
    [snapshotRow({ IncidentMitigatedByAgent: 'True', IncidentMitigatedOn: '2026-01-01T00:10:00Z' })],
    { hasLocalFallback: true, now: new Date('2026-01-01T01:00:00Z') },
  );
  assert.equal(withinCooldown.withinCooldown, true);

  const outsideCooldown = reconcileNativeIncidentEvidence(
    [snapshotRow({ IncidentMitigatedByAgent: 'True', IncidentMitigatedOn: '2026-01-01T00:10:00Z' })],
    { hasLocalFallback: true, now: new Date('2026-01-01T04:00:00Z') },
  );
  assert.equal(outsideCooldown.withinCooldown, false);
});

test('never fabricates identifiers: fields absent from the source row stay undefined', () => {
  const evidence = reconcileNativeIncidentEvidence(
    [{ timestamp: '2026-01-01T00:00:00Z', IncidentId: 'INC-9' }],
    { hasLocalFallback: true, now: new Date('2026-01-01T00:01:00Z') },
  );
  assert.equal(evidence.incidentId, 'INC-9');
  assert.equal(evidence.threadId, undefined);
  assert.equal(evidence.responsePlanId, undefined);
});

test('malformed-timestamp path: an unparsable timestamp is dropped, never substituted with "now"', () => {
  const rows = [
    snapshotRow({ IncidentMitigatedByAgent: 'True', timestamp: 'not-a-real-date' }),
  ];
  const parsed = parseIncidentActivitySnapshotRows(rows);
  assert.equal(parsed.length, 0, 'a row with an unparsable timestamp must be dropped, not defaulted to now');

  const evidence = reconcileNativeIncidentEvidence(rows, { hasLocalFallback: true, now: new Date('2026-01-01T00:05:00Z') });
  assert.equal(evidence.state, 'local-fallback-only');
  assert.equal(evidence.incidentId, undefined, 'must not fabricate mitigation/freshness from a garbage timestamp');
});

test('ambiguous path: multiple distinct incidents matched by the impactedService heuristic are not auto-correlated', () => {
  const rows = [
    snapshotRow({ IncidentId: 'INC-A', timestamp: '2026-01-01T00:00:00Z' }),
    snapshotRow({ IncidentId: 'INC-B', timestamp: '2026-01-01T00:05:00Z', IncidentMitigatedByAgent: 'True' }),
  ];

  const withoutStrongCorrelation = reconcileNativeIncidentEvidence(rows, {
    hasLocalFallback: true,
    now: new Date('2026-01-01T00:06:00Z'),
    strongCorrelation: false,
  });
  assert.equal(withoutStrongCorrelation.state, 'local-fallback-only');
  assert.equal(withoutStrongCorrelation.incidentId, undefined, 'must not silently pick the newest of several ambiguous matches');
  assert.ok(withoutStrongCorrelation.limitations.some(limitation => limitation.includes('ambiguous')));
});

test('strong correlation permits multiple rows (e.g. a wide time window) to resolve to the freshest', () => {
  const rows = [
    snapshotRow({ IncidentId: 'INC-A', timestamp: '2026-01-01T00:00:00Z' }),
    snapshotRow({ IncidentId: 'INC-A', timestamp: '2026-01-01T00:05:00Z', IncidentMitigatedByAgent: 'True' }),
  ];
  // Same IncidentId across both rows -- latestSnapshotPerIncident already collapses this to one
  // candidate, so strongCorrelation is not even required for a single-incident dedup case.
  const evidence = reconcileNativeIncidentEvidence(rows, {
    hasLocalFallback: true,
    now: new Date('2026-01-01T00:06:00Z'),
    strongCorrelation: false,
  });
  assert.equal(evidence.state, 'native-mitigated');
  assert.equal(evidence.incidentId, 'INC-A');
});

test('rows observed but none usable are distinguished from zero rows observed (possible schema drift signal)', () => {
  const evidence = reconcileNativeIncidentEvidence(
    [{ timestamp: '2026-01-01T00:00:00Z' }, { IncidentId: 'INC-1' }],
    { hasLocalFallback: false, now: new Date('2026-01-01T00:01:00Z') },
  );
  assert.equal(evidence.state, 'evidence-unavailable');
  assert.ok(evidence.limitations.some(limitation => limitation.includes('schema drift')));
});

test('selectRowsForCorrelation: an explicit incidentId is always a strong, precise correlation', () => {
  const rows = [snapshotRow({ IncidentId: 'INC-1' }), snapshotRow({ IncidentId: 'INC-2' })];
  const selection = selectRowsForCorrelation(rows, { hasExplicitIncidentId: true });
  assert.equal(selection.strongCorrelation, true);
  assert.deepEqual(selection.rows, rows);
});

test('selectRowsForCorrelation: a known threadId that matches narrows to that thread and is strong', () => {
  const rows = [
    snapshotRow({ IncidentId: 'INC-1', ThreadId: 'thread-1' }),
    snapshotRow({ IncidentId: 'INC-2', ThreadId: 'thread-2' }),
  ];
  const selection = selectRowsForCorrelation(rows, { knownThreadId: 'thread-1', hasExplicitIncidentId: false });
  assert.equal(selection.strongCorrelation, true);
  assert.equal(selection.rows.length, 1);
  assert.equal(selection.rows[0]?.IncidentId, 'INC-1');
});

test('selectRowsForCorrelation: a known threadId that matches nothing never falls back to the full row set', () => {
  const rows = [
    snapshotRow({ IncidentId: 'INC-1', ThreadId: 'thread-1' }),
    snapshotRow({ IncidentId: 'INC-2', ThreadId: 'thread-2' }),
  ];
  const selection = selectRowsForCorrelation(rows, { knownThreadId: 'thread-does-not-exist', hasExplicitIncidentId: false });
  assert.equal(selection.rows.length, 0, 'must not silently broaden to unrelated incidents when the known thread is not found');
  assert.equal(selection.strongCorrelation, false);
});

test('selectRowsForCorrelation: no incidentId or threadId leaves correlation weak (heuristic only)', () => {
  const rows = [snapshotRow({ IncidentId: 'INC-1' })];
  const selection = selectRowsForCorrelation(rows, { hasExplicitIncidentId: false });
  assert.equal(selection.strongCorrelation, false);
  assert.deepEqual(selection.rows, rows);
});
