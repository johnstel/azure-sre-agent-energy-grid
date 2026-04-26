# ServiceMismatch — Wave 2 Evidence Capture Plan

**Scenario ID**: service-mismatch
**Narrative**: Service selector mismatch after "v2 upgrade" — meter-service pods Running but unreachable
**Diagnosis Complexity**: High (silent failure, no crashes, requires configuration analysis)
**Reference**: Wave 1 OOMKilled evidence structure

---

## Scenario Characteristics

**Breaking Change**: meter-service Service selector changed to `app: meter-service-v2` (pods still labeled `app: meter-service`)
**Expected Symptoms**:
- All meter-service pods show Running/Ready (no crashes, no OOMKilled)
- Grid dashboard loads fine (client-side app)
- Submitting meter readings fails silently (meter-service unreachable)
- No visible errors in pod status

**Root Cause Validation**:
- KQL can show symptom evidence (pods running, possible client errors)
- kubectl/K8s API needed to prove selector mismatch:
  - `kubectl get svc meter-service -n energy -o yaml` (shows selector: app=meter-service-v2)
  - `kubectl get pods -n energy -l app=meter-service --show-labels` (shows actual pod labels)
  - `kubectl get endpoints meter-service -n energy` (shows 0 ready addresses)

---

## Evidence Capture Timeline (T0-T5)

### T0: Baseline (Healthy State)
**Commands**:
```bash
kubectl get pods -n energy -o wide > T0-baseline-pods.txt
kubectl get svc meter-service -n energy -o yaml > T0-baseline-service-yaml.txt
kubectl get endpoints meter-service -n energy -o yaml > T0-baseline-endpoints.txt
kubectl get events -n energy --sort-by='.lastTimestamp' > T0-baseline-events.txt
```

**Expected Output**:
- meter-service pods: 2/2 Running
- Service selector: `app: meter-service`
- Endpoints: 2 ready addresses (pod IPs)

---

### T1: Inject Scenario
**Command**:
```bash
kubectl apply -f k8s/scenarios/service-mismatch.yaml
```

**Expected Output**:
```
service/meter-service configured
```

**Wait**: 30-60 seconds for service endpoint update

---

### T2: Detect Failure (Subtle!)
**Commands**:
```bash
kubectl get pods -n energy -l app=meter-service -o wide > T2-meter-service-pods.txt
kubectl get svc meter-service -n energy -o wide > T2-meter-service-svc.txt
kubectl get endpoints meter-service -n energy -o yaml > T2-meter-service-endpoints.txt
```

**Expected Output**:
- Pods: 2/2 Running (healthy, no failures!)
- Service: Shows port 3000 (no visible issue)
- Endpoints: **0 ready addresses** (this is the smoking gun)

---

### T3: Diagnose Root Cause (Configuration Analysis)
**Commands**:
```bash
kubectl get svc meter-service -n energy -o yaml > T3-service-yaml.txt
kubectl get pods -n energy -l app=meter-service --show-labels -o wide > T3-pod-labels.txt
kubectl describe svc meter-service -n energy > T3-service-describe.txt
```

**Expected Output**:
- Service YAML shows `selector: app=meter-service-v2` (root cause)
- Pod labels show `app=meter-service` (mismatch)
- `kubectl describe svc` shows 0 endpoints

**Root Cause**: Service selector doesn't match any pod labels

---

### T4: Restore Healthy State
**Command**:
```bash
kubectl apply -f k8s/base/application.yaml
```

**Expected Output**:
```
service/meter-service configured
# ... other resources unchanged
```

**Wait**: 10-30 seconds for endpoint update

---

### T5: Verify Recovery
**Commands**:
```bash
kubectl get pods -n energy -o wide > T5-recovery-pods.txt
kubectl get endpoints meter-service -n energy -o yaml > T5-recovery-endpoints.txt
kubectl get events -n energy --sort-by='.lastTimestamp' > T5-post-recovery-events.txt
```

