/**
 * Lifecycle-managed MCP client for the Azure MCP Server `sreagent` tool surface.
 *
 * Responsibilities:
 *  - own the child process / transport lifecycle (lazy start, idle shutdown, disposal);
 *  - enforce the tool allowlist immediately before every dispatch;
 *  - apply per-call timeouts and cooperative cancellation;
 *  - normalise transport failures into actionable, redacted errors.
 *
 * The transport is injected through `McpTransportFactory` so tests can run the real MCP
 * protocol against an in-memory fake server without spawning `npx`.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { buildChildEnv, type SreAgentConfig } from './config.js';
import { assertToolAllowed, type SreAgentToolName } from './operations.js';
import { redactSensitiveText } from './redaction.js';
import { logger } from '../../utils/logger.js';

export type McpTransportFactory = (config: SreAgentConfig) => Promise<Transport> | Transport;

/** JSON-RPC error code the MCP SDK raises when a request exceeds its timeout. */
const MCP_REQUEST_TIMEOUT_CODE = -32001;

export interface McpToolCallOptions {
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface McpToolCallResult {
  /** Concatenated text content blocks, before bounding. */
  readonly text: string;
  readonly isError: boolean;
  readonly structuredContent?: unknown;
}

export type SreAgentFailureKind =
  | 'not-configured'
  | 'auth'
  | 'permission'
  | 'not-found'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'runtime-missing'
  | 'protocol'
  | 'denied'
  | 'unknown';

export class SreAgentMcpError extends Error {
  readonly kind: SreAgentFailureKind;
  readonly statusCode: number;
  readonly remediation: string;

  constructor(kind: SreAgentFailureKind, message: string, remediation: string, statusCode = 503) {
    super(message);
    this.name = 'SreAgentMcpError';
    this.kind = kind;
    this.remediation = remediation;
    this.statusCode = statusCode;
  }
}

/** Default transport: spawn Azure MCP Server over stdio with the tool allowlist applied. */
export const createStdioTransport: McpTransportFactory = (config) =>
  new StdioClientTransport({
    command: config.command,
    args: [...config.args],
    env: buildChildEnv(config),
    // 'pipe' keeps child diagnostics out of Mission Control's stdout, which would
    // otherwise corrupt operator-facing logs and could leak environment detail.
    stderr: 'pipe',
  });

export class SreAgentMcpClient {
  private client?: Client;
  private transport?: Transport;
  private connecting?: Promise<Client>;
  private idleTimer?: NodeJS.Timeout;
  private inFlight = 0;
  private disposed = false;
  private lastStderr = '';

  constructor(
    private readonly config: SreAgentConfig,
    private readonly transportFactory: McpTransportFactory = createStdioTransport,
  ) {}

  /** True when a live MCP session is currently held. */
  get connected(): boolean {
    return this.client !== undefined;
  }

  async listToolNames(): Promise<string[]> {
    const client = await this.connect();
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name).sort();
  }

  /**
   * Dispatches an allowlisted tool call.
   *
   * `assertToolAllowed` runs here — not only at the caller — so that every path into the
   * MCP server is gated even if a future caller forgets.
   */
  async callTool(
    toolName: SreAgentToolName,
    args: Record<string, unknown>,
    options: McpToolCallOptions,
  ): Promise<McpToolCallResult> {
    assertToolAllowed(toolName);

    if (options.signal?.aborted) {
      throw new SreAgentMcpError('cancelled', 'The SRE Agent operation was cancelled before it started.', 'Start a new investigation when ready.', 499);
    }

    const client = await this.connect();
    this.inFlight += 1;
    this.clearIdleTimer();

    try {
      const result = await client.callTool(
        { name: toolName, arguments: args },
        undefined,
        {
          timeout: options.timeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
        },
      );

      return normalizeToolResult(result);
    } catch (error) {
      throw this.normalizeError(error, options);
    } finally {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.scheduleIdleShutdown();
    }
  }

