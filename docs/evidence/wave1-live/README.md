# Wave 1 Live UAT Evidence Package

> **Status**: In Progress
> **UAT Lead**: Lambert (QA/Docs)
> **Target Completion**: Post-deployment verification
> **Purpose**: Close out Wave 1 with complete evidence set for live Azure deployment

---

## Overview

Wave 1 focuses on **live UAT validation** of the Energy Grid SRE Agent demo lab in a real Azure environment. This package captures:

1. **Deployment success** (infrastructure provisioned, AKS cluster healthy, all services running)
2. **Observability stack** (Container Insights, 90-day retention, Activity Log export configured)
3. **Alert configuration** (four production alerts: OOMKilled, CrashLoop, PodPending, HighCPU)
4. **KQL execution** (all parameterised queries run successfully against live environment)
5. **SRE Agent portal** (accessible, test prompt result captured exactly as shown, agent identity verified)
6. **End-to-end scenario** (OOMKilled cycle: inject → alert → ask for diagnosis → operator remediates → recover)

---

## Evidence Checklist

### 1. Deployment Evidence

- [ ] **Deployment log** — `deploy.ps1` output showing success (save as `deployment-log.txt`)
- [ ] **Resource list** — `az resource list --resource-group <rg-name> -o table` output (save as `resources.txt`)
- [ ] **Validation output** — `validate-deployment.ps1` showing all checks pass (save as `validation-output.txt`)
- [ ] **Screenshot: Azure Portal resource overview** — shows all deployed resources (save as `screenshots/portal-resources.png`)

**Expected resources (minimum):**
- AKS cluster (`aks-srelab`)
- Container registry (`acrsrelab<random>`)
- Key Vault (`kv-srelab-<random>`)
- Log Analytics workspace (`log-srelab`)
- Application Insights (`appi-srelab`)
- Managed Grafana (`grafana-srelab`)
- SRE Agent (`sreagent-energy-<random>`)
- VNet, subnets, NSG
- Managed Identity (AKS workload identity)

---

### 2. AKS Health Evidence

- [ ] **Node status** — `kubectl get nodes -o wide` (save as `aks-nodes.txt`)
- [ ] **Pod status** — `kubectl get pods -n energy -o wide` showing all Running/Ready (save as `aks-pods-healthy.txt`)
- [ ] **Services** — `kubectl get svc -n energy` showing LoadBalancer external IPs assigned (save as `aks-services.txt`)
- [ ] **ConfigMaps** — `kubectl get cm -n energy` showing embedded nginx configs (save as `aks-configmaps.txt`)
- [ ] **Events** — `kubectl get events -n energy --sort-by='.lastTimestamp' | head -30` showing no errors (save as `aks-events-healthy.txt`)
- [ ] **Screenshot: kubectl pod status** (save as `screenshots/kubectl-pods-healthy.png`)

---

### 3. Container Insights & Retention Evidence

- [ ] **Container Insights enabled** — Verify in Portal: AKS → Insights shows live data
- [ ] **Log Analytics retention** — Verify workspace retention set to **90 days**:
  ```bash
  az monitor log-analytics workspace show \
    --resource-group <rg-name> \
    --workspace-name log-srelab \
    --query retentionInDays
  ```
  (Expected output: `90`)
- [ ] **Screenshot: Container Insights dashboard** — showing pod CPU/memory metrics (save as `screenshots/container-insights.png`)
- [ ] **Screenshot: Log Analytics workspace retention** — Portal view showing 90-day retention (save as `screenshots/log-retention.png`)

---

### 4. Activity Log Export Evidence

- [ ] **Diagnostic settings configured** — Verify Activity Log export to Log Analytics:
  ```bash
  az monitor diagnostic-settings subscription list --subscription <sub-id>
  ```
  (Expected: diagnostic setting routing Activity Log to `log-srelab`)
- [ ] **Screenshot: Activity Log diagnostic settings** — Portal view showing export to Log Analytics (save as `screenshots/activity-log-export.png`)

---

### 5. Alert Configuration Evidence

**Four alerts deployed:**
1. `alert-oom-killed` — OOMKilled container events
2. `alert-crash-loop` — CrashLoopBackOff containers
3. `alert-pod-pending` — Pods stuck in Pending state
4. `alert-high-cpu` — High CPU usage

**Evidence required:**

- [ ] **Alert list** — `az monitor metrics alert list --resource-group <rg-name> -o table` (save as `alerts-list.txt`)
- [ ] **Alert details** — For each alert, capture configuration:
  ```bash
  az monitor metrics alert show --resource-group <rg-name> --name alert-oom-killed
  ```
  (Save as `alert-oom-killed.json`, `alert-crash-loop.json`, `alert-pod-pending.json`, `alert-high-cpu.json`)
