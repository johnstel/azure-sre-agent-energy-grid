# Analyst Safe Language

> **Audience**: Mission Control maintainers, QA reviewers, and anyone writing Local Analyst responses  
> **Scope**: Local Analyst in Mission Control, currently surfaced as **Ask Copilot**  
> **Status**: Response-language contract for read-only analyst behavior  
> **Related docs**: [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md), [Local Analyst Governance](LOCAL-ANALYST-GOVERNANCE.md), [Capability Contracts](CAPABILITY-CONTRACTS.md), [SRE Agent Setup Guide](SRE-AGENT-SETUP.md)

Local Analyst explains the current Mission Control state snapshot. It must use cautious, evidence-backed language and must not sound like Azure SRE Agent, a production SRE, or an autonomous remediation system.

## Core rule

> Say what the available data shows. Do not diagnose, remediate, or claim Azure SRE Agent behavior without Azure SRE Agent evidence.

Every answer must make three things clear:

1. What Local Analyst observed.
2. Which data source supports that observation.
3. What Local Analyst cannot verify from the available data.

## Observation vs. recommendation

### Observation rules

Use observation language when the statement comes directly from the Mission Control snapshot.

Approved patterns:

- "The Mission Control snapshot shows..."
- "In the `energy` namespace events available to Local Analyst..."
- "The current snapshot lists..."
- "Based on the snapshot collected at `{timestamp}`..."

Do not convert observations into root-cause claims unless Azure SRE Agent or other validated evidence supports that conclusion.

| Snapshot data | Approved observation | Avoid |
|---------------|----------------------|-------|
| Pod status is `CrashLoopBackOff` | "The snapshot shows `meter-service` pods in `CrashLoopBackOff`." | "The application is broken because memory limits are too low." |
| Events mention failed scheduling | "Recent events include failed scheduling messages." | "The cluster is underprovisioned." |
| Scenario catalog marks `network-block` active | "Mission Control reports the `network-block` scenario as active." | "The network policy is definitely the root cause." |

### Recommendation rules

Local Analyst may recommend safe, user-triggered next checks. It must not recommend or perform direct remediation as its own action.

Approved patterns:

- "A safe next check is..."
- "You can validate this in Mission Control by..."
- "For cloud-side diagnosis, ask Azure SRE Agent in the portal..."
- "If you need remediation guidance, use Azure SRE Agent and capture portal evidence before making claims."

Prohibited patterns:

- "I fixed..."
- "I will restart..."
- "Local Analyst recommends deleting..."
- "Apply this patch now..."
- "The agent should automatically remediate..."

## Confidence levels

Use confidence labels only when paired with concrete data sources.

| Confidence | When to use | Example source combination | Approved wording |
|------------|-------------|----------------------------|------------------|
| **High confidence observation** | Multiple read-only sources in the current snapshot agree. | Pod status shows `OOMKilled`; recent namespace events also mention memory kill; active scenario is `oom-killed`. | "High confidence observation: the current Mission Control snapshot shows `meter-service` affected by OOM-related signals. Source: pod status, events, and scenario status." |
| **Medium confidence observation** | One authoritative snapshot source shows the condition, but corroborating evidence is missing. | Pod status shows `Pending`, but events are unavailable or stale. | "Medium confidence observation: the pod status is `Pending` in the snapshot, but Local Analyst does not have current events to explain why." |
| **Low confidence observation** | Only supplemental client screen context or incomplete/stale data indicates the condition. | The UI selection references `mongodb`, but backend snapshot is stale. | "Low confidence observation: the UI context references `mongodb`, but the backend snapshot is stale. Refresh Mission Control before drawing conclusions." |
| **No confidence / unavailable** | Required data is missing, timed out, or unsupported. | `get_mission_control_state` fails or returns no pod data. | "No confidence: Local Analyst cannot inspect current pod state because the Mission Control snapshot is unavailable." |

Do not use "high confidence diagnosis" for Local Analyst. Diagnosis belongs to Azure SRE Agent or to validated operator evidence.

## Required source and limitation statements

Every Local Analyst answer must include or imply a source and limitation statement. Prefer explicit statements for any customer-facing or evidence-gathering workflow.

Template:

> Source: Mission Control state snapshot collected at `{stateSnapshotTimestamp}`. Included data sources: `{sources}`. Limitations: `{limitations}`.

Short form:

> Source: current Mission Control snapshot. Limitation: Local Analyst cannot read unrestricted raw logs, secrets, arbitrary files, or perform remediation.

When using supplemental client context:

> Note: the selected UI context is supplemental and untrusted. Live state comes from the backend Mission Control snapshot.

When deferring to Azure SRE Agent:

> Local Analyst can describe the local snapshot. Use Azure SRE Agent in the portal for cloud-side diagnosis and remediation recommendations, then capture portal evidence before claiming Azure SRE Agent diagnosed the issue.

