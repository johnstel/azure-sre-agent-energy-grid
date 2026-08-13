# Wave 3 Live Evidence Package — Security, Guardrails, Least Privilege

**Date**: 2026-04-26
**Owner**: Security Engineer
**Scope**: Azure SRE Agent Service capabilities only — **Mission Control is out of scope**
**Current verdict recommendation**: 🟡 `PASS_WITH_PENDING_HUMAN_PORTAL`

> **GA/lab API disclosure**: Azure SRE Agent is generally available, and this lab pins `Microsoft.App/agents@2026-01-01` with `upgradeChannel: 'Stable'`. If a subscription exposes only older preview provider metadata, deployment skips the SRE Agent instead of falling back to the legacy preview API. This evidence package documents only what this repo can prove. Where the deployed service or portal has not been human-validated, the status remains pending and must not be presented as proven.

---

## Executive Summary

Wave 3 answers the customer's security/risk/auditability questions for the Azure SRE Agent demo without claiming unverified approval APIs or autonomous remediation.

**What is proven from repo/config review:**

- The Bicep SRE Agent module is hard-coded to `mode: 'Review'`.
- The SRE Agent supports two repo-defined access levels: `Low` and `High`.
- `Low` maps to Reader + Log Analytics Reader at resource-group scope.
- `High` adds Contributor at resource-group scope and is used by `main.bicep` for the default demo deployment.
- Activity Log diagnostic export is defined in Bicep for subscription-level AzureActivity ingestion.
- App Insights logging is configured for the SRE Agent resource, but SRE Agent-specific telemetry fields remain `SCHEMA_TBD`.

**What is not yet proven and must remain qualified:**

- Human portal validation for Wave 2 scenarios remains pending.
- This repo does not prove a specific Azure SRE Agent approval/denial API surface.
- This repo does not prove Auto mode execution or autonomous remediation.
- This repo does not prove complete SRE Agent conversation retention fields.

---

## Evidence Files

| File | Purpose |
|------|---------|
| `SECURITY-STATUS.md` | Customer-facing security/risk/auditability answers with evidence references |
| `SAFE-FAIL-DEMO-CHECKLIST.md` | Operator-executable safe-fail demo, including RBAC-denial path and limitations |

---

## Gate Context from Wave 2

Wave 2 status is inherited as:

- **MongoDBDown**: partial pass — root cause proven by kubectl evidence; alert firing did not occur in the rapid execution window.
- **ServiceMismatch**: full pass — selector mismatch/root cause proven; no alert fired as expected for the silent failure.
- **SRE Agent portal validation**: pending final human action and must not be fabricated.

Wave 3 therefore focuses on governance and safe-fail materials, not new diagnosis claims.

---

## Verdict Recommendation

**Recommendation**: 🟡 `PASS_WITH_PENDING_HUMAN_PORTAL`

Rationale:

- Wave 3 governance documentation is complete and safe-language compliant.
- Least-privilege profiles and demo-only RBAC exceptions are documented.
- Safe-fail checklist is operator-executable without fabricating portal behavior.
- Final customer-demo blocker remains the same: real SRE Agent portal validation must be captured by a human operator.