  /** Establishes (or reuses) a session. Concurrent callers share one connect attempt. */
  private async connect(): Promise<Client> {
    if (this.disposed) {
      throw new SreAgentMcpError('protocol', 'The SRE Agent MCP client has been shut down.', 'Restart Mission Control to reconnect.', 503);
    }
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;

    this.connecting = this.establish().finally(() => {
      this.connecting = undefined;
    });

    return this.connecting;
  }

  private async establish(): Promise<Client> {
    const client = new Client(
      { name: 'mission-control-sre-agent', version: '1.0.0' },
      { capabilities: {} },
    );

    let transport: Transport;
    try {
      transport = await this.transportFactory(this.config);
    } catch (error) {
      throw this.normalizeError(error);
    }

    this.captureStderr(transport);

    transport.onerror = (error: Error) => {
      logger.warn({ err: redactSensitiveText(error.message) }, 'SRE Agent MCP transport error');
    };
    transport.onclose = () => {
      // Drop the cached session so the next call reconnects instead of using a dead pipe.
      if (this.transport === transport) {
        this.client = undefined;
        this.transport = undefined;
      }
    };

    try {
      await client.connect(transport);
    } catch (error) {
      await safeClose(transport);
      throw this.normalizeError(error);
    }

    // dispose() may have been called while the child process was starting (a cold npx
    // start takes seconds). Without this re-check the freshly connected transport would
    // be cached on a disposed client and never closed, orphaning the child process.
    if (this.disposed) {
      await client.close().catch(() => undefined);
      await safeClose(transport);
      throw new SreAgentMcpError(
        'protocol',
        'The SRE Agent MCP client was shut down while the server was starting.',
        'Restart Mission Control to reconnect.',
        503,
      );
    }

    this.client = client;
    this.transport = transport;
    this.scheduleIdleShutdown();
    return client;
  }

  /** Buffers a bounded tail of child stderr to explain startup failures. */
  private captureStderr(transport: Transport): void {
    // Reset per transport so stale output from a previous failed process is never
    // attributed to a later, unrelated failure.
    this.lastStderr = '';

    const stderr = (transport as StdioClientTransport).stderr;
    if (!stderr || typeof stderr.on !== 'function') return;

    stderr.on('data', (chunk: Buffer | string) => {
      // Buffer raw and redact once on read, so a secret straddling a chunk boundary is
      // still matched by the redaction rules.
      this.lastStderr = `${this.lastStderr}${String(chunk)}`.slice(-2_000);
    });
  }

