/**
 * Route-level tests for the SRE Agent API.
 *
 * These boot a real Fastify instance with the routes registered against a
 * fake-MCP-backed service, so request validation, status codes, and the
 * "never substitute Local Analyst" contract are verified end to end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerSreAgentRoutes, resolvePrompt } from './sre-agent.js';
import { loadSreAgentConfig } from '../services/sre-agent/config.js';
import { FakeMcpServer, fakeAgentPayload, fakeInvestigationPayload } from '../services/sre-agent/fakeMcpServer.js';
import { SreAgentService } from '../services/sre-agent/SreAgentService.js';
import { SreAgentOperationDeniedError } from '../services/sre-agent/operations.js';

const SUBSCRIPTION = '11111111-2222-3333-4444-555555555555';

function configuredService(fake: FakeMcpServer): SreAgentService {
  return new SreAgentService(
    loadSreAgentConfig({
      SRE_AGENT_NAME: 'sre-agent-energygrid',
      SRE_AGENT_SUBSCRIPTION_ID: SUBSCRIPTION,
      SRE_AGENT_RESOURCE_GROUP: 'rg-srelab-eastus2',
      SRE_AGENT_REQUEST_TIMEOUT_MS: '5000',
      SRE_AGENT_INVESTIGATION_TIMEOUT_MS: '5000',
    }),
    fake.factory(),
  );
}

function happyFake(): FakeMcpServer {
  return new FakeMcpServer({
    handlers: {
      sreagent_agents_list: () => fakeAgentPayload(),
      sreagent_agents_get: () => fakeAgentPayload(),
      sreagent_threads_investigate: () => fakeInvestigationPayload(),
      sreagent_threads_send_message: () => fakeInvestigationPayload(),
      sreagent_threads_get: () => fakeInvestigationPayload(),
      sreagent_threads_create: () => fakeInvestigationPayload(),
    },
  });
}

async function withApp(
  service: SreAgentService,
  run: (app: ReturnType<typeof Fastify>) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'sre-route-state-'));
  const previous = process.env['SRE_AGENT_THREAD_STATE_PATH'];
  process.env['SRE_AGENT_THREAD_STATE_PATH'] = join(dir, 'threads.json');

  const app = Fastify({ logger: false });
  registerSreAgentRoutes(app, service);
  await app.ready();

  try {
    await run(app);
  } finally {
    await app.close();
    await service.shutdown();
    if (previous === undefined) delete process.env['SRE_AGENT_THREAD_STATE_PATH'];
    else process.env['SRE_AGENT_THREAD_STATE_PATH'] = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test('the config route advertises the allowlist and never exposes a yolo tool', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    const response = await app.inject({ method: 'GET', url: '/api/sre-agent/config' });
    assert.equal(response.statusCode, 200);

    const body = response.json();
    assert.equal(body.configured, true);
    assert.equal(body.target.allowedTools.length, 6);
    assert.ok(!body.target.allowedTools.some((tool: string) => /yolo/i.test(tool)));
    assert.ok(body.target.blockedTools.includes('sreagent_threads_investigate_yolo'));
    assert.ok(!JSON.stringify(body).includes(SUBSCRIPTION), 'raw subscription GUID must not be returned');
    assert.equal(body.scenarioPrompts.length, 3);
    for (const prompt of body.scenarioPrompts) {
      assert.ok(prompt.prompt.length > 0);
    }
  });
  await fake.close();
});

test('starting an investigation returns a real thread and agent identity', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sre-agent/investigations',
      payload: { scenarioName: 'OOMKilled' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.provenance, 'azure-sre-agent');
    assert.equal(body.thread.id, 'thread-0f8a1c2d-9b3e-4c5f-8a7b-6d5e4f3a2b1c');
    assert.equal(body.agent.name, 'sre-agent-energygrid');
    assert.equal(body.approval.autoApproved, false);
    assert.equal(body.metadata.tool, 'sreagent_threads_investigate');

    // The approved scenario prompt was used verbatim — no manual copying required.
    const investigateCall = fake.calls.find((call) => call.name === 'sreagent_threads_investigate');
    assert.ok(String(investigateCall?.args['message']).length > 0);
  });
  await fake.close();
});

test('an unapproved scenario name is rejected', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sre-agent/investigations',
      payload: { scenarioName: 'DropProductionDatabase' },
    });

    assert.equal(response.statusCode, 403);
    const body = response.json();
    assert.equal(body.kind, 'denied');
    assert.equal(body.investigationStarted, false);
    assert.equal(body.localAnalystSubstituted, false);
  });
  await fake.close();
});

test('a request with neither prompt nor scenario is rejected', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    const response = await app.inject({ method: 'POST', url: '/api/sre-agent/investigations', payload: {} });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().kind, 'denied');
  });
  await fake.close();
});

test('an MCP failure returns an honest error with the portal handoff and no fallback answer', async () => {
  const fake = new FakeMcpServer({ failConnect: new Error('AuthorizationFailed: 403 Forbidden') });
  await withApp(configuredService(fake), async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sre-agent/investigations',
      payload: { scenarioName: 'MongoDBDown' },
    });

    assert.equal(response.statusCode, 403);
    const body = response.json();

    assert.equal(body.kind, 'permission');
    assert.equal(body.investigationStarted, false);
    assert.equal(body.localAnalystSubstituted, false);
    assert.match(body.remediation, /SRE Agent Administrator/);
    assert.match(body.portalHandoff.href, /^https:\/\//);
    assert.match(body.portalHandoff.description, /Local Analyst is not a substitute/i);
    // The portal handoff carries the prompt so the presenter can continue manually.
    assert.ok(String(body.portalHandoff.prompt ?? '').length > 0);

    // Critically: no success-shaped fields are present.
    assert.equal(body.provenance, undefined);
    assert.equal(body.response, undefined);
    assert.equal(body.thread, undefined);
  });
  await fake.close();
});

test('an unconfigured backend reports not-configured instead of pretending', async () => {
  const fake = happyFake();
  const service = new SreAgentService(loadSreAgentConfig({}), fake.factory());

  await withApp(service, async (app) => {
    const config = await app.inject({ method: 'GET', url: '/api/sre-agent/config' });
    assert.equal(config.json().configured, false);
    assert.ok(config.json().configurationIssues.length > 0);

    const response = await app.inject({
      method: 'POST',
      url: '/api/sre-agent/investigations',
      payload: { prompt: 'why are pods restarting' },
    });

    assert.equal(response.statusCode, 503);
    assert.equal(response.json().kind, 'not-configured');
    assert.equal(response.json().localAnalystSubstituted, false);
  });
  await fake.close();
});

test('follow-up requires a valid thread ID', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/sre-agent/investigations/continue',
      payload: { threadId: 'nope', prompt: 'next step' },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().kind, 'denied');
  });
  await fake.close();
});

test('cancel requires a correlation ID and states the honest limitation', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    const missing = await app.inject({ method: 'POST', url: '/api/sre-agent/investigations/cancel', payload: {} });
    assert.equal(missing.statusCode, 400);

    const unknown = await app.inject({
      method: 'POST',
      url: '/api/sre-agent/investigations/cancel',
      payload: { correlationId: 'mc-unknown-0001' },
    });
    assert.equal(unknown.statusCode, 200);
    assert.equal(unknown.json().cancelled, false);
    assert.match(unknown.json().limitation, /does not document a server-side stop/i);
  });
  await fake.close();
});

test('recorded threads are exposed so the UI can re-attach after a restart', async () => {
  const fake = happyFake();
  await withApp(configuredService(fake), async (app) => {
    await app.inject({ method: 'POST', url: '/api/sre-agent/investigations', payload: { scenarioName: 'ServiceMismatch' } });

    const response = await app.inject({ method: 'GET', url: '/api/sre-agent/threads' });
    assert.equal(response.statusCode, 200);
    const threads = response.json().threads;
    assert.equal(threads.length, 1);
    assert.equal(threads[0].scenarioName, 'ServiceMismatch');
    assert.equal(threads[0].threadId, 'thread-0f8a1c2d-9b3e-4c5f-8a7b-6d5e4f3a2b1c');
  });
  await fake.close();
});

test('resolvePrompt only seeds prompts from approved scenarios', () => {
  assert.equal(resolvePrompt({ prompt: '  custom prompt ' }), 'custom prompt');
  assert.ok(resolvePrompt({ scenarioName: 'OOMKilled' }).length > 0);
  assert.throws(() => resolvePrompt({}), SreAgentOperationDeniedError);
  assert.throws(
    () => resolvePrompt({ scenarioName: 'NotAScenario' as never }),
    SreAgentOperationDeniedError,
  );
});
