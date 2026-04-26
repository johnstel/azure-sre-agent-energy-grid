# Wave 3 Security Status — Azure SRE Agent Governance

**Date**: 2026-04-26
**Scope**: Azure SRE Agent Service only. Mission Control is intentionally excluded.
**Status**: Gate-ready documentation, pending human portal validation.

> **Safe-language rule**: The demo uses “agent recommends, operator executes” unless a specific Azure SRE Agent Preview portal/API approval flow has been captured with real evidence.

---

## 1. Read-Only vs. Read/Write Action Model

| Profile | SRE Agent `mode` | SRE Agent `accessLevel` | Repo evidence | Customer-safe statement |
|---------|------------------|-------------------------|---------------|-------------------------|
| `review-readonly` | `Review` | `Low` | `infra/bicep/modules/sre-agent.bicep` roleDefinitions `Low` = Log Analytics Reader + Reader | The agent can investigate using read access and log queries. It should not have write permissions by default. |
| `review-remediate` | `Review` | `High` | `High` adds Contributor; `main.bicep` passes `accessLevel: 'High'` for the default demo | Demo convenience profile. The agent can recommend remediations, but the operator remains responsible for execution. |
| `auto-remediate` | `Auto` | `High` | Documented contract only; not deployed in this repo | Out of scope. Do not demonstrate or claim autonomous remediation. |

**Current deployment posture**: The repo’s default `main.bicep` deploys `review-remediate` by passing `accessLevel: 'High'`, while `sre-agent.bicep` hard-codes `mode: 'Review'`.

**Risk**: `High` grants Contributor at the resource-group scope. That is acceptable for a time-boxed demo only, not as a production default.

**Production default recommendation**: Start with `review-readonly` (`accessLevel: 'Low'`) and route any write actions through an operator-controlled process such as change management, ITSM, GitOps PR, or a manually executed runbook.

---

## 2. Guardrails and Approvals

| Guardrail | Current repo state | Evidence | Limitations |
|-----------|--------------------|----------|-------------|
| Review mode | Configured in Bicep | `sre-agent.bicep` `actionConfiguration.mode: 'Review'` | This proves configuration intent, not the exact portal UX. |
| Human-in-the-loop | Documented as required for writes | `docs/CAPABILITY-CONTRACTS.md` §9 and this Wave 3 package | Portal approval/denial screenshots remain pending. |
| Auto mode disabled | Not used in deployment | `sre-agent.bicep` hard-codes `Review` | Auto mode exists as a contract item only. |
| Safe language | Guardrail table exists | `docs/SAFE-LANGUAGE-GUARDRAILS.md` | Updated Wave 3 wording avoids implying a verified approval API. |
| Operator-run remediation | Runbook path uses kubectl restore | `docs/DEMO-RUNBOOK.md` Step 4d/5 | Operator commands are reversible when using baseline restore. |

**Customer-safe wording**:

> “In this demo, Azure SRE Agent is configured in Review mode. The agent can recommend remediation steps; the operator executes the change and verifies recovery. We do not claim autonomous remediation in this demo.”

---

## 3. Least-Privilege RBAC Profiles

### `review-readonly` — recommended production starting point

Purpose: diagnosis-only, no write actions.

Minimum Azure RBAC:

- Resource-group scoped `Reader`
- Log Analytics workspace scoped `Log Analytics Reader`
- Monitoring resource scoped `Monitoring Reader` where needed

Avoid as production defaults:

- AKS Cluster Admin
- AKS RBAC Cluster Admin
- Key Vault Secrets Officer
- ACR admin credentials or `AcrPush`
- Subscription-wide Reader unless the operational scope truly spans the subscription

Kubernetes posture:

- Prefer namespace-scoped read-only Kubernetes RBAC for the `energy` namespace.
- Avoid cluster-admin. If SRE Agent Preview cannot use namespace-scoped Kubernetes RBAC in the current environment, document that as a Preview/demo limitation instead of granting it silently.

### `review-remediate` — demo convenience profile

Purpose: show recommendations and allow operator-led remediation in a controlled demo.

Demo-only permissions observed in repo/scripts:

- Resource-group `Contributor`
- AKS Cluster Admin / AKS RBAC Cluster Admin via `scripts/configure-rbac.ps1`
- Key Vault Secrets Officer via `scripts/configure-rbac.ps1`
- `AcrPush` via `scripts/configure-rbac.ps1`
- Subscription-wide Reader via `scripts/configure-rbac.ps1`

Required safe-language qualifier:

