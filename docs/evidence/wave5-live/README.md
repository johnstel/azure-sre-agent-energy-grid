# Wave 5 Live Evidence Package — Compliance, Audit, and Measurement Readiness

**Date**: 2026-04-26
**Owner**: Compliance/Audit
**Customer scope**: Azure SRE Agent Service capabilities only
**Out of scope**: Mission Control UI, Mission Control source code, and any unvalidated SRE Agent Preview portal behavior
**Inherited gated status**: Wave 2 passed with pending human portal validation; Waves 3 and 4 have safe-language-compliant documentation.
**Verdict recommendation**: `PASS_WITH_PENDING_HUMAN_PORTAL`

> **Preview disclosure**: Azure SRE Agent is in Public Preview. Treat SRE Agent telemetry fields, conversation retention, action history fields, and portal approval UX as unverified unless captured in live evidence. In this package, SRE Agent operational telemetry remains `SCHEMA_TBD`.

## Compliance/audit artifacts

| Artifact | Purpose |
|----------|---------|
| [`AUDIT-EVIDENCE-PACKAGE.md`](AUDIT-EVIDENCE-PACKAGE.md) | Maps customer compliance questions to concrete repo evidence, evidence gaps, and auditor-safe responses. |
| [`RISK-REGISTER.md`](RISK-REGISTER.md) | Customer-demo risk register with severity, mitigation, and exact phrasing constraints. |
| [`CHECKLISTS-AND-VERDICT.md`](CHECKLISTS-AND-VERDICT.md) | Evidence redaction checklist, final customer-demo checklist, and verdict rationale. |

## Measurement/reliability artifacts

| Artifact | Purpose |
|----------|---------|
| [`STATUS.md`](STATUS.md) | Gate-ready Wave 5 status and remaining blockers. |
| [`MTTR-MODEL-AND-EVIDENCE.md`](MTTR-MODEL-AND-EVIDENCE.md) | MTTR model and supported measured evidence boundaries. |
| [`TOIL-COMPARISON.md`](TOIL-COMPARISON.md) | Manual toil vs intended SRE Agent-assisted workflow, with portal validation caveats. |
| [`SLO-ERROR-BUDGET-MAPPING.md`](SLO-ERROR-BUDGET-MAPPING.md) | Scenario-to-SLO/error-budget mapping without claiming production burn. |
| [`CHANGE-CORRELATION-SUMMARY.md`](CHANGE-CORRELATION-SUMMARY.md) | Wave 4 change-correlation metadata summary and limitations. |

## Evidence boundary

This Wave 5 package does **not** fabricate:

- SRE Agent portal screenshots or transcripts.
- Approval/denial UI behavior.
- SRE Agent conversation/action telemetry fields.
- KQL results not already captured from a live environment.
- Alert firing history not proven by alert-management evidence.
- Autonomous remediation or Auto-mode behavior.

Use this phrasing for the demo boundary:

> “For this customer demo, Azure SRE Agent is configured for Review-mode recommendation workflows. The agent may recommend next steps; the operator validates and executes any changes. Portal validation and Preview telemetry field names remain pending unless shown with live, redacted evidence.”

## Verdict recommendation

`PASS_WITH_PENDING_HUMAN_PORTAL`

Wave 5 compliance and measurement packaging is ready for gate review because the evidence map, risk register, redaction controls, measurement boundaries, and final checklist are defined. Do not upgrade to `PASS` until real SRE Agent portal evidence is captured and reviewed.
