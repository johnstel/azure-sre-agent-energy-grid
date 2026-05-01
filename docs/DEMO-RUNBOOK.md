# Demo Runbook

> **Audience**: Demo operators · **Time**: ~45 minutes (deploy) + 20 minutes (demo) · **Wave**: 0+

This is the single sequential checklist for running the Energy Grid SRE Agent demo end-to-end. It references other docs by section — do not duplicate content here.

---

## Pre-Demo Checklist (Day Before)

- [ ] Azure subscription has Owner/Contributor access
- [ ] Region is one of: `eastus2`, `swedencentral`, `australiaeast`
- [ ] Azure CLI installed and logged in (`az login --use-device-code` in dev container)
- [ ] Dev container is running (or PowerShell Core + kubectl available locally)
- [ ] Firewall allows `*.azuresre.ai`
- [ ] Confirm SRE Agent Preview is available: visit [aka.ms/sreagent/portal](https://aka.ms/sreagent/portal)
- [ ] Review [docs/COSTS.md](COSTS.md) — budget ~$34-40/day with SRE Agent
- [ ] Identify which scenarios you will demo (recommended: OOMKilled → MongoDBDown → ServiceMismatch)
- [ ] Review [docs/SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) for claims to avoid
- [ ] Review the visual evidence convention in [docs/evidence/screenshots/README.md](evidence/screenshots/README.md)
- [ ] If reusing screenshots from a prior run, confirm they are real captures, redacted, and not placeholders
- [ ] **External demo only**: complete the [External Demo Security Checklist](#external-demo-security-checklist) below

---

## External Demo Security Checklist

> **Required before any demo where the AKS cluster is exposed to networks outside your office/VPN.**
> Internal sandbox demos (closed network, single-person laptop) may skip this section with the assumption that access is already constrained by network topology.

### H-1 — AKS API Server IP Allowlist

The AKS API server is publicly reachable by default (required for SRE Agent access). For external demos, restrict it to known CIDRs before the session and restore open access afterwards if needed.

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

> ⚠️ **SRE Agent access**: if SRE Agent cannot reach the API server after applying allowlist, its service IPs are not in your list. Check Microsoft's published egress ranges for `*.azuresre.ai` and add them.

### H-4 — RabbitMQ Credentials

RabbitMQ credentials have been changed from the factory default `guest/guest` to `energy-grid-mq` / `energy-grid-mq-demo` (static demo values, stored as a Kubernetes Secret). The management UI (port 15672) is not exposed outside the cluster. No further rotation is required for internal demos.

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
- [ ] Note the resource group name from output (e.g., `rg-srelab-eastus2`)

```powershell
.\scripts\validate-deployment.ps1 -ResourceGroupName <rg-name>
```

- [ ] All resources report healthy
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

**Evidence capture — per scenario baseline screenshots** (use as pre-demo study material and for the visual evidence pack, #38):

| Scenario | Target file | Status on first run |
|----------|-------------|---------------------|
| OOMKilled | `docs/evidence/screenshots/oom-killed_before.png` | See `docs/evidence/screenshots/oom-killed/BLOCKER-NOTE.md` |
| MongoDBDown | `docs/evidence/screenshots/mongodb-down_before.png` | See `docs/evidence/screenshots/mongodb-down/BLOCKER-NOTE.md` |
| ServiceMismatch | `docs/evidence/screenshots/service-mismatch_before.png` | See `docs/evidence/screenshots/service-mismatch/BLOCKER-NOTE.md` |

- [ ] Capture `oom-killed_before.png` — all pods `Running/Ready`, no restarts
- [ ] Capture `mongodb-down_before.png` — MongoDB deployment `1/1`, endpoints active
- [ ] Capture `service-mismatch_before.png` — meter-service endpoints populated

If a screenshot is not yet available, record the blocker in the scenario's `BLOCKER-NOTE.md`.

---

## Step 3: Find Your SRE Agent Portal URL

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

## Step 4: Run Scenario — Break, Diagnose, Fix

For each scenario you plan to demo, follow this loop. Use the complete-failure bundle only after the core scenarios are understood, because it combines dependency outage, service routing failure, and network isolation in one incident.

### 4a. Inject the failure

```bash
kubectl apply -f k8s/scenarios/<scenario>.yaml
```

**Estimated times:** OOMKilled ~30s to manifest, MongoDBDown ~60s for cascade, ServiceMismatch ~immediate

### 4b. Observe the failure

```bash
kubectl get pods -n energy -w    # Watch pods
kubectl get events -n energy --sort-by='.lastTimestamp' | head -20
```

- [ ] Failure is visible in kubectl output

### 4c. MongoDBDown manual path (live contrast)

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

### 4d. Ask SRE Agent to diagnose

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

Capture evidence in `docs/evidence/scenarios/complete-failure-bundle/run-notes.md`. Do not claim SRE Agent guided recovery unless the real portal conversation is captured or visible live.

**Evidence capture — per scenario failure + recovery screenshots** (visual evidence pack, #38 / #45):

| Scenario | Failure file | Diagnosis file | Recovery file |
|----------|-------------|----------------|---------------|
| OOMKilled | `oom-killed_failure.png` | `oom-killed_sre-agent-diagnosis.png` | `oom-killed_after-fix.png` |
| MongoDBDown | `mongodb-down_failure.png` | `mongodb-down_sre-agent-diagnosis.png` | `mongodb-down_after-fix.png` |
| ServiceMismatch | `service-mismatch_failure.png` | `service-mismatch_sre-agent-diagnosis.png` | `service-mismatch_after-fix.png` |

- [ ] Screenshot the visible failure state → `docs/evidence/screenshots/<scenario>_failure.png`
- [ ] Screenshot the real SRE Agent diagnosis, if available → `docs/evidence/screenshots/<scenario>_sre-agent-diagnosis.png`
- [ ] Copy any KQL queries shown → `docs/evidence/kql/<scenario>_diagnosis.kql`
- [ ] If portal access is unavailable, write `PENDING PORTAL EVIDENCE — do not present as captured` in the scenario's `BLOCKER-NOTE.md` instead of creating a fake screenshot

For the SRE Agent portal capture steps, see the per-scenario checklists:
- OOMKilled: `docs/evidence/wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md`
- MongoDBDown: `docs/evidence/wave2-live/mongodb-down/sre-agent/HUMAN-ACTION-CHECKLIST.md`
- ServiceMismatch: `docs/evidence/wave2-live/service-mismatch/sre-agent/HUMAN-ACTION-CHECKLIST.md`

If you just ran the MongoDBDown manual path, say: "Now we'll ask SRE Agent the same question and compare the investigation path it recommends." Do not script or paraphrase a diagnosis as if it happened live; show the portal response or clearly label any prior screenshot as previous-run evidence.

### 4e. Remediate

If SRE Agent recommends a fix in Review mode:
- [ ] Screenshot the recommendation/proposal exactly as shown → `docs/evidence/screenshots/<scenario>_proposal.png`
- [ ] If the portal exposes a real approval UI, capture it before use; otherwise use safe language: **agent recommends, operator executes**
- [ ] Manually apply the fix from an authorized operator shell

Or restore manually:
```bash
kubectl apply -f k8s/base/application.yaml
```

### 4f. Verify recovery

```bash
kubectl get pods -n energy
```

- [ ] All pods back to Running/Ready
- [ ] Screenshot recovery state → `docs/evidence/screenshots/<scenario>_after-fix.png`

### 4g. Record timestamps

In `docs/evidence/scenarios/<scenario>/run-notes.md`, record:
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

## Step 5: Restore Healthy State

```bash
# Portable command — works anywhere with kubectl access:
kubectl apply -f k8s/base/application.yaml

# Or use the dev-container shortcut (defined in .devcontainer/post-create.sh):
fix-all
```

> **Note**: `fix-all` is a shell alias available only inside the dev container. Outside the dev container, use `kubectl apply -f k8s/base/application.yaml` directly.

- [ ] All pods Running/Ready
- [ ] No error events in last 5 minutes

---

## Step 6: Teardown (Post-Demo)

```powershell
.\scripts\destroy.ps1 -ResourceGroupName <rg-name>
```

- [ ] Resource group deleted
- [ ] Verify in Azure Portal: no orphaned resources

---

## Evidence Storage

All evidence artifacts go under `docs/evidence/`. See [docs/evidence/README.md](evidence/README.md) for naming conventions.

| Artifact Type | Path Pattern | Example |
|---------------|-------------|---------|
| Screenshots | `docs/evidence/screenshots/{scenario}_{step}.png` | `oom-killed_sre-agent-diagnosis.png` |
| KQL queries | `docs/evidence/kql/{query-purpose}.kql` | `pod-restart-trend.kql` |
| Run notes | `docs/evidence/scenarios/{id}/run-notes.md` | `scenarios/oom-killed/run-notes.md` |
| Diagrams | `docs/evidence/diagrams/{topic}.mmd` | `trust-tiers.mmd` |

---

## Fallback Plan: SRE Agent Unavailable

Azure SRE Agent is **GA**. If the portal is unresponsive during a live demo:

1. **Acknowledge it**: "SRE Agent is available, and this lab keeps operator control — let me show you the diagnosis path manually while we wait."
2. **Use kubectl diagnosis**: Walk through the `What to observe` commands in [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md) for the active scenario. For MongoDBDown, use the manual path in Step 4c above.
3. **Show the prompt library**: Open [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) and explain the prompt progression — "These are the prompts we'd use when the portal is available." Do not describe a live SRE Agent result unless it is visible in the portal or captured as previous-run evidence.
4. **Show prior evidence**: If you have screenshots from a previous run in `docs/evidence/screenshots/`, use those.
5. **Pivot to architecture**: Use the trust model diagram in README to discuss Review vs. Auto mode and RBAC controls.
6. **Resume when available**: Keep the portal tab open and continue once service responsiveness returns.

**Do NOT**: claim the service is GA, promise specific uptime, or skip the scenario entirely.

---

## Known Issues

| Issue | Workaround |
|-------|------------|
| Port 3333 conflict with Mission Control | Change port in Mission Control config or stop conflicting process |
| `managedResources: []` in SRE Agent | Current API-version limitation in this subscription (`2025-05-01-preview`) — add managed resources manually via Azure Portal after deployment |
| Public AKS API server required | Current SRE Agent deployment path in this lab requires a public endpoint; do not enable private cluster |
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

## Wave 0 Completion Checklist

Use this checklist to verify Wave 0 is fully closed before moving to Wave 1.

- [ ] **Core docs committed**: README.md, DEMO-RUNBOOK.md, DEMO-NARRATIVE.md, BREAKABLE-SCENARIOS.md, CAPABILITY-CONTRACTS.md, SAFE-LANGUAGE-GUARDRAILS.md
- [ ] **Evidence layout exists**: `docs/evidence/` directory structure with screenshots/, kql/, scenarios/, diagrams/ folders
- [ ] **Scenario manifest present**: `docs/evidence/scenarios/scenario-manifest.yaml` covers reference scenarios (OOMKilled, MongoDBDown, ServiceMismatch); remaining 7 scenarios stubbed for Wave 1
- [ ] **Safe language reviewed**: SAFE-LANGUAGE-GUARDRAILS.md has ❌/✅ table; no overclaims in README or DEMO-NARRATIVE
- [ ] **Scenario ordering aligned**: DEMO-NARRATIVE.md is the canonical source for the 20-minute demo sequence; BREAKABLE-SCENARIOS.md defers to it
- [ ] **No runtime changes**: Wave 0 is docs-only — no modifications to Bicep, K8s manifests, scripts, or application code
- [ ] **Cross-references resolve**: All doc-to-doc links are valid relative paths
- [ ] **Brand and Operator reviews**: Both reviews returned APPROVE (or APPROVE WITH FIXES, all fixes applied)

---

## Wave 1 UAT Checklist (Evidence & Observability Foundation)

> **Purpose**: Verify Wave 1 infrastructure and KQL queries before Wave 2 scenario validation
> **Owner**: Lambert (QA/Docs) with Ripley (Infra) support
> **Timing**: Run immediately after `deploy.ps1` completes, before injecting any scenarios
> **Status**: This is the gate between Wave 1 deployment and Wave 2 scenario UAT

### Prerequisites (Infrastructure)

Complete these before starting UAT:

- [ ] Deployment completed successfully (`.\scripts\deploy.ps1 -Location eastus2 -Yes`)
- [ ] Resource group exists and all resources are in "Succeeded" provisioning state
- [ ] AKS cluster is accessible: `kubectl get nodes` returns healthy nodes
- [ ] Container Insights is enabled: `az aks show -g <rg> -n <cluster> --query addonProfiles.omsagent.enabled` returns `true`
- [ ] Log Analytics workspace exists and is receiving data: `Heartbeat | take 10` returns results

### Wave 1 Infrastructure Checklist

Verify these resources are deployed:

- [ ] **Activity Log diagnostic export** — `az monitor diagnostic-settings list --resource <subscription-id>` shows export to Log Analytics
  - If missing: Redeploy Wave 1 Bicep and verify `infra/bicep/modules/activity-log-diagnostics.bicep` was applied
  - Blocker: `alert-history.kql` and `activity-log-rbac.kql` will return no results
- [ ] **Alerts deployed** — `az monitor scheduled-query list -g <rg>` shows 4 alert rules (pod-restarts, http-5xx, pod-failures, crashloop-oom)
  - If missing: Set `deployAlerts = true` in `main.bicepparam` and redeploy
  - Non-blocker: Alert queries will parse but return no fired alerts until scenarios are injected
- [ ] **Log Analytics retention = 90 days** — `az monitor log-analytics workspace show -g <rg> -n <workspace> --query retentionInDays` returns `90`
  - If 30 days: Redeploy Wave 1 Bicep or update workspace retention before customer evidence capture
  - Impact: Retention configuration is not validated for the 90-day evidence contract
- [ ] **SRE Agent deployed** — `az resource list -g <rg> --resource-type Microsoft.App/agents` shows 1 agent resource
  - If missing: Set `deploySreAgent = true` in `main.bicepparam` and redeploy
  - Blocker: `sre-agent-telemetry.kql` will return no results

### KQL Query Syntax Validation (Pre-Deployment)

Verify all KQL queries parse successfully **before** running them against live data:

- [ ] `docs/evidence/kql/stable/pod-lifecycle.kql` — Copy query into Log Analytics > Logs query editor, verify no syntax errors
- [ ] `docs/evidence/kql/stable/alert-history.kql` — Verify no syntax errors
- [ ] `docs/evidence/kql/stable/activity-log-rbac.kql` — Verify no syntax errors
- [ ] `docs/evidence/kql/schema-tbd/sre-agent-telemetry.kql` — Verify no syntax errors (ignore SCHEMA_TBD warnings)
- [ ] `docs/evidence/kql/stable/scenario-oom-killed.kql` — Verify no syntax errors
- [ ] `docs/evidence/kql/stable/scenario-mongodb-down.kql` — Verify no syntax errors
- [ ] `docs/evidence/kql/stable/scenario-service-mismatch.kql` — Verify no syntax errors

**Pass criteria:** All queries show "Query is valid" (green checkmark) in query editor
**Fail criteria:** Any query shows parse errors (red underline) — fix syntax before proceeding

### KQL Query Execution Validation (Post-Deployment, Healthy State)

Run each query in Log Analytics workspace with **no scenarios injected** (healthy baseline):

- [ ] `pod-lifecycle.kql` — Returns 6-8 pods in "energy" namespace, all with Status="Running", Restarts=0, HasFailures=false
  - If no results: Container Insights is not enabled or namespace is incorrect
- [ ] `alert-history.kql` — Returns 0 results in healthy state or prior alert activity if the workspace already has alert records
  - Expected: 0 fired alerts (healthy baseline)
  - If parsing error: Fix query syntax before proceeding
- [ ] `activity-log-rbac.kql` — Returns RBAC role assignment operations from deployment (SRE Agent managed identity, user roles)
  - Expected: 3-5 role assignment operations in last 24h (from deployment)
  - If 0 results: Activity Log export may not be deployed yet, records may not have ingested, or there were no role assignment operations in the query window
- [ ] `sre-agent-telemetry.kql` — Returns 0 results (no SRE Agent conversations yet) OR returns telemetry if test prompt was submitted
  - Expected: 0 results until first SRE Agent conversation
  - If parsing error: SRE Agent App Insights connection issue

**Scenario queries should show healthy baseline evidence:**

- [ ] `scenario-oom-killed.kql` — 0 OOMKilled events (healthy baseline)
- [ ] `scenario-mongodb-down.kql` — MongoDB pod observations match healthy baseline, service object observations are present, dependent service errors=0
- [ ] `scenario-service-mismatch.kql` — Meter Service Pods=1/1, service object observations are present, client connection errors=0

**Pass criteria:** All queries execute without errors; results match expected healthy baseline
**Fail criteria:** Queries fail to execute OR results indicate scenario is already active (should not be — no scenarios injected yet)

### SRE Agent Telemetry Schema Verification (SCHEMA_TBD)

Verify SRE Agent App Insights telemetry schema and document observed fields:

- [ ] Open SRE Agent portal: `az resource show --ids <agent-resource-id> --query properties.agentPortalUrl -o tsv`
- [ ] Submit test prompt: "Show me pods in the energy namespace"
- [ ] Wait 2-5 minutes for telemetry ingestion
- [ ] Run exploratory query in Log Analytics:
  ```kql
  traces
  | where timestamp > ago(10m)
  | where cloud_RoleName contains "sre-agent" or customDimensions has "sre.agent"
  | project timestamp, message, severityLevel, cloud_RoleName, customDimensions
  | take 10
  ```
- [ ] **Document observed field names** in `docs/evidence/kql/README.md` under "Observed SRE Agent Telemetry Fields (SCHEMA_TBD)"
  - Record: API version (`2025-05-01-preview`), date observed, field name, type, purpose
  - Example: `customDimensions["sre.agent.conversationId"]`, string, "Unique conversation session ID"
- [ ] Update `sre-agent-telemetry.kql` if field names differ from expected
- [ ] Keep `// SCHEMA_TBD` comments in place until GA schema is confirmed

**Pass criteria:** Telemetry appears in Log Analytics within 5 minutes; field names documented
**Fail criteria:** No telemetry after 10 minutes (check App Insights connection in `sre-agent.bicep`)

### Evidence Capture Verification

Verify evidence folder structure and file paths:

- [ ] All scenario folders exist: `docs/evidence/scenarios/{oom-killed,crash-loop,mongodb-down,service-mismatch,...}`
- [ ] Each folder has placeholder `README.md` or `run-notes.md` template
- [ ] KQL query files exist: `docs/evidence/kql/stable/*.kql` (6 files) and `docs/evidence/kql/schema-tbd/*.kql` (1 file)
- [ ] KQL README.md is updated with usage, parameters, Preview caveats
- [ ] Screenshot folder exists: `docs/evidence/screenshots/`
- [ ] Diagrams folder exists: `docs/evidence/diagrams/`

### Metadata Validation

Run scenario metadata validation script:

- [ ] `.\scripts\validate-scenario-metadata.ps1` — No errors, all 10 scenarios pass validation
  - Validates: scenario-manifest.yaml schema, K8s manifest file paths, fix commands
  - Pass criteria: Script exits 0, no validation errors
  - Fail criteria: Script exits non-zero OR reports missing files/invalid metadata

### Documentation Cross-Reference Validation

Verify all doc-to-doc links resolve:

- [ ] `docs/evidence/README.md` — All relative links resolve (no 404s)
- [ ] `docs/evidence/kql/README.md` — All relative links resolve
- [ ] `docs/CAPABILITY-CONTRACTS.md` — All section references are valid (§1–§16)
- [ ] `docs/DEMO-RUNBOOK.md` — All relative links resolve

**Validation command:**
```bash
# Check for broken links (requires markdown-link-check or manual verification)
find docs/ -name "*.md" -exec echo "Checking {}" \; -exec grep -E '\[.*\]\(.*\.md.*\)' {} \;
```

### Wave 1 UAT Gate Criteria

All of the following must be true to proceed to Wave 2 scenario validation:

- [ ] **All infrastructure prerequisites deployed** (Activity Log export, alerts, Log Analytics 90-day retention, SRE Agent)
- [ ] **All KQL queries parse without syntax errors**
- [ ] **All KQL queries execute in healthy baseline** (no scenarios injected) and return expected results
- [ ] **SRE Agent telemetry schema documented** (SCHEMA_TBD fields observed and recorded)
- [ ] **Scenario metadata validation passes** (all 10 scenarios have valid metadata)
- [ ] **Documentation cross-references validated** (no broken links)
- [ ] **Evidence folder structure exists** (screenshots/, kql/, scenarios/, diagrams/)

### Wave 1 Blockers (Must Fix Before Wave 2)

If any of these are missing, **do not proceed to Wave 2 scenario validation:**

1. **Activity Log diagnostic export not deployed or not ingesting** — Redeploy Wave 1 Bicep and verify the subscription diagnostic setting
   - Impact: Cannot query exported RBAC operations or alert firing history from Log Analytics
   - Affected queries: `alert-history.kql`, `activity-log-rbac.kql`

2. **Alerts not deployed** — Verify `deployAlerts = true` and redeploy Wave 1 Bicep
   - Impact: Cannot capture alert firing timestamps (T1 in MTTR timeline)
   - Affected queries: `alert-history.kql`

3. **SRE Agent not deployed** — Set `deploySreAgent = true` in Bicep parameters
   - Impact: Cannot verify SRE Agent diagnosis capability (entire demo fails)
   - Affected queries: `sre-agent-telemetry.kql`

4. **Container Insights not enabled** — Enable via `az aks enable-addons --addons monitoring`
   - Impact: No pod lifecycle data, no events, no scenario verification
   - Affected queries: All scenario-*.kql queries, `pod-lifecycle.kql`

### Wave 1 Non-Blockers (Can Defer to Later Waves)

These are known gaps but do not block Wave 2 scenario validation:

- SRE Agent telemetry field names differ from expected — Update queries after documentation
- Alert custom properties incomplete — Current alerts work, enhancements are Wave 1+

---

## Wave 1 UAT Sign-Off

Completed by: _______________
Date: _______________
Blockers resolved: ☐ Yes ☐ No (list blockers below)
Ready for Wave 2 scenario validation: ☐ Yes ☐ No

**Notes:**
