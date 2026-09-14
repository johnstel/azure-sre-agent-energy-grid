# Capability Contracts

These contracts keep the demo's alerts, scenarios, evidence, access model, and customer-facing claims consistent with the checked-in implementation.

## 1. Telemetry dimensions

Use stable, lowercase scenario IDs and the `energy` namespace across alerts, KQL, runbooks, and evidence.

Preferred correlation fields:

| Field | Purpose |
|-------|---------|
| `sre.namespace` | Kubernetes namespace |
| `sre.scenario` | Single scenario ID when a signal maps one-to-one |
| `alert.scenarios` | Comma-separated scenario IDs for shared alerts |
| `sre.service` | Affected service |
| `sre.root-cause-category` | Stable root-cause category |
| `CorrelationId` | Cross-signal correlation when the source exposes it |

Do not invent fields for Azure tables that do not expose them. Use an empty value and document the limitation.

## 2. Evidence layout

The repository retains only reusable evidence assets:

- `docs/evidence/kql/stable/`
- `docs/evidence/runbooks/`
- `docs/evidence/scenarios/scenario-manifest.yaml`
- `docs/evidence/diagrams/`

Raw logs, screenshots, exports, and run notes stay outside the repository until redacted and reviewed. Missing evidence remains missing; do not add simulated portal output or blocker-card screenshots.

## 3. Scenario metadata schema

`docs/evidence/scenarios/scenario-manifest.yaml` is the metadata source for the ten individual scenarios. Each record contains identity, severity, affected services, expected signals, root-cause category, linked runbook/KQL/alert/SLO data, break manifest, restore command, and pass/fail criteria.

The `complete-failure-bundle` is a composite scenario outside the numbered registry.

| Scenario ID | # | Title | Severity | Root-cause category |
|-------------|---|-------|----------|---------------------|
| `oom-killed` | 1 | Meter Service Memory Exhaustion | critical | resource-exhaustion |
| `crash-loop` | 2 | Asset Service Configuration Failure | critical | configuration |
| `image-pull-backoff` | 3 | Failed Dispatch Service Deployment | critical | image |
| `high-cpu` | 4 | Grid Frequency Calculation Overload | warning | resource-exhaustion |
| `pending-pods` | 5 | Substation Monitor Cannot Schedule | warning | scheduling |
| `probe-failure` | 6 | Grid Health Monitor Probe Failure | warning | probe |
| `network-block` | 7 | Meter Service Network Isolation | critical | networking |
| `missing-config` | 8 | Grid Zone Configuration Missing | warning | configuration |
| `mongodb-down` | 9 | Meter Database Outage | critical | dependency |
| `service-mismatch` | 10 | Meter Service Selector Mismatch | critical | configuration |

Run `scripts/validate-scenario-metadata.ps1 -Strict` after changing scenario metadata or Kubernetes scenario manifests.

## 4. Alert naming and severity

Alert names use the deployed workload prefix plus a stable signal suffix.

| Severity | Meaning |
|----------|---------|
| Sev 0 | Critical service-wide outage requiring immediate response |
| Sev 1 | Error condition with material service impact |
| Sev 2 | Warning or degraded condition |
| Sev 3-4 | Informational signals |

The four checked-in baseline alerts are defined in `infra/bicep/modules/alerts.bicep`. Do not claim that every scenario has a dedicated alert.

## 5. Runbook IDs

Runbooks use `RB-{NNN}-{slug}.md`. A runbook must state symptoms, diagnosis steps, safe recovery, prompts, reusable evidence, and the human execution boundary.

## 6. RBAC and access profiles

| Profile | Agent access | Intended use |
|---------|--------------|--------------|
| `Low` | Reader + Log Analytics Reader | Diagnosis-only and external demos |
| `High` | Adds Contributor and broad AKS administration | Internal remediation demonstrations only |
| `Mitigation` | Reader/Log Analytics Reader plus the narrow checked-in mitigation role | Review-mode mitigation workflow |

The Bicep modules are authoritative for role assignments. These are demo profiles, not production recommendations. Review scopes, tool policies, identity boundaries, and organizational controls before adapting them.

## 7. SLO and MTTR timestamps

The demo incident timeline uses:

| Marker | Event |
|--------|-------|
| T0 | Scenario injected |
| T1 | First observable symptom or alert |
| T2 | Investigation started |
| T3 | Diagnosis received |
| T4 | Remediation applied |
| T5 | Functional recovery verified |

Do not mark T5 from pod readiness alone when the scenario affects a customer journey. For meter ingest, require a newer successful synthetic transaction.

Do not publish MTTR improvement percentages without repeated, comparable measurements.

## 8. Undocumented telemetry

Do not build stable queries or customer claims on undocumented SRE Agent telemetry fields. Exploratory fields must remain outside the stable KQL library until verified against current first-party documentation and a live deployment.

## 9. Action mode

The ARM API exposes `ReadOnly`, `Review`, and `Automatic` action modes. This demo uses Review mode and keeps operator control explicit.

Approval behavior can differ by operation type and tool policy. Do not claim that every Kubernetes or external-tool action presents an approval button. Show the actual portal/API behavior or say that the agent recommends and the operator executes.

## 10. Demo versus production

Demo conveniences include a single resource group, a single namespace, broad internal-only access profiles, and a public AKS API endpoint with optional authorized IP ranges.

Production design requires a separate security and reliability review covering least privilege, private connectivity, identity lifecycle, secrets, telemetry retention, policy, and incident ownership.

## 11. Data retention

The checked-in Log Analytics and Application Insights settings define the intended retention configuration. Verify the deployed values before making retention or audit-completeness claims.

Activity Log export proves only the operations actually exported and retained. It does not by itself provide a complete end-to-end audit trail for SRE Agent reasoning or every external tool call.

## 12. Schema stability

Classify a query as stable only when its source tables and required fields are documented and validated. Keep schema assumptions close to the query and fail visibly when required columns are unavailable.

## 13. Demo-only shortcuts

Document shortcuts that would be unacceptable defaults elsewhere, including:

- Broad `High` access
- Public AKS API exposure
- In-cluster MongoDB and RabbitMQ
- Accelerated SLO probes and scenario timings
- Destructive break scenarios

## 14. Readiness gates

Before a customer-facing run:

- Deployment validation passes.
- The selected scenarios restore cleanly.
- Required portal and telemetry surfaces are reachable.
- Claims are supported by live or current captured evidence.
- Screenshots and exported data are redacted.
- The operator has a teardown plan.

## 15. Anti-rework rules

- Reuse stable scenario IDs.
- Reuse checked-in runbooks and KQL.
- Do not duplicate troubleshooting content.
- Do not copy live environment output into durable documentation.
- Keep implementation claims tied to code, tests, or current first-party documentation.

## 16. Native incident platform

The Bicep module configures `incidentManagementConfiguration.type` with the documented `AzMonitor` literal when Azure Monitor is selected. `scripts/configure-sre-agent-incident-response.ps1` performs the remaining setup and verification steps.

Live alert-to-investigation proof must include the actual incident/thread evidence. Configuration alone does not prove that a particular alert triggered, merged, or completed an investigation.

## 17. Maintenance

Review this document whenever the SRE Agent ARM API, access model, incident integration, scenario registry, or evidence policy changes. Prefer current Microsoft Learn documentation and the checked-in implementation over dated rollout notes or one-time execution reports.
