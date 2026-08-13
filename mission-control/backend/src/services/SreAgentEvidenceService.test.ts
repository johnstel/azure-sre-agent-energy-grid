import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SreAgentEvidenceQueryError,
  SreAgentEvidenceService,
  buildSreAgentEvidenceKql,
  configuredSreAgentWorkspaceId,
  mapSreAgentQueryRows,
  normalizeSreAgentEvidenceRequest,
  normalizeSreAgentMonitorError,
} from './SreAgentEvidenceService.js';
import { KubeInputError } from './KubeClient.js';
import { buildSreAgentEvidenceErrorResponse } from '../routes/analyst.js';

test('SRE Agent evidence rejects unknown templates and disallowed parameters', () => {
  assert.throws(() => normalizeSreAgentEvidenceRequest('freeform', {}), KubeInputError);
  assert.throws(() => normalizeSreAgentEvidenceRequest('incident-activity-snapshot', { kql: 'customEvents | take 1' }), KubeInputError);
  assert.throws(() => normalizeSreAgentEvidenceRequest('incident-thread-timeline', {}), KubeInputError, 'incident-thread-timeline requires threadId');
  assert.throws(() => normalizeSreAgentEvidenceRequest('incident-activity-snapshot', { incidentId: 'DROP TABLE;' }), KubeInputError);
});

test('SRE Agent evidence validates bounded template parameters', () => {
  const request = normalizeSreAgentEvidenceRequest('incident-thread-timeline', { threadId: 'thread-42', minutes: '120', limit: '10' });
  assert.equal(request.templateName, 'incident-thread-timeline');
  assert.equal(request.threadId, 'thread-42');
  assert.equal(request.minutes, 120);
  assert.equal(request.limit, 10);
});

test('SRE Agent evidence KQL uses documented event names for every template', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-01T01:00:00Z');

  const snapshot = normalizeSreAgentEvidenceRequest('incident-activity-snapshot', { incidentId: 'INC-1' });
  const snapshotKql = buildSreAgentEvidenceKql(snapshot, from, to);
  assert.match(snapshotKql, /customEvents/);
  assert.match(snapshotKql, /IncidentActivitySnapshot/);
  assert.match(snapshotKql, /IncidentMitigatedByAgent/);
  assert.match(snapshotKql, /tostring\(customDimensions\.IncidentId\) == "INC-1"/);

  const toolExecution = normalizeSreAgentEvidenceRequest('agent-tool-execution', { threadId: 'thread-1' });
  assert.match(buildSreAgentEvidenceKql(toolExecution, from, to), /AgentToolExecution/);

  const execution = normalizeSreAgentEvidenceRequest('agent-execution-lifecycle', {});
  assert.match(buildSreAgentEvidenceKql(execution, from, to), /AgentExecution/);

  const approvals = normalizeSreAgentEvidenceRequest('approval-decisions', {});
  assert.match(buildSreAgentEvidenceKql(approvals, from, to), /ApprovalDecision/);

  const timeline = normalizeSreAgentEvidenceRequest('incident-thread-timeline', { threadId: 'thread-9' });
  const timelineKql = buildSreAgentEvidenceKql(timeline, from, to);
  assert.match(timelineKql, /IncidentActivitySnapshot/);
  assert.match(timelineKql, /AgentExecution/);
  assert.match(timelineKql, /AgentToolExecution/);
  assert.match(timelineKql, /ApprovalDecision/);
  assert.match(timelineKql, /thread-9/);
});

test('SRE Agent evidence maps Azure table JSON into row objects', () => {
  const rows = mapSreAgentQueryRows(JSON.stringify({
    tables: [{
      columns: [{ name: 'timestamp' }, { name: 'IncidentId' }],
      rows: [['2026-01-01T00:00:00Z', 'INC-1']],
    }],
  }));
  assert.deepEqual(rows, [{ timestamp: '2026-01-01T00:00:00Z', IncidentId: 'INC-1' }]);
});

test('SRE Agent evidence invalid JSON maps to a service error', () => {
  assert.throws(() => mapSreAgentQueryRows('not-json'), SreAgentEvidenceQueryError);
});

test('SRE Agent evidence detects schema mismatch distinctly from generic failure/timeout', () => {
  const timeout = normalizeSreAgentMonitorError(new Error('Command timed out after 15000ms'));
  assert.equal(timeout.statusCode, 504);
  assert.equal(timeout.schemaMismatch, false);

  const schemaMismatch = normalizeSreAgentMonitorError(
    Object.assign(new Error('az failed'), { stderr: "SemanticError: 'customEvents' has no column named 'IncidentId2'" }),
  );
  assert.equal(schemaMismatch.schemaMismatch, true);
  assert.match(schemaMismatch.message, /schema validation/);

  const genericFailure = normalizeSreAgentMonitorError(Object.assign(new Error('az failed'), { stderr: 'ClientAuthenticationError: token expired' }));
  assert.equal(genericFailure.schemaMismatch, false);
});

