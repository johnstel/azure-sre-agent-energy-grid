# Wave 2 ServiceMismatch Evidence — Status Summary

**Last Updated**: 2026-04-26T08:05:00Z
**Gate Verdict**: ⏸️ **STANDING BY** (Ripley resolving cluster blocker)
**Overall Status**: ⏸️ STANDING BY — All prep complete, awaiting cluster confirmation

---

## Evidence Status Matrix

| Evidence Item | Status | Owner | Blocker | Pass/Fail | Redaction |
|---------------|--------|-------|---------|-----------|-----------|
| **T0-T5 kubectl Evidence** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **MTTR Calculation** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **Alert Firing Evidence (ARG)** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **KQL: scenario-service-mismatch** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **KQL: pod-lifecycle** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **Kubernetes API Evidence** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **SRE Agent Portal Evidence** | ⏳ PENDING_HUMAN_PORTAL | John | Requires human portal interaction | ⏳ PENDING | N/A |
| **Evidence Redaction** | ⏳ PENDING | Parker | Awaiting live capture | ⏳ PENDING | N/A |

---

## Blocker Summary

**Critical Blocker**: AKS cluster `aks-srelab` is in **Stopped** power state

**Impact**:
- Cannot execute kubectl commands (control plane unreachable)
- Cannot inject scenario or capture live evidence
- Cannot validate KQL queries against live telemetry
- Cannot capture Kubernetes API configuration evidence (required for root cause)

**Resolution**:
```bash
az aks start --resource-group rg-srelab-eastus2 --name aks-srelab
# Wait 5-10 minutes for cluster to start
```

**Estimated Time to Complete** (after cluster start):
- Pre-flight check: 5 minutes
- Scenario execution: 10 minutes
- KQL validation: 10 minutes
- Redaction: 10 minutes
- **Total**: ~35-45 minutes

---

## Evidence Preparation Status

| Asset | Status | Location |
|-------|--------|----------|
| Scenario Manifest | ✅ READY | k8s/scenarios/service-mismatch.yaml |
| KQL Query | ✅ READY | docs/evidence/kql/stable/scenario-service-mismatch.kql |
| KQL Query (pod-lifecycle) | ✅ READY | docs/evidence/kql/stable/pod-lifecycle.kql |
| Evidence Plan | ✅ READY | docs/evidence/wave2-live/service-mismatch/EVIDENCE-PLAN.md |
| Execution Guide | ✅ READY | docs/evidence/wave2-live/service-mismatch/EXECUTION-GUIDE.md |
| Wave 1 Template | ✅ AVAILABLE | docs/evidence/wave1-live/oom-killed/ |

**All scenario assets ready**. Cluster start is the only blocker.

---

## Expected Evidence Upon Completion

### kubectl Evidence (T0-T5)
- T0-baseline-pods.txt
- T0-baseline-service-yaml.txt
- T0-baseline-endpoints.txt
- T0-baseline-events.txt
- T1-scenario-applied.txt
- T2-meter-service-pods.txt
- T2-meter-service-svc.txt
- T2-meter-service-endpoints.txt
- T3-service-yaml.txt — **CRITICAL: Shows selector mismatch**
- T3-pod-labels.txt — **CRITICAL: Shows actual pod labels**
- T3-service-describe.txt — **CRITICAL: Shows 0 endpoints**
- T4-restore-healthy.txt
- T5-recovery-pods.txt
- T5-recovery-endpoints.txt
- T5-post-recovery-events.txt

### Alert Firing Evidence (Wave 2 Alert Path)
- alert-firing-history.json — Azure Resource Graph query output (firing events, NOT Activity Log rule changes)
- **Expected**: **NO_ALERT_FIRED** (silent failure — pods healthy, no crashloop/OOM/restarts)
- **Rationale**: Service selector mismatch causes unreachability but does not trigger traditional failure alerts

### KQL Evidence
- scenario-service-mismatch.json — Symptom evidence (pods running, possible client errors)
- pod-lifecycle.json — Pod state transitions and lifecycle events

### MTTR Metrics
- mttr-summary.yaml — Timeline from T0 to T5 with calculated MTTR

---

## Root Cause vs. Symptom Documentation

**Symptoms** (observable in KQL + kubectl):
- Pods are Running/Ready (no crashes)
- Service object exists
- Client connection errors (possible)

**Root Cause** (requires kubectl/K8s API configuration analysis):
- Service selector `app: meter-service-v2` doesn't match pod labels `app: meter-service`
- Endpoints have 0 ready addresses
- This is a **configuration mismatch**, not a runtime failure

**SRE Agent Diagnosis Path**:
1. Detect symptom: meter-service appears healthy but unreachable
2. Check endpoints: `kubectl get endpoints meter-service` shows 0 addresses
3. Compare service selector vs. pod labels: mismatch identified
4. Recommendation: Correct service selector to match pod labels

**Diagnosis Complexity**: HIGH — This is a "silent failure" scenario that tests SRE Agent's ability to analyze configuration mismatches vs. runtime failures.

---

## Critical Kubernetes API Evidence

**Why This Matters**: KQL cannot prove selector mismatch. Kubernetes API evidence is **required** for root cause validation.

**Critical Evidence Files**:
- `T3-service-yaml.txt` — Shows `selector: app=meter-service-v2`
- `T3-pod-labels.txt` — Shows actual pod labels `app=meter-service`
- `T3-service-describe.txt` — Shows `Endpoints: <none>` or empty list
- `T2-meter-service-endpoints.txt` — Shows 0 ready addresses

---

## Parker's Summary

ServiceMismatch scenario assets fully prepared and ready for execution. This is a high-complexity "silent failure" scenario requiring Kubernetes API configuration analysis. Wave 1 OOMKilled evidence structure serves as template. AKS cluster start is the only blocker for live kubectl + KQL evidence capture. Estimated completion: 35-45 minutes after cluster start.
