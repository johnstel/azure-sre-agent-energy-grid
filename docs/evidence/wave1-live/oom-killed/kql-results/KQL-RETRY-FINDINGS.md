# KQL Evidence Retry - Findings Report
**Parker SRE Dev** | Wave 1 Live UAT | OOMKilled Scenario
**Retry Time**: 2026-04-26T02:42:14Z (~23 minutes after T5 recovery)

---

## Executive Summary

**Result**: ❌ **KQL evidence collection BLOCKED by Container Insights data pipeline issue**

- Container Insights **addon enabled** ✅
- AMA-logs pods **running** ✅ (6 pods in kube-system)
- Log Analytics workspace **configured** ✅ (log-gridmon-dev)
- Data ingestion **NOT WORKING** ❌ (zero data across all tables)

**Root Cause**: Container Insights monitoring pipeline is not ingesting data from AKS cluster despite correct configuration.

---

## Investigation Timeline

### T+23min: Retry Attempt (02:42:14Z)
Retried all 3 KQL queries 23 minutes after scenario recovery (well beyond typical 2-5 minute ingestion delay).

**Queries Attempted**:
1. `scenario-oom-killed.kql` → Query execution **hung indefinitely** (terminated)
2. `pod-lifecycle.kql` → Query execution **hung indefinitely** (terminated)
3. `alert-history.kql` → Query **failed** with semantic error (separate issue, see below)

### Workspace ID Correction Discovery
**Critical Finding**: Initial queries targeted **wrong workspace**.

- **Initial queries**: `log-srelab` workspace (b5f04de7-f962-41a7-a32b-4d5f586760f3)
- **Correct workspace**: `log-gridmon-dev` workspace (e705c573-15bb-42d1-a268-1d6879dea792)
- **Source**: AKS addon config `/subscriptions/.../log-gridmon-dev`

**Action Taken**: Retried diagnostic queries against correct workspace `log-gridmon-dev`.

**Result**: Still **zero data** in correct workspace.

---

## Data Availability Assessment

### Container Insights Tables (log-gridmon-dev workspace)

| Table | Time Window | Row Count | Status |
|-------|-------------|-----------|--------|
| `KubeEvents` | 24 hours | **0** | ❌ NO DATA |
| `KubePodInventory` | 24 hours | **0** | ❌ NO DATA |
| `Perf` | 1 hour | **0** | ❌ NO DATA |
| `Heartbeat` | 1 hour | **0** | ❌ NO DATA |

**Interpretation**: Container Insights has **never successfully ingested data** from this cluster, or data retention cleared all historical data.

### AKS Monitoring Configuration Verification

```bash
# AKS addon status
az aks show --name aks-gridmon-dev --resource-group rg-gwsrelab-eastus2 \
  --query "addonProfiles.omsagent"

{
  "config": {
    "logAnalyticsWorkspaceResourceID": "/subscriptions/.../log-gridmon-dev"
  },
  "enabled": true,
  "identity": {
    "clientId": "076b486c-d5d5-4c87-bdef-5674f5968929",
    ...
  }
}
```

✅ **Addon enabled**: `true`
✅ **Workspace configured**: `log-gridmon-dev`
✅ **Managed identity assigned**: `omsagent-aks-gridmon-dev`

### AMA-Logs Pod Status

```bash
kubectl get pods -n kube-system | grep ama-logs
```

```
ama-logs-dh26x                    3/3     Running   0    28m
ama-logs-fgdh2                    3/3     Running   0    28m
ama-logs-j6cfk                    3/3     Running   0    28m
ama-logs-j9k7q                    3/3     Running   0    29m
ama-logs-rs-54c758bd6b-h5sd6      2/2     Running   0    3h26m
ama-logs-vc972                    3/3     Running   0    3h33m
```

✅ **6 pods running** (5 DaemonSet + 1 ReplicaSet)
✅ **All containers healthy** (3/3 or 2/2 ready)
✅ **No crash loops**

**Pod logs**: No obvious errors detected in initial scan.

---

## Alert History Query - Separate Issue

### Query Failure Details

**Query**: `docs/evidence/kql/stable/alert-history.kql`
**Error**: `SEM0100 - 'extend' operator: Failed to resolve scalar expression named 'properties_s'`

### Root Cause Analysis

**Expected Behavior** (per query comments):
- Query targets `AzureDiagnostics` table (Activity Log export)
- Expects JSON column `properties_s` containing alert metadata
- Parses `properties_s.alertName`, `properties_s.severity`, etc.

**Actual Schema** (confirmed via `getschema`):
- `AzureDiagnostics` table **exists** ✅
- Column `properties_s` **does NOT exist** ❌
- Schema contains only resource-specific columns:
  - `properties_sku_Family_s`
  - `properties_sku_Name_s`
  - `properties_tenantId_g`
  - (Key Vault-specific properties)

