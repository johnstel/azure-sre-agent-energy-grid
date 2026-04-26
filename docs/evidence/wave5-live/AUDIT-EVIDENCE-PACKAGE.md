# Wave 5 Audit Evidence Package

**Assessment date**: 2026-04-26
**Target use**: Customer demo compliance/audit evidence package
**Scope**: Azure SRE Agent Service capabilities only
**Out of scope**: Mission Control
**Inherited status**: Wave 2 passed with pending human portal validation; Wave 3/Wave 4 docs exist and remain the primary source for security, governance, runbooks, and telemetry caveats.

## Executive summary

Overall readiness: **82/100** for a customer demo evidence package, not a certification audit.
Critical blocker: **real SRE Agent portal validation remains pending**.
Recommended verdict: **`PASS_WITH_PENDING_HUMAN_PORTAL`**.

The repo has strong evidence for configuration intent, runbook governance, least-privilege target posture, activity-log export design, and safe-fail language. The repo does **not** prove a specific SRE Agent approval UI, conversation retention schema, alert firing history for unobserved scenarios, or autonomous remediation.

## Evidence index

| Evidence area | Evidence files | What it supports | Boundary |
|---------------|----------------|------------------|----------|
| SRE Agent Review-mode configuration | `infra/bicep/modules/sre-agent.bicep`; `docs/evidence/wave3-live/SECURITY-STATUS.md` | `actionConfiguration.mode: 'Review'`; `accessLevel` profiles; app insights logging configuration | Configuration intent only; does not prove exact portal UX. |
| Default demo RBAC | `infra/bicep/modules/sre-agent.bicep`; `infra/bicep/main.bicep`; `docs/CAPABILITY-CONTRACTS.md` §6 | `Low` = Reader + Log Analytics Reader; `High` adds Contributor; default deployment passes `High` | `High` is demo convenience, not production least privilege. |
| Human-in-the-loop operating model | `docs/evidence/wave3-live/SECURITY-STATUS.md`; `docs/evidence/wave4-live/RUNBOOK-RECOMMENDATION-VS-EXECUTION.md`; `docs/SAFE-LANGUAGE-GUARDRAILS.md` | Safe statement: agent recommends, operator executes | Approval UI/API remains unproven unless live portal evidence exists. |
| Runbook recommendation boundary | `docs/evidence/runbooks/*.md`; `docs/evidence/wave4-live/RUNBOOK-RECOMMENDATION-VS-EXECUTION.md` | Structured response paths for five scenarios | Execution evidence must be captured separately. |
| Dependency reasoning | `docs/evidence/wave4-live/DEPENDENCY-REASONING.md`; `docs/evidence/runbooks/RB-009-mongodb-down.md` | MongoDBDown root-cause reasoning path | SRE Agent diagnosis remains pending portal validation. |
| Alert limitations | `docs/evidence/wave4-live/ALERT-NOISE-REDUCTION.md`; `docs/evidence/kql/stable/alert-history.kql`; Wave 2 evidence | Baseline alert narrative and `NO_ALERT_FIRED` boundary where applicable | Do not claim alert fired without live alert-management evidence. |
| Audit trail foundations | `infra/bicep/modules/activity-log-diagnostics.bicep`; `docs/evidence/kql/stable/activity-log-rbac.kql` | Activity Log diagnostic export design; RBAC/resource operation query pattern | Live ingestion must be validated per environment. |
| SRE Agent telemetry | `infra/bicep/modules/sre-agent.bicep`; `docs/evidence/kql/schema-tbd/sre-agent-telemetry.kql` | App Insights connection is configured for the SRE Agent resource | SRE Agent Preview telemetry fields and retention are `SCHEMA_TBD`. |
| App/dependency telemetry limitations | `docs/evidence/wave4-live/APP-TELEMETRY-COVERAGE.md` | Infrastructure telemetry coverage; app/dependency telemetry gap | Full App Insights request/dependency coverage is not proven. |
| Safe-fail checklist | `docs/evidence/wave3-live/SAFE-FAIL-DEMO-CHECKLIST.md` | Operator-executable no-permission/safe-fail path | Live RBAC-denial evidence may remain untested unless separately captured. |

## Customer question mapping

### 1. Data handling and retention

**Customer question**: What data does the demo collect, where is it stored, and how long is it retained?

**Evidence files**:

- `infra/bicep/main.bicep` — Log Analytics workspace is configured with `retentionInDays: 90`.
- `infra/bicep/modules/activity-log-diagnostics.bicep` — subscription Activity Log categories are exported to Log Analytics.
- `infra/bicep/modules/sre-agent.bicep` — SRE Agent resource is configured with App Insights connection settings.
- `docs/evidence/wave3-live/SECURITY-STATUS.md` — data handling and retention table.
- `docs/evidence/wave4-live/APP-TELEMETRY-COVERAGE.md` — workload telemetry boundaries.

