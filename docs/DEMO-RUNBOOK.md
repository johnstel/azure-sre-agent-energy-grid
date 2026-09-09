# Demo Runbook

> **Audience**: Demo operators · **Time**: ~45 minutes (deploy) + 20 minutes (demo)

This is the single sequential checklist for running the Energy Grid SRE Agent demo end-to-end. It references other docs by section — do not duplicate content here.

---

## Pre-Demo Checklist (Day Before)

- [ ] Azure subscription has Owner/Contributor access
- [ ] Region is one of: `eastus2`, `swedencentral`, `australiaeast`
- [ ] Azure CLI installed and logged in (`az login --use-device-code` in dev container)
- [ ] Dev container is running (or PowerShell Core + kubectl available locally)
- [ ] Firewall/proxy follows the complete [Azure SRE Agent network requirements](https://learn.microsoft.com/azure/sre-agent/network-requirements)
- [ ] Confirm SRE Agent is available: visit [aka.ms/sreagent/portal](https://aka.ms/sreagent/portal)
- [ ] Review [docs/COSTS.md](COSTS.md) — budget for core infrastructure plus SRE Agent AAU usage
- [ ] Identify which scenarios you will demo (recommended: OOMKilled → MongoDBDown → ServiceMismatch)
- [ ] Review [docs/SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) for claims to avoid
- [ ] Review the demo-only [meter-ingest SLO contract](SLO-METER-INGEST.md) and its live-proof gate
- [ ] If a proactive task is in scope, configure and validate it through [Grid Readiness scheduled-task guidance](SRE-AGENT-GRID-READINESS-TASK.md); do not claim findings until real runs are captured
- [ ] Prepare a local evidence folder outside the repository for screenshots and raw run output
- [ ] If reusing screenshots from a prior run, confirm they are real captures, current, redacted, and not placeholders
- [ ] **External demo only**: complete the [External Demo Security Checklist](#external-demo-security-checklist) below

---

## External Demo Security Checklist

> **Required before any demo where the AKS cluster is exposed to networks outside your office/VPN.**
> Internal sandbox demos (closed network, single-person laptop) may skip this section with the assumption that access is already constrained by network topology.

### H-1 — AKS API Server IP Allowlist

This lab deploys a public AKS API endpoint. For external demos, restrict it to known CIDRs before the session and restore the intended configuration afterwards if needed.

**Step 1**: Determine your egress CIDR(s):
- Your laptop public IP: `curl -s https://api.ipify.org`
- Office/VPN egress CIDR (ask your network team)
- SRE Agent service CIDR: confirm current range at [aka.ms/sreagent/network](https://learn.microsoft.com/en-us/azure/sre-agent/network-requirements) and include it or the cluster will lose SRE Agent connectivity

**Step 2**: Edit `infra/bicep/main.bicepparam` — uncomment and populate the allowlist:
```bicep
param aksApiServerAuthorizedIpRanges = [
  '203.0.113.10/32'   // your public egress IP
  '198.51.100.0/24'   // office/VPN CIDR
  // add SRE Agent service CIDRs if required by current network docs
]
```

**Step 3**: Redeploy (idempotent, AKS control-plane update only, ~5 min):
```powershell
.\scripts\deploy.ps1 -Location eastus2 -Yes
```

**Step 4**: After the demo, revert `aksApiServerAuthorizedIpRanges = []` and redeploy, or destroy the environment.

> **Connectivity check**: if SRE Agent cannot reach AKS after applying the allowlist, review the current [network requirements](https://learn.microsoft.com/azure/sre-agent/network-requirements) and the agent's reported outbound addresses before changing the allowlist.

### H-4 — RabbitMQ Credentials

RabbitMQ credentials are bootstrapped at deploy time into Azure Key Vault as the deployment source of truth. The values are not committed to Git and are rotated with `deploy.ps1 -RotateRabbitMqSecrets` only when required. The management UI (port 15672) is not exposed outside the cluster.

For external demos where the cluster LoadBalancer IP is shared with attendees, confirm that port `15672` is **not** in any exposed Service spec before the session:
```bash
kubectl get svc -n energy | grep 15672
```
No output means the management port is not externally reachable.

---

## Step 1: Deploy Infrastructure (~15-25 min)

```powershell
.\scripts\deploy.ps1 -Location eastus2 -Yes
```

**Verify:**
- [ ] Deployment completes without errors
- [ ] The repo-managed Grafana incident dashboard was imported during deployment from `infra/grafana/energy-grid-incident-dashboard.json` and the deploy script exited non-zero if the import/verification step failed
- [ ] Note the resource group name from output (e.g., `rg-srelab-eastus2`)

```powershell
.\scripts\validate-deployment.ps1 -ResourceGroupName <rg-name>
```

- [ ] All resources report healthy
- [ ] The managed Grafana dashboard is present and shows the expected title: `Energy Grid — Incident Overview`
- [ ] AKS cluster is accessible: `kubectl get nodes`

---

## Step 2: Verify Healthy Baseline (~2 min)

```bash
kubectl get pods -n energy
```

- [ ] All pods show `Running` / `1/1 Ready`
- [ ] No restarts > 0

```bash
# Quick smoke test
kubectl exec -n energy deploy/grid-dashboard -- curl -s localhost:8080/health
```

- [ ] Grid dashboard responds
- [ ] `kubectl get cronjob synthetic-meter-ingest-probe -n energy` reports the two-minute probe schedule
- [ ] Record whether the customer-impact panel shows real telemetry, `NO_DATA`, or `UNKNOWN`; neither non-green state is a healthy baseline

If capturing evidence, save a real, redacted baseline screenshot in the run's local evidence folder. Do not commit raw environment output or placeholder screenshots.

---

## Step 3: Open the Managed Grafana Workspace and SRE Agent Portal

After deployment, the Managed Grafana workspace is available in the resource group. No repo-managed dashboard import is performed as part of this branch.

1. Open the Managed Grafana instance from the Azure Portal resource group or run `site` in the dev container terminal to retrieve the URL.
2. Confirm that the workspace shows the customer-impact SLO row, baseline panels, and the scenario variable.
3. Keep the workspace open during the demo to show the transition from healthy to degraded to critical or no-data while the operator investigates.

### Demo path guidance

- 5-minute path: start with the customer-impact state, then show namespace health, pod restarts, and alert-state views.
- 10-minute path: add the SLO success/p95/freshness row, CPU/memory, request/error-rate, and timeline annotations.
- 20-minute path: include dependency failures, scenario narrative, and the operator handoff panels.

Use the safe-language guardrails in [docs/SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) when presenting the dashboard. Do not imply autonomous remediation; present it as evidence that the operator can review and act on.

---

## Step 4: Find Your SRE Agent Portal URL

**Option A — Deployment output:**
The URL is printed at the end of `deploy.ps1` output. Look for the SRE Agent resource URL.

**Option B — Azure Portal:**
1. Go to [aka.ms/sreagent/portal](https://aka.ms/sreagent/portal)
2. Select your subscription → find the agent resource in your resource group
3. Open the SRE Agent conversation pane

**Option C — Azure CLI:**
```bash
az resource list --resource-group <rg-name> --resource-type Microsoft.App/agents -o table
```

- [ ] SRE Agent portal is accessible and responsive

---

## Step 5: Run Scenario — Break, Diagnose, Fix

For each scenario you plan to demo, follow this loop. Use the complete-failure bundle only after the core scenarios are understood, because it combines dependency outage, service routing failure, and network isolation in one incident.

### 5a. Inject the failure

```bash
kubectl apply -f k8s/scenarios/<scenario>.yaml
```

**Estimated times:** OOMKilled ~30s to manifest, MongoDBDown ~60s for cascade, ServiceMismatch ~immediate

### 5b. Observe the failure

```bash
kubectl get pods -n energy -w    # Watch pods
kubectl get events -n energy --sort-by='.lastTimestamp' | head -20
```

- [ ] Failure is visible in kubectl output

### 5c. MongoDBDown manual path (live contrast)

Use this only for the MongoDBDown scenario before asking SRE Agent. The goal is to let the audience watch the manual investigation path, not to make a quantitative MTTR claim.

**Presenter setup:** Say: "I'll do the manual triage first so you can see the breadcrumbs an operator normally follows. Then we'll ask SRE Agent the same diagnostic question."

| Step | Command | Expected output snippet | Presenter note / timing guidance |
|------|---------|-------------------------|----------------------------------|
| 1 | `kubectl get pods -n energy` | `dispatch-service-...` rows are visible, while `mongodb` is absent from the pod list | Start broad. Point out that the visible symptom may be the dispatch layer, not the database itself. Keep this brisk. |
| 2 | `kubectl get deploy mongodb dispatch-service meter-service -n energy` | `mongodb   0/0   0   0   0` | Move from pods to desired state. Emphasize that MongoDB is configured for zero desired replicas in the broken scenario. |
| 3 | `kubectl get endpoints mongodb -n energy` | `mongodb   <none>   ...` | This is the key dependency clue: the Service exists, but no MongoDB pod backs it. Pause here so the audience sees the root-cause signal. |
| 4 | `kubectl describe deploy mongodb -n energy` | `Replicas: 0 desired, 0 updated, 0 total, 0 available` | Confirm this is a deployment scale state, not a DNS or Service-name typo. |
| 5 | `kubectl get deploy dispatch-service -n energy -o jsonpath='{range .spec.template.spec.containers[*].env[*]}{.name}={.value}{"\n"}{end}'` | `ORDER_DB_URI=mongodb://mongodb:27017` | Trace why dispatch is affected: it depends on the `mongodb` Service for meter-reading persistence. |
| 6 | `kubectl logs -n energy deploy/dispatch-service --tail=80` | `Using MongoDB API`; longer runs may also show MongoDB connection errors | Use this as app-level corroboration that dispatch uses MongoDB. Exact application log wording can vary by image version; do not over-script it. |
| 7 | `kubectl exec -n energy deploy/rabbitmq -- rabbitmqctl list_queues name messages --timeout 10` | `meter-events` with a message count | Close the loop with business impact: meter events can queue while persistence is blocked. Skip this if the first six commands already tell the story. |

**Manual root-cause conclusion:** "MongoDB is scaled to zero replicas. The `mongodb` Service has no endpoints, and `dispatch-service` is configured to write to `mongodb://mongodb:27017`, so meter events can be accepted upstream but dispatch/persistence cannot complete until MongoDB is restored."

**Manual fix if needed:**

```bash
kubectl apply -f k8s/base/application.yaml
```

After recovery, verify:

```bash
kubectl get deploy mongodb dispatch-service -n energy
kubectl get endpoints mongodb -n energy
```

Expected snippets: `mongodb   1/1` and `mongodb   <pod-ip>:27017`.

### 5d. Ask SRE Agent to diagnose

Open the SRE Agent portal. Start with an open-ended prompt, then escalate to scenario-specific prompts:

**Open-ended (any scenario):**
- "Something seems wrong in the energy namespace. Can you investigate?"

**Recommended scenario-specific prompts:**

| Scenario | Top Prompt |
|----------|-----------|
| **OOMKilled** | "Why is the meter-service pod restarting repeatedly?" |
| **MongoDBDown** | "Smart meter data isn't being processed — what's wrong?" |
| **ServiceMismatch** | "Grid dashboard loads but meter readings fail — what's broken?" |
| **CompleteFailureBundle** | "Why is the entire energy grid platform down?" |

For the full prompt catalog, see [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) or per-scenario prompts in [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md).

**Complete-failure bundle operator path (optional advanced demo):**

```bash
kubectl apply -f k8s/scenarios/complete-failure-bundle/scenario.yaml
kubectl get deployment mongodb rabbitmq -n energy
kubectl get endpoints mongodb rabbitmq -n energy
kubectl get endpoints meter-service -n energy
kubectl get networkpolicy deny-meter-service -n energy
```

Ask SRE Agent for dependency-aware recovery guidance, then keep the operator in control:

```bash
# Restore dependency and Service specs first.
kubectl apply -f k8s/base/application.yaml
kubectl get deployment mongodb rabbitmq -n energy
kubectl get endpoints mongodb rabbitmq -n energy
kubectl get endpoints meter-service -n energy

# Remove the extra NetworkPolicy because apply does not prune it.
kubectl delete networkpolicy deny-meter-service -n energy
kubectl get pods -n energy
kubectl get networkpolicy -n energy
```

Capture real failure, diagnosis, and recovery evidence in the run's local evidence folder. Do not claim SRE Agent guided recovery unless the real portal conversation is captured or visible live. Missing portal evidence should remain missing rather than being replaced with a simulated screenshot.

If you just ran the MongoDBDown manual path, say: "Now we'll ask SRE Agent the same question and compare the investigation path it recommends." Do not script or paraphrase a diagnosis as if it happened live; show the portal response or clearly label any prior screenshot as previous-run evidence.

### 5e. Remediate

If SRE Agent recommends a fix in Review mode:
- [ ] Screenshot the recommendation/proposal exactly as shown and save it with the local run evidence
- [ ] If the portal exposes a real approval UI, capture it before use; otherwise use safe language: **agent recommends, operator executes**
- [ ] Manually apply the fix from an authorized operator shell

Or restore manually:
```bash
kubectl apply -f k8s/base/application.yaml
```

### 5f. Verify recovery

```bash
kubectl get pods -n energy
```

- [ ] All pods back to Running/Ready (infrastructure recovery evidence only)
- [ ] Wait for the next `synthetic-meter-ingest-probe` execution and identify its completed Job:

  ```bash
  kubectl get jobs -n energy -l app.kubernetes.io/component=synthetic-probe --sort-by=.status.startTime
  kubectl logs -n energy job/<latest-completed-probe-job>
  ```

- [ ] Confirm the JSON result has `"success":true` and a correlation ID, then use `docs/evidence/kql/stable/slo-meter-ingest.kql` to confirm the newer persisted transaction in AppRequests.
- [ ] Screenshot the functional recovery state and save it with the local run evidence

Do not mark `T5` or say the customer journey recovered when only pods are ready. A new successful synthetic transaction is the recovery gate.

### 5g. Record timestamps

In the local run notes, record:
| Timestamp | Event |
|-----------|-------|
| T0 | Scenario injected |
| T1 | First symptom visible |
| T2 | SRE Agent conversation started |
| T3 | Diagnosis received |
| T4 | Remediation applied |
| T5 | Service healthy |

See [docs/CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) §7 for the MTTR model.

---

## Step 6: Restore Healthy State

```bash
# Portable command — works anywhere with kubectl access:
kubectl apply -f k8s/base/application.yaml

# Or use the dev-container shortcut (defined in .devcontainer/post-create.sh):
fix-all
```

> **Note**: `fix-all` is a shell alias available only inside the dev container. Outside the dev container, use `kubectl apply -f k8s/base/application.yaml` directly.

- [ ] All pods Running/Ready
- [ ] No error events in last 5 minutes
- [ ] A newer successful `slo-meter-ingest` transaction is visible before presenting a healthy customer-impact state

---

## Step 7: Teardown (Post-Demo)

```powershell
.\scripts\destroy.ps1 -ResourceGroupName <rg-name>
```

- [ ] Resource group deleted
- [ ] Verify in Azure Portal: no orphaned resources

---

## Evidence Storage

Keep raw run evidence outside the repository. Promote only reusable, redacted material that satisfies [docs/evidence/README.md](evidence/README.md).

| Artifact Type | Path Pattern | Example |
|---------------|-------------|---------|
| Screenshots and raw logs | Local run folder outside the repository | Timestamped, redacted capture set |
| Reusable KQL queries | `docs/evidence/kql/stable/{query-purpose}.kql` | `pod-lifecycle.kql` |
| Reusable runbooks | `docs/evidence/runbooks/RB-{NNN}-{slug}.md` | `RB-001-oom-killed.md` |
| Diagrams | `docs/evidence/diagrams/{topic}.mmd` | `trust-tiers.mmd` |

---

## Fallback Plan: SRE Agent Unavailable

Azure SRE Agent is **GA**. If the portal is unresponsive during a live demo:

1. **Acknowledge it**: "SRE Agent is available, and this lab keeps operator control — let me show you the diagnosis path manually while we wait."
2. **Use kubectl diagnosis**: Walk through the `What to observe` commands in [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md) for the active scenario. For MongoDBDown, use the manual path in Step 5c above.
3. **Show the prompt library**: Open [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) and explain the prompt progression — "These are the prompts we'd use when the portal is available." Do not describe a live SRE Agent result unless it is visible in the portal or captured as previous-run evidence.
4. **Reference the incident handoff flow**: When the Mission Control backend is in use, the incident queue follows an explicit `open` → `acknowledged` → `resolved` lifecycle so the operator remains in control of remediation decisions.
4. **Show prior evidence**: If you have current, redacted screenshots from a previous run, use those and label them with their capture date.
5. **Pivot to architecture**: Use the trust model diagram in README to discuss Review vs. Auto mode and RBAC controls.
6. **Resume when available**: Keep the portal tab open and continue once service responsiveness returns.

**Do NOT**: promise specific uptime SLAs, or skip the scenario entirely.

---

## Known Issues

| Issue | Workaround |
|-------|------------|
| Port 3333 conflict with Mission Control | Change port in Mission Control config or stop conflicting process |
| `managedResources: []` in SRE Agent | Current lab configuration keeps managed resources explicit; add managed resources manually via Azure Portal after deployment if required for the scenario |
| Public AKS API server | This repository validates a public endpoint with optional authorized IP ranges; private connectivity is outside the current lab design |
| Deployment output scrolls past SRE Agent URL | Use Option B or C in Step 3 above |
| RabbitMQ severity stickiness after recovery | Wallboard may show warning after fix-all; redeploy RabbitMQ if needed |
| `menu` command only works in dev container | Outside dev container, refer to Commands Reference in README |

---

## Reference Docs

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Quick start, architecture, commands |
| [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md) | All 10 scenarios with observe/fix commands |
| [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) | SRE Agent prompt progressions |
| [docs/SRE-AGENT-SETUP.md](SRE-AGENT-SETUP.md) | SRE Agent deployment and configuration |
| [docs/CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) | Shared contracts (telemetry, evidence, RBAC) |
| [docs/SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) | What to say / not say during demos |
| [docs/COSTS.md](COSTS.md) | Cost estimates and optimization |

---

## Review-mode mitigation (MongoDBDown)

> Issue #80. Full action design, blast radius, permission boundary and evidence contract:
> [`REVIEW-MODE-MITIGATION.md`](REVIEW-MODE-MITIGATION.md).
>
> **Live deny/approve proof is currently PENDING.** Run this procedure against a real lab to
> capture it. Until then, do not present the deny or approve paths as proven.

### Prerequisites

1. Deploy with the least-privilege posture:
   ```bash
   az deployment sub create --template-file infra/bicep/main.bicep \
     --parameters sreAgentAccessLevel=Mitigation enableReviewModeMitigation=true
   ```
   Add `enableAgentKubernetesRbac=true` to move the boundary into the Kubernetes API server
   (removes the documented demo-only permission breadth).

2. Apply and verify the guardrails:
   ```bash
   pwsh ./scripts/validate-sre-agent-mitigation-guardrails.ps1
   pwsh ./scripts/configure-sre-agent-mitigation-guardrails.ps1 -ResourceGroupName <rg>
   pwsh ./scripts/configure-sre-agent-mitigation-guardrails.ps1 -ResourceGroupName <rg> -Apply
   ```
   The first command must exit 0. The second must not report Contributor on the agent identity.

   With `enableAgentKubernetesRbac=true`, the `-Apply` run also creates the Layer 2 assignment at
   exactly `<aksResourceId>/namespaces/energy` (Bicep cannot express that extension-resource scope —
   see [`REVIEW-MODE-MITIGATION.md` §3](REVIEW-MODE-MITIGATION.md)) and reads it back to verify.
   Expected output:
   ```text
   [PASS   ] Created and verified namespace-scoped assignment. Returned scope:
             /subscriptions/…/managedClusters/<aks>/namespaces/energy
   ```
   A `CLUSTER-WIDE GRANT` or `OUT-OF-SCOPE GRANT` line is a **failure**, not a warning: the script
   prints the exact `az role assignment delete --ids …` command to remove it. Namespace enforcement
   is never reported from the mere existence of an assignment.

3. **Set the response plan to Review.** Microsoft documents the *response plan* default as
   Autonomous even though the agent-level default is Review
   ([run modes](https://learn.microsoft.com/azure/sre-agent/run-modes)). In the agent portal, edit
   the incident trigger and set **Agent autonomy level → Review**. If you skip this, Mission
   Control reports `blocked-run-mode` and the demonstration correctly refuses to proceed.

### Capture the deny path

1. Break the scenario: `kubectl apply -f k8s/scenarios/mongodb-down.yaml`
2. Record the pre-decision baseline so the no-mutation proof has an earlier observation:
   ```bash
   curl -s "http://localhost:3001/api/mitigation/evidence?threadId=<threadId>"
   kubectl get deployment mongodb -n energy -o jsonpath='{.spec.replicas}{"\n"}'
   ```
3. Let the agent investigate and propose. In the portal, select **Deny**.
4. Re-query the evidence endpoint. Expected: `state: "denied"` with
   `resourceState.mutation: "unchanged"`.
   - `denied-with-unverified-state` means there is no fresh before/after pair — capture one and retry.
   - `deny-violation` is a **security finding**: stop and investigate the policy/RBAC boundary.

### Capture the approve path

1. Ask the agent to propose the mitigation again. In the portal, select **Approve**.
2. Poll the evidence endpoint until `execution.completedAt` is populated.
3. Expected end state: `state: "verification-passed"`, `incidentResolved: true`, and all three
   probes (`kubernetes-readiness`, `service-endpoint-health`, `golden-transaction`) reporting
   `pass` with timestamps **after** `execution.completedAt`.
4. Attach the evidence to the rehearsal package (it is re-derived server-side, not trusted from the body):
   ```bash
   curl -s -X POST http://localhost:3001/api/rehearsals/MongoDBDown/mitigation-evidence \
     -H 'content-type: application/json' -d '{"threadId":"<threadId>"}'
   ```

### Prove an out-of-scope command is blocked

Ask the agent to do something outside the allowlist, for example
"delete the mongodb deployment in the energy namespace". Expected: the tool access policy `deny`
rule blocks it. Mission Control reports it under `securityFindings` and it never contributes to
`verification-passed`.

### Rollback

`kubectl scale deployment/mongodb -n energy --replicas=0` — inside the same allowlist, so the
rollback is itself gated and audited.
