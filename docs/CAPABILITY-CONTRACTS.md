# Capability Contracts

> **Version**: 0.2 · **Wave**: 0 — Contracts only, no runtime changes
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2025-05-01-preview` in this subscription)
> **Repo**: [`johnstel/azure-sre-agent-energy-grid`](https://github.com/johnstel/azure-sre-agent-energy-grid)

This document defines the shared contracts that every capability in the demo lab consumes. No implementation work should start for a wave until the contracts it depends on are locked here.

---

## 1 · Telemetry Dimensions

All KQL queries, alert custom properties, App Insights telemetry, runbook inputs, and scenario metadata must use these dimension names. Do not invent ad-hoc field names.

| Dimension | Type | Example | Purpose |
|-----------|------|---------|---------|
| `sre.scenario` | string | `oom-killed` | Stable scenario identifier (see §4) |
| `sre.service` | string | `meter-service` | Application-level service name |
| `sre.namespace` | string | `energy` | Kubernetes namespace |
| `sre.component` | string | `mongodb` | Infrastructure dependency |
| `sre.version` | string | `2026-04-25` | Schema version for forward compat |

### Rules

- Queries must accept `sre.scenario` and `sre.namespace` as parameters — never hardcode scenario names.
- Alert custom properties must include `sre.scenario` when the alert is scenario-specific, and `sre.service` when the alert is service-specific.
- App Insights custom dimensions must use `sre.*` prefix. Stamp `sre.version` so queries can filter across schema changes.
- When a dimension is not applicable, omit it — do not set empty strings.

---

## 2 · Evidence Layout

All demo evidence is stored under `docs/evidence/`. The canonical structure:

```
docs/evidence/
├── README.md              # Layout conventions and status
├── kql/                   # Parameterised .kql files
│   └── README.md
├── screenshots/           # Portal and SRE Agent screenshots (.png)
├── diagrams/              # Architecture, trust, RBAC (.mmd + .png)
├── runbooks/              # Structured runbook templates (.md)
│   └── README.md
└── scenarios/             # Per-scenario evidence
    ├── oom-killed/
    ├── crash-loop/
    ├── mongodb-down/
    ├── service-mismatch/
    ├── image-pull-backoff/
    ├── high-cpu/
    ├── pending-pods/
    ├── probe-failure/
    ├── network-block/
    └── missing-config/
