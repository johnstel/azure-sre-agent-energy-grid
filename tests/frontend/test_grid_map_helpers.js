const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('../../k8s/base/grid-map-helpers.js');

test('topology exposes the governed cloud-demo contract', () => {
  const topology = helpers.buildTopology();
  assert.equal(topology.schemaVersion, '1.2');
  assert.equal(topology.dataContract.version, 'cloud-demo-v2');
  assert.deepEqual(topology.dataContract.allowlistedNamespaces, ['energy']);
  assert.equal(topology.dataContract.maxEvents, 8);
});

test('scenario helpers include transient nodes and preserve unknown handling', () => {
  const topology = helpers.buildTopology();
  const nodes = helpers.getScenarioNodeIds(topology, 'high-cpu');
  assert.ok(nodes.includes('frequency-calc-overload'));
  assert.equal(helpers.normalizeStatus('foo'), 'unknown');
  assert.equal(helpers.normalizeStatus('healthy'), 'healthy');
});

test('status snapshots merge scenario events and respect event limits', () => {
  const topology = helpers.buildTopology();
  const payload = {
    activeScenario: 'oom-killed',
    nodes: [{ id: 'meter-service', status: 'critical', sourceTimestamp: '2026-01-01T00:00:00Z', summary: 'critical' }],
    events: [
      { nodeId: 'meter-service', severity: 'critical', timestamp: '2026-01-01T00:00:00Z', reason: 'kube', message: 'Pod crashed' },
      { nodeId: 'meter-service', severity: 'warning', timestamp: '2026-01-01T00:00:00Z', reason: 'kube', message: 'Restarting' },
      { nodeId: 'meter-service', severity: 'warning', timestamp: '2026-01-01T00:00:00Z', reason: 'kube', message: 'Restarting again' }
    ]
  };
  const snapshot = helpers.buildStatusSnapshot(payload, topology, Date.now());
  assert.equal(snapshot.activeScenario, 'oom-killed');
  assert.equal(snapshot.events.length, payload.events.length);
  assert.ok(snapshot.events.some(entry => entry.nodeId === 'meter-service'));
});
