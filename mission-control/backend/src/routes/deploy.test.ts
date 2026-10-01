import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeployArgs,
  resolveSreAgentLocation,
  validateDeployLocations,
} from './deploy.js';

test('Central US workload can use an East US 2 SRE Agent', () => {
  assert.equal(validateDeployLocations('centralus', 'eastus2'), null);
});

test('workload validation rejects unknown Azure regions', () => {
  assert.match(
    validateDeployLocations('invalid-region', 'eastus2') ?? '',
    /Invalid workload location/,
  );
});

test('SRE Agent validation remains restricted to supported regions', () => {
  assert.match(
    validateDeployLocations('centralus', 'centralus') ?? '',
    /Invalid SRE Agent location/,
  );
});

test('existing callers keep the SRE Agent in the workload region when no override is provided', () => {
  assert.equal(resolveSreAgentLocation('swedencentral'), 'swedencentral');
});

test('Central US defaults the SRE Agent to East US 2 when no override is provided', () => {
  assert.equal(resolveSreAgentLocation('centralus'), 'eastus2');
});

test('an explicit SRE Agent region overrides the workload region', () => {
  assert.equal(resolveSreAgentLocation('centralus', 'eastus2'), 'eastus2');
});

test('Mission Control passes independent workload and SRE Agent regions to deploy.ps1', () => {
  assert.deepEqual(
    buildDeployArgs('/repo/scripts/deploy.ps1', {
      location: 'centralus',
      sreAgentLocation: 'eastus2',
      workloadName: 'srelab',
      skipRbac: false,
      skipSreAgent: false,
    }),
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', '/repo/scripts/deploy.ps1',
      '-Location', 'centralus',
      '-SreAgentLocation', 'eastus2',
      '-WorkloadName', 'srelab',
      '-Yes',
    ],
  );
});