**Conclusion**: Query assumes Activity Log diagnostic export schema that **does not match current workspace ingestion pattern**.

### Possible Causes

1. **Activity Log export not configured** (despite Ripley's claim)
2. **Wrong table for alert data** (should use `AzureActivity` instead?)
3. **Schema changed** (Azure Monitor alert schema evolution)
4. **No alert has fired yet** (OOMKilled scenario may not trigger configured alerts)

### Alert Data Availability Check

```kql
-- Checked for any alert-related Activity Log events
AzureActivity
| where TimeGenerated > ago(24h)
| where ResourceProvider == 'Microsoft.Insights'
  and OperationNameValue contains 'Alert'
| take 5
```

**Result**: **0 rows** (no alert firing events recorded)

**Interpretation**: Either:
- Alert rules not deployed (`deployAlerts` may be `false`)
- OOMKilled scenario did not trigger alert thresholds
- Alert fired but Activity Log export not working

---

## Ripley's Activity Log Claim - Verification Status

**Ripley's Statement**: "Activity Log diagnostics ARE configured"

**Parker's Verification**:
1. ✅ `AzureDiagnostics` table exists in workspace
2. ❌ `properties_s` column does NOT exist (schema mismatch)
3. ❌ No alert firing events in `AzureActivity` table
4. ⚠️ Cannot confirm Activity Log export is actually ingesting alert data

**Verdict**: **Configuration may exist, but data not flowing or query schema incorrect**.

---

## KQL Evidence Status Decision

### Query 1: scenario-oom-killed.kql
**Status**: ⏳ **BLOCKED - Container Insights Not Ingesting**
**Reason**: `KubeEvents` table has zero data (24h window)
**Next Action**: Requires Ripley/John to diagnose Container Insights pipeline

### Query 2: pod-lifecycle.kql
**Status**: ⏳ **BLOCKED - Container Insights Not Ingesting**
**Reason**: `KubePodInventory` table has zero data (24h window)
**Next Action**: Requires Ripley/John to diagnose Container Insights pipeline

### Query 3: alert-history.kql
**Status**: ❌ **BLOCKED - Query Schema Error**
**Reason**: `properties_s` column does not exist in `AzureDiagnostics`
**Next Action**: Propose corrected query OR confirm no alert deployed

**Overall KQL Evidence**: ❌ **BLOCKED** (cannot proceed without data pipeline fix)

---

## Recommended Next Steps

### Immediate (Parker Cannot Resolve)
1. **Escalate to John/Ripley**: Container Insights data pipeline not functioning
   - Workspace: `log-gridmon-dev` (e705c573-15bb-42d1-a268-1d6879dea792)
   - Symptom: Zero data in all tables (KubeEvents, KubePodInventory, Perf, Heartbeat)
   - Config: Addon enabled, ama-logs pods running, no obvious errors

2. **Verify Activity Log export**: Check if Activity Log diagnostic setting actually deployed
   - Expected: Subscription-level diagnostic setting exporting to `log-gridmon-dev`
   - Current: `AzureDiagnostics` has no `properties_s` column

3. **Confirm alert deployment**: Check if `deployAlerts = true` in deployment parameters
   - If alerts not deployed, alert-history.kql will always return 0 rows (expected)

### Defer to Post-Pipeline-Fix
4. **Retry KQL queries** once Container Insights ingestion confirmed working
5. **Correct alert-history.kql** if Activity Log export exists but schema different
6. **Mark KQL evidence as PASS** only after actual data collection succeeds

---

## Decision Inbox Note

**For**: John Stelter
**Subject**: KQL Evidence Blocked - Container Insights Data Pipeline Issue

**Summary**:
- Container Insights addon enabled, ama-logs pods running, but **zero data ingestion**
- All queries return 0 rows (not ingestion delay - pipeline broken)
- Alert history query has schema error (`properties_s` missing)
- Cannot complete KQL evidence collection until pipeline fixed

**Request**:
1. Diagnose why Container Insights not ingesting to `log-gridmon-dev`
2. Verify Activity Log diagnostic export configured (Ripley's claim)
3. Confirm if alert rules deployed (`deployAlerts` parameter)

**Evidence Status Impact**:
- kubectl evidence: ✅ COMPLETE (authorized for Git commit)
- KQL evidence: ❌ BLOCKED (pipeline issue)
- SRE Agent evidence: ⏳ PENDING_HUMAN_PORTAL (awaiting John)

---

## Files Updated

- `kql-results/scenario-oom-killed-raw-retry.json` (empty/failed)
- `kql-results/pod-lifecycle-raw-retry.json` (empty/failed)
- This report: `KQL-RETRY-FINDINGS.md`

**Next Update**: After Container Insights pipeline fixed, retry all 3 queries and document actual results.

---

**Parker SRE Dev** | 2026-04-26T02:43:16Z
*No fabricated data. Evidence status reflects actual findings.*