test('SRE Agent evidence service executes, redacts rows, and reports low confidence on zero rows', async () => {
  const originalWorkspace = process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID;
  process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID = '/subscriptions/000/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/configured-demo';

  try {
    const serviceWithRows = new SreAgentEvidenceService(async () => ({
      stderr: '',
      stdout: JSON.stringify([{ IncidentId: 'INC-1', ResponsePlanId: 'plan-1', ToolInput: 'token=abc123' }]),
    }));
    const response = await serviceWithRows.execute('incident-activity-snapshot', {});
    assert.equal(configuredSreAgentWorkspaceId(), process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID);
    assert.equal(response.rowCount, 1);
    assert.equal(response.metadata.confidence, 'medium');
    assert.equal(response.rows[0]?.ToolInput, 'token=[REDACTED]');

    const serviceWithNoRows = new SreAgentEvidenceService(async () => ({ stderr: '', stdout: '[]' }));
    const emptyResponse = await serviceWithNoRows.execute('incident-activity-snapshot', {});
    assert.equal(emptyResponse.rowCount, 0);
    assert.equal(emptyResponse.metadata.confidence, 'low');
    assert.ok(emptyResponse.metadata.limitations.some(limitation => limitation.includes('unknown/pending evidence')));
  } finally {
    if (originalWorkspace === undefined) {
      delete process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID;
    } else {
      process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID = originalWorkspace;
    }
  }
});

test('SRE Agent evidence surfaces SCHEMA_TBD limitations for AgentExecution and ApprovalDecision', async () => {
  const originalWorkspace = process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID;
  process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID = '/subscriptions/000/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/configured-demo';

  try {
    const service = new SreAgentEvidenceService(async () => ({ stderr: '', stdout: '[]' }));
    const execution = await service.execute('agent-execution-lifecycle', {});
    assert.ok(execution.metadata.limitations.some(limitation => limitation.includes('SCHEMA_TBD')));

    const approvals = await service.execute('approval-decisions', {});
    assert.ok(approvals.metadata.limitations.some(limitation => limitation.includes('SCHEMA_TBD')));
  } finally {
    if (originalWorkspace === undefined) {
      delete process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID;
    } else {
      process.env.SRE_AGENT_LOG_ANALYTICS_WORKSPACE_ID = originalWorkspace;
    }
  }
});

test('SRE Agent evidence denied/unavailable error responses keep honest, empty evidence metadata', () => {
  const denied = buildSreAgentEvidenceErrorResponse(
    'freeform',
    {},
    'SRE Agent evidence template \'freeform\' is not allowlisted.',
    'denied',
  );
  assert.equal(denied.status, 'denied');
  assert.equal(denied.rowCount, 0);
  assert.deepEqual(denied.rows, []);
  assert.equal(denied.metadata.confidence, 'none');

  const unavailable = buildSreAgentEvidenceErrorResponse(
    'incident-activity-snapshot',
    { minutes: '30' },
    'Azure SRE Agent evidence query timed out.',
    'unavailable',
  );
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.timeRange.minutes, 30);
  assert.equal(unavailable.rowCount, 0);

  const schemaMismatch = buildSreAgentEvidenceErrorResponse(
    'incident-activity-snapshot',
    {},
    'Azure SRE Agent evidence query failed schema validation.',
    'unavailable',
    true,
  );
  assert.equal(schemaMismatch.metadata.schemaMismatch, true);
  assert.ok(schemaMismatch.metadata.limitations.some(limitation => limitation.includes('telemetry schema')));
});

// ---------------------------------------------------------------------------
// agent-tool-execution incidentId filtering (issue #80 review blocker 2)
// ---------------------------------------------------------------------------

test('agent-tool-execution filters by incidentId, threadId, or both', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-01T01:00:00Z');

  // Incident-only: the primary Mission Control path can have an incidentId without a threadId.
  // Without this filter the query degrades to a workspace-wide top-N whose `take` can silently
  // drop this incident's tool rows.
  const incidentOnly = normalizeSreAgentEvidenceRequest('agent-tool-execution', { incidentId: 'INC-42' });
  const incidentOnlyKql = buildSreAgentEvidenceKql(incidentOnly, from, to);
  assert.match(incidentOnlyKql, /tostring\(customDimensions\.IncidentId\) == "INC-42"/);
  assert.doesNotMatch(incidentOnlyKql, /customDimensions\.ThreadId\) ==/);

  const threadOnly = normalizeSreAgentEvidenceRequest('agent-tool-execution', { threadId: 'thread-1' });
  const threadOnlyKql = buildSreAgentEvidenceKql(threadOnly, from, to);
  assert.match(threadOnlyKql, /tostring\(customDimensions\.ThreadId\) == "thread-1"/);
  assert.doesNotMatch(threadOnlyKql, /customDimensions\.IncidentId\) ==/);

  const both = normalizeSreAgentEvidenceRequest('agent-tool-execution', { threadId: 'thread-1', incidentId: 'INC-42' });
  const bothKql = buildSreAgentEvidenceKql(both, from, to);
  assert.match(bothKql, /tostring\(customDimensions\.ThreadId\) == "thread-1"/);
  assert.match(bothKql, /tostring\(customDimensions\.IncidentId\) == "INC-42"/);

  // The row projection must expose IncidentId so post-query correlation can compare it exactly.
  assert.match(bothKql, /IncidentId = tostring\(customDimensions\.IncidentId\)/);
});

test('agent-tool-execution accepts incidentId as an allowed parameter', () => {
  assert.doesNotThrow(() => normalizeSreAgentEvidenceRequest('agent-tool-execution', { incidentId: 'INC-42' }));
  // Unrelated parameters remain rejected.
  assert.throws(
    () => normalizeSreAgentEvidenceRequest('agent-tool-execution', { impactedService: 'mongodb' }),
    KubeInputError,
  );
});
