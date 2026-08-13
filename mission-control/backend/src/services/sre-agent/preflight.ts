/**
 * Preflight checks for the Azure SRE Agent MCP path.
 *
 * Each check answers one question an operator can act on before a demo:
 * configuration, Azure sign-in, Node/npx runtime, MCP server surface, agent discovery,
 * RBAC, and `*.azuresre.ai` reachability. Failures are reported with a concrete
 * remediation rather than a generic "unavailable".
 *
 * Checks are read-only and must never mutate Azure or agent state.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isSreAgentUsable, type SreAgentConfig } from './config.js';
import { ALLOWED_SRE_AGENT_TOOLS, BLOCKED_SRE_AGENT_TOOLS } from './operations.js';
import { maskGuid, redactSensitiveText } from './redaction.js';
import { SreAgentMcpError } from './SreAgentMcpClient.js';
import type { SreAgentService } from './SreAgentService.js';
import type {
  SreAgentPreflightCheck,
  SreAgentPreflightResult,
} from '../../types/index.js';

const exec = promisify(execFile);

const AZ_TIMEOUT_MS = 15_000;
const TOOL_LIST_TIMEOUT_MS = 120_000;
const NETWORK_TIMEOUT_MS = 10_000;

/** Data-plane suffix documented for SRE Agent endpoints. */
export const SRE_AGENT_DATA_PLANE_SUFFIX = 'azuresre.ai';

type CommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

const defaultRunner: CommandRunner = async (command, args, timeoutMs) => {
  const { stdout, stderr } = await exec(command, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 });
  return { stdout: String(stdout), stderr: String(stderr) };
};

export interface SreAgentPreflightOptions {
  /** Skips the MCP tool-list probe, which can take ~30s on a cold npx cache. */
  readonly skipMcpProbe?: boolean;
  readonly runner?: CommandRunner;
  /** Injected for tests; defaults to a real DNS lookup of the agent endpoint host. */
  readonly resolveHost?: (host: string) => Promise<boolean>;
}

async function defaultResolveHost(host: string): Promise<boolean> {
  const { lookup } = await import('node:dns/promises');
  try {
    await lookup(host);
    return true;
  } catch {
    return false;
  }
}

export async function collectSreAgentPreflight(
  service: SreAgentService,
  options: SreAgentPreflightOptions = {},
): Promise<SreAgentPreflightResult> {
  const config = service.configuration;
  const runner = options.runner ?? defaultRunner;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const checks: SreAgentPreflightCheck[] = [];

  checks.push(configurationCheck(config));

  const azAccount = await azAccountCheck(runner, config);
  checks.push(azAccount.check);

  if (!isSreAgentUsable(config)) {
    return finalize(service, checks, config);
  }

  if (options.skipMcpProbe) {
    checks.push({
      name: 'Azure MCP Server tool surface',
      status: 'skipped',
      message: 'MCP probe skipped by request.',
      remediation: 'Re-run preflight without skipMcpProbe to verify the allowlisted tool surface.',
    });
    return finalize(service, checks, config);
  }

  const toolCheck = await mcpToolSurfaceCheck(service, config);
  checks.push(...toolCheck);

  // Only attempt discovery when the transport itself came up.
  if (toolCheck.every((check) => check.status !== 'fail')) {
    const discovery = await agentDiscoveryCheck(service, config);
    checks.push(discovery.check);

    if (discovery.endpointHost) {
      checks.push(await endpointReachabilityCheck(discovery.endpointHost, resolveHost));
    } else {
      checks.push({
        name: 'SRE Agent data-plane reachability',
        status: 'warn',
        message: `Agent endpoint host was not reported, so *.${SRE_AGENT_DATA_PLANE_SUFFIX} reachability could not be verified.`,
        remediation: `Allow outbound HTTPS to *.${SRE_AGENT_DATA_PLANE_SUFFIX} and confirm the agent is fully provisioned.`,
      });
    }
  }

  return finalize(service, checks, config);
}

function configurationCheck(config: SreAgentConfig): SreAgentPreflightCheck {
  if (!config.configured) {
    return {
      name: 'SRE Agent configuration',
      status: 'fail',
      message: 'Mission Control has no configured Azure SRE Agent target.',
      remediation: config.configurationIssues.join(' '),
    };
  }
  if (!config.enabled) {
    return {
      name: 'SRE Agent configuration',
      status: 'fail',
      message: 'The SRE Agent MCP integration is disabled by configuration.',
      remediation: 'Set SRE_AGENT_MCP_ENABLED=true and restart Mission Control.',
    };
  }
  return {
    name: 'SRE Agent configuration',
    status: 'pass',
    message: `Targeting agent '${config.agentName}' in subscription ${maskGuid(config.subscriptionId)}${
      config.resourceGroup ? ` (resource group ${config.resourceGroup})` : ''
    }.`,
  };
}

