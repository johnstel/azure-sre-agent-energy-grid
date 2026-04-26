# ServiceMismatch — Execution Guide

**Scenario**: Service Selector Mismatch - Meter Service Routing Failure (Silent Failure)
**Estimated Time**: 35-45 minutes (including pre-flight check and KQL validation)
**Prerequisites**: AKS cluster running, Container Insights active

---

## Pre-Flight Checklist

```bash
# 1. Verify AKS cluster is running
az aks show --resource-group rg-srelab-eastus2 --name aks-srelab --query "powerState.code" -o tsv
# Expected: Running

# 2. Get AKS credentials
az aks get-credentials --resource-group rg-srelab-eastus2 --name aks-srelab --overwrite-existing

# 3. Verify kubectl connection
kubectl get nodes
# Expected: 2-3 nodes Ready

# 4. Verify energy namespace baseline
kubectl get pods -n energy
# Expected: 12 pods Running (including meter-service)

# 5. Verify Container Insights is ingesting data
# Run this KQL query in Log Analytics workspace:
# KubePodInventory | where TimeGenerated > ago(5m) | where Namespace == "energy" | count
# Expected: >0 rows (recent ingestion)

# 6. Create evidence output directory
mkdir -p docs/evidence/wave2-live/service-mismatch/kubectl-output
mkdir -p docs/evidence/wave2-live/service-mismatch/kql-results
mkdir -p docs/evidence/wave2-live/service-mismatch/metrics
```

---

## T0: Capture Baseline (Healthy State)

```bash
# Record start time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/service-mismatch/kubectl-output/T0-timestamp.txt

# Capture baseline pod status
kubectl get pods -n energy -o wide > docs/evidence/wave2-live/service-mismatch/kubectl-output/T0-baseline-pods.txt

# Capture baseline meter-service Service YAML (CRITICAL: shows healthy selector)
kubectl get svc meter-service -n energy -o yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T0-baseline-service-yaml.txt

# Capture baseline endpoints (CRITICAL: should have 2 ready addresses)
kubectl get endpoints meter-service -n energy -o yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T0-baseline-endpoints.txt

# Capture baseline events
kubectl get events -n energy --sort-by='.lastTimestamp' > docs/evidence/wave2-live/service-mismatch/kubectl-output/T0-baseline-events.txt
```

---

## T1: Inject Scenario

```bash
# Record injection time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/service-mismatch/kubectl-output/T1-timestamp.txt

# Apply scenario (changes service selector to app=meter-service-v2)
kubectl apply -f k8s/scenarios/service-mismatch.yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T1-scenario-applied.txt 2>&1

# WAIT 30-60 seconds for service endpoint update
echo "Waiting 45 seconds for service endpoint update..."
sleep 45
```

---

## T2: Detect Failure (Subtle — No Visible Crashes!)

```bash
# Record detection time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/service-mismatch/kubectl-output/T2-timestamp.txt

# Check meter-service pods (should be Running — no crashes!)
kubectl get pods -n energy -l app=meter-service -o wide > docs/evidence/wave2-live/service-mismatch/kubectl-output/T2-meter-service-pods.txt

# Check meter-service Service (looks normal at first glance)
kubectl get svc meter-service -n energy -o wide > docs/evidence/wave2-live/service-mismatch/kubectl-output/T2-meter-service-svc.txt

# Check meter-service endpoints (SMOKING GUN: 0 ready addresses)
kubectl get endpoints meter-service -n energy -o yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T2-meter-service-endpoints.txt
```

---

## T3: Diagnose Root Cause (Configuration Analysis)

```bash
# Record diagnosis time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/service-mismatch/kubectl-output/T3-timestamp.txt

# Get Service YAML (CRITICAL: shows selector: app=meter-service-v2 — ROOT CAUSE)
kubectl get svc meter-service -n energy -o yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T3-service-yaml.txt

# Get pod labels (CRITICAL: shows actual labels app=meter-service — MISMATCH)
kubectl get pods -n energy -l app=meter-service --show-labels -o wide > docs/evidence/wave2-live/service-mismatch/kubectl-output/T3-pod-labels.txt

# Describe service (CRITICAL: shows 0 endpoints)
kubectl describe svc meter-service -n energy > docs/evidence/wave2-live/service-mismatch/kubectl-output/T3-service-describe.txt
```