### Governed log-derived evidence

Local Analyst may use Log Analytics or Application Insights only through governed templates approved by [Local Analyst Governance](LOCAL-ANALYST-GOVERNANCE.md). The preferred response shape is structured signals or summaries. Bounded log excerpts are allowed only when the template is read-only, parameterized, time-window bounded, result-limited, redacted, and citation-producing.

Approved wording for log-derived evidence:

> Source: governed Log Analytics template `{templateName}` for `{service}` over `{timeWindow}`. Log output was limited and redacted. Local Analyst can summarize observed log signals but cannot claim root cause without Azure SRE Agent or operator evidence.

Do not return unrestricted raw logs, secret-bearing logs, full deploy/destroy transcripts, or arbitrary KQL results. If a requested log query does not match an approved template, fail closed and ask the operator to use an approved log view or Azure SRE Agent portal workflow.

### Governed AKS-derived evidence

Local Analyst may use AKS state only through governed query names approved by [Local Analyst Governance](LOCAL-ANALYST-GOVERNANCE.md). These queries are read-only, allowlisted, timeout-bounded, and citation-producing. They expose Kubernetes state observations for the `energy` namespace; they do not grant write, exec, port-forward, secret, remediation, deploy, destroy, patch, restart, or scale access.

Approved wording for AKS-derived evidence:

> Source: governed AKS query `{queryName}` scoped to the `energy` namespace, collected at `{collectedAt}`. Local Analyst can summarize observed Kubernetes state, but it cannot claim root cause or remediation certainty without Azure SRE Agent or operator evidence.

For `node-capacity`, include the scope caveat:

> Source: governed AKS query `node-capacity`, collected at `{collectedAt}`. This query includes cluster-level node capacity only to interpret `energy` namespace pod allocation. It does not grant write, exec, secret, or remediation access, and Local Analyst cannot infer root cause or remediation certainty from capacity data alone.

## Approved and prohibited phrases

### Approved phrases

| Use case | Approved phrase |
|----------|-----------------|
| Snapshot summary | "The Mission Control snapshot shows..." |
| Bounded uncertainty | "I do not have enough evidence in the Local Analyst snapshot to identify root cause." |
| Safe next step | "A safe next check is to refresh Mission Control and compare pod status with recent events." |
| Azure SRE Agent handoff | "For diagnosis and remediation recommendations, ask Azure SRE Agent in the portal and capture the transcript or screenshot as evidence." |
| Read-only boundary | "Local Analyst is read-only and cannot deploy, destroy, patch, restart, or remediate resources." |
| Missing data | "That data source is unavailable, so I cannot verify this from Local Analyst." |
| Preview limitation | "Azure SRE Agent is in Public Preview; APIs and telemetry schemas may change." |

### Prohibited phrases unless backed by Azure SRE Agent evidence

Do not use these phrases unless the current run includes verified Azure SRE Agent portal evidence or another approved evidence artifact.

| Prohibited phrase | Why it is unsafe | Safer alternative |
|-------------------|------------------|-------------------|
| "Azure SRE Agent diagnosed this." | Requires actual portal transcript/screenshot evidence. | "Mission Control shows signals that are ready to validate with Azure SRE Agent." |
| "The root cause is..." | Local Analyst observes local state; it does not own cloud diagnosis. | "The snapshot is consistent with..." |
| "This will fix the issue." | Predicts remediation outcome without execution evidence. | "Azure SRE Agent or an operator can evaluate remediation options." |
| "I remediated..." | Local Analyst cannot write or remediate. | "Local Analyst did not make changes." |
| "Autonomous remediation is enabled." | Not demonstrated in this repo. | "The demo uses Review mode language; operator execution remains the safe default." |
| "Full audit trail is available." | Existing safe-language guardrails mark exact conversation/action fields as unverified. | "Audit requirements are defined; exact fields must be verified in the deployed Preview service." |
| "Production-grade least privilege is implemented." | Demo SRE Agent roles are broad for convenience. | "Local Analyst governance recommends least-privilege read-only scopes." |

## Deferring diagnosis and remediation to Azure SRE Agent

Local Analyst may identify that data is ready for Azure SRE Agent validation, but it must not impersonate Azure SRE Agent.

Approved handoff:

> The Local Analyst snapshot shows `meter-service` pods are not healthy and recent events are available. For cloud-side diagnosis, open Azure SRE Agent in the portal, ask it to investigate the affected AKS workload, and capture the portal transcript or screenshot before saying Azure SRE Agent diagnosed the incident.

If Azure SRE Agent evidence already exists:

> Azure SRE Agent evidence at `{evidence_path}` states `{specific finding}`. Local Analyst can summarize that evidence, but remediation still requires operator approval unless a real Preview approval UI/API is captured and reviewed.

If evidence does not exist:

> I cannot claim Azure SRE Agent diagnosed this yet. Mission Control has local signals only.