- [ ] **Screenshot: Portal alerts overview** — showing all four alerts (save as `screenshots/alerts-portal.png`)

---

### 6. KQL Execution Evidence

**Baseline KQL queries from `docs/evidence/kql/` must execute successfully.**

Run each query against Log Analytics workspace and verify:
- No syntax errors
- Returns results (or empty result set if no events yet)
- Parameters work correctly (`sre_scenario`, `sre_namespace`)

**Queries to test:**

- [ ] `oom-killed_diagnosis.kql` — (save output as `kql-output/oom-killed_diagnosis.txt`)
- [ ] `crash-loop_diagnosis.kql` — (save output as `kql-output/crash-loop_diagnosis.txt`)
- [ ] `pending-pods_diagnosis.kql` — (save output as `kql-output/pending-pods_diagnosis.txt`)
- [ ] `high-cpu_diagnosis.kql` — (save output as `kql-output/high-cpu_diagnosis.txt`)

**If queries don't exist yet:** Mark as `BLOCKED — Query not authored`. This is expected for Wave 1 (KQL authoring is Wave 2+).

**Screenshot required:**

- [ ] **Screenshot: KQL query execution in Portal** — showing a query running successfully (save as `screenshots/kql-execution.png`)

---

### 7. SRE Agent Portal Evidence

- [ ] **SRE Agent URL** — Record the agent portal URL (format: `https://<agent-id>.azuresre.ai` or Portal blade URL)
- [ ] **Screenshot: SRE Agent portal** — showing conversation interface (save as `screenshots/sre-agent-portal.png`)
- [ ] **Test prompt** — Submit a simple diagnostic prompt and capture the response exactly as shown:
  - Prompt: `"Show me the health status of my AKS cluster"`
  - Do not pre-script or paraphrase the response; record whether the portal returns a useful cluster-health summary.
  - **Screenshot: SRE Agent response** (save as `screenshots/sre-agent-test-prompt.png`)
- [ ] **Agent identity verification** — Verify agent resource exists:
  ```bash
  az resource show --ids <agent-resource-id>
  ```
  (Save as `sre-agent-identity.json`)

---

### 8. End-to-End Scenario: OOMKilled Cycle

**This is the primary UAT gate for Wave 1.**

Run the full OOMKilled scenario from injection to recovery and capture complete evidence.

#### 8a. Pre-Injection Baseline

- [ ] **T0 — Healthy baseline** — `kubectl get pods -n energy` showing all Running (save as `scenario/oom-killed/T0-baseline.txt`)
- [ ] **Screenshot: T0 baseline** (save as `screenshots/oom-killed-T0-baseline.png`)

#### 8b. Inject Failure

- [ ] **Inject scenario** — `kubectl apply -f k8s/scenarios/oom-killed.yaml`
- [ ] **T1 — Failure manifests** — Wait ~30s, capture failing pod state (save as `scenario/oom-killed/T1-failure.txt`)
- [ ] **Screenshot: T1 failure state** — kubectl showing OOMKilled pod (save as `screenshots/oom-killed-T1-failure.png`)

#### 8c. Alert Detection

- [ ] **T1b — Alert fires** — Verify alert `alert-oom-killed` fires (check Portal or alert webhook)
- [ ] **Screenshot: Alert fired** — Portal showing active alert (save as `screenshots/oom-killed-alert-fired.png`)

#### 8d. SRE Agent Diagnosis

- [ ] **T2 — Operator submits prompt** — In SRE Agent portal, submit:
  - Prompt: `"Why is the meter-service pod crashing in the energy namespace?"`
- [ ] **T3 — Diagnosis received** — Capture what SRE Agent returns. The scenario-under-test root cause is memory pressure/OOMKilled events; do not claim the agent found it unless the portal output shows that.
- [ ] **Screenshot: T3 diagnosis** — Real SRE Agent portal output only (save as `screenshots/oom-killed-T3-diagnosis.png`)
- [ ] **Save conversation transcript** (copy/paste into `scenario/oom-killed/sre-agent-conversation.txt`)

#### 8e. Remediation

- [ ] **T4 — Fix applied** — Restore healthy state:
  ```bash
  kubectl apply -f k8s/base/application.yaml
  ```
- [ ] **T5 — Service healthy** — Wait ~30s, verify all pods Running/Ready (save as `scenario/oom-killed/T5-recovered.txt`)
- [ ] **Screenshot: T5 recovered** (save as `screenshots/oom-killed-T5-recovered.png`)

#### 8f. MTTR Calculation