async function azAccountCheck(
  runner: CommandRunner,
  config: SreAgentConfig,
): Promise<{ check: SreAgentPreflightCheck }> {
  try {
    const { stdout } = await runner('az', ['account', 'show', '--output', 'json'], AZ_TIMEOUT_MS);
    const account = JSON.parse(stdout) as { id?: string; name?: string; tenantId?: string };

    if (config.tenantId && account.tenantId && account.tenantId.toLowerCase() !== config.tenantId.toLowerCase()) {
      return {
        check: {
          name: 'Azure sign-in',
          status: 'warn',
          message: `Signed in to tenant ${maskGuid(account.tenantId)}, but SRE_AGENT_TENANT_ID is ${maskGuid(config.tenantId)}.`,
          // Preflight output is pasted into issues and evidence packs, so the raw GUID
          // is never interpolated here; the operator reads it from their own config.
          remediation: 'Run: az login --tenant "$SRE_AGENT_TENANT_ID"',
        },
      };
    }

    if (config.subscriptionId && account.id && account.id.toLowerCase() !== config.subscriptionId.toLowerCase()) {
      return {
        check: {
          name: 'Azure sign-in',
          status: 'warn',
          message: `Azure CLI default subscription is ${maskGuid(account.id)}, which differs from the configured target.`,
          remediation: 'Mission Control passes the configured subscription explicitly, but running `az account set` avoids confusion.',
        },
      };
    }

    return {
      check: {
        name: 'Azure sign-in',
        status: 'pass',
        message: `Signed in as subscription ${account.name ?? 'unknown'} (${maskGuid(account.id)}).`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? redactSensitiveText(error.message) : 'unknown error';
    const notFound = (error as NodeJS.ErrnoException)?.code === 'ENOENT';
    return {
      check: {
        name: 'Azure sign-in',
        status: 'fail',
        message: notFound ? 'Azure CLI is not available on PATH.' : `Not signed in to Azure (${message.slice(0, 200)}).`,
        remediation: notFound
          ? 'Install the Azure CLI, then run `az login`.'
          : 'Run `az login` (add `--tenant <agent-tenant-id>` if the agent lives in another tenant). Azure MCP Server suppresses interactive sign-in, so you must sign in first.',
      },
    };
  }
}

async function mcpToolSurfaceCheck(service: SreAgentService, config: SreAgentConfig): Promise<SreAgentPreflightCheck[]> {
  const checks: SreAgentPreflightCheck[] = [];

  try {
    const tools = await withTimeout(service.listTools(), TOOL_LIST_TIMEOUT_MS);
    const exposed = new Set(tools);
    const missing = ALLOWED_SRE_AGENT_TOOLS.filter((tool) => !exposed.has(tool));
    const forbidden = tools.filter((tool) => BLOCKED_SRE_AGENT_TOOLS.includes(tool) || /yolo/i.test(tool));

    checks.push({
      name: 'Azure MCP Server tool surface',
      status: missing.length === 0 ? 'pass' : 'fail',
      message:
        missing.length === 0
          ? `Azure MCP Server (${config.serverPackage}) exposed all ${tools.length} allowlisted SRE Agent tools.`
          : `Azure MCP Server did not expose: ${missing.join(', ')}.`,
      ...(missing.length === 0
        ? {}
        : {
            remediation:
              'Clear the npx cache (`rm -rf ~/.npm/_npx`) and confirm SRE_AGENT_MCP_PACKAGE points at a version that includes the sreagent namespace.',
          }),
    });

    checks.push({
      name: 'Auto-approval tools blocked',
      status: forbidden.length === 0 ? 'pass' : 'fail',
      message:
        forbidden.length === 0
          ? 'investigate_yolo and every auto-approval tool are absent from the MCP server surface.'
          : `Blocked tools were exposed by the MCP server: ${forbidden.join(', ')}.`,
      ...(forbidden.length === 0
        ? {}
        : { remediation: 'Do not use this build. Mission Control must launch Azure MCP Server with its --tool allowlist.' }),
    });
  } catch (error) {
    const mcpError = error instanceof SreAgentMcpError ? error : undefined;
    checks.push({
      name: 'Azure MCP Server tool surface',
      status: 'fail',
      message: mcpError?.message ?? `Could not start the Azure MCP Server: ${errorText(error)}`,
      remediation:
        mcpError?.remediation ??
        'Confirm Node.js LTS is installed so `npx` can launch the Azure MCP Server, then retry.',
    });
  }

  return checks;
}

async function agentDiscoveryCheck(
  service: SreAgentService,
  config: SreAgentConfig,
): Promise<{ check: SreAgentPreflightCheck; endpointHost?: string }> {
  try {
    const discovery = await service.discoverAgents();

    if (!discovery.selected) {
      const names = discovery.agents.map((agent) => agent.name).filter(Boolean);
      return {
        check: {
          name: 'SRE Agent discovery',
          status: 'fail',
          message:
            names.length > 0
              ? `Agent '${config.agentName}' was not found. Visible agents: ${names.join(', ')}.`
              : `No SRE Agent resources were visible in subscription ${maskGuid(config.subscriptionId)}.`,
          remediation:
            'Confirm SRE_AGENT_NAME/SRE_AGENT_RESOURCE_GROUP, and that you hold Reader on the Microsoft.App/agents resource.',
        },
      };
    }

    const selected = discovery.selected;
    const provisioned = (selected.provisioningState ?? '').toLowerCase() === 'succeeded';

    return {
      check: {
        name: 'SRE Agent discovery',
        status: provisioned || !selected.provisioningState ? 'pass' : 'warn',
        message: `Resolved agent '${selected.name}'${
          selected.provisioningState ? ` (provisioningState: ${selected.provisioningState})` : ''
        }${selected.location ? ` in ${selected.location}` : ''}.`,
        ...(provisioned || !selected.provisioningState
          ? {}
          : { remediation: 'Wait for provisioningState to reach Succeeded before starting an investigation.' }),
      },
      ...(selected.endpointHost ? { endpointHost: selected.endpointHost } : {}),
    };
  } catch (error) {
    const mcpError = error instanceof SreAgentMcpError ? error : undefined;
    const isPermission = mcpError?.kind === 'permission';

    return {
      check: {
        name: isPermission ? 'SRE Agent RBAC' : 'SRE Agent discovery',
        status: 'fail',
        message: mcpError?.message ?? `Agent discovery failed: ${errorText(error)}`,
        remediation:
          mcpError?.remediation ??
          'Assign Reader (control plane) and SRE Agent Administrator (data plane) on the Microsoft.App/agents resource, then retry.',
      },
    };
  }
}

async function endpointReachabilityCheck(
  host: string,
  resolveHost: (host: string) => Promise<boolean>,
): Promise<SreAgentPreflightCheck> {
  const expected = host.toLowerCase().endsWith(SRE_AGENT_DATA_PLANE_SUFFIX);

  try {
    const resolved = await withTimeout(resolveHost(host), NETWORK_TIMEOUT_MS);
    if (resolved) {
      return {
        name: 'SRE Agent data-plane reachability',
        status: expected ? 'pass' : 'warn',
        message: expected
          ? `Resolved the agent data-plane host ${host}.`
          : `Resolved ${host}, which is outside the expected *.${SRE_AGENT_DATA_PLANE_SUFFIX} domain.`,
        ...(expected ? {} : { remediation: 'Confirm the agent endpoint is a Microsoft-managed SRE Agent endpoint.' }),
      };
    }

    return {
      name: 'SRE Agent data-plane reachability',
      status: 'fail',
      message: `Could not resolve the agent data-plane host ${host}.`,
      remediation: `Allow outbound DNS and HTTPS to *.${SRE_AGENT_DATA_PLANE_SUFFIX} through your proxy or firewall, then retry.`,
    };
  } catch (error) {
    return {
      name: 'SRE Agent data-plane reachability',
      status: 'warn',
      message: `Reachability check for ${host} did not complete: ${errorText(error)}`,
      remediation: `Verify outbound access to *.${SRE_AGENT_DATA_PLANE_SUFFIX} manually.`,
    };
  }
}

function finalize(
  service: SreAgentService,
  checks: SreAgentPreflightCheck[],
  config: SreAgentConfig,
): SreAgentPreflightResult {
  return {
    ready: checks.every((check) => check.status !== 'fail'),
    configured: config.configured,
    enabled: config.enabled,
    checks,
    target: service.targetSummary(),
    collectedAt: new Date().toISOString(),
    portalHandoff: service.portalHandoff(),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? redactSensitiveText(error.message).slice(0, 300) : 'unknown error';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
