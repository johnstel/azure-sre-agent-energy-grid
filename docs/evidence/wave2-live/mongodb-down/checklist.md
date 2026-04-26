# Wave 2 Evidence Checklist — MongoDBDown Scenario

> **Scenario**: MongoDBDown (Meter Database Outage — Cascading Failure)
> **Evidence Owner**: Parker (SRE Dev)
> **Status**: ⏳ PENDING — Awaiting infrastructure readiness

---

## Pre-Execution Requirements

- [ ] **AKS cluster is healthy** — All nodes in Ready state
- [ ] **All pods Running** — No Pending/CrashLoop pods in `energy` namespace
- [ ] **Baseline health verified** — kubectl/metrics confirm stable state, MongoDB operational
- [ ] **Log Analytics workspace responsive** — KQL queries return results
- [ ] **Azure SRE Agent accessible** — Portal loads and accepts prompts
- [ ] **Evidence directory structure created** — `wave2-live/mongodb-down/` folders exist

---

## T0: Baseline Evidence (Healthy State)

- [ ] Captured `kubectl get pods -n energy -o wide` → `kubectl-output/T0-baseline-pods.txt`
- [ ] Captured `kubectl get events -n energy` → `kubectl-output/T0-baseline-events.txt`
- [ ] Verified mongodb pod shows `1/1 Ready`, `Running`
- [ ] Verified all dependent services (meter-service, asset-service) are healthy
- [ ] Captured service endpoint status: `kubectl get endpoints -n energy` → `kubectl-output/T0-baseline-endpoints.txt`

---

## T1: Scenario Injection

- [ ] Applied `kubectl apply -f k8s/scenarios/mongodb-down.yaml`
- [ ] Recorded exact timestamp in run-notes.md
- [ ] Captured `kubectl get pods -n energy -o wide` immediately after apply → `kubectl-output/T1-scenario-applied.txt`
- [ ] Confirmed mongodb deployment selector updated (readiness probe failure or replica set to 0)

---

## T2: Failure Observation (30-90s after T1 — Cascading)

- [ ] Observed mongodb pod entering Terminating or NotReady state
- [ ] Captured cascading failures in dependent services: `kubectl get pods -n energy -w` → `kubectl-output/T2-cascading-failures.txt`
- [ ] Verified meter-service/asset-service pods show CrashLoopBackOff or connection errors
- [ ] Captured events showing dependency failure: `kubectl get events -n energy --sort-by='.lastTimestamp' | head -30` → `kubectl-output/T2-cascading-events.txt`
- [ ] Recorded timestamp of first mongodb failure and first dependent service failure in run-notes.md

---

## T3: Detailed Diagnosis

- [ ] Captured `kubectl describe pod -n energy -l app=mongodb` → `kubectl-output/T3-describe-mongodb.txt`
- [ ] Captured `kubectl describe pod -n energy -l app=meter-service` → `kubectl-output/T3-describe-meter-service.txt`
- [ ] Verified "Back-off restarting failed container" or connection timeout in dependent service logs
- [ ] Captured previous container logs for meter-service: `kubectl logs -n energy -l app=meter-service --previous --tail=100` → `kubectl-output/T3-meter-service-logs.txt`
- [ ] Documented dependency chain: mongodb → meter-service → billing events
- [ ] Recorded diagnosis timestamp in run-notes.md

---

## T4: Fix Applied

- [ ] Applied fix: `kubectl apply -f k8s/base/application.yaml`
- [ ] Recorded fix timestamp in run-notes.md
- [ ] Watched pods return to Running state: `kubectl get pods -n energy -w`
- [ ] Captured post-fix pod status: `kubectl get pods -n energy -o wide` → `kubectl-output/T4-restore-healthy.txt`
- [ ] Verified mongodb pod is Running and Ready
- [ ] Verified dependent services recovered after mongodb healthy

---

## T5: Recovery Verification

- [ ] Verified all pods in energy namespace show `1/1 Ready`, `Running`
- [ ] Verified mongodb accepts connections (check meter-service logs for successful connections)
- [ ] Captured post-recovery events: `kubectl get events -n energy --sort-by='.lastTimestamp' | head -20` → `kubectl-output/T5-post-recovery-events.txt`
- [ ] Recorded recovery timestamp in run-notes.md
- [ ] Confirmed no CrashLoopBackOff events in last 2 minutes

---

## KQL Evidence Collection

- [ ] Waited 2-5 minutes after T2 for Log Analytics ingestion
- [ ] Ran `scenario-mongodb-down.kql` in Log Analytics workspace (or adapted from pod-lifecycle)
- [ ] Exported results to JSON → `kql-results/scenario-mongodb-down.json`
- [ ] Verified results contain mongodb pod state changes and dependent service restarts
- [ ] Ran `pod-lifecycle.kql` to capture full cascade timeline → `kql-results/pod-lifecycle.json`
- [ ] Ran `alert-history.kql` to check if any alerts fired → `kql-results/alert-history.json`
- [ ] Documented ingestion delay or blocker if queries returned no results

---

## Alert Verification (via Azure Resource Graph)

- [ ] Ran `scripts/get-alert-firing-history.ps1 -Hours 2 -ResourceGroup <rg-name>` to capture alert firing events
- [ ] **Expected**: Possibly `{prefix}-http-5xx` alert (Sev 1) if downstream services emit 5xx errors, OR NO_ALERT_FIRED (MongoDBDown has no dedicated baseline alert)
- [ ] If alert fired: Captured firing event with timestamp and properties → `alert-firing/mongodb-down-alert-fired.json`
- [ ] If NO alert fired: Documented NO_ALERT_FIRED with ARG command output → `alert-firing/NO_ALERT_FIRED.txt`
- [ ] Activity Log `alert-history.kql` captured rule configuration changes only (per Wave 1 limitation)
- [ ] Noted alert correlation (or lack thereof) in run-notes.md

