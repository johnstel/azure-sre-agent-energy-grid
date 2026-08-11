const assert = require('assert');
const fs = require('fs');
const path = require('path');

const topologyPath = path.resolve(__dirname, '../../k8s/base/grid-map-topology.json');
const topology = JSON.parse(fs.readFileSync(topologyPath, 'utf8'));

assert(topology.schemaVersion === '1.2');
assert(topology.dataContract.version === 'cloud-demo-v2');
assert(topology.dataContract.allowlistedNamespaces.includes('energy'));
assert(topology.nodes.some(node => node.transient && node.scenarioId === 'high-cpu'));
assert(topology.nodes.some(node => node.transient && node.scenarioId === 'missing-config'));
assert(topology.scenarioMappings['high-cpu'].nodeId === 'frequency-calc-overload');
assert(topology.scenarioMappings['missing-config'].nodeId === 'grid-zone-config');
assert(topology.edges.some(edge => edge.scenarioId === 'probe-failure'));
console.log('grid map contract tests passed');
