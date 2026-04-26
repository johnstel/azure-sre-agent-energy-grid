# Wave 2 Evidence Checklist — ServiceMismatch Scenario

> **Scenario**: ServiceMismatch (Meter Service Routing Failure — Silent Networking)
> **Evidence Owner**: Parker (SRE Dev)
> **Status**: ⏳ PENDING — Awaiting infrastructure readiness

---

## Pre-Execution Requirements

- [ ] **AKS cluster is healthy** — All nodes in Ready state
- [ ] **All pods Running** — No Pending/CrashLoop pods in `energy` namespace
- [ ] **Baseline health verified** — kubectl/metrics confirm stable state, all services resolving endpoints
- [ ] **Log Analytics workspace responsive** — KQL queries return results
- [ ] **Azure SRE Agent accessible** — Portal loads and accepts prompts
- [ ] **Evidence directory structure created** — `wave2-live/service-mismatch/` folders exist

---

## T0: Baseline Evidence (Healthy State)

- [ ] Captured `kubectl get pods -n energy -o wide` → `kubectl-output/T0-baseline-pods.txt`
- [ ] Captured `kubectl get svc -n energy -o wide` → `kubectl-output/T0-baseline-services.txt`
- [ ] Captured `kubectl get endpoints -n energy` → `kubectl-output/T0-baseline-endpoints.txt`
- [ ] Verified meter-service service has matching endpoints for running pods
- [ ] Verified grid-dashboard can reach meter-service (check logs for successful API calls)

---

## T1: Scenario Injection

- [ ] Applied `kubectl apply -f k8s/scenarios/service-mismatch.yaml`
- [ ] Recorded exact timestamp in run-notes.md
- [ ] Captured `kubectl get svc -n energy -o wide` immediately after apply → `kubectl-output/T1-scenario-applied-services.txt`
- [ ] Captured `kubectl get endpoints -n energy` immediately after apply → `kubectl-output/T1-scenario-applied-endpoints.txt`
- [ ] Confirmed service selector has been modified (incorrect label selector)

---

## T2: Failure Observation (30-60s after T1 — Silent Failure)

- [ ] Observed meter-service endpoints become empty or misaligned
- [ ] Captured service endpoint mismatch: `kubectl describe svc -n energy meter-service` → `kubectl-output/T2-service-describe.txt`
- [ ] Verified "Endpoints: <none>" or endpoints pointing to wrong pods
- [ ] Captured pod labels: `kubectl get pods -n energy --show-labels | grep meter-service` → `kubectl-output/T2-pod-labels.txt`
- [ ] Verified service selector does NOT match pod labels
- [ ] Captured grid-dashboard logs showing connection failures: `kubectl logs -n energy -l app=grid-dashboard --tail=50` → `kubectl-output/T2-dashboard-errors.txt`
- [ ] Recorded timestamp of first connection failure in run-notes.md

---

## T3: Detailed Diagnosis

- [ ] Captured `kubectl describe svc -n energy meter-service` → `kubectl-output/T3-describe-service.txt`
- [ ] Verified selector mismatch: Service selector vs. Pod labels
- [ ] Captured endpoint status: `kubectl get endpoints -n energy meter-service -o yaml` → `kubectl-output/T3-endpoints-yaml.txt`
- [ ] Documented selector gap (e.g., service selects `app=meter-service,version=v2` but pods only have `app=meter-service`)
- [ ] Captured network connectivity test from grid-dashboard to meter-service ClusterIP:
  ```bash
  kubectl exec -n energy deploy/grid-dashboard -- curl -s -m 5 http://meter-service:8080/health || echo "Connection failed"
  ```
  → `kubectl-output/T3-network-test.txt`
- [ ] Recorded diagnosis timestamp in run-notes.md

---

## T4: Fix Applied

- [ ] Applied fix: `kubectl apply -f k8s/base/application.yaml`
- [ ] Recorded fix timestamp in run-notes.md
- [ ] Watched endpoints repopulate: `kubectl get endpoints -n energy -w`
- [ ] Captured post-fix service status: `kubectl describe svc -n energy meter-service` → `kubectl-output/T4-restore-service.txt`
- [ ] Captured post-fix endpoints: `kubectl get endpoints -n energy meter-service` → `kubectl-output/T4-restore-endpoints.txt`
- [ ] Verified service selector matches pod labels

---

## T5: Recovery Verification

- [ ] Verified meter-service endpoints are populated with correct pod IPs
- [ ] Verified grid-dashboard can reach meter-service (check logs for successful API calls)
- [ ] Captured post-recovery events: `kubectl get events -n energy --sort-by='.lastTimestamp' | head -20` → `kubectl-output/T5-post-recovery-events.txt`
- [ ] Ran network connectivity test from grid-dashboard to meter-service:
  ```bash
  kubectl exec -n energy deploy/grid-dashboard -- curl -s -m 5 http://meter-service:8080/health
  ```
  → `kubectl-output/T5-network-test-success.txt`
- [ ] Recorded recovery timestamp in run-notes.md

---

## KQL Evidence Collection

