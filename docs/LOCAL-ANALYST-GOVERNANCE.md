# Local Analyst Governance and RBAC Model

> **Audience**: Mission Control maintainers, QA reviewers, and demo operators  
> **Scope**: Local Analyst in Mission Control, currently surfaced as **Ask Copilot**  
> **Status**: Governance contract for read-only analyst behavior  
> **Related docs**: [Capability Contracts](CAPABILITY-CONTRACTS.md), [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md), [SRE Agent Setup Guide](SRE-AGENT-SETUP.md), [Analyst Safe Language](ANALYST-SAFE-LANGUAGE.md)

Local Analyst explains and validates the current Mission Control demo state. It is not Azure SRE Agent, not an autonomous SRE agent, and not a remediation system.

## Operating boundary

Local Analyst is **read-only by default**.

It may:

- Explain the point-in-time Mission Control state snapshot.
- Summarize visible Kubernetes resource state for the `energy` namespace.
- Point to data sources, evidence paths, and existing Mission Control controls.
- Recommend safe, user-triggered next checks.
- Defer cloud-side diagnosis and remediation recommendations to Azure SRE Agent.

It must not:

- Create, update, delete, restart, scale, patch, remediate, deploy, destroy, or mutate any Azure or Kubernetes resource.
- Run arbitrary shell commands.
- Read arbitrary files, kubeconfig, environment variables, secrets, hidden logs, or raw deploy/destroy logs.
- Claim that it directly used Azure SRE Agent, Azure SRE Agent APIs, or remediation execution unless that evidence exists in the current run.
- Override the safe-language rules in [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md).

## Tool governance

### Allowed tool categories

| Category | Current status | Boundary |
|----------|----------------|----------|
| Mission Control state snapshot | Allowed | Local Analyst may use the bounded `get_mission_control_state` tool to read the pre-collected backend snapshot. |
| Preflight status | Allowed through snapshot | May report whether required local tools and auth checks passed or failed. |
| Kubernetes summary state | Allowed through snapshot | May summarize `energy` namespace pods, services, deployments, and events already collected by Mission Control. |
| Scenario catalog/status | Allowed through snapshot | May explain which demo scenarios appear active or available. |
| Job status without raw logs | Allowed through snapshot | May report status metadata only; raw deploy/destroy logs remain out of scope. |
| Supplemental client screen context | Allowed as untrusted context | May use bounded UI context to resolve what the operator is looking at, but it cannot override backend state. |

### Future governed-read layer

