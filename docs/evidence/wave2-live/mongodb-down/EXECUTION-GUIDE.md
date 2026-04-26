# MongoDBDown — Execution Guide

**Scenario**: MongoDB Down - Meter Database Outage (Cascading Failure)
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
# Expected: 12 pods Running (including mongodb, dispatch-service, meter-service)

# 5. Verify Container Insights is ingesting data
# Run this KQL query in Log Analytics workspace:
# KubePodInventory | where TimeGenerated > ago(5m) | where Namespace == "energy" | count
# Expected: >0 rows (recent ingestion)

# 6. Create evidence output directory
mkdir -p docs/evidence/wave2-live/mongodb-down/kubectl-output
mkdir -p docs/evidence/wave2-live/mongodb-down/kql-results
mkdir -p docs/evidence/wave2-live/mongodb-down/metrics
```

---

## T0: Capture Baseline (Healthy State)

```bash
# Record start time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T0-timestamp.txt

# Capture baseline pod status
kubectl get pods -n energy -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T0-baseline-pods.txt

# Capture baseline MongoDB deployment
kubectl get deployment mongodb -n energy -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T0-baseline-mongodb-deployment.txt

# Capture baseline dispatch-service deployment
kubectl get deployment dispatch-service -n energy -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T0-baseline-dispatch-deployment.txt

# Capture baseline events
kubectl get events -n energy --sort-by='.lastTimestamp' > docs/evidence/wave2-live/mongodb-down/kubectl-output/T0-baseline-events.txt
```

---

## T1: Inject Scenario

```bash
# Record injection time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T1-timestamp.txt

# Apply scenario (scales MongoDB to 0 replicas)
kubectl apply -f k8s/scenarios/mongodb-down.yaml > docs/evidence/wave2-live/mongodb-down/kubectl-output/T1-scenario-applied.txt 2>&1

# WAIT 60-120 seconds for cascading failures to manifest
echo "Waiting 90 seconds for cascading failure..."
sleep 90
```

---

## T2: Detect Failure

```bash
# Record detection time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T2-timestamp.txt

# Check MongoDB status (should be 0 pods)
kubectl get pods -n energy -l app=mongodb -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T2-mongodb-status.txt

# Check dispatch-service status (should still be Running but erroring)
kubectl get pods -n energy -l app=dispatch-service -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T2-dispatch-status.txt

# Capture dependency-related events
kubectl get events -n energy --sort-by='.lastTimestamp' | grep -i "mongodb\|dispatch" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T2-dependency-events.txt
```

---

## T3: Diagnose Root Cause

```bash
# Record diagnosis time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T3-timestamp.txt

# Get MongoDB deployment YAML (shows replicas: 0 — root cause)
kubectl get deployment mongodb -n energy -o yaml > docs/evidence/wave2-live/mongodb-down/kubectl-output/T3-mongodb-deployment-yaml.txt

# Describe MongoDB deployment
kubectl describe deployment mongodb -n energy > docs/evidence/wave2-live/mongodb-down/kubectl-output/T3-mongodb-describe.txt

# Check MongoDB endpoints (should be empty)
kubectl get endpoints mongodb -n energy -o yaml > docs/evidence/wave2-live/mongodb-down/kubectl-output/T3-mongodb-endpoints.txt

# Capture dispatch-service logs (should show connection errors)
kubectl logs -n energy -l app=dispatch-service --tail=50 > docs/evidence/wave2-live/mongodb-down/kubectl-output/T3-dispatch-logs.txt 2>&1
```

---

## T4: Restore Healthy State

```bash
# Record fix time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T4-timestamp.txt

# Apply baseline (restores MongoDB to 1 replica)
kubectl apply -f k8s/base/application.yaml > docs/evidence/wave2-live/mongodb-down/kubectl-output/T4-restore-healthy.txt 2>&1

# WAIT 30-60 seconds for MongoDB pod to start
echo "Waiting 45 seconds for MongoDB recovery..."
sleep 45
```

---

## T5: Verify Recovery

```bash
# Record recovery time
date -u +"%Y-%m-%dT%H:%M:%SZ" > docs/evidence/wave2-live/mongodb-down/kubectl-output/T5-timestamp.txt

# Verify all pods Running
kubectl get pods -n energy -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T5-recovery-pods.txt

# Verify MongoDB deployment
kubectl get deployment mongodb -n energy -o wide > docs/evidence/wave2-live/mongodb-down/kubectl-output/T5-mongodb-recovery.txt

