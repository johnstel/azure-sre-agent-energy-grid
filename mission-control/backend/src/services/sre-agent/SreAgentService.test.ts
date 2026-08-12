/**
 * Integration tests for the SRE Agent adapter.
 *
 * These run the real MCP protocol (official SDK client + server) over
 * `InMemoryTransport` against `FakeMcpServer`. No `npx`, no Azure, no network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSreAgentConfig, type SreAgentConfig } from './config.js';
import { FakeMcpServer, fakeAgentPayload, fakeInvestigationPayload } from './fakeMcpServer.js';
import { SreAgentMcpClient, SreAgentMcpError } from './SreAgentMcpClient.js';
import {
  SreAgentNotConfiguredError,
  SreAgentProvenanceError,
  SreAgentService,
  normalizePrompt,
  normalizeThreadId,
} from './SreAgentService.js';
import { SreAgentOperationDeniedError } from './operations.js';
import { collectSreAgentPreflight } from './preflight.js';

const SUBSCRIPTION = '11111111-2222-3333-4444-555555555555';
const AGENT_NAME = 'sre-agent-energygrid';
const THREAD_ID = 'thread-0f8a1c2d-9b3e-4c5f-8a7b-6d5e4f3a2b1c';

function testConfig(overrides: Record<string, string> = {}): SreAgentConfig {
  return loadSreAgentConfig({
    SRE_AGENT_NAME: AGENT_NAME,
    SRE_AGENT_SUBSCRIPTION_ID: SUBSCRIPTION,
    SRE_AGENT_RESOURCE_GROUP: 'rg-srelab-eastus2',
    SRE_AGENT_REQUEST_TIMEOUT_MS: '5000',
    SRE_AGENT_INVESTIGATION_TIMEOUT_MS: '5000',
    ...overrides,
  });
}

function happyHandlers(investigationOverrides: Record<string, unknown> = {}) {
  return {
    sreagent_agents_list: () => fakeAgentPayload(),
    sreagent_agents_get: () => fakeAgentPayload(),
    sreagent_threads_investigate: () => fakeInvestigationPayload(investigationOverrides),
    sreagent_threads_send_message: () => fakeInvestigationPayload(investigationOverrides),
    sreagent_threads_get: () => fakeInvestigationPayload(investigationOverrides),
    sreagent_threads_create: () => fakeInvestigationPayload(investigationOverrides),
  };
}

/** Isolates the durable thread-reference file per test. */
async function withThreadState<T>(run: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'sre-thread-state-'));
  const previous = process.env['SRE_AGENT_THREAD_STATE_PATH'];
  process.env['SRE_AGENT_THREAD_STATE_PATH'] = join(dir, 'threads.json');
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env['SRE_AGENT_THREAD_STATE_PATH'];
    else process.env['SRE_AGENT_THREAD_STATE_PATH'] = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

// --- happy path: real provenance --------------------------------------------

