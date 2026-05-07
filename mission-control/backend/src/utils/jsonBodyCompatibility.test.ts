import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import Fastify from 'fastify';
import { addScenarioJsonBodyCompatibility } from './jsonBodyCompatibility.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  addScenarioJsonBodyCompatibility(app);

  app.post('/api/scenarios/:name/enable', async (request) => ({ body: request.body }));
  app.post('/api/scenarios/:name/disable', async (request) => ({ body: request.body }));
  app.post('/api/scenarios/fix-all', async (request) => ({ body: request.body }));
  app.post('/api/deploy', async (request) => ({ body: request.body }));

  return app;
}

test('treats empty JSON scenario mutation bodies as empty objects', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  for (const url of ['/api/scenarios/oom-killed/enable', '/api/scenarios/oom-killed/disable', '/api/scenarios/fix-all']) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { body: {} });
  }
});

test('preserves malformed non-empty JSON errors on scenario mutations', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/scenarios/oom-killed/enable',
    headers: { 'content-type': 'application/json' },
    payload: '{',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'FST_ERR_CTP_INVALID_JSON_BODY');
});

test('preserves default empty JSON rejection outside scenario mutations', async (t) => {
  const app = await buildTestApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/deploy',
    headers: { 'content-type': 'application/json' },
    payload: '',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, 'FST_ERR_CTP_EMPTY_JSON_BODY');
});