# Capture post-recovery events
kubectl get events -n energy --sort-by='.lastTimestamp' > docs/evidence/wave2-live/mongodb-down/kubectl-output/T5-post-recovery-events.txt
```

---

## Calculate MTTR

```bash
# Extract timestamps and calculate MTTR
cat > docs/evidence/wave2-live/mongodb-down/metrics/mttr-summary.yaml << 'EOF'
scenario: mongodb-down
timeline:
  T0_baseline: $(cat docs/evidence/wave2-live/mongodb-down/kubectl-output/T0-timestamp.txt)
  T1_inject: $(cat docs/evidence/wave2-live/mongodb-down/kubectl-output/T1-timestamp.txt)
  T2_detect: $(cat docs/evidence/wave2-live/mongodb-down/kubectl-output/T2-timestamp.txt)
  T3_diagnose: $(cat docs/evidence/wave2-live/mongodb-down/kubectl-output/T3-timestamp.txt)
  T4_fix: $(cat docs/evidence/wave2-live/mongodb-down/kubectl-output/T4-timestamp.txt)
  T5_verify: $(cat docs/evidence/wave2-live/mongodb-down/kubectl-output/T5-timestamp.txt)
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
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/mongodb-down/alert-firing-history.json

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
" --output json > docs/evidence/wave2-live/mongodb-down/alert-firing-history.json
```

**Expected Alerts** (MongoDBDown scenario):
- Possible: `alert-srelab-pod-failures` (if dispatch-service reports failures)
- Possible: `alert-srelab-http-5xx` (if dependent services return errors)
- **Unlikely**: OOM/CrashLoop alerts (MongoDB is scaled to 0, not crashing)

**If NO alerts fire**:
```bash
# Document no-alert evidence
cat > docs/evidence/wave2-live/mongodb-down/alert-firing-history.json << 'EOF'
{
  "count": 0,
  "data": [],
  "note": "NO_ALERT_FIRED - MongoDB scaled to 0 replicas does not trigger crashloop/OOM alerts. Pod failures alert may require dependent service error threshold."
}
EOF
```

**Validation**:
- Check if any alerts fired: `cat docs/evidence/wave2-live/mongodb-down/alert-firing-history.json | grep -c '"FiredTime"'`
- If count > 0: Document which alerts fired and correlation with scenario timeline
- If count = 0: Document NO_ALERT_FIRED with exact query output

---

## Run KQL Queries

**Log Analytics Workspace**: Find via `az monitor log-analytics workspace list`

### Query 1: scenario-mongodb-down.kql
```bash
# Copy query from docs/evidence/kql/stable/scenario-mongodb-down.kql
# Run in Azure Portal Log Analytics
# Time range: Last 30 minutes
# Export results to docs/evidence/wave2-live/mongodb-down/kql-results/scenario-mongodb-down.json
```

**Expected Results**:
- MongoDB Pod Observations: absent or stale (observedPodNames=0)
- Service Object Observed: shows service metadata
- Dependent Service Errors: >0 for dispatch-service

### Query 2: pod-lifecycle.kql
```bash
# Copy query from docs/evidence/kql/stable/pod-lifecycle.kql
# Set sre_namespace = "energy"
# Time range: Last 30 minutes
# Export results to docs/evidence/wave2-live/mongodb-down/kql-results/pod-lifecycle.json
```

**Expected Results**:
- MongoDB pod lifecycle events
- Dispatch-service error events

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

# Verify redaction
grep -r "ca7bde74" docs/evidence/wave2-live/mongodb-down/  # subscription ID check
grep -r "rg-srelab" docs/evidence/wave2-live/mongodb-down/  # resource group check
grep -r "10\." docs/evidence/wave2-live/mongodb-down/kubectl-output/  # internal IP check
```

---

## Update Evidence Status

```bash
# Update docs/evidence/wave2-live/mongodb-down/EVIDENCE-STATUS.md
# Mark kubectl evidence as COMPLETE
# Mark KQL evidence as COMPLETE or PARTIAL
# Mark SRE Agent portal evidence as PENDING_HUMAN_PORTAL
# Document MTTR pass/fail
```

---

## SRE Agent Portal Capture (John)

**Diagnosis Prompt**:
```
The meter database appears to be offline and dispatch-service can't process readings.
What's wrong with MongoDB in the energy namespace?
```

**Capture Steps**:
1. Navigate to https://aka.ms/sreagent/portal
2. Select AKS cluster: aks-srelab
3. Input diagnosis prompt
4. Wait for SRE Agent diagnosis
5. Save output to `docs/evidence/wave2-live/mongodb-down/sre-agent/diagnosis-output.json` (redacted)
6. Update EVIDENCE-STATUS.md with SRE Agent verdict

---

## Completion Checklist

- [ ] T0-T5 kubectl evidence captured (16 files)
- [ ] MTTR calculated (< 900s threshold)
- [ ] Alert firing evidence captured (ARG query output)
- [ ] KQL scenario-mongodb-down.json captured
- [ ] KQL pod-lifecycle.json captured
- [ ] Redaction complete (0 sensitive data)
- [ ] SRE Agent portal evidence captured (PENDING_HUMAN_PORTAL)
- [ ] EVIDENCE-STATUS.md updated
- [ ] Baseline restored (all 12 pods Running)