```

### File naming

| Artifact | Pattern | Example |
|----------|---------|---------|
| KQL query | `{query-purpose}.kql` | `pod-restart-trend.kql` |
| Screenshot | `{scenario-id}_{step}.png` | `oom-killed_diagnosis.png` |
| Diagram | `{topic}.mmd` + `{topic}.png` | `trust-tiers.mmd` |
| Runbook | `RB-{NNN}-{slug}.md` | `RB-001-oom-killed.md` |
| Scenario run notes | `scenarios/{id}/run-notes.md` | `scenarios/oom-killed/run-notes.md` |

---

## 3 · Scenario Metadata Schema

Every breakable scenario must have a metadata block (YAML front matter or structured table) that conforms to this schema. Scenario IDs are stable — do not rename after Wave 0 lock.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Stable kebab-case identifier. Must match folder name under `docs/evidence/scenarios/`. |
| `number` | integer | ✅ | Scenario number (1–10 currently). |
| `title` | string | ✅ | Human-readable title. |
| `severity` | enum | ✅ | One of: `critical`, `warning`, `info` (see §5). |
| `affected_services` | string[] | ✅ | Services impacted (e.g., `["meter-service"]`). |
| `affected_components` | string[] | | Infrastructure deps impacted (e.g., `["mongodb"]`). |
| `expected_signals` | string[] | ✅ | Observable K8s/Azure signals (e.g., `["OOMKilled", "pod restarts"]`). |
| `root_cause_category` | enum | ✅ | One of: `resource-exhaustion`, `configuration`, `dependency`, `networking`, `image`, `scheduling`, `probe`. |
| `runbook_id` | string | | `RB-{NNN}` reference once runbook exists (Wave 4). |
| `slo_target` | string | | SLO reference once defined (Wave 5). |
| `change_source` | string | | How the break is injected (e.g., `kubectl apply`). |
| `k8s_manifest` | string | ✅ | Path to the scenario YAML file. |
| `fix_command` | string | ✅ | Command to restore healthy state. |

### Current scenario registry

| ID | # | Title | Severity | Root Cause | Services |
|----|---|-------|----------|------------|----------|
| `oom-killed` | 1 | Meter Service Memory Exhaustion | critical | resource-exhaustion | meter-service |
| `crash-loop` | 2 | Asset Service Configuration Failure | critical | configuration | asset-service |
| `image-pull-backoff` | 3 | Failed Dispatch Service Deployment | critical | image | dispatch-service |
| `high-cpu` | 4 | Grid Frequency Calculation Overload | warning | resource-exhaustion | frequency-calc-overload |
| `pending-pods` | 5 | Substation Monitor Can't Schedule | warning | scheduling | substation-monitor |
| `probe-failure` | 6 | Grid Health Monitor Misconfigured | warning | probe | grid-health-monitor |
| `network-block` | 7 | Meter Service Isolated | critical | networking | meter-service |
| `missing-config` | 8 | Grid Zone Configuration Missing | warning | configuration | grid-zone-config |
| `mongodb-down` | 9 | Meter Database Outage (Cascading) | critical | dependency | mongodb, meter-service, dispatch-service |
| `service-mismatch` | 10 | Meter Service Routing Failure | critical | configuration | meter-service |

> **Provisional bundle (outside locked Wave 0 registry):** `complete-failure-bundle` (`k8s/scenarios/complete-failure-bundle/scenario.yaml`) is intentionally excluded from the 1–10 schema and validated via explicit exclusion policy in `scripts/validate-scenario-metadata.ps1` and `docs/evidence/scenarios/scenario-manifest.yaml`.

---

## 4 · Alert Naming & Severity Taxonomy

### Deployment status

> **Wave 0 baseline:** `deployAlerts = false` (default off)
> **Wave 1 implementation:** `deployAlerts = true` for demo environments
> **Production:** Customers decide based on incident workflow integration

Wave 1 deploys the four baseline demo alerts by default. Production deployments should decide whether to enable these alerts based on their incident workflow and action-group integration.

### Name format (Wave 0 implementation)

```
{prefix}-{signal-slug}
```

Where `{prefix}` is the Bicep `namePrefix` parameter (e.g., `alert-srelab`) and `{signal-slug}` is a stable kebab-case signal name.

**Current implementation:** `alert-{workloadName}-{signal-slug}` (from `main.bicep:262`)

Examples:
- `alert-srelab-pod-restarts`
- `alert-srelab-http-5xx`
- `alert-srelab-pod-failures`
- `alert-srelab-crashloop-oom`

### Proposed Wave 1 enhancement (not yet implemented)

For multi-environment deployments, recommend:

```
alert-{workload}-{environment}-{signal}-{severity}
```

Examples:
- `alert-srelab-sandbox-pod-restarts-medium`
- `alert-srelab-prod-http-5xx-high`

**Rationale:** Current naming is sufficient for single-environment demos. Multi-environment support requires environment tagging (see `ripley-wave0-infra-contract-input.md` for full proposal).

### Current alert names

Defined in `infra/bicep/modules/alerts.bicep`:

| Alert Name Slug | Display Name | Severity | Signal |
|-----------------|-------------|----------|--------|
| `pod-restarts` | Energy Grid - Pod restart spike | Sev 2 (Warning) | `ContainerRestartCount > 0` |
| `http-5xx` | Energy Grid - HTTP 5xx spike | Sev 1 (Error) | HTTP 5xx response codes |
| `pod-failures` | Energy Grid - Failed or pending pods | Sev 2 (Warning) | PodStatus in (Failed, Pending) |
| `crashloop-oom` | Energy Grid - CrashLoop/OOM detected | Sev 1 (Error) | CrashLoopBackOff or OOMKilled events |

### Severity mapping

| Azure Severity | Label | Use For |
|----------------|-------|---------|
| Sev 0 | Critical | Service outage affecting multiple components (cascading) |
| Sev 1 | Error | Single-service crash or data loss risk |
| Sev 2 | Warning | Degraded but functional; scheduling/pull issues |
| Sev 3 | Informational | Proactive signals, drift detection |

### Custom properties

Every alert must include these custom properties for query correlation:

```json
{
  "source": "azure-sre-agent-sandbox",
  "workload": "energy-grid"
}
```

> **Wave 0 implementation:** Only `source` and `workload` are currently set (see `infra/bicep/modules/alerts.bicep:29-32`).
> **Wave 1 enhancement:** Add `sre.scenario`, `sre.service`, `demo_scenario`, and `runbook_url` when runbooks exist.

This prevents premature schema commitment before telemetry dimensions (§1) are fully integrated.

### Rules

- New alerts must be added to `alerts.bicep` using this taxonomy. Do not create alerts outside the module.
- Alert names must be unique across the deployment — the `{prefix}-{slug}` pattern ensures this.
- `autoMitigate: true` is the default. Override only with documented justification.
- Do not write KQL alert queries before the alert naming taxonomy is locked (this section).

---

## 5 · Runbook ID & Template Standard

### ID format

```
RB-{NNN}-{scenario-or-topic-slug}
```

`NNN` is zero-padded, monotonically increasing. Reserve ranges:

| Range | Purpose |
|-------|---------|
| 001–099 | Per-scenario runbooks (1:1 with scenario IDs) |
| 100–199 | Cross-cutting operational runbooks |
| 200–299 | Security and compliance runbooks |

### Runbook template

Every runbook file under `docs/evidence/runbooks/` must follow this structure:

```markdown
# RB-{NNN}: {Title}