  private scheduleIdleShutdown(): void {
    this.clearIdleTimer();
    if (this.inFlight > 0 || !this.client || this.disposed) return;

    this.idleTimer = setTimeout(() => {
      if (this.inFlight === 0) {
        void this.disconnect();
      }
    }, this.config.idleShutdownMs);
    this.idleTimer.unref?.();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  /** Tears down the current session without permanently disabling the client. */
  async disconnect(): Promise<void> {
    this.clearIdleTimer();
    const client = this.client;
    const transport = this.transport;
    this.client = undefined;
    this.transport = undefined;

    if (client) {
      await client.close().catch(() => undefined);
    }
    if (transport) {
      await safeClose(transport);
    }
  }

  /** Permanently shuts the client down; used on backend shutdown. */
  async dispose(): Promise<void> {
    this.disposed = true;
    // Wait for any in-flight connect to settle so its transport is disconnected too,
    // rather than being established moments after we tear down.
    await this.connecting?.catch(() => undefined);
    await this.disconnect();
  }

  private normalizeError(error: unknown, options?: McpToolCallOptions): SreAgentMcpError {
    if (error instanceof SreAgentMcpError) return error;

    const err = error as NodeJS.ErrnoException;
    const rawMessage = err?.message ?? String(error);
    // MCP protocol errors carry a numeric JSON-RPC code; Node system errors carry a string code.
    const errorCode: string | number | undefined = (error as { code?: string | number })?.code;
    const message = redactSensitiveText(rawMessage);
    const normalized = message.toLowerCase();
    const stderrHint = redactSensitiveText(this.lastStderr).trim();

    if (options?.signal?.aborted || err?.name === 'AbortError' || normalized.includes('aborted')) {
      return new SreAgentMcpError(
        'cancelled',
        'The SRE Agent operation was cancelled.',
        'The in-flight request was aborted. Any agent-side work already started continues in the SRE Agent portal.',
        499,
      );
    }

    if (errorCode === 'ENOENT') {
      return new SreAgentMcpError(
        'runtime-missing',
        `Could not launch the Azure MCP Server (command '${this.config.command}' not found).`,
        'Install Node.js LTS so npx is on PATH, or set SRE_AGENT_MCP_COMMAND to a valid launcher.',
        503,
      );
    }

    if (normalized.includes('timeout') || normalized.includes('timed out') || errorCode === MCP_REQUEST_TIMEOUT_CODE) {
      return new SreAgentMcpError(
        'timeout',
        'The SRE Agent operation did not complete before the Mission Control timeout.',
        'Retry with a narrower prompt, or continue the investigation in the SRE Agent portal.',
        504,
      );
    }

    if (/401|unauthor|not signed in|no.*credential|interactive.*suppress|defaultazurecredential/i.test(message)) {
      return new SreAgentMcpError(
        'auth',
        'Azure authentication failed for the SRE Agent MCP server.',
        'Run `az login` (add `--tenant <agent-tenant-id>` if the agent is in another tenant), then retry.',
        401,
      );
    }

    if (/403|forbidden|not authorized|authorizationfailed|does not have authorization/i.test(message)) {
      return new SreAgentMcpError(
        'permission',
        'Azure denied the SRE Agent request (missing RBAC).',
        'Assign Reader (control plane) and SRE Agent Administrator (data plane) on the Microsoft.App/agents resource.',
        403,
      );
    }

    if (/404|not found|resourcenotfound|no agent endpoint/i.test(message)) {
      return new SreAgentMcpError(
        'not-found',
        'The configured SRE Agent resource or thread was not found.',
        'Confirm SRE_AGENT_NAME, SRE_AGENT_SUBSCRIPTION_ID, and SRE_AGENT_RESOURCE_GROUP, and that provisioningState is Succeeded.',
        404,
      );
    }

    if (/enotfound|econnrefused|eai_again|etimedout|econnreset|network|dns|proxy|azuresre\.ai/i.test(message)) {
      return new SreAgentMcpError(
        'network',
        'Mission Control could not reach the SRE Agent data-plane endpoint.',
        'Allow outbound HTTPS to *.azuresre.ai and management.azure.com, then retry.',
        503,
      );
    }

    const detail = stderrHint ? `${message} (server: ${stderrHint.slice(-300)})` : message;
    return new SreAgentMcpError(
      'unknown',
      `The SRE Agent MCP server request failed: ${detail}`,
      'Check Azure sign-in, RBAC, and network access, then retry. Use the SRE Agent portal handoff if the failure persists.',
      503,
    );
  }
}

async function safeClose(transport: Transport): Promise<void> {
  try {
    await transport.close();
  } catch {
    // Closing a already-dead transport is not actionable.
  }
}

/** Flattens MCP content blocks into plain text plus any structured payload. */
export function normalizeToolResult(result: unknown): McpToolCallResult {
  const record = (result ?? {}) as Record<string, unknown>;
  const content = Array.isArray(record.content) ? record.content : [];

  const text = content
    .map((block) => {
      const entry = block as Record<string, unknown>;
      if (entry?.type === 'text' && typeof entry.text === 'string') return entry.text;
      if (typeof entry?.text === 'string') return entry.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();

  return {
    text,
    isError: record.isError === true,
    structuredContent: record.structuredContent,
  };
}