test('a completed investigation carries real agent and thread identity', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const investigation = await service.startInvestigation({ prompt: 'Why are meter-service pods restarting?' });

      assert.equal(investigation.provenance, 'azure-sre-agent');
      assert.equal(investigation.status, 'completed');
      assert.equal(investigation.thread.id, THREAD_ID);
      assert.equal(investigation.agent.name, AGENT_NAME);
      assert.equal(investigation.agent.location, 'eastus2');
      assert.equal(investigation.agent.provisioningState, 'Succeeded');
      assert.equal(investigation.agent.endpointHost, 'sre-agent-energygrid.eastus2.azuresre.ai');
      assert.match(investigation.response, /OOMKilled/);
      assert.equal(investigation.approval.autoApproved, false);
      assert.equal(investigation.metadata.tool, 'sreagent_threads_investigate');
      assert.ok(investigation.metadata.elapsedMs >= 0);
      assert.ok(investigation.metadata.correlationId.length > 0);

      // Only the allowlisted tools were touched, and never yolo.
      assert.deepEqual(fake.calledToolNames, ['sreagent_agents_get', 'sreagent_threads_investigate']);
      assert.ok(!fake.calledToolNames.some((name) => /yolo/i.test(name)));
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('agent ARM ID and subscription are masked before leaving the backend', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const investigation = await service.startInvestigation({ prompt: 'status check' });
      const serialized = JSON.stringify(investigation);

      assert.ok(!serialized.includes(SUBSCRIPTION), 'raw subscription GUID leaked to the client payload');
      assert.ok(investigation.agent.armIdMasked?.includes('agents/sre-agent-energygrid'));
      assert.ok(investigation.agent.subscriptionIdMasked?.includes('****'));
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('identifiers quoted by the agent in prose and citations are masked too', async () => {
  await withThreadState(async () => {
    const armId = `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-srelab-eastus2/providers/Microsoft.ContainerService/managedClusters/aks-demo`;
    const fake = new FakeMcpServer({
      handlers: happyHandlers({
        response: `Root cause: the AKS cluster ${armId} has a 128Mi memory limit. Subscription ${SUBSCRIPTION} is affected.`,
        citations: [{ title: `AKS resource ${armId}`, source: 'Azure Resource Graph' }],
        approvalMessage: `Approval required to scale ${armId}.`,
        approvalRequired: true,
      }),
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const investigation = await service.startInvestigation({ prompt: 'why' });
      const serialized = JSON.stringify(investigation);

      // The whole client payload — response prose, citation labels and approval detail.
      assert.ok(!serialized.includes(SUBSCRIPTION), 'subscription GUID leaked in the response payload');
      assert.ok(!investigation.response.includes(SUBSCRIPTION));
      assert.ok(!investigation.citations[0]?.label.includes(SUBSCRIPTION));
      assert.ok(!(investigation.approval.detail ?? '').includes(SUBSCRIPTION));

      // Diagnostic value is preserved.
      assert.match(investigation.response, /managedClusters\/aks-demo/);
      assert.match(investigation.response, /128Mi/);
      assert.match(investigation.citations[0]?.label ?? '', /aks-demo/);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('citations are rendered when present and reported absent when not', async () => {
  await withThreadState(async () => {
    const withCitations = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), withCitations.factory());
    try {
      const investigation = await service.startInvestigation({ prompt: 'why' });
      assert.equal(investigation.citationsPresent, true);
      assert.equal(investigation.citations.length, 2);
      assert.equal(investigation.citations[0]?.label, 'KubePodInventory — meter-service restarts');
      assert.equal(investigation.citations[0]?.url, 'https://portal.azure.com/#logs');
      assert.equal(investigation.citations[0]?.source, 'Log Analytics');
    } finally {
      await service.shutdown();
      await withCitations.close();
    }

    const withoutCitations = new FakeMcpServer({ handlers: happyHandlers({ citations: [] }) });
    const bare = new SreAgentService(testConfig(), withoutCitations.factory());
    try {
      const investigation = await bare.startInvestigation({ prompt: 'why' });
      assert.equal(investigation.citationsPresent, false);
      assert.deepEqual(investigation.citations, []);
    } finally {
      await bare.shutdown();
      await withoutCitations.close();
    }
  });
});

// --- approval gates ----------------------------------------------------------

test('standard mode surfaces an approval gate and never auto-approves', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: happyHandlers({
        approvalRequired: true,
        approvalMessage: 'Approval required to restart the meter-service deployment.',
        response: 'I can restart the deployment, but this action requires your approval.',
      }),
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const investigation = await service.startInvestigation({ prompt: 'fix meter-service' });

      assert.equal(investigation.status, 'awaiting-approval');
      assert.equal(investigation.approval.required, true);
      assert.equal(investigation.approval.autoApproved, false);
      assert.match(investigation.approval.detail ?? '', /Approval required/);
      assert.ok(
        investigation.metadata.limitations.some((entry) => /never auto-approves/i.test(entry)),
        'limitations must state that Mission Control never auto-approves',
      );
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('an approval gate is detected from prose when no structured flag is present', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: happyHandlers({ response: 'I have a remediation ready. Approval is required before I proceed.' }),
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const investigation = await service.startInvestigation({ prompt: 'fix it' });
      assert.equal(investigation.status, 'awaiting-approval');
      assert.equal(investigation.approval.required, true);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

// --- provenance enforcement --------------------------------------------------

test('a response without a thread ID is refused rather than attributed to SRE Agent', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: {
        ...happyHandlers(),
        sreagent_threads_investigate: () => ({ status: 200, results: { response: 'Some answer with no thread.' } }),
      },
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      await assert.rejects(
        () => service.startInvestigation({ prompt: 'why' }),
        (error: unknown) => {
          assert.ok(error instanceof SreAgentProvenanceError);
          assert.match(error.message, /without a thread ID/i);
          return true;
        },
      );
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('an unresolvable agent resource is refused rather than assumed', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: { ...happyHandlers(), sreagent_agents_get: () => ({ status: 200, results: [] }) },
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      await assert.rejects(() => service.startInvestigation({ prompt: 'why' }), SreAgentProvenanceError);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('a tool error is surfaced as a failure, never as a successful investigation', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: { sreagent_agents_get: () => fakeAgentPayload() },
      toolNames: ['sreagent_agents_get', 'sreagent_threads_investigate'],
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      // No handler registered for investigate -> fake server returns isError.
      await assert.rejects(() => service.startInvestigation({ prompt: 'why' }), SreAgentMcpError);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

// --- follow-up and thread continuity ----------------------------------------

test('a follow-up continues the same thread', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const first = await service.startInvestigation({ prompt: 'why are pods restarting?' });
      const followUp = await service.continueInvestigation({ threadId: first.thread.id, prompt: 'what should we change?' });

      assert.equal(followUp.thread.id, first.thread.id);
      assert.equal(followUp.metadata.tool, 'sreagent_threads_send_message');

      const sendCall = fake.calls.find((call) => call.name === 'sreagent_threads_send_message');
      assert.equal(sendCall?.args['thread-id'], THREAD_ID);
      assert.equal(sendCall?.args['message'], 'what should we change?');
      assert.equal(sendCall?.args['agent'], AGENT_NAME);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('a follow-up echoing no thread ID still resolves to the requested thread', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: {
        ...happyHandlers(),
        sreagent_threads_send_message: () => ({ status: 200, results: { response: 'Scale the memory limit to 256Mi.' } }),
      },
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const followUp = await service.continueInvestigation({ threadId: THREAD_ID, prompt: 'next step?' });
      assert.equal(followUp.thread.id, THREAD_ID);
      assert.match(followUp.response, /256Mi/);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

// --- backend restart / reconnect --------------------------------------------

test('an in-flight thread survives a backend restart and can be re-attached', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const first = new SreAgentService(testConfig(), fake.factory());

    let threadId: string;
    try {
      const investigation = await first.startInvestigation(
        { prompt: 'why are pods restarting?', scenarioName: 'OOMKilled' },
        undefined,
      );
      threadId = investigation.thread.id;

      const recorded = await first.listRecordedThreads();
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0]?.threadId, threadId);
      assert.equal(recorded[0]?.scenarioName, 'OOMKilled');
    } finally {
      // Simulate a backend restart: dispose the client and the child transport.
      await first.shutdown();
    }

    const restarted = new SreAgentService(testConfig(), fake.factory());
    try {
      const recorded = await restarted.listRecordedThreads();
      assert.equal(recorded[0]?.threadId, threadId);

      // The thread lives server-side, so status can be read on a brand-new session.
      const status = await restarted.getThreadStatus(threadId);
      assert.equal(status.thread.id, threadId);
      assert.equal(status.provenance, 'azure-sre-agent');
      assert.equal(status.metadata.tool, 'sreagent_threads_get');
    } finally {
      await restarted.shutdown();
      await fake.close();
    }
  });
});

test('thread references persist to disk without leaking prompts or secrets', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      await service.startInvestigation({ prompt: 'password=hunter2 investigate meter-service' });
      const raw = await readFile(process.env['SRE_AGENT_THREAD_STATE_PATH']!, 'utf8');
      assert.ok(!raw.includes('hunter2'), 'prompt content must not be persisted');
      assert.ok(raw.includes(THREAD_ID));
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

// --- timeout and cancellation ------------------------------------------------

test('an operation that exceeds the timeout fails as a timeout, not a result', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers(), hangMs: 5_000 });
    const service = new SreAgentService(testConfig({ SRE_AGENT_REQUEST_TIMEOUT_MS: '5000' }), fake.factory());

    try {
      await assert.rejects(
        () => service.getConfiguredAgent(AbortSignal.timeout(250)),
        (error: unknown) => {
          assert.ok(error instanceof SreAgentMcpError);
          assert.ok(['timeout', 'cancelled'].includes(error.kind), `unexpected kind ${error.kind}`);
          return true;
        },
      );
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('cancel aborts the in-flight operation and reports the honest limitation', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers(), hangMs: 5_000 });
    const service = new SreAgentService(testConfig(), fake.factory());
    const correlationId = 'mc-cancel-test-0001';

    try {
      const pending = service.startInvestigation({ prompt: 'long investigation', correlationId });

      // Wait until the investigate call is actually in flight before cancelling.
      await waitUntil(() => service.activeOperationIds().includes(correlationId), 3_000);
      assert.equal(service.cancel(correlationId), true);

      await assert.rejects(pending, (error: unknown) => {
        assert.ok(error instanceof SreAgentMcpError);
        assert.equal(error.kind, 'cancelled');
        return true;
      });

      // A second cancel is a no-op, not an error.
      assert.equal(service.cancel(correlationId), false);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('shutdown aborts every in-flight operation', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers(), hangMs: 5_000 });
    const service = new SreAgentService(testConfig(), fake.factory());

    const pending = service.startInvestigation({ prompt: 'long investigation', correlationId: 'mc-shutdown-0001' });
    await waitUntil(() => service.activeOperationIds().length > 0, 3_000);

    await service.shutdown();
    await assert.rejects(pending);
    await fake.close();
  });
});

test('disposing while the MCP server is still starting does not orphan the transport', async () => {
  const fake = new FakeMcpServer({ handlers: happyHandlers() });
  const slowFactory = async (config: SreAgentConfig) => {
    // Simulate a cold `npx @azure/mcp` start that takes time to come up.
    await new Promise((resolve) => setTimeout(resolve, 60));
    return fake.factory()(config);
  };

  const client = new SreAgentMcpClient(testConfig(), slowFactory);
  const pending = client.listToolNames();

  // Dispose mid-connect.
  await new Promise((resolve) => setTimeout(resolve, 10));
  await client.dispose();

  await assert.rejects(pending);
  assert.equal(client.connected, false, 'a disposed client must not cache a live session');

  // A disposed client stays disposed and cannot start another child process.
  await assert.rejects(() => client.listToolNames(), SreAgentMcpError);
  assert.equal(client.connected, false);

  await fake.close();
});

// --- failure modes -----------------------------------------------------------

test('an unconfigured adapter refuses every operation with actionable guidance', async () => {
  const service = new SreAgentService(loadSreAgentConfig({}), new FakeMcpServer().factory());

  await assert.rejects(() => service.discoverAgents(), SreAgentNotConfiguredError);
  await assert.rejects(() => service.startInvestigation({ prompt: 'why' }), SreAgentNotConfiguredError);
  await assert.rejects(() => service.continueInvestigation({ threadId: THREAD_ID, prompt: 'why' }), SreAgentNotConfiguredError);
  await assert.rejects(() => service.getThreadStatus(THREAD_ID), SreAgentNotConfiguredError);

  const handoff = service.portalHandoff('prompt text');
  assert.match(handoff.description, /Local Analyst is not a substitute/i);
  assert.equal(handoff.prompt, 'prompt text');
  await service.shutdown();
});

test('a transport that cannot start produces an actionable runtime error', async () => {
  await withThreadState(async () => {
    const enoent = Object.assign(new Error('spawn npx ENOENT'), { code: 'ENOENT' });
    const fake = new FakeMcpServer({ failConnect: enoent });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      await assert.rejects(
        () => service.discoverAgents(),
        (error: unknown) => {
          assert.ok(error instanceof SreAgentMcpError);
          assert.equal(error.kind, 'runtime-missing');
          assert.match(error.remediation, /Node\.js/);
          return true;
        },
      );
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('auth, permission, and network failures map to actionable remediations', async () => {
  const cases: Array<{ message: string; kind: string; remediation: RegExp }> = [
    { message: 'AADSTS700082 401 Unauthorized', kind: 'auth', remediation: /az login/ },
    { message: 'AuthorizationFailed: 403 Forbidden', kind: 'permission', remediation: /SRE Agent Administrator/ },
    { message: 'getaddrinfo ENOTFOUND agent.azuresre.ai', kind: 'network', remediation: /azuresre\.ai/ },
    { message: 'ResourceNotFound: 404 no agent endpoint', kind: 'not-found', remediation: /SRE_AGENT_NAME/ },
  ];

  for (const testCase of cases) {
    await withThreadState(async () => {
      const fake = new FakeMcpServer({ failConnect: new Error(testCase.message) });
      const service = new SreAgentService(testConfig(), fake.factory());
      try {
        await assert.rejects(
          () => service.discoverAgents(),
          (error: unknown) => {
            assert.ok(error instanceof SreAgentMcpError, `expected SreAgentMcpError for ${testCase.message}`);
            assert.equal(error.kind, testCase.kind);
            assert.match(error.remediation, testCase.remediation);
            return true;
          },
        );
      } finally {
        await service.shutdown();
        await fake.close();
      }
    });
  }
});

// --- input validation --------------------------------------------------------

test('prompts and thread IDs are validated before any MCP dispatch', () => {
  assert.throws(() => normalizePrompt(''), SreAgentOperationDeniedError);
  assert.throws(() => normalizePrompt('   '), SreAgentOperationDeniedError);
  assert.throws(() => normalizePrompt(undefined), SreAgentOperationDeniedError);
  assert.throws(() => normalizePrompt('x'.repeat(8_001)), SreAgentOperationDeniedError);
  assert.equal(normalizePrompt('  investigate  '), 'investigate');

  assert.throws(() => normalizeThreadId(''), SreAgentOperationDeniedError);
  assert.throws(() => normalizeThreadId('short'), SreAgentOperationDeniedError);
  assert.throws(() => normalizeThreadId('bad id with spaces'), SreAgentOperationDeniedError);
  assert.equal(normalizeThreadId(` ${THREAD_ID} `), THREAD_ID);
});

// --- preflight ---------------------------------------------------------------

test('preflight proves the MCP surface excludes every auto-approval tool', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const result = await collectSreAgentPreflight(service, {
        runner: async () => ({ stdout: JSON.stringify({ id: SUBSCRIPTION, name: 'demo-sub' }), stderr: '' }),
        resolveHost: async () => true,
      });

      const blockedCheck = result.checks.find((check) => check.name === 'Auto-approval tools blocked');
      assert.equal(blockedCheck?.status, 'pass');
      assert.match(blockedCheck?.message ?? '', /investigate_yolo/);

      assert.equal(result.checks.find((check) => check.name === 'Azure MCP Server tool surface')?.status, 'pass');
      assert.equal(result.checks.find((check) => check.name === 'SRE Agent discovery')?.status, 'pass');
      assert.equal(result.checks.find((check) => check.name === 'SRE Agent data-plane reachability')?.status, 'pass');
      assert.equal(result.ready, true);
      assert.ok(!result.target.allowedTools.some((tool) => /yolo/i.test(tool)));
      assert.ok(result.target.blockedTools.includes('sreagent_threads_investigate_yolo'));
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('preflight fails loudly if the MCP server ever exposes an auto-approval tool', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      toolNames: [...['sreagent_agents_get', 'sreagent_agents_list', 'sreagent_threads_create', 'sreagent_threads_get', 'sreagent_threads_investigate', 'sreagent_threads_send_message'], 'sreagent_threads_investigate_yolo'],
      handlers: happyHandlers(),
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const result = await collectSreAgentPreflight(service, {
        runner: async () => ({ stdout: JSON.stringify({ id: SUBSCRIPTION, name: 'demo-sub' }), stderr: '' }),
        resolveHost: async () => true,
      });

      const blockedCheck = result.checks.find((check) => check.name === 'Auto-approval tools blocked');
      assert.equal(blockedCheck?.status, 'fail');
      assert.match(blockedCheck?.message ?? '', /sreagent_threads_investigate_yolo/);
      assert.equal(result.ready, false);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('preflight reports an actionable failure when Azure sign-in is missing', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const result = await collectSreAgentPreflight(service, {
        runner: async () => {
          throw new Error('Please run "az login" to setup account.');
        },
        resolveHost: async () => true,
        skipMcpProbe: true,
      });

      const signIn = result.checks.find((check) => check.name === 'Azure sign-in');
      assert.equal(signIn?.status, 'fail');
      assert.match(signIn?.remediation ?? '', /az login/);
      assert.equal(result.ready, false);
      assert.match(result.portalHandoff.description, /Local Analyst is not a substitute/i);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('preflight surfaces a missing data-plane route as a firewall action', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({ handlers: happyHandlers() });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const result = await collectSreAgentPreflight(service, {
        runner: async () => ({ stdout: JSON.stringify({ id: SUBSCRIPTION, name: 'demo-sub' }), stderr: '' }),
        resolveHost: async () => false,
      });

      const reachability = result.checks.find((check) => check.name === 'SRE Agent data-plane reachability');
      assert.equal(reachability?.status, 'fail');
      assert.match(reachability?.remediation ?? '', /azuresre\.ai/);
      assert.equal(result.ready, false);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

test('preflight reports a missing agent without inventing one', async () => {
  await withThreadState(async () => {
    const fake = new FakeMcpServer({
      handlers: { ...happyHandlers(), sreagent_agents_list: () => ({ status: 200, results: [] }) },
    });
    const service = new SreAgentService(testConfig(), fake.factory());

    try {
      const result = await collectSreAgentPreflight(service, {
        runner: async () => ({ stdout: JSON.stringify({ id: SUBSCRIPTION, name: 'demo-sub' }), stderr: '' }),
        resolveHost: async () => true,
      });

      const discovery = result.checks.find((check) => check.name === 'SRE Agent discovery');
      assert.equal(discovery?.status, 'fail');
      assert.match(discovery?.message ?? '', /No SRE Agent resources were visible/);
      assert.equal(result.ready, false);
    } finally {
      await service.shutdown();
      await fake.close();
    }
  });
});

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Condition was not met before the timeout');
}
