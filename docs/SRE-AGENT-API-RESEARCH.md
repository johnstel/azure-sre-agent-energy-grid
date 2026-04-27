# Azure SRE Agent Preview REST API Research

> **Issue**: [#5 — Research SRE Agent preview REST API integration](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/5)  
> **Owner**: Parker, project SRE Dev  
> **Date**: 2026-04-27  
> **Status**: Azure SRE Agent is in Public Preview. Treat APIs, telemetry schemas, regions, and pricing as subject to change.

## Executive verdict

**Recommendation: use the portal/deep-link fallback for the customer demo; do not implement direct Mission Control → Azure SRE Agent chat/conversation/action API integration yet.**

Official Microsoft documentation reviewed for this spike confirms:

- Azure SRE Agent has a documented Azure resource type (`Microsoft.App/agents`) for ARM/Bicep deployment and configuration.
- Azure SRE Agent exposes a documented **REST API v2 only for custom-agent-level hook configuration** in the reviewed docs: `PUT /api/v2/extendedAgent/agents/{agentName}`.
- Azure SRE Agent writes action/audit telemetry to the linked Application Insights resource, queryable through `customEvents` with KQL.
- SRE Agent uses managed identity and on-behalf-of (OBO) flows for **the agent's Azure resource operations**, not as a documented third-party chat API auth model.

Official Microsoft documentation reviewed did **not** provide a supported public endpoint and auth model for a third-party application to start, drive, approve, reject, or continue SRE Agent chat/conversation/action workflows. Per this repo's safe-language guardrails, Mission Control's Local Analyst must remain a local, read-only explainer and must not claim direct Azure SRE Agent integration until Microsoft documents that endpoint and auth model.

## Research scope and source priority

Reviewed sources prioritized Microsoft Learn and ARM template documentation:

1. Azure SRE Agent overview: <https://learn.microsoft.com/en-us/azure/sre-agent/overview>
2. Create agent: <https://learn.microsoft.com/en-us/azure/sre-agent/create-agent>
3. Permissions: <https://learn.microsoft.com/en-us/azure/sre-agent/permissions>
4. User roles: <https://learn.microsoft.com/en-us/azure/sre-agent/user-roles>
5. Run modes: <https://learn.microsoft.com/en-us/azure/sre-agent/run-modes>
6. Agent identity: <https://learn.microsoft.com/en-us/azure/sre-agent/agent-identity>
7. Network requirements: <https://learn.microsoft.com/en-us/azure/sre-agent/network-requirements>
8. Agent hooks: <https://learn.microsoft.com/en-us/azure/sre-agent/agent-hooks>
9. Configure agent hooks through API tutorial: <https://learn.microsoft.com/en-us/azure/sre-agent/tutorial-agent-hooks>
10. Create/manage hooks in portal: <https://learn.microsoft.com/en-us/azure/sre-agent/create-manage-hooks-ui>
11. Audit agent actions: <https://learn.microsoft.com/en-us/azure/sre-agent/audit-agent-actions>
12. Custom agents/subagents: <https://learn.microsoft.com/en-us/azure/sre-agent/sub-agents>
13. MCP connector: <https://learn.microsoft.com/en-us/azure/sre-agent/mcp-connector>
14. ARM/Bicep resource reference: <https://learn.microsoft.com/en-us/azure/templates/microsoft.app/agents>
15. Repo guardrails: `docs/SAFE-LANGUAGE-GUARDRAILS.md`, `docs/CAPABILITY-CONTRACTS.md`, `docs/DEMO-NARRATIVE.md`, `mission-control/README.md`, and `mission-control/backend/src/services/AssistantService.ts`.

## Findings by requirement

### 1. Official agent/chat/conversation/action APIs

| API area | Official status | Evidence | Feasibility for Mission Control |
|---|---:|---|---|
| ARM resource CRUD/configuration | **Documented** | The ARM/Bicep reference documents `Microsoft.App/agents@2026-01-01`, including properties such as `actionConfiguration`, `knowledgeGraphConfiguration`, `incidentManagementConfiguration`, and `logConfiguration`. | Useful for provisioning/configuration research only. Parker may not modify Bicep in this issue. This is not a chat/conversation API. |
| Custom-agent hook configuration | **Documented for hooks** | The hooks overview and API tutorial document REST API v2 for custom-agent-level hooks, including `PUT /api/v2/extendedAgent/agents/{agentName}` and an `az account get-access-token` + `curl` workflow. | Useful for customizing SRE Agent behavior. Not sufficient for Mission Control to start or drive SRE Agent conversations. |
| Chat/thread/conversation start or send message | **Not verified in official docs reviewed** | The reviewed Microsoft Learn SRE Agent pages describe using the portal chat UI, custom agents, and test playground. They do not document a supported third-party `POST message`, `create thread`, or `continue conversation` endpoint with a stable auth model. | **Blocked** for direct integration. |
| Approve/deny proposed SRE Agent action | **Not verified in official docs reviewed** | Run modes document Review and Autonomous behavior and portal approval for Azure infrastructure operations, but do not document an external approval/rejection REST endpoint. | **Blocked** for direct integration. Keep operator-controlled portal workflow. |
| Query past chat/action history | **Partially documented via telemetry** | Audit docs state SRE Agent logs actions to Application Insights `customEvents`, including `AgentResponse`, `AgentToolExecution`, `ModelGeneration`, `AgentExecution`, `IncidentActivitySnapshot`, `AgentAzCliExecution`, and `ApprovalDecision`. | Viable for read-only audit evidence if the linked Application Insights resource is accessible. Not a supported replay/drive-conversation API. |

### 2. Supported auth patterns

Separate **agent execution auth** from **third-party API caller auth**:

| Auth pattern | Officially documented? | What it applies to | Notes for Mission Control |
|---|---:|---|---|
| Azure user sign-in / delegated user | **Yes, for portal and hook tutorial** | Users sign in to `sre.azure.com`; the hook API tutorial requires Azure CLI logged in and obtains a bearer token before calling the SRE Agent API base URL. User roles (`SRE Agent Reader`, `SRE Agent Standard User`, `SRE Agent Administrator`) control what users can view, chat, approve, or administer. | The only documented API-caller pattern found is a logged-in Azure CLI user for hook configuration. No direct chat API is documented. |
| Agent user-assigned managed identity | **Yes, for agent operations** | The agent's UAMI authenticates to Azure Resource Manager, CLI, diagnostics, Kusto, some connectors, and resource operations. | This does **not** prove Mission Control can use managed identity to call SRE Agent chat APIs. It is the agent's identity to act on resources. |
| On-behalf-of (OBO) | **Yes, for agent resource actions** | If the agent lacks permissions for an action, it can request temporary user authorization through Microsoft Entra OBO. Only SRE Agent Administrators can authorize OBO requests; personal Microsoft accounts are not supported. | This supports the agent taking Azure actions after user authorization. It is not a documented Mission Control → SRE Agent conversation auth model. |
| Workload identity / service principal for third-party callers | **Not verified in official docs reviewed** | No reviewed SRE Agent doc gave a supported workload identity or service principal flow for an external app to drive chat/conversation/action APIs. | Treat as unsupported for this demo until Microsoft documents it. |
| Portal-only | **Yes for core chat/approval UX in reviewed docs** | Create agent, chat, Builder, Agent Canvas, Hooks, Test playground, managed resources, and approvals are primarily documented as portal workflows. | This is the safe demo path. Mission Control can guide the operator to the portal and track evidence. |

### 3. Queryable audit/action history outside the portal

**Yes, with scope limits.** The official audit documentation states that every agent action is logged to the linked Application Insights resource and can be queried in the `customEvents` table with KQL from Monitor > Logs. It documents these event types:

- `AgentResponse` — chat responses sent to the user.
- `ModelGeneration` — LLM calls, token usage, model ID, requesting agent, and `ThreadId`.
- `AgentToolExecution` — tool calls, inputs, outputs, tool name, and correlation IDs.
- `AgentExecution` — session lifecycle.
- `MetaAgent` and `AgentHandoff` — routing/orchestration.
- `IncidentActivitySnapshot` — incident lifecycle, severity, status, autonomy, and mitigation fields.
- `AgentAzCliExecution` — Azure CLI commands run by the agent.
- `ApprovalDecision` — approval or rejection of proposed actions.

Audit docs also state that Azure resource-level operations such as creating, updating, or deleting the agent resource are captured by the Azure Activity Log.

**Implication:** Mission Control can potentially add a future read-only evidence panel that queries the linked Application Insights resource for SRE Agent telemetry, but only after the deployed Preview service schema is validated against this tenant. This does not unlock direct conversation control.

### 4. Do agent hooks help Mission Control integration?

**Hooks help customize and govern Azure SRE Agent behavior; they do not provide a supported external chat/control API for Mission Control.**

Official hook docs describe:

- Supported events: `Stop` and `PostToolUse`.
- Hook levels: agent-level hooks configured in Builder > Hooks, and custom-agent/subagent-level hooks configured in Agent Canvas or REST API v2.
- Hook types: prompt hooks and sandboxed command hooks.
- Hook uses: validate response completeness, audit tool usage, block dangerous commands, inject additional context, enforce policy, and prevent premature task completion.
- Hook limits: script size 64 KB, timeout 1–300 seconds, prompt Stop hook rejection limit 1–25.

For Mission Control, hooks may be useful later to enforce demo safety inside SRE Agent, such as:

- Require "recommend only" phrasing in demo threads.
- Block dangerous shell commands in custom agents.
- Inject audit markers after tool calls.
- Validate that responses include scenario, evidence source, and remediation confidence.

Hooks do **not** solve issue #5's direct integration question because they run inside SRE Agent execution. They are not documented as a third-party API for Mission Control to create threads, send prompts, or approve actions.

### 5. Portal/deep-link fallback for the customer demo

The portal fallback remains viable and is the recommended path:

1. Mission Control continues to collect local state and scenario status from Kubernetes and demo metadata.
2. Mission Control displays the exact SRE Agent portal prompt for each validated scenario, as implemented in `PortalValidationService.ts`.
3. Operator opens SRE Agent in `https://sre.azure.com`, selects the demo agent, and runs the prepared prompt in the portal chat.
4. Operator captures portal evidence:
   - screenshot with timestamp,
   - exact transcript or relevant response excerpt,
   - any proposed action/approval UI,
   - redacted resource IDs, subscription IDs, and tenant IDs.
5. Mission Control records the evidence path and validation status locally. This aligns with `mission-control/README.md`, which states that Mission Control cannot claim "Azure SRE Agent diagnosed" until real portal evidence is captured and validated.
6. Optional future enhancement: if the agent resource ID is known, Mission Control can show an Azure portal resource link plus `https://sre.azure.com` as a safe handoff. Do not claim a stable deep-link route to a specific SRE Agent thread unless Microsoft documents it or the team captures repeatable portal evidence.

Recommended demo language:

> "Mission Control prepares the incident context and prompt. Azure SRE Agent remains the cloud diagnostic/remediation experience in the SRE Agent portal. Until Microsoft documents a supported chat/action API, the integration boundary is a guided portal handoff plus evidence capture."

### 6. Preview limitations and breaking-change risks

| Risk | Evidence | Demo impact | Mitigation |
|---|---|---|---|
| Public Preview behavior can change | Repo guardrails require Preview disclosure; Microsoft Learn docs show Preview concepts and evolving docs. | API, telemetry schema, portal UX, and regions may change before GA. | Keep safe language in all customer-facing docs and demos. |
| ARM API version drift | Repo setup references `Microsoft.App/agents@2025-05-01-preview`; current Microsoft Learn ARM template reference lists `Microsoft.App/agents@2026-01-01` as latest. | Infrastructure may need later review, but this spike must not modify Bicep. | Track separately with infra owner if deployment drift appears. |
| Chat/action API gap | Official docs reviewed do not document a supported chat/conversation/action endpoint and auth model. | Direct Mission Control integration could overclaim unsupported Preview behavior. | Block direct API implementation until Microsoft publishes docs. |
| Hook API is narrow | Hook API manages custom-agent hooks via REST API v2; it is not a conversation API. | Misusing hook API as integration proof would be misleading. | Document hooks as governance/customization only. |
| Telemetry schema may vary | Audit docs document `customEvents` event types and fields, but repo guardrails currently mark exact fields as `SCHEMA_TBD` until verified in the deployed Preview service. | Demo evidence queries could fail or fields may differ. | Validate KQL in the customer's deployed agent before claiming specific fields. |
| Data residency/model provider choices matter | Data/privacy docs state content and conversation history are stored in the agent's Azure region; Anthropic processing occurs in the United States, while Azure OpenAI is processed in the agent region. | Customer compliance questions may arise. | State provider-specific data handling accurately; select Azure OpenAI if EU Data Boundary is required. |
| Network/proxy dependency | Network docs require `*.azuresre.ai`, `sre.azure.com`, `portal.azure.com`, and `api.applicationinsights.io`; WebSocket traffic must be allowed. | Customer demo may fail behind restrictive proxies. | Add pre-demo network check and keep screenshots/evidence fallback. |

## Implementation recommendation

### Do now

- Keep Mission Control's Local Analyst as a local, read-only Copilot SDK explainer over Mission Control state snapshots.
- Keep the portal validation workflow as the supported integration boundary.
- Add any future UI copy as "Open SRE Agent portal" / "Copy prompt" / "Record evidence", not "Send to SRE Agent" or "Run SRE Agent API".
- Use Application Insights `customEvents` only for read-only audit evidence after schema validation in the deployed Preview tenant.

### Do not do yet

- Do not build direct Mission Control → SRE Agent chat/thread/message calls.
- Do not build external approve/deny calls for SRE Agent proposed actions.
- Do not claim managed identity or workload identity support for external SRE Agent chat APIs.
- Do not treat hook REST endpoints as proof of chat/conversation API support.

### Re-open direct API design only when Microsoft publishes:

1. An official Azure SRE Agent chat/conversation/action REST API reference.
2. Stable endpoint patterns for creating threads, sending messages, receiving streamed output, and approving/denying actions.
3. A documented auth model for external callers, including delegated user, managed identity, workload identity, or service principal.
4. RBAC/role requirements for the caller.
5. Preview/GA support statement and breaking-change policy.

## Downstream issue impact

- [#8 Add AKS infrastructure queries for Analyst](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/8) may proceed after its governance/RBAC documentation dependency is approved. This spike does not block read-only AKS query work because that path does not require direct SRE Agent APIs.
- [#9 Add Log Analytics KQL queries for Analyst](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/9) may proceed after its governance/RBAC documentation dependency is approved. SRE Agent `customEvents` telemetry may be considered later as read-only evidence only after the deployed tenant schema is validated.
- [#10 Add Analyst response citations and UI states](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/10) may proceed after safe-language guardrails are approved. The UI must not represent Local Analyst output as Azure SRE Agent recommendations.
- [#11 Add SRE Agent portal deep links for Analyst](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/11) may proceed as the safe fallback path, subject to its governance dependency. Use documented portal/resource links and do not claim stable thread-level deep links unless Microsoft documents them or the team captures repeatable portal evidence.
- [#12 Implement direct SRE Agent API only if supported](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/12) remains blocked. No implementation should start until Microsoft documents supported endpoints, auth model, RBAC requirements, and support status.

## Final feasibility verdict for Dallas review

**Verdict: Portal fallback. Direct API integration is blocked until Preview matures or Microsoft publishes a supported endpoint and auth model.**

This verdict keeps the customer demo viable: Mission Control can prepare scenario context, copy exact prompts, guide the operator to `sre.azure.com`, and record evidence. It avoids overclaiming unsupported direct SRE Agent integration while preserving a clear upgrade path if Microsoft documents chat/conversation/action APIs later.