---

## T4: Restore Healthy State

```bash
# Record fix time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/service-mismatch/kubectl-output/T4-timestamp.txt

# Apply baseline (restores service selector to app=meter-service)
kubectl apply -f k8s/base/application.yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T4-restore-healthy.txt 2>&1

# WAIT 10-30 seconds for endpoint update
echo "Waiting 20 seconds for endpoint recovery..."
sleep 20
```

---

## T5: Verify Recovery

```bash
# Record recovery time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/service-mismatch/kubectl-output/T5-timestamp.txt

# Verify all pods Running (unchanged — pods were never down)
kubectl get pods -n energy -o wide > docs/evidence/wave2-live/service-mismatch/kubectl-output/T5-recovery-pods.txt

# Verify endpoints recovered (CRITICAL: should have 2 ready addresses)
kubectl get endpoints meter-service -n energy -o yaml > docs/evidence/wave2-live/service-mismatch/kubectl-output/T5-recovery-endpoints.txt

# Capture post-recovery events
kubectl get events -n energy --sort-by='.lastTimestamp' > docs/evidence/wave2-live/service-mismatch/kubectl-output/T5-post-recovery-events.txt
```

---

## Calculate MTTR

```bash
# Extract timestamps and calculate MTTR
cat > docs/evidence/wave2-live/service-mismatch/metrics/mttr-summary.yaml << 'EOF'
scenario: service-mismatch
timeline:
  T0_baseline: $(cat docs/evidence/wave2-live/service-mismatch/kubectl-output/T0-timestamp.txt)
  T1_inject: $(cat docs/evidence/wave2-live/service-mismatch/kubectl-output/T1-timestamp.txt)
  T2_detect: $(cat docs/evidence/wave2-live/service-mismatch/kubectl-output/T2-timestamp.txt)
  T3_diagnose: $(cat docs/evidence/wave2-live/service-mismatch/kubectl-output/T3-timestamp.txt)
  T4_fix: $(cat docs/evidence/wave2-live/service-mismatch/kubectl-output/T4-timestamp.txt)
  T5_verify: $(cat docs/evidence/wave2-live/service-mismatch/kubectl-output/T5-timestamp.txt)
mttr:
  detection_seconds: TBD  # T1 → T2
  diagnosis_seconds: TBD  # T2 → T4
  recovery_seconds: TBD   # T4 → T5
  total_seconds: TBD      # T1 → T5
  threshold_seconds: 900
  pass: TBD  # total_seconds < 900
EOF
```

---

## Capture Alert Firing Evidence (Wave 2 Alert Path)

**Wait 2-3 minutes after T2** for alerts to evaluate and fire.

### Query Alert Firing History via Azure Resource Graph

```bash
# Query alert firing history (last 2 hours)
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/service-mismatch/alert-firing-history.json

# Alternatively, use Azure CLI directly:
az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(2h)
| where resourceGroup =~ 'rg-srelab-eastus2'
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity),
    State = tostring(properties.essentials.monitorCondition),
    TargetResource = tostring(properties.essentials.targetResourceName)
| project FiredTime, AlertName, Severity, State, TargetResource, resourceGroup
| order by FiredTime desc
" --output json > docs/evidence/wave2-live/service-mismatch/alert-firing-history.json
```

**Expected Alerts** (ServiceMismatch scenario):
- **Unlikely**: `alert-srelab-crashloop-oom` (pods are healthy, Running/Ready)
- **Unlikely**: `alert-srelab-pod-restarts` (no restarts, silent failure)
- **Unlikely**: `alert-srelab-pod-failures` (pods are Running)
- **Unlikely**: `alert-srelab-http-5xx` (depends on client retry behavior)

**This is a "silent failure" scenario** — no visible pod crashes or OOM events. Alerts are NOT expected to fire.

**Document NO_ALERT_FIRED** (expected for this scenario):
```bash
cat > docs/evidence/wave2-live/service-mismatch/alert-firing-history.json << 'EOF'
{
  "count": 0,
  "data": [],
  "note": "NO_ALERT_FIRED - ServiceMismatch is a silent configuration failure. Pods are Running/Ready. No crashloop, OOM, or restart events. Service selector mismatch causes unreachability but does not trigger traditional failure alerts."
}
EOF
```