**Safe answer**:

> “The demo exports Kubernetes/AKS and Azure control-plane evidence to Log Analytics, with workspace retention configured in Bicep. The SRE Agent resource is configured to send operational telemetry to Application Insights, but exact SRE Agent conversation/action fields and retention behavior are Preview-dependent and treated as `SCHEMA_TBD` until observed live.”

**Gap finding — W5-DH-01**

| Field | Detail |
|-------|--------|
| Control reference | SOC 2 CC7.2 / CC8.1 evidence retention; ISO 27001 A.8.15 logging; ASI-06 Insufficient Logging |
| Current state | Infrastructure defines Log Analytics retention and App Insights wiring, but SRE Agent conversation/action schema and retention are not proven. |
| Target state | Live export showing observed SRE Agent telemetry fields, retention setting, sampling posture, and redaction boundary. |
| Remediation steps | Capture a real portal interaction; query App Insights after ingestion; document observed fields; update only `SCHEMA_TBD` artifacts after evidence exists; confirm retention settings in the deployed workspace and App Insights resource. |
| Estimated effort | 0.5–1 day once portal access is available. |
| Priority | High — auditors/customers will ask what is retained and whether conversations contain sensitive data. |

### 2. Explainability and action logging

**Customer question**: Can we explain what the agent recommended and what actions were taken?

**Evidence files**:

- `docs/evidence/wave4-live/RUNBOOK-RECOMMENDATION-VS-EXECUTION.md`
- `docs/evidence/runbooks/RB-001-oom-killed.md`
- `docs/evidence/runbooks/RB-002-crash-loop.md`
- `docs/evidence/runbooks/RB-007-network-block.md`
- `docs/evidence/runbooks/RB-009-mongodb-down.md`
- `docs/evidence/runbooks/RB-010-service-mismatch.md`
- `docs/evidence/kql/stable/activity-log-rbac.kql`
- `docs/evidence/kql/schema-tbd/sre-agent-telemetry.kql`

**Safe answer**:

> “Runbooks document the expected reasoning path and recommended recovery actions. Actual operator actions can be evidenced through kubectl output and Azure Activity Log where applicable. SRE Agent conversation/action telemetry is configured through App Insights, but the Preview schema is not yet treated as stable.”

**Gap finding — W5-EL-01**

| Field | Detail |
|-------|--------|
| Control reference | SOC 2 CC7.2 monitoring; SOC 2 CC7.4 incident response; ASI-06 Insufficient Logging |
| Current state | Recommendation-vs-execution boundary is documented. Activity Log query exists for ARM/RBAC actions. SRE Agent-specific action fields remain `SCHEMA_TBD`. |
| Target state | A redacted transcript/screenshot of recommendation plus separate execution evidence with timestamp, operator, command/action, result, and recovery verification. |
| Remediation steps | Capture portal recommendation; capture operator execution and verification; correlate timestamps T2–T5 from `docs/CAPABILITY-CONTRACTS.md`; query Activity Log for ARM changes if applicable. |
| Estimated effort | 0.5 day per scenario after live portal access. |
| Priority | Critical before claiming the agent diagnosed or recommended a specific action. |

### 3. Human-in-the-loop controls

**Customer question**: Does the agent act autonomously, or does a human approve changes?

**Evidence files**:

- `infra/bicep/modules/sre-agent.bicep` — `mode: 'Review'`.
- `docs/evidence/wave3-live/SECURITY-STATUS.md`
- `docs/evidence/wave3-live/SAFE-FAIL-DEMO-CHECKLIST.md`
- `docs/evidence/wave4-live/RUNBOOK-RECOMMENDATION-VS-EXECUTION.md`
- `docs/SAFE-LANGUAGE-GUARDRAILS.md`

**Safe answer**:

> “In this demo, the SRE Agent is configured in Review mode. We present the operating model as ‘agent recommends, operator executes.’ We do not claim autonomous remediation or a specific approval UI unless that UI is captured live and redacted.”

**Gap finding — W5-HITL-01**

| Field | Detail |
|-------|--------|
| Control reference | SOC 2 CC6.3 authorization; ISO 27001 A.5.15 access control; ASI-03 Excessive Agency; ASI-04 Unauthorized Escalation |
| Current state | Review mode is configured. Operator-executed remediation is documented. Portal approval/denial UX is not proven. |
| Target state | Real portal evidence showing whether the Preview service presents recommendations only or a specific approval/denial UI. |
| Remediation steps | During portal validation, capture exact UX; classify it as recommendation-only or approval-driven; update demo script wording accordingly. |
| Estimated effort | 1–2 hours during human portal validation. |
| Priority | Critical — overclaiming approval controls is a customer-trust risk. |

### 4. Least privilege

**Customer question**: What permissions does the agent have?

**Evidence files**:

- `infra/bicep/modules/sre-agent.bicep` — role definitions for `Low` and `High`.
- `infra/bicep/main.bicep` — default SRE Agent deployment passes `accessLevel: 'High'`.
- `docs/CAPABILITY-CONTRACTS.md` §6 — RBAC and access profile matrix.
- `docs/evidence/wave3-live/SECURITY-STATUS.md`

**Safe answer**:

> “The repo defines a lower-privilege `Low` profile with Reader and Log Analytics Reader and a broader `High` profile that adds Contributor for demo convenience. The current default demo deployment uses `High`; production should start with `Low` and route write actions through an operator-controlled workflow.”

**Gap finding — W5-LP-01**

| Field | Detail |
|-------|--------|
| Control reference | SOC 2 CC6.1 logical access; SOC 2 CC6.3 authorization; ISO 27001 A.5.18 access rights; ASI-02 Tool Use Governance; ASI-03 Excessive Agency |
| Current state | Least-privilege target is documented, but default demo deployment uses `High` with Contributor. Additional demo-only roles may be assigned via script fallback. |
| Target state | Customer demo explicitly labels broad roles as demo-only and presents production target as diagnosis-only/read-only with separate operator remediation. |
| Remediation steps | Before demo, run read-only role assignment inventory; redact IDs; label Contributor/cluster-admin roles as demo-only; avoid saying “production-grade least privilege.” |
| Estimated effort | 1–2 hours. |
| Priority | High — broad privileges are acceptable only if transparently disclosed as demo-only. |

### 5. Audit evidence

**Customer question**: What evidence can we give auditors after an incident?

**Evidence files**:

- `docs/evidence/kql/stable/activity-log-rbac.kql`
- `docs/evidence/kql/stable/pod-lifecycle.kql`
- `docs/evidence/kql/stable/scenario-mongodb-down.kql`
- `docs/evidence/kql/stable/scenario-service-mismatch.kql`
- `docs/evidence/wave2-live/**`
- `docs/evidence/wave3-live/**`
- `docs/evidence/wave4-live/**`

**Safe answer**:

> “The evidence package can include the runbook used, scenario metadata, kubectl or KQL outputs, Activity Log records for Azure control-plane actions, and redacted portal screenshots/transcripts once captured. It should not include secrets, unredacted subscription/principal identifiers, or inferred SRE Agent fields.”

**Gap finding — W5-AE-01**

| Field | Detail |
|-------|--------|
| Control reference | SOC 2 CC7.2 monitoring; SOC 2 CC7.3 security event evaluation; ISO 27001 A.5.28 collection of evidence; ASI-06 Insufficient Logging |
| Current state | Evidence layout and stable KQL artifacts exist. Some live outputs and portal artifacts remain pending. |
| Target state | Per-scenario evidence bundle with source, timestamp, collector, redaction status, and limitation notes. |
| Remediation steps | Use the final checklist in `CHECKLISTS-AND-VERDICT.md`; collect only real outputs; tag gaps as pending or not tested. |
| Estimated effort | 0.5 day per customer demo dry run. |
| Priority | High. |

### 6. Safe-fail behavior

**Customer question**: What happens if the agent lacks permission or the portal cannot validate a scenario?

**Evidence files**:

- `docs/evidence/wave3-live/SAFE-FAIL-DEMO-CHECKLIST.md`
- `docs/evidence/wave3-live/SECURITY-STATUS.md`
- `docs/evidence/wave4-live/STATUS.md`

**Safe answer**:

> “If permissions are insufficient, the demo should fail closed: preserve the denial/error, do not broaden roles live without approval, restore through an authorized operator path, and mark the unproven capability as pending. Portal unavailability is a documented limitation, not a reason to invent evidence.”

**Gap finding — W5-SF-01**

| Field | Detail |
|-------|--------|
| Control reference | SOC 2 CC7.4 incident response; ISO 27001 A.5.24 incident response planning; ASI-08 Policy Bypass; ASI-10 Behavioral Monitoring |
| Current state | Safe-fail procedure is documented. Live RBAC-denial evidence may not be executed. |
| Target state | One redacted safe-fail artifact showing denied write/no-permission behavior, or an explicit “not tested in this environment” statement. |
| Remediation steps | Use a pre-approved read-only test identity if available; otherwise do not modify tenant RBAC and state the limitation. |
| Estimated effort | 1–3 hours if a test identity exists; otherwise no live execution. |
| Priority | Medium for customer demo; high for production readiness. |

## Auditor-safe summary

Use:

> “The package proves configuration, runbook governance, evidence collection design, and safe operating boundaries. It does not yet prove SRE Agent portal diagnosis or approval behavior. Those remain pending live human validation.”

Avoid:

> “The SRE Agent fully audits every action.”
> “The SRE Agent approved and executed remediation.”
> “The telemetry schema is stable.”
> “All customer compliance evidence is complete.”