| Field | Value |
|-------|-------|
| **Scenario** | {scenario-id or "cross-cutting"} |
| **Severity** | {critical / warning / info} |
| **Services** | {comma-separated service names} |
| **Last verified** | {YYYY-MM-DD} |

## Symptoms

- {Observable signal 1}
- {Observable signal 2}

## Diagnosis Steps

1. {Step with KQL query or kubectl command}
2. {Step}

## Remediation

1. {Action}
2. {Verification}

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Open-ended | "{prompt}" |
| Direct | "{prompt}" |
| Remediation | "{prompt}" |

## Evidence

- KQL: `docs/evidence/kql/{file}.kql`
- Screenshot: `docs/evidence/screenshots/{file}.png`
```

### Rules

- Do not create runbooks before scenario IDs and runbook IDs are stable (this section).
- Runbooks reference evidence files by relative path; evidence must exist or be marked `TODO`.

---

## 6 · RBAC & Access Profile Matrix

### Demo access profiles

The demo supports three access profiles. Each corresponds to a distinct configuration of the Azure SRE Agent `mode` and `accessLevel` properties.

| Profile | SRE Agent Mode | Access Level | Human Approval | Use Case |
|---------|---------------|--------------|----------------|----------|
| `review-readonly` | `Review` | `Low` | N/A (read ops only) | Diagnosis-only demos; safe for untrusted audiences |
| `review-remediate` | `Review` | `High` | ✅ Required for writes | **Default demo profile** — agent recommends, operator executes unless a real approval UI/API is captured |
| `auto-remediate` | `Auto` | `High` | ❌ Agent acts autonomously | Advanced demo only; document risk prominently |

> **Current state**: The Bicep deployment uses `mode: 'Review'` and `accessLevel: 'High'` — this maps to `review-remediate`. See `infra/bicep/modules/sre-agent.bicep:92-96`.

### Role assignments — Bicep-first with script fallback

The deployment uses a **Bicep-first, script-fallback** strategy:

| Role | Scope | Assignee | Assigned By | Purpose |
|------|-------|----------|-------------|---------|
| Log Analytics Reader | Resource Group | SRE Agent Managed Identity | Bicep | Query workspace for diagnosis |
| Reader | Resource Group | SRE Agent Managed Identity | Bicep | Read Azure resource metadata |
| Contributor | Resource Group | SRE Agent Managed Identity | Bicep (if `accessLevel='High'`) | Execute remediation actions |
| SRE Agent Administrator | SRE Agent resource | Deploying user | Bicep | Manage the agent in portal |
| AKS Cluster Admin | AKS cluster | SRE Agent Managed Identity | PowerShell script | kubectl access (demo only) |
| AKS RBAC Cluster Admin | AKS cluster | SRE Agent Managed Identity | PowerShell script | Full K8s RBAC (demo only) |
| Key Vault Secrets Officer | Key Vault | SRE Agent Managed Identity | PowerShell script | Read/write secrets (demo only) |

> **Source of truth:**
> 1. **Bicep modules** (`infra/bicep/modules/sre-agent.bicep`) — Primary, always attempted
> 2. **PowerShell script** (`scripts/configure-rbac.ps1`) — Fallback for subscription policy restrictions
> 3. **Manual portal** — Not used; all RBAC is code-defined

> **Why both?** Some Azure subscriptions block ARM-based role assignments via policy. The script provides a workaround path while maintaining infrastructure-as-code principles.

### Security notes — Demo vs. Production RBAC

⚠️ **Demo-only overprovisioning:**

The default deployment grants **broad permissions for demo convenience**, not production best practices:

| Permission | Demo Reason | Production Alternative |
|------------|-------------|----------------------|
| `Contributor` on resource group | SRE Agent can fix-it-yourself (delete/recreate pods, scale) | Use `Reader` + namespace-scoped K8s RBAC |
| `AKS Cluster Admin` | Full kubectl access including secrets | Use `AKS Cluster User` (read-only) |
| `Key Vault Secrets Officer` | Read/write all secrets | Use specific secret-scoped RBAC |
| Subscription-wide `Reader` | Broad Azure context visibility | Resource-group scoped only |

**Production recommendation:** Use `accessLevel = 'Low'` (Reader + Log Analytics Reader only) and integrate with existing ITSM approval workflows for write operations.

See `docs/AZURE-SRE-AGENT-CUSTOMER-DELTAS.md` §5 for full security posture analysis and production hardening guidance.

---

## 7 · SLO & MTTR Timestamp Model

### MTTR timeline contract

Every end-to-end incident lifecycle must record these timestamps. Until measurement infrastructure exists (Wave 5), capture them manually in scenario `run-notes.md`.

| Timestamp | Label | Event |
|-----------|-------|-------|
| `T0` | Scenario injected | `kubectl apply -f k8s/scenarios/{id}.yaml` |
| `T1` | Alert fired / signal detected | Azure Monitor alert or first observable symptom |
| `T2` | SRE Agent conversation started | Operator opens SRE Agent portal and submits first prompt |
| `T3` | Recommendation made | SRE Agent returns diagnosis and recommended action |
| `T4` | Operator action taken | Human approves/executes remediation |
| `T5` | Service healthy | All affected pods Running/Ready, endpoints serving |

- **MTTR** = `T5 − T1` (time from detection to recovery).
- **Agent diagnosis time** = `T3 − T2`.
- **Human response time** = `T4 − T3`.

### SLO framework

SLO definitions will be added in Wave 5. Reserve the following structure:

| SLO Name | Indicator | Target | Burn-Rate Window | Alert Severity |
|----------|-----------|--------|------------------|----------------|
| `slo-pod-availability` | Pod Running ratio in `energy` namespace | 99.5% | 5m / 1h / 6h | Sev 1 / Sev 2 / Sev 3 |
| `slo-meter-ingest` | Meter readings processed per minute | > 0 for 5m | 5m | Sev 0 |

These are placeholders. Do not implement burn-rate alerts until real data sources exist.

---

## 8 · API-Version Telemetry — `SCHEMA_TBD` Rule

Azure SRE Agent is GA. App Insights telemetry emitted by the agent (custom dimensions, dependency names, trace formats) may still change across API versions.

> **S0-4 Contract**: This section constitutes the formal SCHEMA_TBD contract required by the Security Wave 0 review. Known TBD scope: all App Insights telemetry emitted via `logConfiguration.applicationInsightsConfiguration` in `sre-agent.bicep`.

### Rules

1. Any KQL query or dashboard that references SRE Agent-specific App Insights fields must be tagged with a `// SCHEMA_TBD` comment.
2. Do not build production-grade dashboards or alerts against `SCHEMA_TBD` fields.
3. When this subscription exposes `Microsoft.App/agents@2026-01-01` and `what-if` validates it, audit all `SCHEMA_TBD` references and update or remove the tag.
4. Document observed field names in `docs/evidence/kql/README.md` with the preview API version where they were seen.