- [ ] Waited 2-5 minutes after T2 for Log Analytics ingestion
- [ ] Ran `service-endpoint-tracking.kql` (or adapted from pod-lifecycle) in Log Analytics workspace
- [ ] Exported results to JSON → `kql-results/service-endpoint-tracking.json`
- [ ] Verified results contain service endpoint changes or pod connectivity events
- [ ] Ran `pod-lifecycle.kql` to check if any pods restarted (should be 0) → `kql-results/pod-lifecycle.json`
- [ ] Ran `alert-history.kql` to check if any alerts fired → `kql-results/alert-history.json`
- [ ] Documented ingestion delay or blocker if queries returned no results
- [ ] **Note**: Silent failures may not generate obvious KQL signals — endpoint mismatch is a configuration issue, not a pod crash

---

## Alert Verification (via Azure Resource Graph)

- [ ] Ran `scripts/get-alert-firing-history.ps1 -Hours 2 -ResourceGroup <rg-name>` to capture alert firing events
- [ ] **Expected**: NO_ALERT_FIRED (ServiceMismatch is a silent networking failure with no dedicated baseline alert)
- [ ] Documented NO_ALERT_FIRED with ARG command output → `alert-firing/NO_ALERT_FIRED.txt`
- [ ] Activity Log `alert-history.kql` captured rule configuration changes only (per Wave 1 limitation)
- [ ] Noted silent failure pattern (no alerts expected) in run-notes.md

---

## Azure SRE Agent Evidence

**⚠️ Human Action Required** (Cannot be automated):

- [ ] Created diagnosis prompt file: `sre-agent/diagnosis-prompt.txt` with exact text:
  ```
  The grid-dashboard cannot connect to meter-service, but all pods are running. What's wrong?
  ```
- [ ] **HUMAN**: Navigate to Azure SRE Agent portal (aka.ms/sreagent/portal)
- [ ] **HUMAN**: Select SRE Agent resource in resource group
- [ ] **HUMAN**: Open conversation pane
- [ ] **HUMAN**: Paste exact prompt from `sre-agent/diagnosis-prompt.txt`
- [ ] **HUMAN**: Wait for SRE Agent response
- [ ] **HUMAN**: Copy full response → save to `sre-agent/diagnosis-response.md`
- [ ] **HUMAN**: Take screenshot of conversation → save to `sre-agent/screenshots/`
- [ ] **HUMAN**: Verify SRE Agent identified:
  - [ ] Service selector mismatch detected
  - [ ] Endpoint resolution failure identified
  - [ ] Recommendation to check service selector vs. pod labels
  - [ ] Network connectivity issue diagnosed (not pod health)
- [ ] Documented SRE Agent accuracy in run-notes.md

---

## MTTR Measurement

- [ ] Created `metrics/mttr-summary.yaml` with timestamps:
  - [ ] T0_baseline (healthy state timestamp)
  - [ ] T1_scenario_applied (kubectl apply timestamp)
  - [ ] T2_first_failure (first connection failure timestamp)
  - [ ] T3_diagnosis_complete (selector mismatch identified timestamp)
  - [ ] T4_fix_applied (kubectl apply fix timestamp)
  - [ ] T5_recovery_verified (endpoints repopulated timestamp)
- [ ] Calculated MTTR = T4 - T2 (time from detection to fix)
- [ ] Calculated detection_time = T2 - T1 (time to first failure — should be instant for networking)
- [ ] Calculated recovery_time = T5 - T4 (time to endpoint repopulation)
- [ ] Verified MTTR < 15 minutes (900 seconds) — pass criteria
- [ ] **Note**: Silent failures may have longer detection time if monitoring is not endpoint-aware

---

## Redaction & Cleanup

- [ ] Redacted subscription IDs from all kubectl output files
- [ ] Redacted resource IDs (replaced with `<REDACTED_AKS_RESOURCE_ID>`)
- [ ] Redacted correlation IDs from KQL results
- [ ] Redacted IP addresses (replaced with `<REDACTED_IP>`)
- [ ] Redacted node names (replaced with `<REDACTED_NODE>`)
- [ ] Verified no secrets or credentials in any evidence files
- [ ] Verified pod names, namespace, service names, endpoint IPs (internal) are NOT redacted (safe)

---

## Documentation & Learnings

- [ ] Completed `run-notes.md` with:
  - [ ] T0-T5 timeline
  - [ ] Observations at each stage (silent failure pattern)
  - [ ] Unexpected behaviors or blockers
  - [ ] SRE Agent accuracy assessment (selector mismatch detection)
  - [ ] MTTR vs. baseline comparison
  - [ ] Learnings for future silent networking scenarios
  - [ ] Note: This is the hardest failure to diagnose without deep kubectl knowledge
- [ ] Appended learnings to `.squad/agents/parker/history.md`
- [ ] Created decision inbox file if team-relevant decision made
- [ ] Updated `wave2-live/README.md` status to ✅ COMPLETE

---

## Pass Criteria (from scenario-manifest.yaml)

- [x] **Expected Pass Criteria**:
  - [ ] SRE Agent detects service selector mismatch
  - [ ] SRE Agent identifies endpoint resolution failure
  - [ ] SRE Agent recommends checking service selector vs. pod labels
  - [ ] MTTR < 15 minutes (baseline for manual diagnosis)
  - [ ] Silent failure pattern documented (no pod crashes, only networking)

- [x] **Fail Criteria** (scenario fails if ANY of these occur):
  - [ ] SRE Agent fails to detect selector mismatch
  - [ ] SRE Agent misdiagnoses as pod health issue
  - [ ] SRE Agent recommends restarting pods (incorrect — this is a config issue)
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
QA/Docs | Wave 2 ServiceMismatch Evidence Checklist
2026-04-26T05:15:00Z