- [ ] **Record all timestamps** in `scenario/oom-killed/run-notes.md`:
  - T0 — Baseline healthy
  - T1 — Failure injected
  - T1b — Alert detected
  - T2 — SRE Agent prompt submitted
  - T3 — Diagnosis received
  - T4 — Remediation applied
  - T5 — Service healthy
- [ ] **Calculate MTTR** — (T5 − T1) in minutes
- [ ] **Calculate agent diagnosis time** — (T3 − T2) in seconds

---

### 9. Run Notes & Metadata

- [ ] **`scenario/oom-killed/run-notes.md`** — Completed template from `docs/evidence/README.md` with all timestamps, screenshots, and pass/fail assessment
- [ ] **`wave1-uat-summary.md`** — High-level summary: what passed, what blocked, what deferred to Wave 2
- [ ] **Operator notes** — Any blockers, workarounds, or observations for Wave 2 planning

---

## Deliverables (File Structure)

```
docs/evidence/wave1-live/
├── README.md (this file)
├── deployment-log.txt
├── resources.txt
├── validation-output.txt
├── aks-nodes.txt
├── aks-pods-healthy.txt
├── aks-services.txt
├── aks-configmaps.txt
├── aks-events-healthy.txt
├── alerts-list.txt
├── alert-oom-killed.json
├── alert-crash-loop.json
├── alert-pod-pending.json
├── alert-high-cpu.json
├── sre-agent-identity.json
├── wave1-uat-summary.md
├── screenshots/
│   ├── portal-resources.png
│   ├── kubectl-pods-healthy.png
│   ├── container-insights.png
│   ├── log-retention.png
│   ├── activity-log-export.png
│   ├── alerts-portal.png
│   ├── kql-execution.png
│   ├── sre-agent-portal.png
│   ├── sre-agent-test-prompt.png
│   ├── oom-killed-T0-baseline.png
│   ├── oom-killed-T1-failure.png
│   ├── oom-killed-alert-fired.png
│   ├── oom-killed-T3-diagnosis.png
│   └── oom-killed-T5-recovered.png
├── kql-output/
│   ├── oom-killed_diagnosis.txt
│   ├── crash-loop_diagnosis.txt
│   ├── pending-pods_diagnosis.txt
│   └── high-cpu_diagnosis.txt
└── scenario/
    └── oom-killed/
        ├── run-notes.md
        ├── T0-baseline.txt
        ├── T1-failure.txt
        ├── T5-recovered.txt
        └── sre-agent-conversation.txt
```

---

## Pass Criteria

Wave 1 UAT **PASSES** if:

1. ✅ All Azure resources deploy successfully
2. ✅ AKS cluster is healthy with all pods Running/Ready
3. ✅ Container Insights enabled, 90-day retention confirmed
4. ✅ Activity Log export configured
5. ✅ Four alerts exist in Azure (OOMKilled, CrashLoop, PodPending, HighCPU)
6. ✅ At least one KQL query executes without syntax error (even if empty result)
7. ✅ SRE Agent portal is accessible and responds to test prompt
8. ✅ OOMKilled end-to-end scenario completes: inject → diagnose → remediate → recover
9. ✅ All required screenshots and logs captured
10. ✅ `run-notes.md` completed with MTTR timestamps

**Partial Pass** (proceed to Wave 2 with caveats):
- Deployment passes but one alert fails to create → document in `wave1-uat-summary.md`, flag for Wave 2 fix
- KQL queries not authored yet → mark as `DEFERRED — Wave 2 KQL authoring sprint`

**Fail** (do not proceed):
- AKS cluster unhealthy (pods CrashLooping, ImagePullBackOff)
- SRE Agent not accessible or does not respond
- OOMKilled scenario does not reproduce expected symptoms

---

## Status

**Current State**: Checklist created, evidence capture NOT started.

**Next Steps**:
1. Operator deploys infrastructure to Azure (follow `docs/DEMO-RUNBOOK.md`)
2. Operator completes checklist above
3. Lambert reviews evidence for completeness and quality
4. Dallas gates Wave 2 launch based on UAT outcome

---

## Related Docs

- [docs/DEMO-RUNBOOK.md](../../DEMO-RUNBOOK.md) — Step-by-step deployment and demo guide
- [docs/evidence/README.md](../README.md) — Evidence library conventions
- [docs/evidence/scenarios/README.md](../scenarios/README.md) — Scenario-specific evidence structure
- [docs/CAPABILITY-CONTRACTS.md](../../CAPABILITY-CONTRACTS.md) — SRE Agent capability contracts
- [docs/COSTS.md](../../COSTS.md) — Cost breakdown for budgeting