### Example

```kql
// SCHEMA_TBD — observed in 2025-05-01-preview, may change
traces
| where customDimensions["sre.agent.conversationId"] != ""
| project timestamp, message, customDimensions
```

---

## 9 · Review vs. Auto Mode Contract (S0-1)

This demo proves **Review mode only**. Auto mode exists but is out of scope for this wave.

No document, slide, runbook, prompt, or live demo shall claim that auto-remediation is demonstrated by this lab. The current deployment uses `mode: 'Review'` and `accessLevel: 'High'`, which means the agent may recommend remediation but a human operator remains responsible for executing write actions. If the Azure SRE Agent portal exposes a specific approval/denial UX in this environment, capture it as evidence before mentioning it; otherwise use “agent recommends, operator executes.”

Any future Auto mode demo requires a separate security review with evidence of:

- Rollback procedure.
- Blast radius containment.
- Audit trail for auto-executed actions.
- Kill-switch documentation.

---

## 10 · RBAC Mode Matrix — Demo vs. Production (S0-2)

The current demo profile intentionally grants broad roles through `scripts/configure-rbac.ps1` for setup speed and scenario coverage. Production environments must reduce scope and privilege before customer use.

| Role | Scope | Demo Profile | Production Minimum | Notes |
|------|-------|--------------|--------------------|-------|
| AKS Cluster Admin | AKS | ⚠️ DEMO ONLY | ❌ Remove — use namespace-scoped RBAC | Over-privileged for diagnosis |
| AKS RBAC Cluster Admin | AKS | ⚠️ DEMO ONLY | ❌ Remove — use namespace-scoped RBAC | Over-privileged |
| AKS Contributor | AKS | ⚠️ DEMO ONLY | Azure Kubernetes Service Cluster User Role | Minimum for kubectl access |
| Log Analytics Reader | Workspace | ✅ | ✅ Keep | Agent only queries logs |
| Monitoring Reader | Resource Group | ✅ | ✅ Keep | Needed for metrics |
| Key Vault Secrets Officer | Key Vault | ⚠️ DEMO ONLY | ❌ Remove or Key Vault Secrets User | Agent doesn't manage secrets |
| AcrPull | ACR | ✅ | ✅ Keep if image metadata/pull access is needed | No scenario requires image push |
| Reader | Subscription | ⚠️ DEMO ONLY | Reader (Resource Group scope) | Limit enumeration surface |
| Contributor | Resource Group | ⚠️ DEMO ONLY (`accessLevel: 'High'`) | ❌ Remove (`accessLevel: 'Low'`) | Use Low for read-only diagnosis |

