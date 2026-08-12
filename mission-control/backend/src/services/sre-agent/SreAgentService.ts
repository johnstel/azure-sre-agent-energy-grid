/**
 * Typed adapter between Mission Control and the Azure SRE Agent MCP server.
 *
 * Guarantees enforced here:
 *  - Only the six allowlisted operations are reachable; `investigate_yolo` and every
 *    auto-approval path are impossible (see `operations.ts` for the three layers).
 *  - A response is only labelled `provenance: 'azure-sre-agent'` when it carries a real
 *    agent resource identity AND a real thread ID. Otherwise the call fails honestly.
 *  - Local Analyst output is never substituted for an SRE Agent response.
 *  - All output is redacted and length-bounded before leaving the backend.
 *  - Every operation is auditable and cancellable.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../utils/logger.js';
import { isSreAgentUsable, loadSreAgentConfig, type SreAgentConfig } from './config.js';
import {
  ALLOWED_SRE_AGENT_TOOLS,
  BLOCKED_SRE_AGENT_TOOLS,
  isReadOnlySreAgentOperation,
  resolveOperationTool,
  SreAgentOperationDeniedError,
  type SreAgentOperation,
} from './operations.js';
import {
  SreAgentMcpClient,
  SreAgentMcpError,
  type McpTransportFactory,
} from './SreAgentMcpClient.js';
import { boundText, maskArmId, maskGuid, maskIdentifiers, redactForAudit, redactSensitiveText } from './redaction.js';
import { parseAgentList, parseThreadResponse, type ParsedAgentSummary } from './responseParser.js';
import type {
  ContinueSreAgentInvestigationRequest,
  SreAgentActiveThreadRecord,
  SreAgentCitation,
  SreAgentDiscoveryResponse,
  SreAgentIdentity,
  SreAgentInvestigation,
  SreAgentInvestigationStatus,
  SreAgentPortalHandoff,
  SreAgentTargetSummary,
  StartSreAgentInvestigationRequest,
} from '../../types/index.js';

const RESPONSE_LIMITATIONS = Object.freeze([
  'Standard investigation mode only: Mission Control never auto-approves an SRE Agent action.',
  'Approval gates are resolved by an operator in the Azure SRE Agent portal, not in Mission Control.',
  'Azure MCP Server response schemas are not contractual; field extraction is best-effort and labelled by schemaConfidence.',
  'Cancellation aborts the Mission Control request; agent-side work already started may continue server-side.',
]);

export class SreAgentNotConfiguredError extends Error {
  readonly statusCode = 503;
  readonly kind = 'not-configured' as const;
  readonly remediation: string;

  constructor(message: string, remediation: string) {
    super(message);
    this.name = 'SreAgentNotConfiguredError';
    this.remediation = remediation;
  }
}

/**
 * Raised when the MCP call succeeded but the payload lacks the identity needed to
 * honestly attribute the answer to Azure SRE Agent.
 */
export class SreAgentProvenanceError extends Error {
  readonly statusCode = 502;
  readonly kind = 'protocol' as const;
  readonly remediation =
    'Mission Control will not label a response as Azure SRE Agent output without a real agent resource and thread ID. Run the investigation in the SRE Agent portal and capture evidence there.';

  constructor(message: string) {
    super(message);
    this.name = 'SreAgentProvenanceError';
  }
}

interface ActiveOperation {
  readonly controller: AbortController;
  readonly operation: SreAgentOperation;
  readonly startedAt: number;
  readonly threadId?: string;
}

