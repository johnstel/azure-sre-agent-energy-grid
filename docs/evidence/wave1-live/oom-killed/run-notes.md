# OOMKilled Scenario — Wave 1 Live UAT Run Notes

> **Scenario**: OOMKilled — Meter Service Memory Exhaustion
> **Execution Date**: 2026-04-26 rerun completed; this original template is superseded by completed evidence
> **Operator**: Parker (SRE Dev)
> **Cluster**: aks-srelab (eastus2)
> **Status**: ✅ SUPERSEDED — see `RUN-NOTES-COMPLETED.md` and `../WAVE1-FINAL-VERDICT.md`

---

## Executive Summary

**Goal**: Capture end-to-end evidence of OOMKilled scenario diagnosis using Azure SRE Agent and manual kubectl/KQL analysis.

**Current Status**: Superseded. The earlier cluster-health blocker was resolved and the OOMKilled rerun completed successfully. Use `RUN-NOTES-COMPLETED.md`, `EVIDENCE-STATUS.md`, and `../WAVE1-FINAL-VERDICT.md` for current evidence.

**Former Blocker**: Cluster health restoration was required before execution. This is no longer the active Wave 1 status.

**Next Steps**:
1. John captures real SRE Agent portal evidence using the checklist in `sre-agent/HUMAN-ACTION-CHECKLIST.md`.
2. Keep customer-facing claims scoped to kubectl/KQL evidence until portal validation is captured.

---

## Timeline Template (T0-T5)

### T0: Baseline Health Verification

**Timestamp**: `TBD`

**Actions**:
- [ ] Run `kubectl get pods -n energy -o wide`
- [ ] Run `kubectl get events -n energy --sort-by='.lastTimestamp'`
- [ ] Verify all meter-service pods: `1/1 Ready`, `Running`, `RestartCount=0`

**Expected Baseline**:
```
meter-service-XXXXXXX-XXXXX   1/1   Running   0   Xm   10.x.x.x   aks-workload-xxxxx
meter-service-XXXXXXX-XXXXX   1/1   Running   0   Xm   10.x.x.x   aks-workload-xxxxx
```

**Observations**: TBD

**Evidence Captured**:
- `kubectl-output/T0-baseline-pods.txt`
- `kubectl-output/T0-baseline-events.txt`

---

### T1: Scenario Injection

**Timestamp**: `TBD`

**Actions**:
- [ ] Run `kubectl apply -f k8s/scenarios/oom-killed.yaml`
- [ ] Immediately capture pod state: `kubectl get pods -n energy -o wide`

**Expected Outcome**:
- Deployment `meter-service` updated with memory limit 16Mi
- Pods start to crash within 30-60 seconds

**Observations**: TBD

**Evidence Captured**:
- `kubectl-output/T1-scenario-applied.txt`

---

### T2: Failure Observation

**Timestamp**: `TBD` (typically T1 + 30-60 seconds)

**Actions**:
- [ ] Watch pods: `kubectl get pods -n energy | grep meter-service`
- [ ] Capture events: `kubectl get events -n energy --field-selector involvedObject.name=meter-service --sort-by='.lastTimestamp'`
- [ ] Look for OOMKilled event

**Expected Signals**:
- Pod status: `CrashLoopBackOff` or `Error`
- Event: `Reason: OOMKilled`, `Message: Container exceeded memory limit`
- RestartCount increases (e.g., 1, 2, 3...)

**Observations**: TBD

**Evidence Captured**:
- `kubectl-output/T2-meter-status.txt`
- `kubectl-output/T2-oomkilled-events.txt`

**Key Metrics**:
- Time to first OOMKilled event: TBD seconds
- RestartCount at T2: TBD

---

### T3: Detailed Diagnosis

**Timestamp**: `TBD`

**Actions**:
- [ ] Run `kubectl describe pod -n energy -l app=meter-service`
- [ ] Run `kubectl logs -n energy -l app=meter-service --previous --tail=50`
- [ ] Analyze Events section for OOMKilled reason
- [ ] Verify Container Limits show memory: 16Mi

