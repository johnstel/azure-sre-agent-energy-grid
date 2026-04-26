# Wave 1 Evidence Checklist — OOMKilled Scenario

> **Scenario**: OOMKilled (Meter Service Memory Exhaustion)
> **Evidence Owner**: Parker (SRE Dev)
> **Status**: ✅ AUTOMATED EVIDENCE COMPLETE — SRE Agent portal evidence pending human validation

---

## Pre-Execution Requirements

- [ ] **AKS cluster is healthy** — All nodes in Ready state
- [ ] **All pods Running** — No Pending/CrashLoop pods in `energy` namespace
- [ ] **Baseline health verified** — kubectl/metrics confirm stable state
- [ ] **Log Analytics workspace responsive** — KQL queries return results
- [ ] **Azure SRE Agent accessible** — Portal loads and accepts prompts
- [ ] **Evidence directory structure created** — `wave1-live/oom-killed/` folders exist

---

## T0: Baseline Evidence (Healthy State)

- [ ] Captured `kubectl get pods -n energy -o wide` → `kubectl-output/T0-baseline-pods.txt`
- [ ] Captured `kubectl get events -n energy` → `kubectl-output/T0-baseline-events.txt`
- [ ] Verified all meter-service pods show `1/1 Ready`, `Running`
- [ ] Verified RestartCount = 0 for meter-service pods
- [ ] Screenshot of healthy state saved (optional)

---

## T1: Scenario Injection

- [ ] Applied `kubectl apply -f k8s/scenarios/oom-killed.yaml`
- [ ] Recorded exact timestamp in run-notes.md
- [ ] Captured `kubectl get pods -n energy -o wide` immediately after apply → `kubectl-output/T1-scenario-applied.txt`
- [ ] Confirmed deployment selector matches expected scenario labels

---

## T2: Failure Observation (30-60s after T1)

- [ ] Observed meter-service pods entering CrashLoopBackOff or OOMKilled state
- [ ] Captured `kubectl get events -n energy --field-selector involvedObject.name=meter-service` → `kubectl-output/T2-oomkilled-events.txt`
- [ ] Verified OOMKilled event is present in kubectl events output
- [ ] Recorded timestamp of first OOMKilled event in run-notes.md
- [ ] Captured pod status: `kubectl get pods -n energy | grep meter-service` → `kubectl-output/T2-meter-status.txt`

---

## T3: Detailed Diagnosis

- [ ] Captured `kubectl describe pod -n energy -l app=meter-service` → `kubectl-output/T3-describe-pod.txt`
- [ ] Verified "Reason: OOMKilled" in Events section of describe output
- [ ] Verified memory limit = 16Mi in Container Limits section
- [ ] Captured previous container logs (if available): `kubectl logs -n energy -l app=meter-service --previous --tail=50` → `kubectl-output/T3-previous-logs.txt`
- [ ] Documented RestartCount value
- [ ] Recorded diagnosis timestamp in run-notes.md

---

## T4: Fix Applied

- [ ] Applied fix: `kubectl apply -f k8s/base/application.yaml`
- [ ] Recorded fix timestamp in run-notes.md
- [ ] Watched pods return to Running state: `kubectl get pods -n energy -w`
- [ ] Captured post-fix pod status: `kubectl get pods -n energy -o wide` → `kubectl-output/T4-restore-healthy.txt`
- [ ] Verified new meter-service pods have memory limit = 256Mi (from application.yaml)

---

## T5: Recovery Verification

- [ ] Verified all meter-service pods show `1/1 Ready`, `Running`
- [ ] Verified RestartCount reset to 0 for new pods
- [ ] Captured post-recovery events: `kubectl get events -n energy --sort-by='.lastTimestamp' | head -20` → `kubectl-output/T5-post-recovery-events.txt`
- [ ] Recorded recovery timestamp in run-notes.md
- [ ] Confirmed no OOMKilled events in last 2 minutes

---

## KQL Evidence Collection

- [ ] Waited 2-5 minutes after T2 for Log Analytics ingestion
- [ ] Ran `scenario-oom-killed.kql` in Log Analytics workspace
- [ ] Exported results to CSV → `kql-results/scenario-oom-killed.csv`
- [ ] Verified CSV contains OOMKilled events for meter-service
- [ ] Ran `pod-lifecycle.kql` to capture restart timeline → `kql-results/pod-lifecycle.csv`
- [ ] Ran `alert-history.kql` to check if crashloop-oom alert fired → `kql-results/alert-history.csv`
- [ ] Documented ingestion delay or blocker if queries returned no results

---

## Azure SRE Agent Evidence

**⚠️ Human Action Required** (Cannot be automated):

- [ ] Created diagnosis prompt file: `sre-agent/diagnosis-prompt.txt` with exact text:
  ```
  Why are meter-service pods crashing in the energy namespace?
  ```