export class SreAgentService {
  private readonly client: SreAgentMcpClient;
  private readonly activeOperations = new Map<string, ActiveOperation>();
  private cachedAgent?: SreAgentIdentity;
  private threadStateQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: SreAgentConfig = loadSreAgentConfig(),
    transportFactory?: McpTransportFactory,
  ) {
    this.client = new SreAgentMcpClient(this.config, transportFactory);
  }

  get configuration(): SreAgentConfig {
    return this.config;
  }

  /** Masked, screen-share-safe summary of what Mission Control is pointed at. */
  targetSummary(): SreAgentTargetSummary {
    return {
      ...(this.config.agentName ? { agentName: this.config.agentName } : {}),
      ...(maskGuid(this.config.subscriptionId) ? { subscriptionIdMasked: maskGuid(this.config.subscriptionId) } : {}),
      ...(this.config.resourceGroup ? { resourceGroup: this.config.resourceGroup } : {}),
      ...(maskGuid(this.config.tenantId) ? { tenantIdMasked: maskGuid(this.config.tenantId) } : {}),
      serverPackage: this.config.serverPackage,
      allowedTools: [...ALLOWED_SRE_AGENT_TOOLS],
      blockedTools: [...BLOCKED_SRE_AGENT_TOOLS],
    };
  }

  portalHandoff(prompt?: string): SreAgentPortalHandoff {
    return {
      label: 'Open Azure SRE Agent portal',
      href: this.config.portalUrl,
      description:
        'Mission Control could not complete a supported SRE Agent MCP investigation. Run the prompt directly in the Azure SRE Agent portal and capture evidence there. Local Analyst is not a substitute.',
      ...(prompt ? { prompt } : {}),
    };
  }

  /** Lists SRE Agent resources and resolves the configured target. */
  async discoverAgents(signal?: AbortSignal, correlationId = normalizeCorrelationId()): Promise<SreAgentDiscoveryResponse> {
    this.assertUsable();

    return this.withCancellableOperation('discover-agents', 'discover-agents', signal, undefined, async (linked) => {
      const args: Record<string, unknown> = {};
      if (this.config.subscriptionId) args['subscription'] = this.config.subscriptionId;
      if (this.config.resourceGroup) args['resource-group'] = this.config.resourceGroup;
      if (this.config.tenantId) args['tenant'] = this.config.tenantId;

      const result = await this.invoke('discover-agents', args, {
        timeoutMs: this.config.requestTimeoutMs,
        signal: linked,
        correlationId,
      });

      const agents = parseAgentList(result.text, result.structuredContent).map((agent) => toIdentity(agent));
      const selected = agents.find(
        (agent) => agent.name.toLowerCase() === (this.config.agentName ?? '').toLowerCase(),
      );

      if (selected) this.cachedAgent = selected;

      return {
        configured: true,
        agents,
        ...(selected ? { selected } : {}),
        target: this.targetSummary(),
        collectedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Resolves the configured agent's identity, using `sreagent_agents_get`.
   * Required before any thread operation so provenance can be proven.
   *
   * When called from within a larger operation, the caller passes its linked signal and
   * correlation ID so cancellation and audit records cover this phase too.
   */
  async getConfiguredAgent(
    signal?: AbortSignal,
    refresh = false,
    correlationId = normalizeCorrelationId(),
  ): Promise<SreAgentIdentity> {
    this.assertUsable();
    if (this.cachedAgent && !refresh) return this.cachedAgent;

    const args: Record<string, unknown> = { agent: this.config.agentName };
    if (this.config.subscriptionId) args['subscription'] = this.config.subscriptionId;
    if (this.config.resourceGroup) args['resource-group'] = this.config.resourceGroup;
    if (this.config.tenantId) args['tenant'] = this.config.tenantId;

    const result = await this.invoke('get-agent', args, {
      timeoutMs: this.config.requestTimeoutMs,
      ...(signal ? { signal } : {}),
      correlationId,
    });

    const [agent] = parseAgentList(result.text, result.structuredContent);
    if (!agent?.name) {
      throw new SreAgentProvenanceError(
        `Azure MCP Server did not return an identifiable SRE Agent resource for '${this.config.agentName}'.`,
      );
    }

    this.cachedAgent = toIdentity(agent);
    return this.cachedAgent;
  }

  /**
   * Starts a real investigation thread in standard (approval-gated) mode.
   *
   * Uses `sreagent_threads_investigate`, which runs the documented multi-step loop and
   * pauses at approval gates. `investigate_yolo` is unreachable by construction.
   *
   * The whole operation — agent resolution plus the investigation call — is registered
   * under one correlation ID so `cancel()` stops all of it.
   */
  async startInvestigation(
    request: StartSreAgentInvestigationRequest & { prompt: string },
    signal?: AbortSignal,
  ): Promise<SreAgentInvestigation> {
    this.assertUsable();

    const prompt = normalizePrompt(request.prompt);
    const correlationId = normalizeCorrelationId(request.correlationId);
    const startedAt = new Date();

    const investigation = await this.withCancellableOperation(
      correlationId,
      'investigate',
      signal,
      undefined,
      async (linked) => {
        const agent = await this.getConfiguredAgent(linked, false, correlationId);

        const args: Record<string, unknown> = {
          agent: this.config.agentName,
          message: prompt,
          'max-iterations': this.config.maxIterations,
          'timeout-seconds': Math.floor(this.config.investigationTimeoutMs / 1000),
        };
        if (this.config.subscriptionId) args['subscription'] = this.config.subscriptionId;
        if (this.config.resourceGroup) args['resource-group'] = this.config.resourceGroup;
        if (this.config.tenantId) args['tenant'] = this.config.tenantId;

        const result = await this.invoke('investigate', args, {
          timeoutMs: this.config.investigationTimeoutMs,
          signal: linked,
          correlationId,
        });

        return this.buildInvestigation({
          operation: 'investigate',
          agent,
          rawText: result.text,
          structuredContent: result.structuredContent,
          isError: result.isError,
          startedAt,
          correlationId,
        });
      },
    );

    await this.recordThread(investigation, request.scenarioName);
    return investigation;
  }

  /** Continues an existing thread with an operator follow-up prompt. */
  async continueInvestigation(
    request: ContinueSreAgentInvestigationRequest,
    signal?: AbortSignal,
  ): Promise<SreAgentInvestigation> {
    this.assertUsable();

    const threadId = normalizeThreadId(request.threadId);
    const prompt = normalizePrompt(request.prompt);
    const correlationId = normalizeCorrelationId(request.correlationId);
    const startedAt = new Date();

    const investigation = await this.withCancellableOperation(
      correlationId,
      'follow-up',
      signal,
      threadId,
      async (linked) => {
        const agent = await this.getConfiguredAgent(linked, false, correlationId);

        const args: Record<string, unknown> = {
          agent: this.config.agentName,
          'thread-id': threadId,
          message: prompt,
        };
        if (this.config.subscriptionId) args['subscription'] = this.config.subscriptionId;
        if (this.config.resourceGroup) args['resource-group'] = this.config.resourceGroup;
        if (this.config.tenantId) args['tenant'] = this.config.tenantId;

        const result = await this.invoke('follow-up', args, {
          timeoutMs: this.config.requestTimeoutMs,
          signal: linked,
          correlationId,
        });

        return this.buildInvestigation({
          operation: 'follow-up',
          agent,
          rawText: result.text,
          structuredContent: result.structuredContent,
          isError: result.isError,
          startedAt,
          correlationId,
          // The thread ID is already proven by the caller's prior turn; the follow-up
          // response is not required to echo it.
          fallbackThreadId: threadId,
        });
      },
    );

    await this.recordThread(investigation);
    return investigation;
  }

  /**
   * Reads current thread state. This is how an in-flight investigation is re-attached
   * after a Mission Control backend restart: the thread lives server-side, so the
   * durable thread ID is sufficient to resume.
   */
  async getThreadStatus(threadId: string, signal?: AbortSignal): Promise<SreAgentInvestigation> {
    this.assertUsable();

    const normalizedThreadId = normalizeThreadId(threadId);
    const correlationId = normalizeCorrelationId();
    const startedAt = new Date();

    return this.withCancellableOperation(
      correlationId,
      'thread-status',
      signal,
      normalizedThreadId,
      async (linked) => {
        const agent = await this.getConfiguredAgent(linked, false, correlationId);

        const args: Record<string, unknown> = {
          agent: this.config.agentName,
          'thread-id': normalizedThreadId,
        };
        if (this.config.subscriptionId) args['subscription'] = this.config.subscriptionId;
        if (this.config.resourceGroup) args['resource-group'] = this.config.resourceGroup;
        if (this.config.tenantId) args['tenant'] = this.config.tenantId;

        const result = await this.invoke('thread-status', args, {
          timeoutMs: this.config.requestTimeoutMs,
          signal: linked,
          correlationId,
        });

        return this.buildInvestigation({
          operation: 'thread-status',
          agent,
          rawText: result.text,
          structuredContent: result.structuredContent,
          isError: result.isError,
          startedAt,
          correlationId,
          fallbackThreadId: normalizedThreadId,
        });
      },
    );
  }

  /**
   * Cancels an in-flight Mission Control operation.
   *
   * Azure MCP Server does not document a server-side cancel/stop for a running
   * investigation, so this aborts the Mission Control request and prevents further
   * proxying and retries. Agent-side work already started may continue; the UI and docs
   * say so rather than implying a hard stop.
   */
  cancel(correlationId: string): boolean {
    const active = this.activeOperations.get(correlationId);
    if (!active) return false;

    active.controller.abort();
    this.activeOperations.delete(correlationId);
    logger.info(
      { correlationId, operation: active.operation, event: 'sre-agent.cancel' },
      'SRE Agent operation cancelled by operator',
    );
    return true;
  }

  /** Correlation IDs of operations currently in flight. */
  activeOperationIds(): string[] {
    return [...this.activeOperations.keys()];
  }

  async listTools(): Promise<string[]> {
    this.assertUsable();
    return this.client.listToolNames();
  }

  async shutdown(): Promise<void> {
    for (const [id, active] of this.activeOperations) {
      active.controller.abort();
      this.activeOperations.delete(id);
    }
    await this.client.dispose();
  }

  private assertUsable(): void {
    if (isSreAgentUsable(this.config)) return;

    const issues = this.config.configurationIssues;
    throw new SreAgentNotConfiguredError(
      'The Azure SRE Agent MCP integration is not configured.',
      issues.length > 0 ? issues.join(' ') : 'Set SRE_AGENT_NAME and SRE_AGENT_SUBSCRIPTION_ID, then restart Mission Control.',
    );
  }

  /** Single dispatch path: allowlist check, audit logging, and signal propagation. */
  private async invoke(
    operation: SreAgentOperation,
    args: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal; correlationId?: string; threadId?: string },
  ) {
    const toolName = resolveOperationTool(operation);
    const correlationId = options.correlationId ?? normalizeCorrelationId();

    this.audit({
      event: 'sre-agent.request',
      operation,
      tool: toolName,
      correlationId,
      readOnly: isReadOnlySreAgentOperation(operation),
      args,
    });

    try {
      const result = await this.client.callTool(toolName, args, {
        timeoutMs: options.timeoutMs,
        ...(options.signal ? { signal: options.signal } : {}),
      });

      this.audit({
        event: 'sre-agent.response',
        operation,
        tool: toolName,
        correlationId,
        resultStatus: result.isError ? 'failed' : 'allowed',
        bytes: result.text.length,
      });

      return result;
    } catch (error) {
      this.audit({
        event: 'sre-agent.failure',
        operation,
        tool: toolName,
        correlationId,
        resultStatus: error instanceof SreAgentMcpError ? error.kind : 'failed',
        message: error instanceof Error ? redactSensitiveText(error.message) : 'unknown',
      });
      throw error;
    }
  }

  /**
   * Registers one cancellable logical operation under `correlationId` and runs `body`
   * with a linked signal.
   *
   * Cancellation is scoped to the whole operation — including agent resolution — so an
   * operator pressing Stop during the discovery phase actually stops the work, rather
   * than only the final MCP call.
   */
  private async withCancellableOperation<T>(
    correlationId: string,
    operation: SreAgentOperation,
    externalSignal: AbortSignal | undefined,
    threadId: string | undefined,
    body: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    let detachExternal: (() => void) | undefined;

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        const onAbort = () => controller.abort();
        externalSignal.addEventListener('abort', onAbort, { once: true });
        // Detached in `finally` so a long-lived caller signal that never aborts does not
        // accumulate listeners (and references to completed operations) over time.
        detachExternal = () => externalSignal.removeEventListener('abort', onAbort);
      }
    }

    this.activeOperations.set(correlationId, {
      controller,
      operation,
      startedAt: Date.now(),
      ...(threadId ? { threadId } : {}),
    });

    try {
      return await body(controller.signal);
    } finally {
      detachExternal?.();
      this.activeOperations.delete(correlationId);
    }
  }

  /**
   * Builds the response contract and enforces the provenance rule.
   * Throws rather than returning an unverified "SRE Agent" answer.
   */
  private buildInvestigation(input: {
    operation: SreAgentOperation;
    agent: SreAgentIdentity;
    rawText: string;
    structuredContent?: unknown;
    isError: boolean;
    startedAt: Date;
    correlationId: string;
    fallbackThreadId?: string;
  }): SreAgentInvestigation {
    const parsed = parseThreadResponse(input.rawText, input.structuredContent);
    const threadId = parsed.threadId ?? input.fallbackThreadId;

    if (input.isError) {
      throw new SreAgentMcpError(
        'unknown',
        `Azure SRE Agent returned an error: ${boundText(parsed.messageText || input.rawText, 1_000).text}`,
        'Review the message, then retry or continue in the SRE Agent portal.',
        502,
      );
    }

    if (!threadId) {
      throw new SreAgentProvenanceError(
        'Azure MCP Server returned a response without a thread ID, so Mission Control cannot prove it came from a real SRE Agent thread.',
      );
    }

    if (!input.agent.name) {
      throw new SreAgentProvenanceError('Mission Control could not resolve the SRE Agent resource identity for this response.');
    }

    const completedAt = new Date();
    const known = {
      ...(this.config.subscriptionId ? { subscriptionId: this.config.subscriptionId } : {}),
      ...(this.config.tenantId ? { tenantId: this.config.tenantId } : {}),
    };
    // The agent quotes ARM IDs in prose, so mask identifiers in the response body and
    // citation labels — not only in the structured identity fields.
    const bounded = boundText(maskIdentifiers(parsed.messageText, known), this.config.maxResponseChars);
    const citations = parsed.citations.slice(0, 25).map(
      (citation): SreAgentCitation => ({
        label: maskIdentifiers(redactSensitiveText(citation.label), known).slice(0, 300),
        // Citation URLs are left navigable so the operator can open the cited evidence;
        // they are already restricted to http(s) by the parser.
        ...(citation.url ? { url: citation.url } : {}),
        ...(citation.source ? { source: redactSensitiveText(citation.source).slice(0, 120) } : {}),
      }),
    );

    return {
      provenance: 'azure-sre-agent',
      status: deriveStatus(parsed.approvalRequired, parsed.statusHint),
      agent: input.agent,
      thread: {
        id: threadId,
        createdAt: input.startedAt.toISOString(),
        portalUrl: this.config.portalUrl,
      },
      response: bounded.text,
      citations,
      citationsPresent: citations.length > 0,
      approval: {
        required: parsed.approvalRequired,
        ...(parsed.approvalDetail
          ? { detail: maskIdentifiers(redactSensitiveText(parsed.approvalDetail), known).slice(0, 800) }
          : {}),
        autoApproved: false,
      },
      metadata: {
        operation: input.operation,
        tool: resolveOperationTool(input.operation),
        startedAt: input.startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        elapsedMs: completedAt.getTime() - input.startedAt.getTime(),
        truncated: bounded.truncated,
        schemaConfidence: parsed.schemaConfidence,
        serverPackage: this.config.serverPackage,
        correlationId: input.correlationId,
        limitations: [...RESPONSE_LIMITATIONS],
      },
    };
  }

  /** Audit record shaped to match docs/LOCAL-ANALYST-GOVERNANCE.md requirements. */
  private audit(entry: Record<string, unknown>): void {
    const { args, ...rest } = entry;
    logger.info(
      {
        ...rest,
        requester: process.env['USER'] ?? 'local-operator',
        target: this.config.agentName ?? 'unconfigured',
        timestamp: new Date().toISOString(),
        redactionNotes: 'Prompt and payload fields redacted and bounded before logging.',
        ...(args ? { args: redactForAudit(args) } : {}),
      },
      'SRE Agent MCP audit',
    );
  }

  // --- durable thread references (survive a backend restart) ---------------

  private async recordThread(
    investigation: SreAgentInvestigation,
    scenarioName?: StartSreAgentInvestigationRequest['scenarioName'],
  ): Promise<void> {
    const record: SreAgentActiveThreadRecord = {
      threadId: investigation.thread.id,
      agentName: investigation.agent.name,
      ...(scenarioName ? { scenarioName } : {}),
      startedAt: investigation.thread.createdAt,
      updatedAt: new Date().toISOString(),
      lastStatus: investigation.status,
      correlationId: investigation.metadata.correlationId,
    };

    await this.withThreadStateLock(async () => {
      const threads = await readThreadState();
      const existingIndex = threads.findIndex((entry) => entry.threadId === record.threadId);
      if (existingIndex >= 0) {
        const existing = threads[existingIndex]!;
        threads[existingIndex] = { ...existing, ...record, startedAt: existing.startedAt };
      } else {
        threads.push(record);
      }
      await writeThreadState(threads.slice(-25));
    }).catch((error) => {
      logger.warn(
        { err: error instanceof Error ? redactSensitiveText(error.message) : 'unknown' },
        'Failed to persist SRE Agent thread reference',
      );
    });
  }

  async listRecordedThreads(): Promise<SreAgentActiveThreadRecord[]> {
    return readThreadState();
  }

  private async withThreadStateLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.threadStateQueue;
    let release!: () => void;
    this.threadStateQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function toIdentity(agent: ParsedAgentSummary): SreAgentIdentity {
  return {
    name: agent.name ?? '',
    ...(maskArmId(agent.armId) ? { armIdMasked: maskArmId(agent.armId) } : {}),
    ...(agent.resourceGroup ? { resourceGroup: agent.resourceGroup } : {}),
    ...(maskGuid(agent.subscriptionId) ? { subscriptionIdMasked: maskGuid(agent.subscriptionId) } : {}),
    ...(agent.location ? { location: agent.location } : {}),
    ...(agent.provisioningState ? { provisioningState: agent.provisioningState } : {}),
    ...(agent.endpointHost ? { endpointHost: agent.endpointHost } : {}),
  };
}

function deriveStatus(approvalRequired: boolean, statusHint?: string): SreAgentInvestigationStatus {
  if (approvalRequired) return 'awaiting-approval';
  if (statusHint && /running|in[_-]?progress|active/i.test(statusHint)) return 'running';
  if (statusHint && /cancel/i.test(statusHint)) return 'cancelled';
  if (statusHint && /fail|error/i.test(statusHint)) return 'failed';
  return 'completed';
}

const MAX_PROMPT_CHARS = 8_000;

export function normalizePrompt(prompt: unknown): string {
  if (typeof prompt !== 'string') {
    throw new SreAgentOperationDeniedError('An investigation prompt is required.');
  }
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new SreAgentOperationDeniedError('An investigation prompt is required.');
  }
  if (trimmed.length > MAX_PROMPT_CHARS) {
    throw new SreAgentOperationDeniedError(`Investigation prompts are limited to ${MAX_PROMPT_CHARS} characters.`);
  }
  return trimmed;
}

export function normalizeThreadId(threadId: unknown): string {
  if (typeof threadId !== 'string' || !threadId.trim()) {
    throw new SreAgentOperationDeniedError('A thread ID is required.');
  }
  const trimmed = threadId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(trimmed)) {
    throw new SreAgentOperationDeniedError('The supplied thread ID is not a valid SRE Agent thread identifier.');
  }
  return trimmed;
}

function normalizeCorrelationId(correlationId?: string): string {
  if (typeof correlationId === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(correlationId.trim())) {
    return correlationId.trim();
  }
  return randomUUID();
}

// --- thread state persistence ------------------------------------------------

function getThreadStatePath(): string {
  const override = process.env['SRE_AGENT_THREAD_STATE_PATH'];
  if (override) return override;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', '..', 'state', 'sre-agent-threads.json');
}

async function readThreadState(): Promise<SreAgentActiveThreadRecord[]> {
  const path = getThreadStatePath();
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { threads?: SreAgentActiveThreadRecord[] };
    return Array.isArray(parsed.threads) ? parsed.threads : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    return [];
  }
}

async function writeThreadState(threads: SreAgentActiveThreadRecord[]): Promise<void> {
  const path = getThreadStatePath();
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, JSON.stringify({ threads, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
