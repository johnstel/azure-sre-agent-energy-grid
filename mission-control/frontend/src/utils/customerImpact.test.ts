import assert from 'node:assert/strict';
import test from 'node:test';
import {
  customerImpactStatusClass,
  customerImpactStatusIcon,
  customerImpactStatusLabel,
  formatFreshness,
} from './customerImpact.js';

test('customer impact labels keep unavailable and no-data distinct', () => {
  assert.equal(customerImpactStatusLabel('unknown'), 'Unknown — telemetry unavailable');
  assert.equal(customerImpactStatusLabel('no-data'), 'No telemetry data');
  assert.equal(customerImpactStatusIcon('unknown'), '?');
  assert.equal(customerImpactStatusIcon('no-data'), '○');
  assert.equal(customerImpactStatusClass('unknown'), 'customer-impact--unknown');
});

test('customer impact freshness only formats an actual value', () => {
  assert.equal(formatFreshness(undefined), undefined);
  assert.equal(formatFreshness(42), '42s ago');
  assert.equal(formatFreshness(300), '5m ago');
});
