# Azure SRE Agent MCP Integration (Mission Control)

> **Issue**: [#77 — Embed real SRE Agent investigations in Mission Control via MCP](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/77)
> **Status**: Implemented against the supported Azure MCP Server `sreagent` tool surface. **Not yet live-validated against an Energy Grid SRE Agent resource** — see [Live validation status](#live-validation-status).
> **Related docs**: [SRE Agent API Research](SRE-AGENT-API-RESEARCH.md), [Local Analyst Governance](LOCAL-ANALYST-GOVERNANCE.md), [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md), [SRE Agent Setup](SRE-AGENT-SETUP.md), [Supportability](SUPPORTABILITY.md)

Mission Control can now start and continue a **real Azure SRE Agent investigation** without leaving the dashboard. This supersedes the "portal handoff only" verdict in [SRE-AGENT-API-RESEARCH.md](SRE-AGENT-API-RESEARCH.md), which predates the SRE Agent MCP server.

---

## 1. Supported architecture

Microsoft documents the SRE Agent tools as part of **Azure MCP Server**, not as a private REST API. Mission Control uses exactly that path.

```
Mission Control backend (Fastify, Node)
  └── MCP client (@modelcontextprotocol/sdk, stdio transport)
        └── child process: npx -y @azure/mcp@latest server start --tool <6 allowlisted tools>
              ├── control plane (ARM)  → agent discovery            [Reader]
              └── data plane (*.azuresre.ai) → threads/investigation [SRE Agent Administrator]
```

Key properties, all documented by Microsoft:

| Property | Value | Source |
|---|---|---|
| Transport | stdio child process | [Set up the SRE Agent MCP server](https://learn.microsoft.com/azure/sre-agent/setup-mcp-server) |
| Launcher | `npx -y @azure/mcp@latest server start` | same |
| Tool prefix | `sreagent_` | [SRE Agent MCP server](https://learn.microsoft.com/azure/sre-agent/mcp-server) |
| Authentication | Azure identity available on the host (`az login`, managed identity, env credentials) | same |
| Interactive auth | **Suppressed in server mode** — you must sign in first | same |
| Control-plane RBAC | `Reader` on the `Microsoft.App/agents` resource | same |
| Data-plane RBAC | `SRE Agent Administrator` on the `Microsoft.App/agents` resource | same |
| Data-plane domain | `*.azuresre.ai` (HTTPS only, endpoint-pinned by the server) | same |
| Investigation defaults | 20 iterations, 10-minute timeout (`--max-iterations`, `--timeout-seconds`) | same |
| Server start flags | `--mode`, `--namespace`, `--tool`, `--read-only`, `--transport` | [Azure MCP Server tools](https://learn.microsoft.com/azure/developer/azure-mcp-server/tools/) |

**No private or undocumented API is called. The portal is never scraped.**

### Why a child process rather than an embedded library

Azure MCP Server is distributed as an MCP server, not as a Node library. Running it as a stdio child process is the documented integration model for a programmatic client, and it keeps the Azure credential handling inside Microsoft's own component. Mission Control owns the process lifecycle (lazy start, idle shutdown, disposal on backend close).

---

## 2. Allowlisted operations

Mission Control may invoke **exactly six** tools:

| Mission Control operation | Azure MCP Server tool | Read-only |
|---|---|---|
| `discover-agents` | `sreagent_agents_list` | yes |
| `get-agent` | `sreagent_agents_get` | yes |
| `create-thread` | `sreagent_threads_create` | no |
| `investigate` | `sreagent_threads_investigate` | no |
| `follow-up` | `sreagent_threads_send_message` | no |
| `thread-status` | `sreagent_threads_get` | yes |

Everything else in the `sreagent` namespace — 49 further tools including connector, hook, skill, scheduled-task, workflow, memory, and delete operations — is unreachable.

### `investigate_yolo` is impossible, in three independent layers

Microsoft's own documentation warns that `investigate_yolo` "auto-approves **all** approval gates, including actions that modify your infrastructure (pod deletion, Kubernetes YAML application, scaling, incident state changes)". It is banned here.

1. **Server surface.** The child process is launched with one `--tool` flag per allowlisted tool. The tool is never registered on the server, so it cannot be called even by a compromised caller. Operator-supplied `SRE_AGENT_MCP_ARGS` cannot widen this: tool-exposure flags are stripped from the override.
2. **Client mapping.** Callers address typed `SreAgentOperation` values; there is no code path that accepts a raw tool name.
3. **Denylist assertion.** `assertToolAllowed()` runs immediately before every dispatch and rejects `/yolo/i`, `/auto[_-]?approve/i`, `/approve[_-]?all/i`, `/bypass[_-]?approval/i`, and `/no[_-]?confirm/i`, plus an explicit blocked-tool list.

Verified empirically — with the tool filter applied, Azure MCP Server 3.0.0-beta.34 exposes exactly six tools:

```
TOTAL TOOLS: 6
sreagent_agents_get            ro=true  destructive=false
sreagent_agents_list           ro=true  destructive=false
sreagent_threads_create        ro=false destructive=false
sreagent_threads_get           ro=true  destructive=false
sreagent_threads_investigate   ro=false destructive=false
sreagent_threads_send_message  ro=false destructive=false
```

Without the filter the same server exposes 55 tools including `sreagent_threads_investigate_yolo`. Preflight re-verifies this at runtime and **fails** if an auto-approval tool ever appears.

### Approval gates are never auto-approved

Standard mode pauses at approval gates. Mission Control surfaces the paused state and directs the operator to the Azure SRE Agent portal to approve. `SreAgentApprovalState.autoApproved` is typed as the literal `false`, so an auto-approving code path would not compile.

---

## 3. Security model

| Control | Implementation |
|---|---|
| Credential handling | Host Azure identity only. Mission Control never reads, stores, forwards, or logs a token. No client secret is injected into the child environment. |
| Browser exposure | The browser receives only typed contracts. Subscription/tenant GUIDs are masked (`11111111-****-****-****-555555`) in identity fields **and in the agent's response prose, citation labels, and approval detail**, because the agent routinely quotes ARM resource IDs. ARM IDs keep their resource group / resource name so the answer stays diagnostic. Citation **URLs** are left navigable so the cited evidence can be opened, so a portal link may still contain a resource path. |
| Raw tool payloads | Never returned to the browser and never logged. Only parsed, redacted, bounded fields leave the backend. |
| Redaction | Bearer/Basic headers, JWTs, `key=value` secrets, storage account keys, SAS query parameters, and PEM private keys are stripped from every string that leaves the adapter. Child-process stderr uses a **streaming** redactor (`RedactedStreamBuffer`): output is redacted *before* it is length-bounded, only whole lines are committed so a secret marker can never be split, and an unterminated `BEGIN … PRIVATE KEY` sets a sticky suppression state. A naive raw rolling buffer would evict the `-----BEGIN-----` marker of a multi-kilobyte key while its body survived, defeating a later single redaction pass. |
| Output bounding | Responses are truncated at `SRE_AGENT_MAX_RESPONSE_CHARS` (default 24,000) with explicit truncation marking. Citations capped at 25, prompts at 8,000 characters. |
| Input validation | Prompts and thread IDs are validated before any dispatch; scenario starters are limited to the three approved validation scenarios. |
| Audit | Every request/response/failure emits a structured record with `requester`, `tool`, `target`, `timestamp`, `resultStatus`, `correlationId`, and `redactionNotes`, matching [Local Analyst Governance](LOCAL-ANALYST-GOVERNANCE.md#audit-trail-requirements). Arguments are redacted before logging. |
| Process lifecycle | Child MCP server is started lazily, shut down after `SRE_AGENT_IDLE_SHUTDOWN_MS` idle (default 5 min), and disposed on backend close. `SIGINT`/`SIGTERM` handlers call `app.close()` so the disposal hook actually runs and no orphaned child keeps an Azure session open. Disposal during a cold server start is handled explicitly. |
| Persisted state | Only thread references (`threadId`, agent name, scenario, timestamps, status) are persisted. **Prompts and responses are never written to disk** by this adapter. |

---

## 4. Configuration

All configuration is environment-driven. Nothing is hardcoded to a tenant, subscription, or agent.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `SRE_AGENT_NAME` | **yes** | — | `Microsoft.App/agents` resource name |
| `SRE_AGENT_SUBSCRIPTION_ID` (or `AZURE_SUBSCRIPTION_ID`) | **yes** | — | Subscription GUID |
| `SRE_AGENT_RESOURCE_GROUP` | no | — | Narrows discovery |
| `SRE_AGENT_TENANT_ID` (or `AZURE_TENANT_ID`) | no | — | Cross-tenant agents |
| `SRE_AGENT_MCP_ENABLED` | no | `true` | Kill switch |
| `SRE_AGENT_MCP_PACKAGE` | no | `@azure/mcp@latest` | Pin the server version |
| `SRE_AGENT_MCP_COMMAND` | no | `npx` | Launcher override |
| `SRE_AGENT_MCP_ARGS` | no | `-y <package> server start` | Base argv override. Tool-exposure flags (`--tool`, `--namespace`, `--mode`) are **stripped**, and the six-tool `--tool` allowlist is always appended. |
| `SRE_AGENT_REQUEST_TIMEOUT_MS` | no | `120000` | Discovery/follow-up timeout (5s–15min) |
| `SRE_AGENT_INVESTIGATION_TIMEOUT_MS` | no | `600000` | Investigation timeout (5s–15min) |
| `SRE_AGENT_MAX_ITERATIONS` | no | `20` | Capped at the documented maximum of 20 |
| `SRE_AGENT_IDLE_SHUTDOWN_MS` | no | `300000` | Child process idle shutdown |
| `SRE_AGENT_MAX_RESPONSE_CHARS` | no | `24000` | Output bound (max 100,000) |
| `SRE_AGENT_PORTAL_URL` | no | `https://sre.azure.com` | Portal handoff target |
| `AZURE_TOKEN_CREDENTIALS` | no | — | Pins the credential type when several are available |

### Required RBAC

```bash
OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
SCOPE=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.App/agents/<agentName>

az role assignment create --assignee "$OBJECT_ID" --role "Reader" --scope "$SCOPE"
az role assignment create --assignee "$OBJECT_ID" --role "SRE Agent Administrator" --scope "$SCOPE"
```

Assign at the agent resource scope, not subscription scope.

---

## 5. API surface

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/sre-agent/config` | Configuration, masked target, allow/block lists, approved scenario prompts |
| `GET` | `/api/sre-agent/preflight` | Full preflight (`?skipMcpProbe=true` to skip the ~30s cold-npx probe) |
| `GET` | `/api/sre-agent/agents` | Agent discovery |
| `GET` | `/api/sre-agent/threads` | Recorded thread references (restart recovery) |
| `POST` | `/api/sre-agent/investigations` | Start a standard investigation (`scenarioName` or `prompt`) |
| `POST` | `/api/sre-agent/investigations/continue` | Follow-up on an existing thread |
| `GET` | `/api/sre-agent/investigations/:threadId` | Thread status |
| `POST` | `/api/sre-agent/investigations/cancel` | Cancel an in-flight Mission Control operation |

### Provenance rule

A response is labelled `provenance: 'azure-sre-agent'` **only** when it carries both a resolved agent resource identity and a real thread ID. If either is missing the request fails with `SreAgentProvenanceError` (HTTP 502). Mission Control never claims SRE Agent output it cannot prove.

### Failure contract

Every failure returns:

```jsonc
{
  "error": "Azure denied the SRE Agent request (missing RBAC).",
  "kind": "permission",
  "remediation": "Assign Reader (control plane) and SRE Agent Administrator (data plane)…",
  "investigationStarted": false,
  "localAnalystSubstituted": false,   // always false, asserted in tests
  "portalHandoff": { "label": "…", "href": "…", "prompt": "…" },
  "correlationId": "…",
  "timestamp": "…"
}
```

No success-shaped fields (`provenance`, `response`, `thread`) are present on a failure. **Local Analyst output is never substituted.**

---

## 6. Cancellation and restart behaviour

### Cancellation

Azure MCP Server **does not document a server-side stop** for a running investigation. Mission Control therefore:

- registers each logical operation under a correlation ID, covering agent resolution *and* the investigation call;
- aborts the in-flight MCP request on cancel and performs no automatic retry;
- states plainly in the API response and the UI that agent-side work already started may continue, and points the operator at the portal.

This limitation is reported honestly rather than presented as a hard stop.

### Backend restart / reconnect

SRE Agent threads live server-side, so a thread survives a Mission Control restart.

- Thread references are persisted atomically to `state/sre-agent-threads.json` (path overridable with `SRE_AGENT_THREAD_STATE_PATH`).
- After restart, `GET /api/sre-agent/threads` lists them and `GET /api/sre-agent/investigations/:threadId` re-attaches via `sreagent_threads_get`.
- In-flight *Mission Control* operations do not survive restart; they are aborted on shutdown and the durable thread ID is the recovery handle.

Covered by the test `an in-flight thread survives a backend restart and can be re-attached`.

---

## 7. Response-schema caveat

Microsoft documents the SRE Agent operations and their **inputs**, but not a stable JSON **response** schema for `threads_*`. The parser is therefore tolerant and reports how it interpreted the payload:

| `schemaConfidence` | Meaning |
|---|---|
| `structured` | JSON payload with an explicit thread ID |
| `inferred` | JSON payload; thread ID came from the request context |
| `text-only` | Non-JSON response; text used verbatim |

Two rules hold regardless of shape:

- a missing thread ID fails the request rather than producing an unattributed answer;
- **citations are never invented.** When the agent returns none, the UI says so explicitly.

---

## 8. UI separation from Local Analyst

| | Local Analyst | Azure SRE Agent |
|---|---|---|
| Component | `AssistantPanel.vue` | `SreAgentPanel.vue` |
| Eyebrow | "Local analyst · not Azure SRE Agent" | "Azure SRE Agent · cloud agent" |
| Icon mark | cyan **L** | violet **A** |
| Accent | cyan | violet |
| Badge | "Local · read-only" | "Real agent" |
| Data source | local Mission Control snapshot | real Azure SRE Agent thread |
| Identity shown | snapshot timestamp | agent name, masked ARM ID, thread ID, elapsed time, status |

The SRE Agent panel always shows the agent name and thread ID beside the response, so an audience can verify the answer came from a real agent resource.

---

## 9. Testing

All tests are deterministic and require no Azure access. `FakeMcpServer` is a **real** MCP server from the official SDK connected over `InMemoryTransport`, so the genuine MCP protocol — tool registration, JSON-RPC dispatch, timeouts, cancellation — is exercised.

```bash
cd mission-control
npm test -w backend      # 113 tests
npm test -w frontend
npm run lint             # vue-tsc + tsc
npm run build
```

Coverage of the safety-critical behaviour:

- `investigate_yolo` unreachable from every typed operation, and every auto-approval spelling rejected;
- all 22 blocked tools rejected; unknown/empty/near-miss names rejected;
- the `--tool` allowlist survives an operator argv override;
- preflight fails if the MCP server ever exposes an auto-approval tool;
- approval gates surfaced from both structured flags and prose, never auto-approved;
- responses without a thread ID or agent identity refused;
- MCP failure returns the portal handoff with `localAnalystSubstituted: false` and no success fields;
- timeout, cancellation mid-operation, and shutdown-aborts-in-flight;
- auth / permission / network / not-found / runtime-missing mapped to actionable remediations;
- raw subscription GUID absent from client payloads; prompts absent from persisted state;
- child stderr containing a >2,000-character PEM private key never reaches the normalized
  error message or the HTTP error body — asserted end to end through the real stderr
  accumulation path, including the case where the `BEGIN` marker is evicted by later
  output and the case where the key is still streaming (each test also asserts benign
  stderr *does* reach the message, so the check cannot pass vacuously);
- backend restart re-attach.

---

## 10. Live validation status

**Not yet performed.** No Energy Grid Azure SRE Agent resource was available to this change, and the task scope prohibits deploying one or touching unrelated resource groups.

What **is** proven:

- the supported architecture, from current first-party documentation;
- the real Azure MCP Server (3.0.0-beta.34) starts over stdio and exposes exactly the six allowlisted tools under the `--tool` filter, with `investigate_yolo` absent;
- the full adapter against a protocol-faithful fake MCP server.

What is **not** proven and must be completed before claiming "SRE Agent diagnosed" in a customer demo:

- a real thread ID and cited response from a live agent;
- a real approval gate pausing in standard mode;
- correlation of a Mission Control `correlationId` with an SRE Agent audit event.

### Live validation runbook

Run against a real SRE Agent resource. Every step is read-only apart from creating an investigation thread. **Do not run against the AmeriGas resource group.**

```bash
# 0. Prerequisites: Node.js LTS, Azure CLI, an SRE Agent with provisioningState=Succeeded.
az login                        # add --tenant <agent-tenant-id> if cross-tenant
az account set --subscription <sub-id>

# 1. Assign least-privilege RBAC at the agent scope (once).
OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
SCOPE=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.App/agents/<agentName>
az role assignment create --assignee "$OBJECT_ID" --role "Reader" --scope "$SCOPE"
az role assignment create --assignee "$OBJECT_ID" --role "SRE Agent Administrator" --scope "$SCOPE"

# 2. Confirm the tool surface excludes investigate_yolo (independent of Mission Control).
npx -y @azure/mcp@latest server start --namespace sreagent --mode all   # 55 tools, includes yolo
# Mission Control instead launches with the six --tool flags; preflight asserts this.

# 3. Configure and start Mission Control.
export SRE_AGENT_NAME=<agentName>
export SRE_AGENT_SUBSCRIPTION_ID=<sub-id>
export SRE_AGENT_RESOURCE_GROUP=<rg>
cd mission-control && npm run build && npm start

# 4. Preflight — expect every check to pass.
curl -s localhost:3333/api/sre-agent/preflight | jq '.ready, .checks'

# 5. Discovery — capture with IDs already masked by the backend.
curl -s localhost:3333/api/sre-agent/agents | jq '.selected'

# 6. Cited investigation (Evidence 1). Inject the scenario first: kubectl apply -f k8s/scenarios/oom-killed.yaml
curl -s -X POST localhost:3333/api/sre-agent/investigations \
  -H 'content-type: application/json' -d '{"scenarioName":"OOMKilled"}' \
  | jq '{provenance, status, agent, thread, citationsPresent, citations, correlationId: .metadata.correlationId}'

# 7. Follow-up on the same thread.
curl -s -X POST localhost:3333/api/sre-agent/investigations/continue \
  -H 'content-type: application/json' \
  -d '{"threadId":"<threadId>","prompt":"What memory limit do you recommend?"}' | jq '.thread.id'

# 8. Approval gate (Evidence 2): ask for a remediation that requires approval and confirm
#    status == "awaiting-approval" and approval.autoApproved == false. Approve in the portal.

# 9. Negative test (Evidence 3): confirm yolo cannot be selected or called.
curl -s localhost:3333/api/sre-agent/config | jq '.target.allowedTools, .target.blockedTools'

# 10. Audit correlation (Evidence 4): match metadata.correlationId to the SRE Agent
#     Application Insights customEvents / TraceId per docs/SRE-AGENT-API-RESEARCH.md §3.
```

Record results in [`docs/EXTERNAL-DEMO-HARDENING.md`](EXTERNAL-DEMO-HARDENING.md) and keep the portal validation workflow authoritative until this runbook has been completed.

---

## 11. Supportability notes

- `@azure/mcp@latest` currently resolves to **3.0.0-beta.34**. Pin `SRE_AGENT_MCP_PACKAGE` to an exact version for a customer demo; `npx` caches aggressively (`rm -rf ~/.npm/_npx` to force an update).
- The SRE Agent MCP server is a **preview-stage** surface; tool names and response shapes may change. Preflight fails loudly on a missing tool rather than degrading silently.
- `--read-only` is available on Azure MCP Server but is **not** used here: it would block thread creation and investigation, which are the point of this integration. The narrower `--tool` allowlist is used instead.

---

## Document history

| Date | Version | Change |
|---|---|---|
| 2026-08-12 | 1.0 | Initial supported SRE Agent MCP integration for issue #77 |
