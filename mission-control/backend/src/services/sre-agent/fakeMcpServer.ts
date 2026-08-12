/**
 * Deterministic fake Azure MCP Server for tests.
 *
 * This is a real MCP server (from the official SDK) wired to the client through
 * `InMemoryTransport`, so tests exercise the genuine MCP protocol — tool registration,
 * JSON-RPC dispatch, timeouts, and cancellation — without spawning `npx` or touching
 * Azure. Scenarios can register handlers per tool, simulate hangs, and record calls.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PassThrough } from 'node:stream';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpTransportFactory } from './SreAgentMcpClient.js';
import { ALLOWED_SRE_AGENT_TOOLS } from './operations.js';

export interface FakeToolCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

export type FakeToolHandler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export interface FakeMcpServerOptions {
  /** Tool names the fake server advertises. Defaults to the Mission Control allowlist. */
  readonly toolNames?: readonly string[];
  /** Per-tool handlers returning either a raw string or a JSON-serialisable object. */
  readonly handlers?: Record<string, FakeToolHandler>;
  /** When set, every call blocks for this long, to exercise timeout and cancellation. */
  readonly hangMs?: number;
  /** Fails `connect()`, to exercise transport startup failure. */
  readonly failConnect?: Error;
  /**
   * Attaches a `stderr` stream to the transport (as StdioClientTransport does) and
   * writes these chunks to it in order as soon as the transport is created. Used to
   * exercise the real stderr accumulation path that feeds error messages.
   */
  readonly stderrChunks?: readonly string[];
}

export class FakeMcpServer {
  readonly calls: FakeToolCall[] = [];
  private readonly servers: Server[] = [];
  private readonly transports: Transport[] = [];

  constructor(private readonly options: FakeMcpServerOptions = {}) {}

  get toolNames(): readonly string[] {
    return this.options.toolNames ?? ALLOWED_SRE_AGENT_TOOLS;
  }

  /** Correlation-free view of which tools were invoked, in order. */
  get calledToolNames(): string[] {
    return this.calls.map((call) => call.name);
  }

  /** Transport factory to inject into SreAgentMcpClient / SreAgentService. */
  factory(): McpTransportFactory {
    return async () => {
      if (this.options.failConnect) throw this.options.failConnect;

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const server = this.buildServer();
      await server.connect(serverTransport);

      // Mirror StdioClientTransport's `stderr` so the client's real stderr
      // accumulation path is exercised end to end.
      if (this.options.stderrChunks) {
        const stderr = new PassThrough();
        Object.defineProperty(clientTransport, 'stderr', { value: stderr, configurable: true });
        // Emit synchronously after the client attaches its listener.
        queueMicrotask(() => {
          for (const chunk of this.options.stderrChunks ?? []) stderr.write(chunk);
        });
      }

      this.servers.push(server);
      this.transports.push(serverTransport);
      return clientTransport;
    };
  }

  private buildServer(): Server {
    const server = new Server({ name: 'fake-azure-mcp', version: '0.0.0-test' }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolNames.map((name) => ({
        name,
        description: `Fake ${name}`,
        inputSchema: { type: 'object' as const, properties: {}, additionalProperties: true },
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;
      this.calls.push({ name, args });

      if (this.options.hangMs) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, this.options.hangMs);
          timer.unref?.();
          extra.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('Request aborted by client'));
            },
            { once: true },
          );
        });
      }

      const handler = this.options.handlers?.[name];
      if (!handler) {
        return { content: [{ type: 'text' as const, text: `No fake handler registered for ${name}` }], isError: true };
      }

      const payload = await handler(args);
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
      return { content: [{ type: 'text' as const, text }] };
    });

    return server;
  }

  async close(): Promise<void> {
    for (const server of this.servers.splice(0)) {
      await server.close().catch(() => undefined);
    }
    this.transports.splice(0);
  }
}

/** Canonical agent payload matching the documented `sreagent_agents_*` result fields. */
export function fakeAgentPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    results: [
      {
        name: 'sre-agent-energygrid',
        id: '/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/rg-srelab-eastus2/providers/Microsoft.App/agents/sre-agent-energygrid',
        location: 'eastus2',
        resourceGroup: 'rg-srelab-eastus2',
        provisioningState: 'Succeeded',
        endpoint: 'https://sre-agent-energygrid.eastus2.azuresre.ai',
        ...overrides,
      },
    ],
  };
}

/** Canonical investigation payload with a thread ID and citations. */
export function fakeInvestigationPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    results: {
      threadId: 'thread-0f8a1c2d-9b3e-4c5f-8a7b-6d5e4f3a2b1c',
      response:
        'meter-service pods in namespace energy are being OOMKilled. Container memory limit is 128Mi while working set peaks at 190Mi during smart-meter ingest bursts.',
      citations: [
        { title: 'KubePodInventory — meter-service restarts', url: 'https://portal.azure.com/#logs', source: 'Log Analytics' },
        { title: 'AKS container events', source: 'Azure Monitor' },
      ],
      ...overrides,
    },
  };
}