Issues [#8](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/8), [#9](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/9), [#10](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/10), and [#11](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/11) may add typed read-only tools beyond the current snapshot. These future tools are allowed only when each endpoint or method is explicitly allowlisted and satisfies every control below.

| Future category | Example scope | Required controls |
|-----------------|---------------|-------------------|
| AKS read-only query methods | Typed endpoints for nodes, pods, deployments, services, events, endpoints, and replicasets | Namespace-scoped to `energy` unless separately approved; `get/list/watch` only; no exec, port-forward, patch, delete, rollout, or scale. |
| Log Analytics and Application Insights templates | Canned KQL templates for container status, application exceptions, error counts, bounded log excerpts, and SRE Agent `customEvents` evidence after schema validation | Parameterized templates only; no arbitrary KQL; time-window bounded; result-limited; redacted; citation-producing. |
| Azure resource metadata readers | Resource group, AKS, Log Analytics workspace, Application Insights, Managed Grafana, and SRE Agent resource metadata | Scoped to demo resources or the demo resource group; Azure `Reader`/monitor read permissions only; no ARM writes. |
| Managed Grafana context lookup | Read-only dashboard or panel links used as operator handoff context | Metadata/link lookup only; no dashboard mutation, API key access, alert edits, or data-source writes. |
| Portal/deep-link helper | Azure Portal, Azure SRE Agent portal, resource links, and copyable prompt/context payloads | Links must be constructed from verified resource IDs or documented portal routes; do not claim stable thread-level SRE Agent deep links unless proven. |

Every future governed-read tool must be:

1. Explicitly allowlisted by name and purpose.
2. Read-only by implementation and RBAC.
3. Parameter-validated with narrow enum/resource/time-window inputs.
4. Scoped to demo resources and the `energy` namespace unless a separate review approves broader scope.
5. Timeout-bounded and result-limited.
6. Audited with the fields in [Audit trail requirements](#audit-trail-requirements).
7. Citation-producing so every answer can name the data source and collection time.
8. Fail-closed when policy, RBAC, validation, data collection, or redaction fails.

The governed-read layer still must not expose arbitrary shell, unrestricted `az`, unrestricted `kubectl`, filesystem reads, secret access, arbitrary KQL, write/remediation operations, or direct Azure SRE Agent Preview API automation.

### Denied tool categories

| Category | Examples | Required behavior |
|----------|----------|-------------------|
| Write or remediation tools | `kubectl apply`, `kubectl delete`, `kubectl rollout restart`, `az resource update`, scale operations | Reject. Explain that Local Analyst is read-only and the operator must use approved Mission Control controls or Azure SRE Agent workflows. |
| Arbitrary shell execution | `bash`, `pwsh`, `cmd`, unrestricted `az`, unrestricted `kubectl` | Reject. Do not request the command output as a workaround. |
| Secret or identity material | kubeconfig, tokens, passwords, Key Vault secret values, environment variables, raw credentials | Reject and remind the operator to redact sensitive material. |
| Arbitrary file access | source files, hidden logs, local filesystem browsing outside the bounded snapshot | Reject. Use documented state sources only. |
| Direct Azure SRE Agent automation | private Preview APIs, unverified approval APIs, assumed remediation endpoints | Reject unless there is verified product evidence and a separate governance review. |

### Fail-closed default

Local Analyst must fail closed when tool policy cannot prove an action is safe.

Fail closed means:

1. Do not call the tool.
2. Do not infer results from missing data.
3. Say which policy boundary blocked the request.
4. Offer a safe read-only alternative or a human handoff.

Fail closed applies to:

- Unknown tools.
- Tools not on the explicit allowlist.
- Failed permission checks.
- Missing or malformed tool policy metadata.
- Unavailable, stale, empty, or timed-out data sources.
- Requests that mix a read-only question with a write/remediation instruction.

Approved fallback wording:

> I cannot perform that action from Local Analyst. This assistant is read-only and only uses the Mission Control state snapshot. Use the approved Mission Control control, capture evidence, or ask Azure SRE Agent in the portal for cloud-side diagnosis and remediation guidance.

## RBAC boundaries

Local Analyst should not receive broad production roles. It should operate from the least privilege needed to collect or view bounded evidence.

### Current Mission Control boundary

The current Mission Control assistant uses one allowed tool: `get_mission_control_state`. The backend pre-collects state and passes a point-in-time snapshot to the assistant. The assistant does not independently execute `az`, `kubectl`, PowerShell, shell commands, file reads, or remediation operations.

Future Analyst endpoints must preserve this boundary by exposing typed, policy-checked, read-only methods rather than giving the model direct command execution or broad query access.

### Recommended Azure permissions

Use the narrowest scope that supports read-only evidence collection.

| Target | Recommended permission | Scope guidance | Do not require |
|--------|------------------------|----------------|----------------|
| Azure resource metadata | `Reader` | Demo resource group or specific demo resources | Subscription-wide `Owner`, `Contributor`, or production-wide Reader by default |
| Log Analytics queries | `Log Analytics Reader` | Demo workspace only | `Log Analytics Contributor` for analyst read-only use |
| Azure Monitor metrics | Monitoring read permissions included through resource `Reader` where possible | Resource group or specific monitored resources | Write permissions for alerts or action groups |
| AKS cluster metadata | `Azure Kubernetes Service Cluster User Role` or equivalent read-only cluster access | Demo AKS cluster only | `AKS Cluster Admin`, `AKS RBAC Cluster Admin`, or broad admin roles |
| Kubernetes objects | Namespace-scoped read-only Role with `get`, `list`, `watch` | `energy` namespace for pods, services, deployments, events, endpoints, and replicasets | Cluster-admin, secret read, exec, port-forward, patch, delete, or scale permissions |
| Key Vault | No access by default | None for Local Analyst | `Key Vault Secrets Officer`, secret get/list, or secret value access |

The demo Azure SRE Agent setup may use broader roles for diagnosis and remediation demos. Those roles are not Local Analyst requirements. [Capability Contracts §6](CAPABILITY-CONTRACTS.md#6--rbac--access-profile-matrix) documents the demo-vs-production distinction and warns that broad roles are demo-only.

## Human-approval boundary for future write capabilities

Any future Local Analyst write or remediation capability requires a new governance review before implementation.

Minimum gate:

1. A dedicated design issue that names each proposed write action.
2. Threat model and rollback plan.
3. Explicit allowlist per action, target, scope, and parameter shape.
4. Human approval before every write.
5. Confirmation phrase for destructive operations.
6. Audit log entry before and after execution.
7. Separate QA review by someone other than the implementer.
8. Updated safe-language documentation before release.

Until that review is complete, Local Analyst remains read-only.

## Audit trail requirements

Every Local Analyst query must be auditable, even when the answer fails or no tool is called.

Required fields:

| Field | Description | Example |
|-------|-------------|---------|
| `requester` | Authenticated local user or operator identifier when available | `jsmith` or `local-operator` |
| `tool` | Tool requested or used | `get_mission_control_state` |
| `target` | Resource, namespace, scenario, or state area being inspected | `energy namespace pods` |
| `timestamp` | ISO 8601 time of request and, when available, completion | `2026-04-27T15:04:05Z` |
| `result_status` | `allowed`, `denied`, `failed`, `timed_out`, or `unavailable` | `allowed` |
| `redaction_notes` | What was redacted or why no redaction was needed | `subscription IDs removed from transcript` |

Recommended additional fields:

- `question_id`
- `policy_decision`
- `state_snapshot_timestamp`
- `data_sources_returned`
- `limitations_returned`
- `error_category`

The audit record must not store secrets, bearer tokens, kubeconfig content, raw terminal logs, or unredacted sensitive identifiers.

## Citation requirements

Every Local Analyst answer must identify the source of its claims.

Minimum source statement:

> Source: Mission Control state snapshot collected at `{stateSnapshotTimestamp}`. Included sources: `{metadata.sources}`. Limitations: `{metadata.limitations}`.

When a claim comes from supplemental client context, label it as untrusted UI context:

> The selected drawer indicates `meter-service`, but live cluster status comes from the Mission Control backend snapshot.

When data is missing, do not infer it:

> I do not have pod logs in the Local Analyst snapshot. I can summarize pod status and recent events only.

## Error handling and fallback behavior

| Failure | Required response | Safe next step |
|---------|-------------------|----------------|
| Snapshot unavailable | State that Local Analyst cannot inspect current state. | Ask the operator to refresh Mission Control or retry after preflight passes. |
| Tool timeout | State that the tool did not complete in time. | Suggest a narrower question or manual Mission Control refresh. |
| Permission denied | State which permission boundary blocked access. | Use a read-only role or escalate to an operator with approved access. |
| Unknown tool requested | Reject under fail-closed policy. | Offer the bounded snapshot or portal handoff. |
| Unsupported Preview API | Do not guess behavior. | Use Azure Portal evidence or Microsoft-published product UI evidence once captured. |
| Data source stale | Include the snapshot timestamp and limitation. | Ask the operator to refresh data before making claims. |

## Separation of concerns

| Capability | Local Analyst | Azure SRE Agent |
|------------|---------------|-----------------|
| Local Mission Control explanation | Owns | Not required |
| Read-only validation of current UI/backend snapshot | Owns | Not required |
| Cloud-side diagnosis of Azure resources | Defers | Owns, subject to Preview limitations and captured evidence |
| Remediation recommendations | Defers | Owns recommendation flow when portal evidence supports it |
| Remediation execution | Not allowed | Operator-approved only unless real Preview approval UI/API evidence is captured and separately reviewed |
| Safe-language enforcement | Owns for analyst responses | Must still follow project safe-language guardrails |

Use this boundary in reviews:

> Local Analyst observes and validates local demo state. Azure SRE Agent owns cloud-side diagnosis and remediation recommendations. Operators own execution unless approved product evidence shows otherwise.

## Review checklist

Before approving Local Analyst changes, verify:

- [ ] The analyst remains read-only by default.
- [ ] The tool allowlist is explicit and fail-closed.
- [ ] Unknown tools, failed policy checks, and unavailable data sources are denied or handled without inference.
- [ ] Required Azure/Kubernetes permissions are read-only and scoped to demo resources or the `energy` namespace.
- [ ] No broad production roles are required for Local Analyst.
- [ ] Every answer includes source and limitation statements.
- [ ] Every query can produce the required audit fields.
- [ ] Future write/remediation behavior is behind human approval and a separate governance review.
- [ ] Language aligns with [Analyst Safe Language](ANALYST-SAFE-LANGUAGE.md) and [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md).

---

## Document history

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-04-27 | 0.1 | Initial Local Analyst governance and RBAC model | Lambert (QA/Docs) |