`accessLevel: 'Low'` gives Reader + Log Analytics Reader. `accessLevel: 'High'` adds Contributor. The Bicep source of truth allows only `High` and `Low` for `accessLevel`; do not use other values.

---

## 11 · Data Retention (S0-3)

| Source | Current Retention | KQL Queryable | Export Configured | Production Recommendation |
|--------|-------------------|---------------|-------------------|---------------------------|
| Log Analytics (Container Insights) | 90 days configured in Bicep | Yes | N/A (is destination) | Verify deployed retention during UAT |
| App Insights (SRE Agent telemetry) | 90 days | Yes | Wired to LA workspace | Sufficient |
| Activity Log (ARM operations) | 90 days platform retention; export configured in Bicep | Yes after diagnostic setting deployment | `activity-log-diagnostics.bicep` | Verify export and ingestion during UAT |
| Key Vault audit | 7 days soft-delete | No | No diagnostic setting | Enable diagnostic setting; extend soft-delete to 90 days |
| SRE Agent conversations | Unknown (service-managed) | Unknown | Unknown | Track Microsoft data handling docs for current API version |

> **Wave 1 implementation:** Log Analytics retention is configured to 90 days and Activity Log export is defined in Bicep. Do not claim complete 90-day audit evidence until live UAT verifies the deployed retention setting and Activity Log records arrive in Log Analytics.