**Validation**:
- Check if any alerts fired: `cat docs/evidence/wave2-live/service-mismatch/alert-firing-history.json | grep -c '"FiredTime"'`
- **Expected**: count = 0 (silent failure, no alert triggers)
- Document NO_ALERT_FIRED with exact query output and explanation

---

## Run KQL Queries

**Log Analytics Workspace**: Find via `az monitor log-analytics workspace list`

### Query 1: scenario-service-mismatch.kql
```bash
# Copy query from docs/evidence/kql/stable/scenario-service-mismatch.kql
# Run in Azure Portal Log Analytics
# Time range: Last 30 minutes
# Export results to docs/evidence/wave2-live/service-mismatch/kql-results/scenario-service-mismatch.json
```

**Expected Results**:
- Meter Service Pods: 2/2 Running (pods are healthy)
- Service Object Observed: shows service metadata
- Client Connection Errors: possible errors from grid-dashboard or dispatch-service

**NOTE**: KQL cannot prove selector mismatch — kubectl API evidence is required

### Query 2: pod-lifecycle.kql
```bash
# Copy query from docs/evidence/kql/stable/pod-lifecycle.kql
# Set sre_namespace = "energy"
# Time range: Last 30 minutes
# Export results to docs/evidence/wave2-live/service-mismatch/kql-results/pod-lifecycle.json
```

**Expected Results**:
- Meter-service pods showing Running status (no failures)
- No OOMKilled, CrashLoopBackOff, or BackOff events

---

## Redaction

```bash
# Run redaction script (TBD - follow Wave 1 OOMKilled pattern)
# Remove:
# - Subscription IDs
# - Resource group names
# - Pod UUIDs
# - Internal IPs (10.x.x.x)
# - Node names (aks-*vmss*)
# - Cluster FQDNs

# Verify redaction
grep -r "ca7bde74" docs/evidence/wave2-live/service-mismatch/  # subscription ID check
grep -r "rg-srelab" docs/evidence/wave2-live/service-mismatch/  # resource group check
grep -r "10\." docs/evidence/wave2-live/service-mismatch/kubectl-output/  # internal IP check
grep -r "azmk8s.io" docs/evidence/wave2-live/service-mismatch/kubectl-output/  # cluster FQDN check
```

---

## Update Evidence Status

```bash
# Update docs/evidence/wave2-live/service-mismatch/EVIDENCE-STATUS.md
# Mark kubectl evidence as COMPLETE
# Mark KQL evidence as COMPLETE or PARTIAL
# Mark Kubernetes API evidence as COMPLETE (T3 files)
# Mark SRE Agent portal evidence as PENDING_HUMAN_PORTAL
# Document MTTR pass/fail
```

---

## SRE Agent Portal Capture (John)

**Diagnosis Prompt**:
```
The grid dashboard loads fine but submitting meter readings fails silently.
Meter-service pods are Running. What's wrong with the meter-service in the energy namespace?
```

**Capture Steps**:
1. Navigate to https://aka.ms/sreagent/portal
2. Select AKS cluster: aks-srelab
3. Input diagnosis prompt
4. Wait for SRE Agent diagnosis
5. Save output to `docs/evidence/wave2-live/service-mismatch/sre-agent/diagnosis-output.json` (redacted)
6. Update EVIDENCE-STATUS.md with SRE Agent verdict

---

## Completion Checklist

- [ ] T0-T5 kubectl evidence captured (14 files)
- [ ] MTTR calculated (< 900s threshold)
- [ ] Alert firing evidence documented (NO_ALERT_FIRED expected)
- [ ] KQL scenario-service-mismatch.json captured
- [ ] KQL pod-lifecycle.json captured
- [ ] Kubernetes API evidence captured (T3 files — CRITICAL)
- [ ] Redaction complete (0 sensitive data)
- [ ] SRE Agent portal evidence captured (PENDING_HUMAN_PORTAL)
- [ ] EVIDENCE-STATUS.md updated
- [ ] Baseline restored (endpoints show 2 ready addresses)

---

## Notes

**Silent Failure Scenario**: This scenario is intentionally subtle. Pods appear healthy (Running/Ready), but the service is unreachable due to selector mismatch. SRE Agent must analyze Kubernetes API configuration (selector vs. labels) to diagnose the root cause. This tests advanced diagnostic capabilities beyond runtime failure detection.