**Expected Output**:
- Pods: 2/2 Running (unchanged)
- Endpoints: **2 ready addresses** (recovery confirmed)
- Service selector: `app: meter-service` (restored)

---

## KQL Evidence

**Query**: `docs/evidence/kql/stable/scenario-service-mismatch.kql`

**Expected Results** (symptom evidence):
- Meter Service Pods: 2/2 Running (pods are healthy)
- Service Object Observed: shows service metadata
- Client Connection Errors: possible errors from grid-dashboard or dispatch-service

**Limitations**:
- KQL cannot prove selector mismatch (KubeServices table does not expose selectors or endpoint addresses)
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

**Expected Result**: **NO_ALERT_FIRED**

**Rationale**: ServiceMismatch is a "silent failure" scenario:
- Pods are Running/Ready (no crashes, no restarts, no OOM)
- Service selector mismatch causes unreachability but does not trigger traditional failure alerts
- No crashloop, BackOff, or FailedScheduling events

**Validation**:
```bash
# Wait 2-3 minutes after T2 for alert evaluation
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/service-mismatch/alert-firing-history.json

# Expected: count = 0 (no alerts fired)
cat docs/evidence/wave2-live/service-mismatch/alert-firing-history.json
```

**Evidence File**: `alert-firing-history.json` with NO_ALERT_FIRED documented

**Example NO_ALERT_FIRED Evidence**:
```json
{
  "count": 0,
  "data": [],
  "note": "NO_ALERT_FIRED - ServiceMismatch is a silent configuration failure. Pods are Running/Ready. Service selector mismatch causes unreachability but does not trigger crashloop, OOM, or restart alerts."
}
```

---

## MTTR Calculation

**Expected Timeline**:
- T0 → T1: 0-5 seconds (inject)
- T1 → T2: 30-60 seconds (detect silent failure)
- T2 → T4: 20-60 seconds (diagnose configuration mismatch + apply fix)
- T4 → T5: 10-30 seconds (verify recovery)
- **Total MTTR**: ~60-155 seconds (well below 900s threshold)

---

## Root Cause vs. Symptom Notes

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

## Kubernetes API Evidence (Required)

**Critical Evidence Files**:
- `T3-service-yaml.txt` — Shows `selector: app=meter-service-v2`
- `T3-pod-labels.txt` — Shows actual pod labels `app=meter-service`
- `T3-service-describe.txt` — Shows `Endpoints: <none>` or empty list
- `T2-meter-service-endpoints.txt` — Shows 0 ready addresses

**Why This Matters**: KQL cannot prove selector mismatch. Kubernetes API evidence is **required** for root cause validation.

---

## Redaction Checklist

- [ ] Remove subscription IDs from KQL results
- [ ] Remove resource group names from KQL results
- [ ] Remove pod UUIDs from kubectl output
- [ ] Remove internal IPs (10.x.x.x) from kubectl output
- [ ] Remove node names (aks-*vmss*) from kubectl output
- [ ] Remove cluster FQDNs from service/endpoint YAMLs
- [ ] Verify no sensitive data in configuration YAMLs

---

## SRE Agent Portal Evidence

**Status**: ⏳ PENDING_HUMAN_PORTAL
**Action Required**: John to capture SRE Agent diagnosis via portal
**Diagnosis Prompt**:
```
The grid dashboard loads fine but submitting meter readings fails silently.
Meter-service pods are Running. What's wrong with the meter-service in the energy namespace?
```

**Expected SRE Agent Output**:
- Identifies meter-service pods are Running but unreachable
- Checks service endpoints: 0 ready addresses
- Analyzes service selector vs. pod labels: mismatch detected
- Recommends correcting service selector to `app: meter-service`

---

## Evidence Status

**Overall**: ⏳ PENDING_CLUSTER_START
**Blocker**: AKS cluster stopped, cannot execute live kubectl capture
**Ready to Execute**: All scenario assets prepared, cluster start is only blocker