**Expected Findings**:
```
Containers:
  meter-service:
    Limits:
      cpu:     200m
      memory:  16Mi
    Requests:
      cpu:        100m
      memory:     8Mi
Events:
  Type     Reason     Age   From               Message
  ----     ------     ----  ----               -------
  Warning  BackOff    Xs    kubelet            Back-off restarting failed container
  Normal   Killing    Xs    kubelet            OOMKilling container meter-service ...
```

**Observations**: TBD

**Evidence Captured**:
- `kubectl-output/T3-describe-pod.txt`
- `kubectl-output/T3-previous-logs.txt`

**Root Cause Confirmed**:
- [ ] Memory limit 16Mi is too low for meter-service workload
- [ ] OOMKilled event confirms container exceeded memory limit

---

### T4: Fix Applied

**Timestamp**: `TBD`

**Actions**:
- [ ] Run `kubectl apply -f k8s/base/application.yaml`
- [ ] Watch pods: `kubectl get pods -n energy -w`
- [ ] Wait for all meter-service pods to reach `Running` state

**Expected Outcome**:
- New meter-service pods created with memory limit 256Mi (from application.yaml)
- Old pods terminated
- New pods reach `1/1 Ready`, `Running` within 30-60 seconds

**Observations**: TBD

**Evidence Captured**:
- `kubectl-output/T4-restore-healthy.txt`

**Key Metrics**:
- Time from fix apply to pods Running: TBD seconds

---

### T5: Recovery Verification

**Timestamp**: `TBD`

**Actions**:
- [ ] Run `kubectl get pods -n energy -o wide`
- [ ] Run `kubectl get events -n energy --sort-by='.lastTimestamp' | head -20`
- [ ] Verify no OOMKilled events in last 2 minutes
- [ ] Verify RestartCount = 0 for new pods

**Expected Outcome**:
```
meter-service-XXXXXXX-XXXXX   1/1   Running   0   Xs   10.x.x.x   aks-workload-xxxxx
meter-service-XXXXXXX-XXXXX   1/1   Running   0   Xs   10.x.x.x   aks-workload-xxxxx
```

**Observations**: TBD

**Evidence Captured**:
- `kubectl-output/T5-post-recovery-events.txt`

**Recovery Confirmed**:
- [ ] All meter-service pods healthy
- [ ] No restarts for 2+ minutes
- [ ] Scenario successfully completed

---

## KQL Evidence

### Query Execution

**Timestamp**: `TBD` (T2 + 2-5 minutes for ingestion)

**Queries Run**:
1. `scenario-oom-killed.kql` — Verify OOMKilled events
2. `pod-lifecycle.kql` — Capture restart timeline
3. `alert-history.kql` — Check if crashloop-oom alert fired

**Expected Results**:
- `scenario-oom-killed.kql`: 1+ rows with Reason=OOMKilled, Service=meter-service
- `pod-lifecycle.kql`: Restart timeline showing ContainerRestartCount increases
- `alert-history.kql`: Alert fired (or ingestion delay documented)

**Observations**: TBD

**Evidence Captured**:
- `kql-results/scenario-oom-killed.csv`
- `kql-results/pod-lifecycle.csv`
- `kql-results/alert-history.csv`

**Ingestion Delay**: TBD minutes (if queries returned no results initially)

---

## Azure SRE Agent Evidence

**⚠️ HUMAN ACTION REQUIRED**

### Diagnosis Prompt

**File**: `sre-agent/diagnosis-prompt.txt`

**Exact Prompt**:
```
Why are meter-service pods crashing in the energy namespace?
```

### SRE Agent Response

**Timestamp**: `TBD`

**Actions** (performed by John or designated operator):
1. Navigate to Azure SRE Agent portal: https://aka.ms/sreagent/portal
2. Select SRE Agent resource in resource group
3. Open conversation pane
4. Paste exact prompt from `sre-agent/diagnosis-prompt.txt`
5. Wait for SRE Agent response
6. Copy full response → save to `sre-agent/diagnosis-response.md`
7. Take screenshot → save to `sre-agent/screenshots/`

### Expected SRE Agent Diagnosis

The SRE Agent should identify:
- [ ] OOMKilled events detected for meter-service
- [ ] Memory limits are too low (16Mi)
- [ ] Recommendation to increase memory limits to 128Mi or higher
- [ ] Optional: Reference to pod describe output or events

