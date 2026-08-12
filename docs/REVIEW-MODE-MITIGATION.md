# Review-Mode Mitigation — Action Design, Guardrails, and Evidence Contract

> Issue #80 · Status: **implemented, live approve/deny proof PENDING** (no Energy Grid environment
> is currently deployed in this subscription — see §10).

This document is the action-design gate required by issue #80. It records the feasibility analysis,
the exact chosen action, the enforcement boundary, and the evidence contract that Mission Control
uses to *derive* — never assert — the mitigation lifecycle.

Everything below cites current first-party Microsoft Learn guidance. Where Microsoft does not
document a field, this document says so explicitly and the code refuses to guess.

---

## 1 · Feasibility gate: does a Kubernetes fix trigger the Review-mode approval gate?

This was the blocking question. **It is resolved: no, not by itself.**

Microsoft Learn, [Run modes in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/run-modes):

> Review mode shows **Approve** and **Deny** buttons **only for Azure infrastructure operations**.
> Other actions […] proceed based on the agent's reasoning and your response plan instructions.
> To add governance controls for these actions, use Hooks or Tool Access Policies to enforce safety
> checks before or after specific tool calls.

And [Execute mitigations](https://learn.microsoft.com/azure/sre-agent/execute-mitigations) scopes the
native gate to the Azure CLI tool: *"Write commands: Modify any Azure resource […] **Requires
approval in Review mode**."*

`kubectl scale` is dispatched through the `RunKubectlWriteCommand` tool
([Tool access policies](https://learn.microsoft.com/azure/sre-agent/tool-access-policies)), which is
**not** an Azure Resource Manager write. Relying on run mode alone to gate it would be exactly the
kind of unproven assumption that got the previous attempt rejected.

Microsoft documents the supported control for this case in the same page:

> **Ask** (global only): If matched, the agent pauses for approval in Review mode, or auto-approves
> in Autonomous mode.

So the supported approval contract for a Kubernetes remediation is **Tool Access Policy `ask` +
response plan run mode `Review`**. Both are required. Because an `ask` rule *auto-approves* under
Autonomous, an observed effective mode of `Review` is a hard precondition — which is why
`assertReviewModeOrBlock()` (§7) blocks the demo loudly on `autonomous`/unknown.

### 1.1 Why MongoDBDown cannot use the native Azure-infrastructure gate

| Candidate Azure-infrastructure action | Verdict |
| --- | --- |
| Any ARM operation that scales a Kubernetes `Deployment` | **Does not exist.** ARM has no data-plane verb for in-cluster workloads. |
| `az aks command invoke` (`Microsoft.ContainerService/managedClusters/runCommand/action`) | ARM write, *would* trigger the native gate — but it is arbitrary in-cluster shell execution. Issue #80 non-goals forbid "arbitrary shell execution", and it would defeat every allowlist below. **Rejected.** |
| `az aks nodepool scale` | Does not restore MongoDB. Also invalid here: both node pools set `enableAutoScaling: true` (`infra/bicep/modules/aks.bicep`), and AKS rejects `nodepool scale` on autoscaler-enabled pools. **Rejected.** |
| `az aks start` / `stop` | Whole-cluster blast radius. **Rejected.** |

### 1.2 Why no other repository scenario changes this answer

All ten scenarios in `k8s/scenarios/` are Kubernetes data-plane faults (deployment spec, ConfigMap,
Service selector, NetworkPolicy, replica count). None is repairable by a pure ARM write. Notably
`pending-pods` requests 32Gi/8 CPU per pod, which no node *count* change fixes — it needs a larger
VM SKU — and the autoscaler constraint above applies.

**Conclusion:** MongoDBDown is retained (it is the preferred scenario in issue #80, is reversible,
has the smallest blast radius, and has the richest verification story), and it is governed by the
Tool Access Policy `ask` path rather than the native Azure-infrastructure button. This is a
documented, first-party supported approval mechanism — not a workaround.

---

## 2 · The chosen action

| Property | Value |
| --- | --- |
| **Scenario** | `MongoDBDown` (`k8s/scenarios/mongodb-down.yaml`) — `mongodb` Deployment scaled to 0 |
| **Exact action** | `kubectl scale deployment/mongodb --namespace energy --replicas=1` |
| **Runtime tool** | `RunKubectlWriteCommand` |
| **Resource** | exactly one object: `apps/v1 Deployment energy/mongodb` |
| **Approval gate** | Tool Access Policy `ask` rule + response plan run mode `Review` |
| **Timeout** | 120 s for the action; 300 s total for the verify phase |
| **Rollback** | `kubectl scale deployment/mongodb --namespace energy --replicas=0` (inside the same allowlist, so rollback is itself governed and auditable) |

### Preconditions (all must hold before the action is proposed)

1. Response plan effective run mode is observed as `Review`.
2. `mongodb` Deployment exists in namespace `energy` with `spec.replicas == 0`.
3. The `mongodb-data-pvc` PersistentVolumeClaim is `Bound` (the action must not provoke re-provisioning).
4. The Tool Access Policy in `infra/sre-agent/tool-access-policy.json` is applied at global scope.
5. The agent identity does **not** hold Contributor on the resource group (§4).

### Blast radius

Replica count of a single Deployment in a single namespace of a single cluster.
**No data is mutated** — the PVC and its contents are untouched; scaling to 1 re-attaches the
existing volume. Nothing outside namespace `energy` is reachable by the allowlisted command.

### Failure handling

| Failure | Behaviour |
| --- | --- |
| Deny | Incident stays unresolved; requires an observed rejection event **plus** before/after resource-state evidence proving `replicas` never changed (§6). |
| Insufficient permission | Surfaces as a tool execution failure; lifecycle becomes `execution-failed`, never `verification-passed`. |
| Action timeout | `execution-failed` + rollback guidance. |
| Verification failed / stale / partial / no-data | Incident remains **unresolved**, lifecycle is `verification-failed`, and rollback/escalation guidance is emitted. Never resolved. |

---

## 3 · Enforcement boundary (defence in depth)

Enforcement is layered so that no single bypass — including prompt injection into the agent — grants
an out-of-scope action. Layers are listed narrowest-first.

### Layer 1 — Tool Access Policy (always on, primary boundary)

`infra/sre-agent/tool-access-policy.json`, applied at **global** scope via
`scripts/configure-sre-agent-mitigation-guardrails.ps1`.

Only the global scope can `deny`, and per Microsoft's evaluation order `deny` is checked first, so
these rules cannot be widened by a custom-agent or thread-level allow.

- `ask` — exactly one pattern: the scale command above, pinned to `deployment/mongodb`, `-n energy`,
  and `--replicas=0|1`.
- `deny` — deletes/removes, `exec`, `port-forward`, `cp`, `attach`, `proxy`, `az keyvault`, all
  `RunAzCliWriteCommands`, `ExecutePythonCode`, `RunInTerminal`, `RunShellCommand`, and
  `az aks command invoke`.
- `allow` — read-only tools only.

> **Known limitation, deliberately not papered over:** `RunKubectlWriteCommand` argument globs are
> string patterns. They are a real control at the agent's execution boundary, but they are not an
> API-server-side authorization decision. That is why Layer 2 exists, and why
> `validate-sre-agent-mitigation-guardrails.ps1` reports the two layers separately instead of
> claiming one implies the other.

### Layer 2 — Azure RBAC for Kubernetes, namespace-scoped (opt-in)

Set `enableAgentKubernetesRbac = true` (default `false`). This enables managed Entra integration
with Azure RBAC on the cluster and grants the agent identity a **custom role** whose only
`dataActions` are `apps/deployments` read/write plus a few reads, assigned at scope
`<aksResourceId>/namespaces/energy`. Authorization is then enforced by the API server, not by a
string match.

> **Bicep cannot express this scope, so it does not create the assignment.**
> Azure RBAC for Kubernetes Authorization scopes a namespace grant to the extension-resource path
> `<aksResourceId>/namespaces/<namespace>`
> ([manage-azure-rbac](https://learn.microsoft.com/azure/aks/manage-azure-rbac)). That path is not a
> deployable ARM resource type, so Bicep has no symbolic reference to target and `scope:` cannot
> name it. Writing `scope: aks` instead silently produces a **cluster-wide** grant.
>
> A cluster-wide `dataActions` grant labelled "namespace-scoped" is worse than no Layer 2 at all,
> because the operator is told a boundary exists that does not. So:
>
> - `infra/bicep/modules/sre-agent-mitigation-role.bicep` creates **only the role definition**, and
>   outputs `namespaceRoleAssignmentCreatedByTemplate = false` plus the exact required
>   `namespaceAssignmentScope`.
> - `scripts/configure-sre-agent-mitigation-guardrails.ps1 -Apply` creates the assignment
>   idempotently with `az role assignment create --scope <aksId>/namespaces/energy`, then **reads it
>   back and asserts the scope the service returned** matches exactly.
> - Any assignment found at the bare cluster scope is reported as `CLUSTER-WIDE GRANT` and fails;
>   any other namespace is reported as `OUT-OF-SCOPE GRANT` and fails. Neither is ever reported as
>   namespace enforcement.
> - `scripts/validate-sre-agent-mitigation-guardrails.ps1` and
>   `tests/static/test_review_mode_mitigation_rbac.py` fail the build if a `roleAssignments`
>   resource referencing the dataActions role reappears in the template.

Layer 2 is **off by default** because enabling Entra integration changes how `az aks get-credentials`
issues operator kubeconfigs, and this repository has no live environment in which to validate that
change (§10). `scripts/deploy.ps1` already switches to `--admin` when the flag is on.

### Layer 3 — Azure control-plane custom role (replaces Contributor)

New `accessLevel` value **`Mitigation`** in `infra/bicep/modules/sre-agent.bicep` assigns:

- `Log Analytics Reader`, `Reader` (unchanged), and
- a custom role definition **`SRE Agent Energy Grid Mitigation Operator`**
  (`infra/bicep/modules/sre-agent-mitigation-role.bicep`) whose only actions are
  `Microsoft.ContainerService/managedClusters/read` and
  `…/listClusterUserCredential/action`, scoped to the AKS resource — **not** the resource group.

Contributor is **not** assigned on this path. `High` still exists for the pre-existing broad-access
lab flows, but the guardrail validator **fails** (not warns) if Contributor is present while the
mitigation path is enabled.

### Layer 4 — Run mode

Response plan run mode `Review`. Required, and independently verified from telemetry rather than
trusted from configuration (§7).

---

## 4 · Documented demo-only permission breadth

With Layer 2 **off** (the default), `listClusterUserCredential` returns a cluster credential whose
in-cluster authority is governed by the cluster's own RBAC. Because this lab does not disable local
accounts, that credential is broader than the single Deployment this action needs.

This is disclosed rather than hidden:

- `scripts/validate-sre-agent-mitigation-guardrails.ps1` emits a **loud, non-suppressible**
  `DEMO-ONLY PERMISSION BREADTH` finding whenever Layer 2 is inactive.
- The Mission Control API returns the same disclosure in `guardrails.disclosures[]`, and the UI
  renders it as a warning badge on the mitigation panel.
- Layer 1 still constrains what the agent will actually run.

To remove this breadth entirely, deploy with `enableAgentKubernetesRbac = true`.

---

## 5 · Evidence contract — lifecycle is *derived*, never asserted

Mission Control never accepts a lifecycle state from a request body. Every state is derived from
runtime-validated, redacted Application Insights `customEvents` rows.

Implementation: `mission-control/backend/src/services/sre-agent/mitigationLifecycle.ts`.

### Correlated events

| Event | Role | Schema status |
| --- | --- | --- |
| `IncidentActivitySnapshot` | incident identity, status, `AgentAutonomyLevel`, response plan | [Documented](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions#incident-lifecycle-incidentactivitysnapshot) |
| `ApprovalDecision` | the human approve/reject decision | **`SCHEMA_TBD`** — Microsoft publishes only a raw `customDimensions` projection. Outcome is read from a bounded candidate-key scan and is `unknown` (never guessed) when absent. |
| `AgentToolExecution` | the `RunKubectlWriteCommand` invocation and its result | [Documented](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions#tool-execution-agenttoolexecution) |
| `AgentAzCliExecution` | correlated when present; not required for the kubectl path | Name documented; fields `SCHEMA_TBD` |

### Correlation rule

Events join only on **exact string equality** of `ThreadId`, and additionally on `CorrelationId`,
`IncidentId`, or `TraceId` where present. Anything else is a mismatch:

- No shared identifier → evidence is discarded, not attached.
- Two different `ThreadId`s claiming the same incident → `ambiguous`, no lifecycle asserted.
- Identifier present on one event and absent on its counterpart → not a match.

### Rejected inputs (each has a test)

Replay (repeated `CallId`/`SpanId`), duplicates, future timestamps beyond a bounded clock skew,
out-of-order lifecycles (verification before execution, execution before approval), stale evidence
past the freshness window, schema drift, unknown request keys, forged request-body lifecycle fields.

---

## 6 · Deny requires proof of *no mutation*

`denied` is only asserted when **both** hold:

1. An observed `ApprovalDecision` row correlated by exact ID whose outcome parses as a rejection, **and**
2. Before/after resource-state observations of `energy/mongodb` that are both present, both fresh,
   and **equal** (`spec.replicas` unchanged, `observedGeneration` unchanged).

If the before/after pair is missing, stale, or shows drift, the state is
`denied-with-unverified-state` — **never** `denied`. An applied mutation after a rejection is
reported as `deny-violation`, which is a security finding, not a success. The code never rewrites
`applied`/`unknown` into `unchanged`.

### 6.1 The "before" reading is anchored at the decision, not at the previous poll

Mission Control keeps a short, time-ordered history of observations of `energy/mongodb` and selects
the newest entry **at or before the observed decision timestamp** as the "before" reading.

This matters. Using "whatever the previous poll saw" would be exploitable: once a mutation had
settled, two successive later polls would both read the mutated value, compare equal, and a rejected
proposal that *did* change the resource would be reported as a clean `denied`. Anchoring at the
decision closes that window. If the history contains nothing older than the decision, the state is
`denied-with-unverified-state`, and an explicitly supplied "before" that post-dates the decision is
discarded with a stated reason.

Regression tests: `mitigationLifecycle.test.ts` ("anchors the before reading at or before the
decision") and `mitigation.test.ts` ("does not mask a post-deny mutation across successive polls").

---

## 7 · Verification contract

`verification-passed` requires **all** of:

- an observed approval **and** matching execution telemetry (exact ID equality),
- every probe timestamped **strictly after** the observed execution completion,
- three structured probes, each carrying `source`, observed value, `observedAt`, freshness, and an
  evidence pointer/correlation id — **no boolean-only success**:

| Probe | Signal | Pass condition |
| --- | --- | --- |
| `kubernetes-readiness` | `energy/mongodb` Deployment | `readyReplicas >= 1` and `availableReplicas >= 1` |
| `service-endpoint-health` | `mongodb` Service endpoints | at least one ready endpoint address |
| `golden-transaction` | PR #84 synthetic meter-ingest journey (`CustomerImpactService`) | `dataStatus == 'available'`, success rate ≥ 95 %, freshness ≤ 5 min, journey status not `critical` |

Any probe that is missing, `no-data`, stale, or failing yields `verification-failed`, the incident
stays unresolved, and rollback/escalation guidance is emitted.

`assertReviewModeOrBlock()` blocks the entire flow when the observed `AgentAutonomyLevel` is
`autonomous`, unknown, or absent — the demo fails loudly instead of proceeding.

---

## 8 · Out-of-scope command handling

An out-of-scope attempt must be **blocked and recorded**. Mission Control classifies an
`AgentToolExecution` row as `blocked-out-of-scope` when its `ToolName`/`ToolInput` fails the
allowlist re-check, or when its output carries a policy-denial or API-server `Forbidden` signal.
Such rows never contribute to `verification-passed` and are surfaced as security findings.

The allowlist is re-evaluated at Mission Control's own boundary
(`isAllowlistedMitigationCommand()`), so a policy drift upstream is detected rather than trusted.

`normalizeMitigationCommand()` is a strict tokeniser, not a regex over the whole command. Every
token must be recognised; an unrecognised flag or a second positional resource rejects the whole
string. This closes an argument-smuggling class where a command carrying the required
`-n energy` and `--replicas=N` tokens could also carry `--server`, `--token`, `--kubeconfig`,
`--as system:masters`, `--all-namespaces`, or a second `deployment/...` target.

### 8.1 Findings from adversarial security and peer review

Six issues were found by review of this change and fixed before merge. Each has a named
regression test:

| Finding | Severity | Fix |
| --- | --- | --- |
| Lookahead-based command normalisation discarded extra arguments, so a smuggled command normalised into an allowlisted string | High | Replaced with a strict tokeniser (`mitigationLifecycle.test.ts`: "rejects argument-smuggling payloads…", "does not let a smuggled command reach verification-passed") |
| Layer 2's Kubernetes `dataActions` assignment was written at `scope: aks` — a **cluster-wide** grant — while code, docs and script all claimed `<aksId>/namespaces/energy` | High | Template no longer creates the assignment; the configure script creates it at the exact namespace scope and verifies the returned scope (`tests/static/test_review_mode_mitigation_rbac.py`, validator guard) |
| The run-mode gate selected its snapshot row with an OR over `IncidentId`/`ThreadId`, so the autonomy level could be read from a different agent thread of the same incident | Medium | `correlateRawRow()` applies the same strict equality used everywhere else (`mitigation.test.ts`: "reads the run mode only from a strictly correlated snapshot row") |
| `agent-tool-execution` filtered only on `threadId`, so an incident-only correlation degraded to a workspace-wide top-N query that could drop the incident's tool rows | Medium | The template and its allowed parameters now accept `incidentId` too (`SreAgentEvidenceService.test.ts`, `mitigation.test.ts`: "filters tool execution by incidentId when no threadId is known") |
| Out-of-scope `ToolEnd` rows were excluded from the security scan, so a disallowed operation that **succeeded** produced no finding — quieter than a mere attempt | Medium | All non-allowlisted rows are flagged regardless of event type, deduped by `CallId`/`SpanId` (`mitigationLifecycle.test.ts`: "flags an out-of-scope call represented ONLY by a successful ToolEnd") |
| Redaction of space-separated CLI secret flags stopped at the first space inside quotes, leaking the remainder of a multi-word secret | Medium | The value pattern now consumes to the matching closing quote (`mitigationLifecycle.test.ts`: "redacts quoted secret values that contain spaces") |

---

## 9 · Rollback and escalation

Rollback is the allowlisted `--replicas=0` scale, so it is itself gated and audited. When
verification fails, the API returns `rollback` guidance (exact command, expected effect, and the
escalation contact path) and the lifecycle is `verification-failed` — never `resolved`.

---

## 10 · Live-proof status

No Energy Grid environment is deployed in the current subscription
(`ME-MngEnvMCAP550731-jostelma-2`), and the AmeriGas resource group `rg-srelab-northcentralus` is
explicitly out of bounds. Therefore:

- ✅ Configuration, policy, custom role, KQL, runtime parsers, API, UI, tests, validators, runbook — **implemented**.
- ⏳ One live **Deny** run and one live **Approve → Execute → Verify** run — **PENDING**.
- ⏳ Confirmation that a Tool Access Policy `ask` approval emits an `ApprovalDecision` customEvent
  (Microsoft documents the event but not which approval mechanisms emit it) — **PENDING**.
  The code treats a missing `ApprovalDecision` as `pending`/`unknown`, never as approved.

Run `scripts/validate-sre-agent-mitigation-guardrails.ps1 -ResourceGroupName <rg>` against a live
lab to capture the outstanding proof; the exact live procedure is in
[`DEMO-RUNBOOK.md`](DEMO-RUNBOOK.md#review-mode-mitigation-mongodbdown).

---

## 11 · References

- [Run modes](https://learn.microsoft.com/azure/sre-agent/run-modes)
- [Execute mitigations](https://learn.microsoft.com/azure/sre-agent/execute-mitigations)
- [Tool access policies](https://learn.microsoft.com/azure/sre-agent/tool-access-policies)
- [Agent hooks](https://learn.microsoft.com/azure/sre-agent/agent-hooks)
- [Audit agent actions](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions)
- [User roles and permissions](https://learn.microsoft.com/azure/sre-agent/user-roles)