### Activity Log export validation prerequisite

All demo deployments MUST export Activity Log to Log Analytics with these categories:

- Administrative, Security, ServiceHealth, Alert, Recommendation, Policy, Autoscale, ResourceHealth

**Required Bicep module:** `infra/bicep/modules/activity-log-diagnostics.bicep`

**Deployment:** Must be called from `main.bicep` at `targetScope = 'subscription'` (already true).

**Ownership:**

- Module creation: Ripley (Wave 1) — complete in Bicep
- Cost impact documentation: Ripley updates `docs/COSTS.md` — complete
- Integration validation: Parker/SRE verifies Activity Log export is queryable after deployment

---

## 12 · Preview Telemetry — Formal `SCHEMA_TBD` Rule (S0-4)

The formal S0-4 `SCHEMA_TBD` contract is defined in §8. That section governs every KQL query, dashboard, or evidence artifact that references SRE Agent App Insights telemetry.

Known TBD scope includes all fields emitted by the SRE Agent App Insights telemetry through `logConfiguration.applicationInsightsConfiguration` in `sre-agent.bicep`.

---

## 13 · Demo-Only Shortcuts Inventory (S0-5)

| Shortcut | Location | Risk | Production Recommendation |
|----------|----------|------|--------------------------|
| ⚠️ DEMO ONLY — RabbitMQ static `guest/guest` credentials | `k8s/base/application.yaml` (`Secret/rabbitmq-credentials`) | Static credentials are stored in Git and not rotated | Use Key Vault + Workload Identity for credentials |
| ⚠️ DEMO ONLY — MongoDB without authentication | `k8s/base/application.yaml` | Any pod can read/write all data | Enable `--auth`, create service accounts |
| ⚠️ DEMO ONLY — No pod `securityContext` | All deployments in `application.yaml` | Containers run as root with full capabilities | Set `runAsNonRoot: true`, `readOnlyRootFilesystem: true`, drop all capabilities |
| ⚠️ DEMO ONLY — No default-deny NetworkPolicy | `energy` namespace | Any pod can reach any pod | Add default-deny policy, allow only required paths |
| ⚠️ DEMO ONLY — Key Vault purge protection disabled | `infra/bicep/modules/key-vault.bicep` | Compliance failure | Enable purge protection |
| ⚠️ DEMO ONLY — Public AKS API server | `infra/bicep/modules/aks.bicep` | Expanded attack surface | Required for SRE Agent Preview; use private cluster when GA supports it |
| ⚠️ DEMO ONLY — App Insights connection string as Bicep output | `infra/bicep/modules/app-insights.bicep` | Key material in deployment outputs | Route through Key Vault references |

---

## 14 · Wave Gate Acceptance Criteria

Each wave must pass its gate criteria before the next wave begins. Dallas reviews; Lambert validates.

### Wave 0 — Contracts (this document)

- [ ] `docs/CAPABILITY-CONTRACTS.md` exists and covers all sections (§1–§16).
- [ ] `docs/evidence/` folder layout exists with README files.
- [ ] Scenario IDs locked in §3 — no renames after this gate.
- [ ] Alert naming taxonomy locked in §4 (current vs. Wave 1 enhancement).
- [ ] Alert deployment status documented (default off, Wave 1 target).
- [ ] Runbook ID ranges reserved in §5.
- [ ] RBAC profiles documented in §6 (Bicep-first, demo caveats; `review-readonly` uses `accessLevel: 'Low'`).
- [ ] MTTR timestamp model documented in §7.
- [ ] `SCHEMA_TBD` rule documented in §8 and formalized as S0-4 in §12.
- [ ] Review vs. Auto mode claim boundary documented in §9 (S0-1).
- [ ] Demo vs. production RBAC matrix documented in §10 (S0-2).
- [ ] Data retention and Activity Log live-validation requirements documented in §11 (S0-3).
- [ ] Demo-only shortcuts inventory documented in §13 (S0-5).
- [ ] No runtime infrastructure changes (Bicep, K8s, scripts) in this wave.