**Actual SRE Agent Response**: TBD (see `sre-agent/diagnosis-response.md`)

**Accuracy Assessment**: TBD

- [ ] **PASS**: SRE Agent correctly identified root cause and recommended fix
- [ ] **FAIL**: SRE Agent missed root cause or recommended incorrect fix
- [ ] **PARTIAL**: SRE Agent identified symptom but not root cause

**Evidence Captured**:
- `sre-agent/diagnosis-prompt.txt`
- `sre-agent/diagnosis-response.md`
- `sre-agent/screenshots/conversation.png`

---

## Alert Verification

**Alert Name**: `crashloop-oom` (if configured)

**Expected Behavior**:
- Alert should fire when ContainerRestartCount > threshold within time window
- Alert should appear in Azure Monitor Alert History
- Alert should reference meter-service pods

**Observations**: TBD

**Alert Fired?**: TBD (YES/NO)

**If NO**:
- [ ] Documented ingestion delay
- [ ] Checked alert rule configuration
- [ ] Noted blocker: TBD

**Evidence Captured**:
- `kql-results/alert-history.csv`

---

## MTTR Measurement

### Timestamps

| Event | Timestamp | Notes |
|-------|-----------|-------|
| T0: Baseline Verified | TBD | All pods healthy |
| T1: Scenario Applied | TBD | kubectl apply oom-killed.yaml |
| T2: First OOMKilled Event | TBD | From kubectl events |
| T3: Diagnosis Complete | TBD | Root cause identified |
| T4: Fix Applied | TBD | kubectl apply application.yaml |
| T5: Recovery Verified | TBD | All pods Running |

### Metrics

- **Detection Time** (T1 → T2): TBD seconds
- **Diagnosis Time** (T2 → T3): TBD seconds
- **MTTR** (T2 → T4): TBD seconds
- **Recovery Time** (T4 → T5): TBD seconds
- **Total Time** (T1 → T5): TBD seconds

### Pass/Fail Criteria

**Target**: MTTR < 15 minutes (900 seconds)

**Result**: TBD (PASS/FAIL)

**Evidence Captured**:
- `metrics/mttr-summary.yaml`

---

## Observations & Learnings

### Unexpected Behaviors

1. TBD

### SRE Agent Performance

1. TBD

### KQL Query Performance

1. TBD

### Alert Performance

1. TBD

### Process Improvements

1. TBD

---

## Blockers & Dependencies

### Current Blockers

1. **AKS Cluster Health** (Ripley dependency)
   - 4/5 nodes NotReady for ~9 hours
   - All pods Pending
   - Root cause: TBD (node VM health, kubelet, network?)
   - **Status**: 🚨 BLOCKING
   - **Next Step**: Ripley investigates and restores node health

### Resolved Blockers

1. None yet

---

## Evidence Redaction Checklist

Before committing evidence files:

- [ ] Redacted subscription IDs from kubectl output
- [ ] Redacted resource IDs (replaced with `<REDACTED_AKS_RESOURCE_ID>`)
- [ ] Redacted correlation IDs from KQL results
- [ ] Redacted IP addresses (replaced with `<REDACTED_IP>`)
- [ ] Redacted node names (replaced with `<REDACTED_NODE>`)
- [ ] Verified no secrets or credentials in any files
- [ ] Verified pod names, namespace, event reasons NOT redacted (safe)

---

## Completion Checklist

- [ ] T0-T5 timeline fully populated with timestamps and observations
- [ ] All kubectl evidence files captured
- [ ] All KQL evidence files captured
- [ ] SRE Agent evidence captured (human action)
- [ ] Alert verification completed
- [ ] MTTR metrics calculated
- [ ] Evidence redacted per policy
- [ ] Learnings appended to `.squad/agents/parker/history.md`
- [ ] Decision inbox file created (if team-relevant decision made)
- [ ] `wave1-live/README.md` status updated to ✅ COMPLETE
- [ ] `wave1-live/checklist.md` status updated to ✅ COMPLETE

---

## Sign-Off

**Executed By**: TBD (Parker)
**Reviewed By**: TBD (Dallas or team lead)
**Completion Date**: TBD
**Final Status**: TBD (PASS/FAIL)

**Notes**: TBD
