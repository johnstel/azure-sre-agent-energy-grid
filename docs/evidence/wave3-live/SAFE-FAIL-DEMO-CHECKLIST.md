# Wave 3 Safe-Fail Demo Checklist

**Scope**: Azure SRE Agent Service safe-fail, RBAC, auditability, and human-in-the-loop controls.
**Mission Control**: Out of scope. Do not use or modify it for this Wave 3 demo.
**Safety rule**: Keep live commands read-only or reversible. After any mutation, verify cluster health and restore with `kubectl apply -f k8s/base/application.yaml`.

> If a live denial test would require new tenant identities, production RBAC changes, or unsafe role removal, do not improvise. Use the operator-executable checklist and mark the live denial as **not tested in this environment**.

---

## 0. Pre-Flight

- [ ] Confirm Wave 2 status: `PASS_WITH_PENDING_HUMAN_PORTAL`.
- [ ] Confirm SRE Agent Preview portal access is available.
- [ ] Confirm current Kubernetes health:

```bash
kubectl get nodes
kubectl get pods -n energy
```

- [ ] Confirm all pods are Running/Ready before injecting any scenario.
- [ ] Record resource group, SRE Agent resource name, managed identity principal ID, AKS cluster name, Log Analytics workspace, and subscription ID in private operator notes. Redact before committing evidence.

---

## 1. Read-Only Profile Review (`review-readonly`)

Purpose: demonstrate least-privilege target without requiring new identities.

Read-only commands:

```bash
az resource list --resource-group <rg-name> --resource-type Microsoft.App/agents -o table
az role assignment list --assignee <sre-agent-principal-id> --resource-group <rg-name> -o table
az monitor log-analytics workspace show --resource-group <rg-name> --workspace-name <workspace-name> --query retentionInDays -o tsv
```

Checklist:

- [ ] Capture current SRE Agent `mode` and `accessLevel` from the deployed resource or Bicep.
- [ ] Confirm whether `High`/Contributor is present.
- [ ] If Contributor is present, label it **demo-only**.
- [ ] Explain production alternative: `Low` access with Reader + Log Analytics Reader.
- [ ] Do not remove production/customer permissions live unless pre-approved by the tenant owner.

Expected narrative:

> “This demo deployment uses a broad review-remediate profile for convenience. The production starting point is review-readonly: read Azure resources and logs, then route remediations through operator-controlled change workflows.”

---

## 2. Human-in-the-Loop Recommendation Path

Purpose: demonstrate safe wording for write actions without faking approval APIs.

Steps:

1. Inject a reversible scenario, preferably ServiceMismatch because it is deterministic:

```bash
kubectl apply -f k8s/scenarios/service-mismatch.yaml
kubectl get endpoints -n energy meter-service
kubectl get pods -n energy
```

2. Ask SRE Agent in the portal:

```text
Smart meter data is not being processed, but pods look healthy in the energy namespace. What should I check?
```

3. Capture exactly what the portal returns:

- [ ] Screenshot/transcript of the diagnosis.
- [ ] Whether the agent recommends checking Service selectors/endpoints.
- [ ] Whether any action proposal or approval UI appears.

4. Use safe language based on actual observation:

- If the portal only recommends: “The agent recommended; the operator executed.”
- If the portal exposes a real approval UI: capture screenshot and record exact wording.
- If the portal does not respond or is unavailable: mark `PENDING_HUMAN_PORTAL` and do not claim the capability.

5. Restore:

```bash
kubectl apply -f k8s/base/application.yaml
kubectl get endpoints -n energy meter-service
kubectl get pods -n energy
```

Pass criteria:

- [ ] Scenario restored.
- [ ] Cluster remains healthy.
- [ ] No claim of autonomous remediation.

---

## 3. RBAC-Denial / No-Permission Path

### Option A — Preferred if a pre-existing read-only test identity exists

Use this only if the tenant already has a safe read-only/operator test principal. Do not create new identities solely for the demo unless tenant owners approve.

1. Sign in as the read-only identity.
2. Verify read succeeds:

```bash
az group show --name <rg-name> -o table
az role assignment list --resource-group <rg-name> -o table
```

3. Attempt a reversible but unauthorized write against the demo namespace:

```bash
kubectl apply -f k8s/scenarios/service-mismatch.yaml
```

4. Expected result:

- Kubernetes or Azure RBAC denies the write.
- The operator captures the denial as safe-fail evidence.
- No resources are mutated by the read-only identity.

5. Authorized operator verifies or restores:

```bash
kubectl get pods -n energy
kubectl apply -f k8s/base/application.yaml
kubectl get pods -n energy
```

Evidence to capture:

- [ ] Identity has read-only role assignment.
- [ ] Write command fails with authorization error.
- [ ] Cluster health remains or is restored.

### Option B — If no safe test identity exists

Do not modify tenant RBAC live. Instead, document this limitation:

> “A live RBAC-denial test was not executed because the environment does not currently provide a separate least-privilege test identity and creating/removing tenant RBAC during the customer demo would increase risk. The denial path is operator-executable and should be run in a pre-approved UAT tenant.”

Then review the repo-defined denial expectations:

- `accessLevel: 'Low'` lacks Contributor and should not be used for write/remediation demos.
- Production should use read-only agent identity plus human/operator remediation identity.
- Any write denial should be treated as safe-fail, not as a demo failure.

---

## 4. Audit Evidence Collection

Read-only audit checks:

```bash
az monitor diagnostic-settings list --resource /subscriptions/<subscription-id> -o table
az role assignment list --assignee <sre-agent-principal-id> --all -o table
```

Log Analytics checks to run in portal or approved query environment:

```kql
AzureActivity
| where TimeGenerated > ago(24h)
| where OperationNameValue has "roleAssignments"
| project TimeGenerated, OperationNameValue, ActivityStatusValue, Caller, ResourceGroup, ResourceId
| order by TimeGenerated desc
```

```kql
KubePodInventory
| where TimeGenerated > ago(1h)
| where Namespace == "energy"
| summarize LastSeen=max(TimeGenerated), Pods=dcount(Name) by ClusterName, Namespace
```

Evidence checklist:

- [ ] Activity Log diagnostic setting exists.
- [ ] Role assignment operations are visible or limitation is documented.
- [ ] KubePodInventory/KubeEvents are flowing, or ingestion delay is documented.
- [ ] SRE Agent portal screenshots/transcripts are real and redacted.

---

## 5. Safe-Fail Exit Criteria

Before ending the demo:

```bash
kubectl apply -f k8s/base/application.yaml
kubectl get pods -n energy
kubectl get endpoints -n energy meter-service mongodb rabbitmq
```

- [ ] All pods Running/Ready.
- [ ] Critical endpoints exist.
- [ ] Any RBAC denial is documented as expected safe-fail behavior.
- [ ] Any untested portal/approval behavior is explicitly marked pending.
- [ ] Final verdict remains `PASS_WITH_PENDING_HUMAN_PORTAL` until portal evidence exists.
