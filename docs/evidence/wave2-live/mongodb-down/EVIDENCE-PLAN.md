# MongoDBDown — Wave 2 Evidence Capture Plan

**Scenario ID**: mongodb-down
**Narrative**: Meter database outage causing cascading failure (dispatch-service can't process readings)
**Diagnosis Complexity**: Medium (requires dependency tracing)
**Reference**: Wave 1 OOMKilled evidence structure

---

## Scenario Characteristics

**Breaking Change**: MongoDB deployment scaled to 0 replicas
**Expected Symptoms**:
- MongoDB pod absent (0 running pods)
- Dispatch-service errors (can't connect to database)
- Meter data queues in RabbitMQ indefinitely
- Grid dashboard loads but meter readings are not processed

**Root Cause Validation**:
- KQL can show symptom evidence (pod observations absent, dependent errors)
- kubectl/K8s API needed to prove desired replica count: `kubectl get deploy mongodb -n energy -o yaml | grep replicas`

---

## Evidence Capture Timeline (T0-T5)

### T0: Baseline (Healthy State)
**Commands**:
```bash
kubectl get pods -n energy -o wide > T0-baseline-pods.txt
kubectl get deployment mongodb -n energy -o wide > T0-baseline-mongodb-deployment.txt
kubectl get deployment dispatch-service -n energy -o wide > T0-baseline-dispatch-deployment.txt
kubectl get events -n energy --sort-by='.lastTimestamp' > T0-baseline-events.txt
```

**Expected Output**:
- mongodb: 1/1 Running
- dispatch-service: 1/1 Running
- All 12 pods Running baseline

---

### T1: Inject Scenario
**Command**:
```bash
kubectl apply -f k8s/scenarios/mongodb-down.yaml
```

**Expected Output**:
```
deployment.apps/mongodb configured
```

**Wait**: 60-120 seconds for cascading failures to manifest

---

### T2: Detect Failure
**Commands**:
```bash
kubectl get pods -n energy -l app=mongodb -o wide > T2-mongodb-status.txt
kubectl get pods -n energy -l app=dispatch-service -o wide > T2-dispatch-status.txt
kubectl get events -n energy --sort-by='.lastTimestamp' | grep -i "mongodb\|dispatch" > T2-dependency-events.txt
```

**Expected Output**:
- mongodb: No resources found (0 pods)
- dispatch-service: 1/1 Running (still running but erroring internally)
- Events: Possible dispatch container errors or backoff events

---

### T3: Diagnose Root Cause
**Commands**:
```bash
kubectl get deployment mongodb -n energy -o yaml > T3-mongodb-deployment-yaml.txt
kubectl describe deployment mongodb -n energy > T3-mongodb-describe.txt
kubectl get endpoints mongodb -n energy -o yaml > T3-mongodb-endpoints.txt
kubectl logs -n energy -l app=dispatch-service --tail=50 > T3-dispatch-logs.txt
```

**Expected Output**:
- Deployment YAML shows `replicas: 0` (root cause)
- Endpoints show no ready addresses
- Dispatch logs show connection errors to MongoDB

---

### T4: Restore Healthy State
**Command**:
```bash
kubectl apply -f k8s/base/application.yaml
```

**Expected Output**:
```
deployment.apps/mongodb configured
# ... other deployments unchanged
```

**Wait**: 30-60 seconds for MongoDB pod to start

---

### T5: Verify Recovery
**Commands**:
```bash
kubectl get pods -n energy -o wide > T5-recovery-pods.txt
kubectl get deployment mongodb -n energy -o wide > T5-mongodb-recovery.txt
kubectl get events -n energy --sort-by='.lastTimestamp' > T5-post-recovery-events.txt
```

**Expected Output**:
- mongodb: 1/1 Running
- dispatch-service: 1/1 Running
- All 12 pods Running (recovery confirmed)

---

## KQL Evidence

**Query**: `docs/evidence/kql/stable/scenario-mongodb-down.kql`

**Expected Results** (symptom evidence):
- MongoDB Pod Observations: absent or stale (observedPodNames=0 or LastSeen > 5 minutes ago)
- Service Object Observed: shows service metadata if present
- Dependent Service Errors: >0 for dispatch-service

**Limitations**:
- KQL cannot prove desired replica count (requires kubectl)
- KQL cannot show endpoint membership (requires kubectl)

**Validation**:
```bash
# Run KQL query in Log Analytics workspace
# Workspace: law-srelab-<random>
# Time range: Last 30 minutes (after T1 injection)
```

---

## Alert Firing Evidence (Wave 2 Alert Path)

**Query**: Azure Resource Graph CLI via `scripts/get-alert-firing-history.ps1`

**Expected Alerts**:
- Possible: `alert-srelab-pod-failures` (if dispatch-service reports failures)
- Possible: `alert-srelab-http-5xx` (if dependent services return errors)
- **Unlikely**: OOM/CrashLoop alerts (MongoDB scaled to 0, not crashing)

**If NO alerts fire**:
Document NO_ALERT_FIRED with exact query output. MongoDB scaled to 0 replicas does not necessarily trigger crashloop/OOM alerts — pod is absent, not failing.

**Validation**:
```bash
# Wait 2-3 minutes after T2 for alert evaluation
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/mongodb-down/alert-firing-history.json

# Check if any alerts fired
cat docs/evidence/wave2-live/mongodb-down/alert-firing-history.json | grep -c '"FiredTime"'
```

**Evidence File**: `alert-firing-history.json` (ARG query output, NOT Activity Log)

---

## MTTR Calculation

**Expected Timeline**:
- T0 → T1: 0-5 seconds (inject)
- T1 → T2: 60-120 seconds (detect cascading failure)
- T2 → T4: 10-30 seconds (diagnose + apply fix)
- T4 → T5: 30-60 seconds (verify recovery)
- **Total MTTR**: ~100-215 seconds (well below 900s threshold)

---

## Root Cause vs. Symptom Notes

**Symptoms** (observable in KQL + kubectl):
- MongoDB pod absent
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

## Redaction Checklist

- [ ] Remove subscription IDs from KQL results
- [ ] Remove resource group names from KQL results
- [ ] Remove pod UUIDs from kubectl output
- [ ] Remove internal IPs (10.x.x.x) from kubectl output
- [ ] Remove node names (aks-*vmss*) from kubectl output
- [ ] Verify no sensitive data in logs or deployment YAMLs

---

## SRE Agent Portal Evidence

**Status**: ⏳ PENDING_HUMAN_PORTAL
**Action Required**: John to capture SRE Agent diagnosis via portal
**Diagnosis Prompt**:
```
The meter database appears to be offline and dispatch-service can't process readings.
What's wrong with MongoDB in the energy namespace?
```

**Expected SRE Agent Output**:
- Identifies MongoDB deployment scaled to 0 replicas
- Traces dependency: dispatch-service → MongoDB
- Recommends scaling MongoDB deployment back to 1 replica

---

## Evidence Status

**Overall**: ⏳ PENDING_CLUSTER_START
**Blocker**: AKS cluster stopped, cannot execute live kubectl capture
**Ready to Execute**: All scenario assets prepared, cluster start is only blocker