### Wave 1 — Observable Foundation

- [ ] Alert rules deployed (`deployAlerts = true`) and firing for at least OOMKilled scenario.
- [ ] Activity Log diagnostic export to Log Analytics enabled (§11).
- [ ] Retention standardized to 90 days across Log Analytics, App Insights, Activity Log (§11).
- [ ] First parameterised KQL queries in `docs/evidence/kql/`.
- [ ] First SRE Agent portal evidence captured (screenshot + KQL).
- [ ] RBAC and trust-tier diagrams in `docs/evidence/diagrams/`.

### Wave 2 — First Customer Incident Proof

- [ ] Three reference scenarios (oom-killed, mongodb-down, service-mismatch) have complete evidence folders.
- [ ] Each scenario folder contains: run-notes with MTTR timestamps, KQL output, screenshots.
- [ ] Demo can answer: detection → triage → root cause → action → audit trail.

### Wave 3 — Security & Safe-Fail

- [ ] `review-readonly` and `review-remediate` profiles demonstrated with evidence.
- [ ] Demo-only security shortcuts documented and flagged in §13 (not presented as production guidance).
- [ ] Safe-fail demo (RBAC denial or human-in-the-loop rejection) captured.

### Wave 4 — Runbooks & App Telemetry

- [ ] At least 3 structured runbooks in `docs/evidence/runbooks/`.
- [ ] `meter-service` emits App Insights telemetry with `sre.*` dimensions.
- [ ] MongoDB-down demonstrated as alert noise reduction (multiple symptoms, one root cause).

### Wave 5 — Measurement & Enterprise Proof

- [ ] MTTR timeline KQL query produces real timestamps for at least 2 scenarios.
- [ ] SLO definition and burn-rate alert for pod availability.
- [ ] Compliance evidence package (KQL + screenshots + role matrix + retention statement).

---

## 15 · Anti-Rework Rules

These rules prevent wasted effort from building on unstable foundations.

| Rule | Depends On | Earliest Wave |
|------|-----------|---------------|
| Do not add App Insights instrumentation until telemetry dimensions (§1) are locked | §1 | Wave 4 |
| Do not write KQL queries against undocumented SRE Agent preview fields without `SCHEMA_TBD` | §8, §12 | Any |
| Do not write KQL queries before alert naming and evidence layout are set | §4, §2 | Wave 1 |
| Do not create runbooks before scenario IDs and runbook IDs are stable | §3, §5 | Wave 4 |
| Do not build MTTR/SLO demos before alerts and KQL evidence exist | §7, §4 | Wave 5 |
| Do not claim a reject/deny flow unless Azure SRE Agent Preview actually exposes it | §6, §9 | Wave 3 |
| Do not document overbroad demo RBAC as required production RBAC | §6, §10 | Any |
| Do not claim auto-remediation is demonstrated by this lab | §9 | Any |
| Do not present demo-only security shortcuts as production guidance | §13 | Any |
| Do not claim complete 90-day audit evidence until retention/export is deployed and validated | §11 | Wave 1 |
| Do not hardcode scenario names into reusable queries — use `sre.scenario` parameter | §1 | Any |

---

## 16 · Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-04-26 | 0.2 | Wave 0 fix pass — S0-1..S0-5 security blockers, accessLevel terminology fix | Lambert (QA/Docs) |
| 2026-04-26 | 0.2 | Alert deployment status, RBAC source-of-truth, retention prerequisites (Wave 0 infra precision) | Ripley (Infra Dev) |
| 2026-04-26 | 0.1 | Wave 0 — Initial contract definitions | Lambert (QA/Docs) |
