# Azure SRE Agent Native Incident Platform — Capability Spike & Implementation Record

> **Issue**: [#76 — P0: Wire native Azure Monitor incident response into SRE Agent](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/76)
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2026-01-01`, Stable channel)
> **Date**: 2026-08-12

## Executive summary

**Verdict: Bicep automates the incident-platform connection and required RBAC. An idempotent
script automates as much of the response-plan setup as the documented Azure MCP Server surface
allows, with explicit portal steps for the remainder (reinvestigation cooldown, custom-agent
routing, title-contains parity). The existing Action Group → Mission Control webhook fallback is
unchanged and remains the safe default until native handling has live end-to-end proof.**

This spike began, per the issue's instructions, with a live capability check rather than assuming
a portal-only setting has a stable ARM schema. That check found more automatable surface than the
issue's own "medium confidence" framing anticipated:

| Capability | Automatable? | Surface |
|---|---|---|
| Connect Azure Monitor as incident platform | **Yes** | Documented ARM property `Microsoft.App/agents.properties.incidentManagementConfiguration` (Bicep) |
| Grant Monitoring Contributor for alert visibility | **Yes** | Bicep role assignment |
| Create/list incident response plans | **Partially** | Documented Azure MCP Server tool `azmcp sreagent incidents plans create`/`list`, but its parameter set omits reinvestigation cooldown and custom-agent target |
| Configure reinvestigation cooldown | **No** | Portal-only (Builder → Incident response plans → autonomy step) as of this writing |
| Confirm custom-agent routing / title-contains parity | **No** | Portal-only; not documented in the ARM schema or the MCP tool |
| Query native incident lifecycle evidence | **Yes** | Documented `customEvents` schema in the agent's Application Insights resource, queried the same way this repo already queries Log Analytics |

## Research scope and source priority

Reviewed in this order, consistent with `docs/SRE-AGENT-API-RESEARCH.md`'s established priority
(Microsoft Learn and ARM template documentation over portal screenshots or undocumented behavior):

1. [Azure Monitor alerts in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/azure-monitor-alerts)
2. [Tutorial: Automate Incident Response in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/automate-incidents)
3. [Tutorial: Create an incident response plan in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/response-plan)
4. [Audit Agent Actions in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions)
5. [Microsoft.App/agents ARM template reference](https://learn.microsoft.com/azure/templates/microsoft.app/agents)
6. [Azure MCP Server Tools for Azure SRE Agent](https://learn.microsoft.com/azure/developer/azure-mcp-server/tools/azure-sre-agent)
7. [Azure built-in roles for Monitor](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles/monitor) (Monitoring Contributor role ID)
8. This repo's `docs/SRE-AGENT-API-RESEARCH.md`, `docs/CAPABILITY-CONTRACTS.md`, `docs/SAFE-LANGUAGE-GUARDRAILS.md`

## Findings by requirement

### 1. Incident platform connection (Azure Monitor)

Microsoft Learn documents this as a portal-only step in the getting-started tutorial (Builder →
Incident platform → select Azure Monitor → Save). However, the **ARM template reference for
`Microsoft.App/agents@2026-01-01`** documents a previously-unused property:

```
properties.incidentManagementConfiguration: {
  connectionKey: string   // sensitive, secure parameter
  connectionName: string
  connectionUrl: string
  oboUser: string
  type: string
}
```

This property was already referenced (as unused/empty) in this repo's `docs/SRE-AGENT-API-RESEARCH.md`
line 47 ("`incidentManagementConfiguration`... Useful for provisioning/configuration research
only"). This spike confirms it is a real, documented, stable ARM property and wires it:
`infra/bicep/modules/sre-agent.bicep` now sets `incidentManagementConfiguration.type = 'AzureMonitor'`
when `incidentPlatform = 'AzureMonitor'` (the new default). Azure Monitor does not need
`connectionKey`/`connectionUrl` (unlike the PagerDuty/ServiceNow connectors documented for the
Azure MCP Server, which do carry credentials) because it authenticates through the agent's own
managed identity — consistent with the Azure Monitor alerts doc: "It uses the same managed
identity you already scoped for the agent."

**Confidence**: Medium-high. The ARM property and its shape are documented first-party. The exact
literal expected in `type` is not enumerated by Microsoft Learn (it documents the field as a bare
`string`), so `sre-agent.bicep` exposes it as an overridable parameter
(`incidentManagementConfigurationType`, default `'AzureMonitor'`) and the setup script reads the
value back from the deployed resource so a mismatch is visible rather than silently assumed.

### 2. Required RBAC

The Azure Monitor alerts doc states plainly: "verify the agent's managed identity has the
**Monitoring Contributor** role on the subscription" for alerts to become visible. Role ID
`749f88d5-cbae-40b8-bcfc-e573ddc772fa`, confirmed against the
[Azure built-in roles for Monitor](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles/monitor)
reference. `sre-agent.bicep` now assigns this at **resource-group** scope (not subscription scope)
to match this repo's existing least-privilege pattern for the `accessLevel` role matrix
(`docs/CAPABILITY-CONTRACTS.md` §6) — broaden to subscription scope only if the agent must scan
alerts outside this resource group.

### 3. Incident response plans

The response-plan tutorial documents a portal-only creation flow with these fields: name, severity
filter, **title contains** filter, **response custom agent** selection, autonomy level
(Autonomous/Review), and (Azure Monitor only) **reinvestigation cooldown** (enable checkbox +
1–24h, default 3h, default enabled).

Separately, [Azure MCP Server Tools for Azure SRE Agent](https://learn.microsoft.com/azure/developer/azure-mcp-server/tools/azure-sre-agent)
documents `azmcp sreagent incidents plans create`/`list` — a real, first-party, installable CLI
surface (also exposed as MCP tools). Its parameter set is: `name`, `severity`, `trigger-condition`,
`services`, `steps`, `agent-mode` (review/autonomous), `escalation`, `runbook-url`. Comparing field
by field against the portal tutorial:

| Portal field | MCP tool equivalent | Gap |
|---|---|---|
| Plan name | `--name` | None |
| Severity | `--severity` (critical/high/medium/low) | Value set differs from the portal's Sev0–4 labels; confirm the effective mapping live |
| Title contains | `--trigger-condition` (best-effort) | Semantics undocumented beyond "text that triggers the plan" |
| Response custom agent | *(none)* | **Gap** — not a parameter; `--agent` targets the top-level SRE Agent resource, not a custom sub-agent |
| Autonomy level | `--agent-mode` | None |
| Reinvestigation cooldown | *(none)* | **Gap** — no parameter exists |

The tool's own [tool annotation hints](https://learn.microsoft.com/azure/developer/azure-mcp-server/tools/#tool-annotations-for-azure-mcp-server)
mark `incidents plans create` as **not idempotent** — repeated calls create duplicate plans.
`scripts/configure-sre-agent-incident-response.ps1` therefore always calls `incidents plans list`
first and only creates when a plan with the target name is absent, and **fails closed** (does not
attempt creation) if the list call itself fails, so a transient list failure can never result in a
duplicate active plan.

**Confidence**: Medium. The tool is real and documented, but the two gaps (cooldown, custom-agent
routing) mean the script cannot fully replicate the portal's response-plan model. The script
prints the exact remaining portal steps every run, whether or not `azmcp` is available.

> ⚠️ **Important safety finding from this spike**: the response-plan tutorial states connecting an
> incident platform auto-creates a **Quickstart** response plan, and separately that **new
> response plans default to Autonomous mode**, not Review
> (https://learn.microsoft.com/azure/sre-agent/response-plan: "New plans default to Autonomous").
> This means the moment `incidentManagementConfiguration.type` is set (via Bicep or the portal),
> an Autonomous-mode Quickstart plan may already be active before an operator ever runs the setup
> script or visits the response-plan portal page. `scripts/configure-sre-agent-incident-response.ps1`
> prints an urgent, prominent warning immediately after confirming the platform connection, telling
> the operator to check/delete the Quickstart plan **before** any alert can fire — this is called
> out here because it is the one place in this spike where the documented default behavior actively
> works against this repo's "Review mode only" safety contract, and closing it requires a manual
> portal check that cannot be fully automated by either Bicep or the current Azure MCP Server tool.

### 4. Incident lifecycle evidence

[Audit Agent Actions](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions) documents
nine `customEvents` event types; issue #76 scoped four of them (`IncidentActivitySnapshot`,
`AgentExecution`, `AgentToolExecution`, `ApprovalDecision`) plus the shared correlation fields
(`gen_ai.agent.id`, `gen_ai.agent.name`, `TraceId`, `SpanId`, `ParentSpanId`, `ThreadId`,
`LogTimestamp`, `CorrelationId`). `IncidentActivitySnapshot` and `AgentToolExecution` have fully
itemized field tables; `AgentExecution` and `ApprovalDecision` do not (Microsoft Learn documents
only "session lifecycle" and a raw `customDimensions` projection, respectively) — both are tagged
`SCHEMA_TBD` per `docs/CAPABILITY-CONTRACTS.md` §8/§16 wherever queried.

This repo already deploys the SRE Agent's Application Insights as the **same workspace-based**
resource used for application telemetry (`infra/bicep/modules/app-insights.bicep`,
`sre-agent.bicep`'s `logConfiguration`), so `SreAgentEvidenceService.ts` queries it the same way
`LogAnalyticsQueryService.ts` already queries `AppRequests`/`AppDependencies` — via
`az monitor log-analytics query` against the shared workspace, with the same allowlisted-template,
bounded-parameter, and redaction conventions.

## What was implemented

- **Bicep** (`infra/bicep/modules/sre-agent.bicep`, `main.bicep`, `main.bicepparam`): new
  `incidentPlatform`/`sreAgentIncidentPlatform` parameter (default `'AzureMonitor'`), the
  `incidentManagementConfiguration` property, and a conditional Monitoring Contributor role
  assignment. All additive and backward compatible — set `sreAgentIncidentPlatform = 'None'` to
  restore the prior behavior exactly.
- **Idempotent script** (`scripts/configure-sre-agent-incident-response.ps1`): capability
  detection (incident-platform connection status, Monitoring Contributor presence), idempotent
  response-plan creation via `azmcp` when available, and always-printed portal steps for the
  cooldown/custom-agent/title-contains gaps above. Refuses to run against the excluded
  `rg-srelab-northcentralus` resource group and blocks Autonomous mode without an explicit
  `-AllowAutonomous` acknowledgment.
- **Typed evidence pipeline** (`mission-control/backend/src/services/SreAgentEvidenceService.ts`,
  `NativeIncidentReconciliationService.ts`): parameterized KQL templates for the four documented
  event types, a reconciliation state machine (`local-fallback-only`, `native-observed`,
  `native-approval-required`, `native-mitigated`, `evidence-unavailable`), and a
  `POST /api/incidents/:id/reconcile-native-evidence` route wired into `IncidentHandoffService.ts`
  as an additive `nativeEvidence` field. See `docs/CAPABILITY-CONTRACTS.md` §16 for the full
  contract.
- **Mission Control UI** (`MissionWallboard.vue`): incident cards now show a native-evidence badge
  distinguishing the five states above, plus a "Check native evidence" action.
- **Tests**: `SreAgentEvidenceService.test.ts` and `NativeIncidentReconciliationService.test.ts`
  cover template allowlisting, KQL shape, schema-mismatch detection, duplicate/stale/missing-field
  handling, and the fallback path where no native evidence exists.

## Live validation status

**Attempted, blocked on environment access, honestly reported as pending.** The only Azure
subscription reachable from the session that implemented this issue
(`ME-MngEnvMCAP550731-jostelma-2`, an unrelated internal Microsoft tenant) has no deployed Energy
Grid SRE Agent resource, and the authenticated identity lacks `Microsoft.Resources/subscriptions/read`
on it. Running `scripts/configure-sre-agent-incident-response.ps1` against it correctly reports:

```
BLOCKED: SRE Agent 'sre-srelab' was not found in '<resource-group>'.
Deploy it first with scripts/deploy.ps1 (deploySreAgent=true, the default), then rerun this script.
```

exit code `2` — a blocked, non-fabricated result, not a false success. Per the task instructions,
no paid or destructive deployment was performed to manufacture a live result, and the known
AmeriGas resource group `rg-srelab-northcentralus` was neither deployed into nor modified (the
script hard-blocks that resource group name explicitly).

**Still required to close issue #76** (from the issue's own "Validation evidence required to
close" list — none of these are claimed here):

- [ ] Screenshot or export showing the response plan enabled in Review mode.
- [ ] Azure Monitor alert firing record from a live OOMKilled/MongoDBDown injection.
- [ ] Matching `IncidentActivitySnapshot` and agent lifecycle rows with correlation IDs.
- [ ] Mission Control view showing the reconciled incident (`native-observed`/`native-mitigated`).
- [ ] Repeated-fire evidence proving the reinvestigation cooldown merges threads (OOMKilled ×2).
- [ ] MongoDBDown ×1 to validate a second alert family.
- [ ] Fallback-path test with the native response plan disabled (confirms the Action Group webhook
      still works — this path was exercised in this session via unit tests, but not against a live
      Action Group).

## Known limitations acknowledged during adversarial review

- **ARM incremental-deployment semantics**: setting `sreAgentIncidentPlatform = 'None'` after a
  prior deployment connected Azure Monitor removes the `incidentManagementConfiguration` property
  and the conditional Monitoring Contributor role assignment from the next incremental deployment,
  but Azure Resource Manager does not retroactively delete resources whose `condition` becomes
  false — this is a general Bicep/ARM characteristic that already applies to every other optional
  toggle in this file (`deployActionGroup`, `deployAlerts`, `deploySreAgent`), not something new
  introduced by this change. Confirm role removal manually if strict opt-out is required.
- **Redaction is best-effort, not exhaustive**: `SreAgentEvidenceService.ts` reuses the same
  regex-based `redactSensitiveText`/`redactRow` pattern already used by
  `LogAnalyticsQueryService.ts` for `service-log-excerpts`/`application-exceptions-errors`. It
  catches common credential/token patterns but is not a comprehensive DLP solution; `ToolInput`/
  `ToolOutput` values from `AgentToolExecution` can still contain other sensitive data shapes. This
  is a pre-existing repo-wide characteristic of the governed-evidence-template pattern, not a gap
  unique to this issue's templates.

## Non-goals honored

- Autonomous mode was not enabled anywhere in Bicep, the script, or documentation.
- No portal scraping or undocumented private API calls were used; every automated surface above is
  a documented, first-party ARM property or Azure MCP Server tool.
- No fabricated incident IDs, thread IDs, or diagnoses appear in code or docs — `evidence-unavailable`
  and `local-fallback-only` are the honest defaults absent live telemetry.
- The Action Group → Mission Control webhook fallback (`infra/bicep/modules/action-group.bicep`,
  `IncidentHandoffService.ts`) was not modified in a breaking way and remains fully functional.

## Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-08-12 | 0.1 | Initial capability spike and implementation record for issue #76 | Copilot draft for review |
