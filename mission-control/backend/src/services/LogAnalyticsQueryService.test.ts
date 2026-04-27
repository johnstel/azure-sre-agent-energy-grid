import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LogAnalyticsQueryError,
  LogAnalyticsQueryService,
  buildKqlTemplate,
  configuredWorkspaceId,
  mapAzureQueryRows,
  normalizeAzureMonitorError,
  normalizeLogAnalyticsRequest,
} from './LogAnalyticsQueryService.js';
import { KubeInputError } from './KubeClient.js';
import { buildLogAnalyticsErrorResponse } from '../routes/analyst.js';

test('Log Analytics rejects unknown templates and freeform KQL parameters', () => {
  assert.throws(() => normalizeLogAnalyticsRequest('freeform', {}), KubeInputError);
  assert.throws(() => normalizeLogAnalyticsRequest('pod-restarts-lifecycle', { kql: 'ContainerLogV2 | take 1' }), KubeInputError);
  assert.throws(() => normalizeLogAnalyticsRequest('pod-restarts-lifecycle', { workspaceId: '/subscriptions/override' }), KubeInputError);
  assert.throws(() => normalizeLogAnalyticsRequest('service-log-excerpts', { service: 'api; drop', minutes: '30' }), KubeInputError);
  assert.throws(() => normalizeLogAnalyticsRequest('application-exceptions-errors', { minutes: '30' }), KubeInputError);
});

test('Log Analytics validates bounded template parameters', () => {
  const request = normalizeLogAnalyticsRequest('service-log-excerpts', { service: 'meter-api', minutes: '15', limit: '25', timeoutMs: '2000' });
  assert.equal(request.templateName, 'service-log-excerpts');
  assert.equal(request.namespace, 'energy');
  assert.equal(request.minutes, 15);
  assert.equal(request.limit, 25);
  assert.match(buildKqlTemplate(request, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:15:00Z')), /ContainerLogV2/);
});

test('Log Analytics timeout normalization is explicit', () => {
  const error = normalizeAzureMonitorError(new Error('Command timed out after 15000ms'));
  assert.equal(error.statusCode, 504);
  assert.match(error.message, /timed out/);
});

test('Log Analytics maps Azure table JSON into row objects', () => {
  const rows = mapAzureQueryRows(JSON.stringify({
    tables: [{
      columns: [{ name: 'TimeGenerated' }, { name: 'Message' }],
      rows: [['2026-01-01T00:00:00Z', 'failed once']],
    }],
  }));
  assert.deepEqual(rows, [{ TimeGenerated: '2026-01-01T00:00:00Z', Message: 'failed once' }]);
});

test('Log Analytics service maps success response and redacts returned rows', async () => {
  const originalWorkspace = process.env.LOG_ANALYTICS_WORKSPACE_ID;
  process.env.LOG_ANALYTICS_WORKSPACE_ID = '/subscriptions/000/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/configured-demo';
  const service = new LogAnalyticsQueryService(async () => ({
    stderr: '',
    stdout: JSON.stringify([{ Message: 'token=abc123 failed', PodName: 'meter-api-1' }]),
  }));
  try {
    const response = await service.execute('service-log-excerpts', {
      service: 'meter-api',
    });

    assert.equal(configuredWorkspaceId(), '/subscriptions/000/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/configured-demo');
    assert.equal(response.templateName, 'service-log-excerpts');
    assert.equal(response.workspace, '/subscriptions/000/resourceGroups/rg/providers/Microsoft.OperationalInsights/workspaces/configured-demo');
    assert.equal(response.rowCount, 1);
    assert.equal(response.metadata.partial, false);
    assert.equal(response.rows[0]?.Message, 'token=[REDACTED] failed');
  } finally {
    if (originalWorkspace === undefined) {
      delete process.env.LOG_ANALYTICS_WORKSPACE_ID;
    } else {
      process.env.LOG_ANALYTICS_WORKSPACE_ID = originalWorkspace;
    }
  }
});

test('Log Analytics invalid JSON maps to service error', () => {
  assert.throws(() => mapAzureQueryRows('not-json'), LogAnalyticsQueryError);
});

test('Log Analytics denied response keeps evidence metadata shape', () => {
  const response = buildLogAnalyticsErrorResponse(
    'freeform',
    { kql: 'ContainerLogV2 | take 1' },
    'Log Analytics template is not allowlisted.',
    'denied',
  );

  assert.equal(response.status, 'denied');
  assert.equal(response.templateName, 'freeform');
  assert.equal(response.rowCount, 0);
  assert.deepEqual(response.rows, []);
  assert.equal(response.metadata.confidence, 'none');
  assert.equal(response.metadata.status, 'denied');
  assert.equal(response.metadata.partial, false);
});

test('Log Analytics unavailable response keeps validated time and empty rows', () => {
  const response = buildLogAnalyticsErrorResponse(
    'service-log-excerpts',
    { service: 'meter-api', minutes: '15', timeoutMs: '2000' },
    'Azure Monitor query timed out.',
    'unavailable',
  );

  assert.equal(response.status, 'unavailable');
  assert.equal(response.timeRange.minutes, 15);
  assert.equal(response.metadata.timeoutMs, 2000);
  assert.equal(response.rowCount, 0);
  assert.deepEqual(response.rows, []);
});