---

## Azure SRE Agent Evidence

**⚠️ Human Action Required** (Cannot be automated):

- [ ] Created diagnosis prompt file: `sre-agent/diagnosis-prompt.txt` with exact text:
  ```
  Why are meter-service pods crashing in the energy namespace? MongoDB appears to be down.
  ```
- [ ] **HUMAN**: Navigate to Azure SRE Agent portal (aka.ms/sreagent/portal)
- [ ] **HUMAN**: Select SRE Agent resource in resource group
- [ ] **HUMAN**: Open conversation pane
- [ ] **HUMAN**: Paste exact prompt from `sre-agent/diagnosis-prompt.txt`
- [ ] **HUMAN**: Wait for SRE Agent response
- [ ] **HUMAN**: Copy full response → save to `sre-agent/diagnosis-response.md`
- [ ] **HUMAN**: Take screenshot of conversation → save to `sre-agent/screenshots/`
- [ ] **HUMAN**: Verify SRE Agent identified:
  - [ ] Cascading failure pattern detected
  - [ ] MongoDB as root cause identified
  - [ ] Dependency chain traced (mongodb → meter-service)
  - [ ] Recommendation to restore mongodb or check database connectivity
- [ ] Documented SRE Agent accuracy in run-notes.md

---

## MTTR Measurement

- [ ] Created `metrics/mttr-summary.yaml` with timestamps:
  - [ ] T0_baseline (healthy state timestamp)
  - [ ] T1_scenario_applied (kubectl apply timestamp)
  - [ ] T2_first_failure (first mongodb failure timestamp)
  - [ ] T2_cascade_start (first dependent service failure timestamp)
  - [ ] T3_diagnosis_complete (root cause identified timestamp)
  - [ ] T4_fix_applied (kubectl apply fix timestamp)
  - [ ] T5_recovery_verified (all pods Running timestamp)
- [ ] Calculated MTTR = T4 - T2 (time from detection to fix)
- [ ] Calculated cascade_delay = T2_cascade_start - T2_first_failure
- [ ] Calculated recovery_time = T5 - T4 (time to full recovery)
- [ ] Verified MTTR < 15 minutes (900 seconds) — pass criteria

---

## Redaction & Cleanup

- [ ] Redacted subscription IDs from all kubectl output files
- [ ] Redacted resource IDs (replaced with `<REDACTED_AKS_RESOURCE_ID>`)
- [ ] Redacted correlation IDs from KQL results
- [ ] Redacted IP addresses (replaced with `<REDACTED_IP>`)
- [ ] Redacted node names (replaced with `<REDACTED_NODE>`)
- [ ] Verified no secrets or credentials in any evidence files
- [ ] Verified pod names, namespace, event reasons are NOT redacted (safe)

---

## Documentation & Learnings

- [ ] Completed `run-notes.md` with:
  - [ ] T0-T5 timeline
  - [ ] Observations at each stage (cascading failure pattern)
  - [ ] Unexpected behaviors or blockers
  - [ ] SRE Agent accuracy assessment (dependency tracing)
  - [ ] MTTR vs. baseline comparison
  - [ ] Learnings for future cascading dependency scenarios
- [ ] Appended learnings to `.squad/agents/parker/history.md`
- [ ] Created decision inbox file if team-relevant decision made
- [ ] Updated `wave2-live/README.md` status to ✅ COMPLETE

---

## Pass Criteria (from scenario-manifest.yaml)

- [x] **Expected Pass Criteria**:
  - [ ] SRE Agent detects cascading failure pattern
  - [ ] SRE Agent identifies mongodb as root cause
  - [ ] SRE Agent traces dependency chain (mongodb → meter-service)
  - [ ] MTTR < 15 minutes (baseline for manual diagnosis)
  - [ ] Cascading failure timeline documented

- [x] **Fail Criteria** (scenario fails if ANY of these occur):
  - [ ] SRE Agent fails to detect cascading pattern
  - [ ] SRE Agent misidentifies root cause (blames meter-service instead of mongodb)
  - [ ] SRE Agent recommends incorrect fix (restarts meter-service without checking mongodb)
  - [ ] MTTR > 15 minutes without documented blocker

---

## Completion Status

**Overall Status**: ⏳ PENDING — Awaiting Parker execution after infrastructure readiness

| Phase | Status | Blocker |
|-------|--------|---------|
| Pre-Execution | ⏳ PENDING | Infrastructure |
| T0: Baseline | ⏳ PENDING | Infrastructure |
| T1: Inject | ⏳ PENDING | Infrastructure |
| T2: Observe | ⏳ PENDING | Infrastructure |
| T3: Diagnose | ⏳ PENDING | Infrastructure |
| T4: Fix | ⏳ PENDING | Infrastructure |
| T5: Verify | ⏳ PENDING | Infrastructure |
| KQL Evidence | ⏳ PENDING | Infrastructure |
| SRE Agent | ⏳ PENDING | Human |
| MTTR Calc | ⏳ PENDING | All evidence |
| Redaction | ⏳ PENDING | All evidence |
| Documentation | ⏳ PENDING | All evidence |

---

## Next Action

**RIPLEY MUST**: Ensure AKS cluster health and Container Insights operational before Parker executes this scenario.

**PARKER THEN**: Execute this checklist top-to-bottom and mark items complete.

---

**Lambert**
QA/Docs | Wave 2 MongoDBDown Evidence Checklist
2026-04-26T05:15:00Z