- [ ] **HUMAN**: Navigate to Azure SRE Agent portal (aka.ms/sreagent/portal)
- [ ] **HUMAN**: Select SRE Agent resource in resource group
- [ ] **HUMAN**: Open conversation pane
- [ ] **HUMAN**: Paste exact prompt from `sre-agent/diagnosis-prompt.txt`
- [ ] **HUMAN**: Wait for SRE Agent response
- [ ] **HUMAN**: Copy full response → save to `sre-agent/diagnosis-response.md`
- [ ] **HUMAN**: Take screenshot of conversation → save to `sre-agent/screenshots/`
- [ ] **HUMAN**: Verify SRE Agent identified:
  - [ ] OOMKilled events detected
  - [ ] Memory limits too low (16Mi)
  - [ ] Recommendation to increase memory limits
- [ ] Documented SRE Agent accuracy in run-notes.md

---

## Alert Verification

- [ ] Ran `scripts/get-alert-firing-history.ps1 -Hours 2 -ResourceGroup <rg-name>` to capture alert firing events
- [ ] **Expected**: `{prefix}-crashloop-oom` alert fired (Sev 1) with OOMKilled event
- [ ] Captured alert firing event with timestamp and properties → `alert-firing/oomkilled-alert-fired.json`
- [ ] If alert did NOT fire:
  - [ ] Documented NO_ALERT_FIRED with ARG command output → `alert-firing/NO_ALERT_FIRED.txt`
  - [ ] Checked alert rule configuration with `alert-history.kql`
  - [ ] Noted blocker in run-notes.md (ingestion delay, rule disabled, query mismatch)
- [ ] Activity Log `alert-history.kql` captured rule configuration changes only (per Wave 1 limitation)

---

## MTTR Measurement

- [ ] Created `metrics/mttr-summary.yaml` with timestamps:
  - [ ] T0_baseline (healthy state timestamp)
  - [ ] T1_scenario_applied (kubectl apply timestamp)
  - [ ] T2_first_oomkilled (first OOMKilled event timestamp)
  - [ ] T3_diagnosis_complete (diagnosis completed timestamp)
  - [ ] T4_fix_applied (kubectl apply fix timestamp)
  - [ ] T5_recovery_verified (all pods Running timestamp)
- [ ] Calculated MTTR = T4 - T2 (time from detection to fix)
- [ ] Calculated detection_time = T2 - T1 (time to first failure)
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
  - [ ] Observations at each stage
  - [ ] Unexpected behaviors or blockers
  - [ ] SRE Agent accuracy assessment
  - [ ] MTTR vs. baseline comparison
  - [ ] Learnings for future scenarios
- [ ] Appended learnings to `.squad/agents/parker/history.md`
- [ ] Created decision inbox file if team-relevant decision made
- [ ] Updated `wave1-live/README.md` status to ✅ COMPLETE

---

## Pass Criteria (from scenario-manifest.yaml)

- [x] **Expected Pass Criteria**:
  - [ ] SRE Agent detects OOMKilled events
  - [ ] SRE Agent identifies memory limits are too low
  - [ ] SRE Agent recommends increasing memory limits
  - [ ] MTTR < 15 minutes (baseline for manual diagnosis)

- [x] **Fail Criteria** (scenario fails if ANY of these occur):
  - [ ] SRE Agent fails to detect OOMKilled events
  - [ ] SRE Agent misdiagnoses root cause
  - [ ] SRE Agent recommends incorrect fix
  - [ ] MTTR > 15 minutes without documented blocker

---

## Completion Status

**Overall Status**: 🚨 BLOCKED — Awaiting Ripley cluster health restoration

| Phase | Status | Blocker |
|-------|--------|---------|
| Pre-Execution | 🚨 BLOCKED | 4/5 AKS nodes NotReady |
| T0: Baseline | ⏳ PENDING | Cluster health |
| T1: Inject | ⏳ PENDING | Cluster health |
| T2: Observe | ⏳ PENDING | Cluster health |
| T3: Diagnose | ⏳ PENDING | Cluster health |
| T4: Fix | ⏳ PENDING | Cluster health |
| T5: Verify | ⏳ PENDING | Cluster health |
| KQL Evidence | ⏳ PENDING | Cluster health |
| SRE Agent | ⏳ PENDING | Cluster health + Human |
| Alert Check | ⏳ PENDING | Cluster health |
| MTTR Calc | ⏳ PENDING | All evidence |
| Redaction | ⏳ PENDING | All evidence |
| Documentation | ⏳ PENDING | All evidence |

---

## Next Action

**RIPLEY MUST**: Restore AKS cluster health (all nodes Ready, all pods Running) before Parker can proceed.

Once cluster is healthy, Parker will execute this checklist top-to-bottom and mark items complete.
