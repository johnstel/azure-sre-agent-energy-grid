import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalystKubeQueryService, assertAllowedAksQuery, assertReadOnlyKubectlArgs, parseCpuMillicores, parseMemoryBytes } from './AnalystKubeQueryService.js';
import { KubeInputError } from './KubeClient.js';
import type { AnalystPodResourceState } from '../types/index.js';
import { buildAksErrorResponse } from '../routes/analyst.js';

test('AKS analyst query allowlist fails closed for unknown query names', () => {
  assert.throws(() => assertAllowedAksQuery('delete-pods'), KubeInputError);
});

test('AKS analyst kubectl guard allows get and rejects write verbs', () => {
  assert.doesNotThrow(() => assertReadOnlyKubectlArgs(['get', 'pods', '-n', 'energy', '-o', 'json']));
  assert.throws(() => assertReadOnlyKubectlArgs(['delete', 'pods', '-n', 'energy']), KubeInputError);
  assert.throws(() => assertReadOnlyKubectlArgs(['get', 'secrets', '-n', 'energy']), KubeInputError);
});

test('AKS quantity parsing maps CPU and memory into comparable units', () => {
  assert.equal(parseCpuMillicores('250m'), 250);
  assert.equal(parseCpuMillicores('2'), 2000);
  assert.equal(parseMemoryBytes('128Mi'), 134217728);
  assert.equal(parseMemoryBytes('1G'), 1000000000);
});

test('AKS pod resource query maps success response with metadata', async () => {
  const service = new AnalystKubeQueryService(async () => ({
    stderr: '',
    stdout: JSON.stringify({
      items: [{
        metadata: { name: 'api-1', labels: { app: 'api' } },
        spec: { nodeName: 'node-a', containers: [{ name: 'api', resources: { requests: { cpu: '100m', memory: '64Mi' }, limits: { cpu: '500m', memory: '128Mi' } } }] },
        status: { phase: 'Running', startTime: '2026-01-01T00:00:00Z', containerStatuses: [{ name: 'api', ready: true, restartCount: 0, state: { running: {} } }] },
      }],
    }),
  }));

  const response = await service.execute('pod-resources');
  assert.equal(response.queryName, 'pod-resources');
  assert.equal(response.namespace, 'energy');
  assert.equal(response.metadata.allowedVerb, 'get');
  assert.equal(response.metadata.status, 'complete');
  assert.equal((response.data as AnalystPodResourceState[])[0]?.name, 'api-1');
});

test('AKS denied response keeps evidence metadata shape', () => {
  const response = buildAksErrorResponse('delete-pods', 'AKS analyst query is not allowlisted.', 'denied');

  assert.equal(response.status, 'denied');
  assert.equal(response.queryName, 'delete-pods');
  assert.equal(response.namespace, 'energy');
  assert.deepEqual(response.data, []);
  assert.equal(response.metadata.confidence, 'none');
  assert.equal(response.metadata.status, 'denied');
  assert.equal(response.metadata.allowedVerb, 'get');
});

test('AKS unavailable response keeps empty data and no-confidence metadata', () => {
  const response = buildAksErrorResponse('pod-resources', 'kubectl timed out.', 'unavailable');

  assert.equal(response.status, 'unavailable');
  assert.equal(response.queryName, 'pod-resources');
  assert.deepEqual(response.data, []);
  assert.equal(response.metadata.confidence, 'none');
  assert.equal(response.metadata.status, 'unavailable');
});
