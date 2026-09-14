import assert from 'node:assert/strict';
import test from 'node:test';
import { effectScope } from 'vue';
import { usePolling } from './usePolling.js';

test('scheduled polling waits for the current request to finish', async () => {
  let calls = 0;
  let resolveRequest: (() => void) | undefined;
  const request = new Promise<void>((resolve) => {
    resolveRequest = resolve;
  });
  const scope = effectScope();
  const poller = scope.run(() => usePolling(async () => {
    calls += 1;
    await request;
    return calls;
  }, 1));

  assert.ok(poller);
  poller.start();
  poller.start();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(calls, 1);

  poller.stop();
  resolveRequest?.();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(calls, 1);
  scope.stop();
});

test('manual polls reuse the request already in flight', async () => {
  let calls = 0;
  let resolveRequest: (() => void) | undefined;
  const request = new Promise<void>((resolve) => {
    resolveRequest = resolve;
  });
  const scope = effectScope();
  const poller = scope.run(() => usePolling(async () => {
    calls += 1;
    await request;
    return calls;
  }));

  assert.ok(poller);
  const first = poller.poll();
  const second = poller.poll();

  assert.equal(first, second);
  assert.equal(calls, 1);

  resolveRequest?.();
  await Promise.all([first, second]);
  scope.stop();
});
