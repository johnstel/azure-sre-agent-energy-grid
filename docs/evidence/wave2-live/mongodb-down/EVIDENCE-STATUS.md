# Wave 2 MongoDBDown Evidence — Status Summary

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
| **KQL: scenario-mongodb-down** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **KQL: pod-lifecycle** | ⏳ PENDING | Parker | AKS cluster stopped | ⏳ PENDING | N/A |
| **SRE Agent Portal Evidence** | ⏳ PENDING_HUMAN_PORTAL | John | Requires human portal interaction | ⏳ PENDING | N/A |
| **Evidence Redaction** | ⏳ PENDING | Parker | Awaiting live capture | ⏳ PENDING | N/A |

---

## Blocker Summary

**Critical Blocker**: AKS cluster `aks-srelab` is in **Stopped** power state

**Impact**:
- Cannot execute kubectl commands (control plane unreachable)
- Cannot inject scenario or capture live evidence
- Cannot validate KQL queries against live telemetry

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
| Scenario Manifest | ✅ READY | k8s/scenarios/mongodb-down.yaml |
| KQL Query | ✅ READY | docs/evidence/kql/stable/scenario-mongodb-down.kql |
| KQL Query (pod-lifecycle) | ✅ READY | docs/evidence/kql/stable/pod-lifecycle.kql |
| Evidence Plan | ✅ READY | docs/evidence/wave2-live/mongodb-down/EVIDENCE-PLAN.md |
| Execution Guide | ✅ READY | docs/evidence/wave2-live/mongodb-down/EXECUTION-GUIDE.md |
| Wave 1 Template | ✅ AVAILABLE | docs/evidence/wave1-live/oom-killed/ |

**All scenario assets ready**. Cluster start is the only blocker.

---

## Expected Evidence Upon Completion

### kubectl Evidence (T0-T5)
- T0-baseline-pods.txt
- T0-baseline-mongodb-deployment.txt
- T0-baseline-dispatch-deployment.txt
- T0-baseline-events.txt
- T1-scenario-applied.txt
- T2-mongodb-status.txt
- T2-dispatch-status.txt
- T2-dependency-events.txt
- T3-mongodb-deployment-yaml.txt
- T3-mongodb-describe.txt
- T3-mongodb-endpoints.txt
- T3-dispatch-logs.txt
- T4-restore-healthy.txt
- T5-recovery-pods.txt
- T5-mongodb-recovery.txt
- T5-post-recovery-events.txt

### Alert Firing Evidence (Wave 2 Alert Path)
- alert-firing-history.json — Azure Resource Graph query output (firing events, NOT Activity Log rule changes)
- **Expected**: Possible pod-failures or http-5xx alerts (if dependent services error)
- **If NO alerts**: Document NO_ALERT_FIRED with exact query output

### KQL Evidence
- scenario-mongodb-down.json — Symptom evidence (pod observations, dependent errors)
- pod-lifecycle.json — Pod state transitions and lifecycle events

### MTTR Metrics
- mttr-summary.yaml — Timeline from T0 to T5 with calculated MTTR

---

## Root Cause vs. Symptom Documentation

**Symptoms** (observable in KQL + kubectl):
- MongoDB pod absent (0 running pods)
- Dispatch-service connection errors
- Meter data not processing

**Root Cause** (requires kubectl/K8s API):
- MongoDB deployment `replicas: 0` (intentional scale-down)
- Endpoint has no ready addresses

**SRE Agent Diagnosis Path**:
1. Detect symptom: dispatch-service errors referencing MongoDB connection
2. Check MongoDB pod status: 0 running pods
3. Validate deployment: `kubectl get deploy mongodb` shows 0/0 replicas
4. Recommendation: Scale MongoDB deployment to 1 replica

---

## Parker's Summary

MongoDBDown scenario assets fully prepared and ready for execution. Wave 1 OOMKilled evidence structure serves as template. AKS cluster start is the only blocker for live kubectl + KQL evidence capture. Estimated completion: 35-45 minutes after cluster start.