> “These roles are demo-only shortcuts. Production deployments should reduce the agent identity to read-only diagnosis and use separate human/operator identities or change workflows for remediation.”

---

## 4. Human-in-the-Loop Controls

The repo supports human-in-the-loop controls through process and configuration:

1. **Review-mode configuration**: SRE Agent is configured to recommend, not autonomously remediate.
2. **Operator-owned commands**: Demo remediation uses explicit commands such as `kubectl apply -f k8s/base/application.yaml`.
3. **Evidence gates**: Wave 2 and Wave 3 require real portal evidence before customer-facing diagnosis claims.
4. **Runbooks as governance artifacts**: Runbooks may document the approved path, but Wave 3 does not modify Wave 4 runbook content.
5. **No fabricated approvals**: If the portal does not expose a specific denial/approval artifact in this environment, the demo says so.

---

## 5. Audit Evidence Sources

| Source | What it can show | Repo evidence | Caveat |
|--------|------------------|---------------|--------|
| Azure Activity Log / AzureActivity | ARM role assignments, resource writes, diagnostic setting changes | `infra/bicep/modules/activity-log-diagnostics.bicep` exports Administrative/Security/etc. | Queryability must be validated per live deployment. |
| Log Analytics / Container Insights | Kubernetes pod state, events, inventory | Wave 1/2 evidence conventions and KQL docs | Ingestion delay can be 2–5 minutes. |
| App Insights for SRE Agent | Potential SRE Agent operational telemetry | `sre-agent.bicep` `logConfiguration.applicationInsightsConfiguration` | SRE Agent field names are `SCHEMA_TBD` in Preview. |
| Azure RBAC role assignment list | Actual principal permissions at demo time | Operator checklist in `SAFE-FAIL-DEMO-CHECKLIST.md` | Requires live `az role assignment list`; do not infer from templates alone. |
| SRE Agent portal screenshots/transcripts | Human-visible diagnosis/recommendation behavior | Pending human portal validation | Must be captured live; never fabricate. |

---

## 6. Data Handling and Retention

| Data category | Handling in this demo | Retention/evidence note |
|---------------|-----------------------|--------------------------|
| Kubernetes state/events | Collected through Container Insights and kubectl evidence | Log Analytics retention is configured in Bicep; verify deployed value live. |
| Azure control-plane events | Exported via subscription Activity Log diagnostic setting | Platform Activity Log retention and export must be validated in UAT. |
| SRE Agent telemetry | Sent to App Insights per Bicep | Conversation/action schema and retention are Preview/opaque until verified. |
| Secrets | Demo app includes known demo-only shortcuts | Do not use demo credentials as production patterns. Do not include secrets in evidence. |
| Screenshots/transcripts | Human-curated evidence | Redact subscription IDs, principal IDs, IPs, node names, and any sensitive values before commit. |

---

## 7. Safe-Fail Behavior

Safe-fail goal: if the agent or operator lacks permission, the demo should fail closed, preserve evidence, and restore health through an authorized operator path.

Expected safe-fail responses:

- If SRE Agent cannot access a resource: document the denial/error, do not grant broad roles live unless explicitly framed as demo-only.
- If SRE Agent recommends a write action: operator decides whether to execute it; no autonomous execution claim.
- If a remediation command fails due to RBAC: capture the denied command/error, stop the mutation path, and have an authorized operator restore with `kubectl apply -f k8s/base/application.yaml`.
- If portal validation is unavailable: state that the Preview portal could not be validated and pivot to repo evidence and manual kubectl diagnosis.

---

## 8. Open Blockers Before Customer Demo

| Blocker | Severity | Owner/action |
|---------|----------|--------------|
| SRE Agent portal validation for MongoDBDown and ServiceMismatch still pending | Critical | Human operator captures real portal screenshots/transcripts and diagnosis accuracy. |
| Approval/denial UX not proven in this repo/environment | High | Do not claim a product approval API. Use “agent recommends, operator executes.” |
| Live RBAC-denial path not executed by Wave 3 | Medium | Use `SAFE-FAIL-DEMO-CHECKLIST.md`; mark as operator-executable until tested. |
| Exact SRE Agent App Insights fields unknown | Medium | Keep `SCHEMA_TBD` tags and do not build compliance claims on unknown fields. |

---

## 9. Verdict Recommendation

**Recommendation**: 🟡 `PASS_WITH_PENDING_HUMAN_PORTAL`

Wave 3 security/governance materials are complete enough for a gate review. The final customer-demo blocker remains real human SRE Agent portal evidence; do not upgrade to `PASS` until that evidence exists.