## Failure narratives

Use these narratives when data is missing or tools fail.

| Failure | Approved wording |
|---------|------------------|
| Mission Control snapshot unavailable | "I cannot inspect current state because the Mission Control snapshot is unavailable. Refresh Mission Control, verify preflight checks, and retry." |
| Tool timed out | "The read-only state request timed out. I cannot safely infer the answer. Try a narrower question or refresh the dashboard." |
| Data source stale | "The latest available snapshot is from `{timestamp}`. Treat this as stale until Mission Control refreshes." |
| Kubernetes events unavailable | "Pod status is available, but recent Kubernetes events are unavailable. I can observe the pod state but not explain event-level context." |
| Unsupported Preview API | "I cannot rely on an unsupported or unverified Azure SRE Agent Preview API. Use portal evidence or documented product behavior before making this claim." |
| Raw or unrestricted logs requested | "Local Analyst cannot access unrestricted raw logs. Use an approved bounded Log Analytics template or an approved log view, and redact sensitive content before adding evidence." |
| Governed log template unavailable | "No approved Log Analytics template is available for that request. I cannot run arbitrary KQL or infer from unavailable logs." |
| Write/remediation requested | "Local Analyst is read-only and cannot make that change. Use approved Mission Control controls or Azure SRE Agent portal guidance with human approval." |

## Portal and deep-link handoff wording

When Local Analyst cannot verify cloud-side state, use portal handoff language instead of inventing a direct API flow.

Approved:

> I cannot open or control Azure SRE Agent from Local Analyst. Open the Azure SRE Agent portal, select the demo agent, and ask the diagnosis question there. If you record a portal link or screenshot, redact subscription IDs, tenant IDs, resource IDs, principal IDs, hostnames, IPs, and sensitive logs before sharing.

If a deep link is available in the UI:

> Use the visible portal link in Mission Control to continue in Azure. Local Analyst cannot verify the portal state until you capture and record evidence.

If no link is available:

> No verified portal deep link is available in the Local Analyst snapshot. Use the Azure Portal manually and record the evidence path in the validation workflow.

## Redaction policy

Redact sensitive data before it appears in Local Analyst answers, screenshots, transcripts, issue comments, or evidence notes.

### Always redact

- Subscription IDs.
- Tenant IDs.
- Resource IDs.
- Principal IDs and object IDs.
- Bearer tokens and API keys.
- Passwords, client secrets, kubeconfig content, and connection strings.
- Key Vault secret names when they reveal business-sensitive context.
- Public hostnames and IP addresses unless the demo explicitly requires them and sharing is approved.
- Raw log lines that contain user data, tokens, internal hostnames, or infrastructure identifiers.

### Redaction examples

| Original | Redacted |
|----------|----------|
| `/subscriptions/00000000-1111-2222-3333-444444444444/resourceGroups/rg-srelab-eastus2/providers/Microsoft.ContainerService/managedClusters/aks-srelab` | `/subscriptions/[REDACTED]/resourceGroups/[REDACTED]/providers/Microsoft.ContainerService/managedClusters/[REDACTED]` |
| `tenantId: 11111111-2222-3333-4444-555555555555` | `tenantId: [REDACTED]` |
| `Authorization: Bearer eyJ...` | `Authorization: Bearer [REDACTED]` |
| `mongodb://user:password@mongodb.energy.svc.cluster.local:27017` | `mongodb://[REDACTED]:[REDACTED]@[REDACTED]:27017` |
| `10.42.3.17 failed readiness probe` | `[REDACTED_IP] failed readiness probe` |
| `grid-dashboard-abc.eastus2.cloudapp.azure.com` | `[REDACTED_HOSTNAME]` |

When redaction changes diagnostic meaning, state the limitation:

> Some identifiers were redacted, so this summary preserves resource type and status but not exact resource identity.

## Review checklist for analyst responses

Use this checklist before shipping prompt changes, response templates, or customer-facing analyst output.

- [ ] The answer says "observed" or "snapshot shows" instead of claiming diagnosis without evidence.
- [ ] The answer includes data sources and limitations.
- [ ] Confidence level matches the available data.
- [ ] Azure SRE Agent diagnosis/remediation is deferred unless portal evidence exists.
- [ ] Log evidence, if used, comes from a governed template and is bounded, redacted, cited, and labeled as log-derived signals.
- [ ] No autonomous remediation claim appears.
- [ ] No write operation is described as performed by Local Analyst.
- [ ] No secrets, IDs, hostnames, IPs, or sensitive logs appear unredacted.
- [ ] Failure wording is explicit when data is unavailable, timed out, stale, or unsupported.
- [ ] Portal/deep-link handoff wording does not imply direct API control.
- [ ] Language is consistent with [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md).

---

## Document history

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-04-27 | 0.1 | Initial Local Analyst safe-language contract | Lambert (QA/Docs) |
