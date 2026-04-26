# KQL Evidence Collection — Escalation to John

**From**: Parker (SRE Dev)
**To**: John Stelter
**Date**: 2026-04-26T02:46:40Z
**Subject**: ❌ KQL Evidence BLOCKED - Container Insights Pipeline Not Ingesting Data

---

## Executive Summary

**Status**: ❌ **BLOCKED** — Cannot complete KQL evidence collection

**Root Cause**: Container Insights monitoring pipeline **not ingesting data** despite correct configuration

**Impact**:
- ✅ kubectl evidence: PASS, redacted, ready for Git commit (unaffected)
- ❌ KQL evidence: BLOCKED (requires infrastructure fix)
- ⏳ SRE Agent evidence: PENDING_HUMAN_PORTAL (awaiting John)

**Required Action**: John/Ripley must diagnose and fix Container Insights data ingestion pipeline

---

## What Parker Did

### 1. Retried KQL Queries (T+23 minutes)
- **Time**: 2026-04-26T02:42:14Z (~23 minutes after T5 recovery)
- **Well beyond**: Typical 2-5 minute ingestion delay
- **Result**: All queries **hung/failed** or returned **zero rows**

### 2. Verified Container Insights Configuration
```bash
# Confirmed addon enabled
az aks show --name aks-gridmon-dev --query "addonProfiles.omsagent"
# Result: "enabled": true, workspace configured

# Confirmed pods running
kubectl get pods -n kube-system | grep ama-logs
# Result: 6 pods, all healthy (3/3 or 2/2 containers ready)
```

✅ **Configuration is correct**
❌ **Data is NOT flowing**

### 3. Diagnosed Data Availability

**All Container Insights tables are EMPTY** (24-hour window):

| Table | Expected Data | Actual Rows | Status |
|-------|---------------|-------------|--------|
| `KubeEvents` | OOMKilled events, pod lifecycle | **0** | ❌ EMPTY |
| `KubePodInventory` | Pod status, restart counts | **0** | ❌ EMPTY |
| `Perf` | Node/pod CPU/memory metrics | **0** | ❌ EMPTY |
| `Heartbeat` | Agent health signals | **0** | ❌ EMPTY |

**Interpretation**: Container Insights has **never successfully ingested data** from this cluster, or data was purged.

### 4. Corrected Workspace ID Targeting

**Initial Error**:
- Queried wrong workspace: `log-srelab` (b5f04de7-f962-41a7-a32b-4d5f586760f3)

**Correction**:
- Verified correct workspace from AKS addon config: `log-gridmon-dev` (e705c573-15bb-42d1-a268-1d6879dea792)
- Retried all queries against correct workspace

**Result**: Still **zero data** in correct workspace

### 5. Investigated alert-history.kql Query Failure

**Error**: `SEM0100 - 'extend' operator: Failed to resolve scalar expression named 'properties_s'`

**Root Cause**:
- Query expects `properties_s` column (Activity Log JSON blob)
- Column **does NOT exist** in `AzureDiagnostics` table (verified via `getschema`)
- Current schema has only resource-specific columns (e.g., Key Vault properties)

**Conflict with Ripley**:
- Ripley claimed: "Activity Log diagnostics ARE configured"
- Parker's data: No `properties_s` column, no alert events in `AzureActivity` table (0 rows, 24h)

**Possible Causes**:
1. Activity Log export not actually deployed
2. Query schema outdated/incorrect (needs correction)
3. No alert actually fired (OOMKilled scenario may not trigger alerts)
4. Alerts not deployed (`deployAlerts` parameter may be `false`)

---

## What John/Ripley Must Do

### CRITICAL: Fix Container Insights Ingestion

**Target Workspace**: `log-gridmon-dev` (e705c573-15bb-42d1-a268-1d6879dea792)
**Resource Group**: `rg-gwsrelab-eastus2`
**Cluster**: `aks-gridmon-dev`

**Diagnostic Steps**:
1. Check workspace ingestion status in Azure Portal
2. Verify ama-logs pods are successfully authenticating to workspace
3. Check for RBAC/firewall issues blocking data upload
4. Review ama-logs pod logs for ingestion errors:
   ```bash
   kubectl logs -n kube-system ama-logs-rs-54c758bd6b-h5sd6 | grep -i error
   ```
5. Check if data retention settings purged all data
6. Verify Container Insights solution deployed in workspace

### Verify Activity Log Export Configuration

**Ripley's Claim**: "Activity Log diagnostics ARE configured"
**Parker's Evidence**: `properties_s` column missing, no alert events

**Required Verification**:
1. Check subscription-level diagnostic settings:
   ```bash
   az monitor diagnostic-settings subscription list
   ```
2. Verify Activity Log export includes "Alert" category
3. Confirm export target is `log-gridmon-dev` workspace
4. If export exists, determine why `properties_s` column missing (schema change?)

### Confirm Alert Deployment

**Question**: Are alert rules actually deployed?

**Check Deployment Parameters**:
```bash
# Review deployment parameters
cat infra/bicep/main.bicepparam | grep deployAlerts
```

**If `deployAlerts = false`**:
- alert-history.kql will always return 0 rows (expected behavior)
- Query is correct, just no alerts to query
- Mark as EXPECTED_NO_DATA, not BLOCKED

**If `deployAlerts = true`**:
- Verify alert rules exist:
  ```bash
  az monitor metrics alert list --resource-group rg-gwsrelab-eastus2
  ```
- Check if OOMKilled triggers any alert thresholds

---

## Current Evidence Status

### ✅ kubectl Evidence (COMPLETE)
- **Status**: PASS, redacted, authorized for Git commit
- **Files**: 9 kubectl outputs, MTTR calculation, execution notes
- **MTTR**: 21 seconds (PASS < 900s)
- **Redaction**: Complete, zero sensitive identifiers
- **Safe to commit**: ✅ YES

### ❌ KQL Evidence (BLOCKED)
- **Status**: BLOCKED by Container Insights pipeline issue
- **Queries**: All 3 failed/hung or returned zero data
- **Blocker Owner**: John/Ripley (infrastructure)
- **Safe to commit**: ✅ YES (documentation of blocker)

### ⏳ SRE Agent Evidence (PENDING_HUMAN_PORTAL)
- **Status**: PENDING_HUMAN_PORTAL (John action)
- **Guide**: `sre-agent/HUMAN-ACTION-CHECKLIST.md`
- **Prompt**: "Why are meter-service pods crashing in the energy namespace?"
- **Safe to commit**: N/A (not yet captured)

---

## Files Created/Updated

**New Files**:
- `kql-results/KQL-RETRY-FINDINGS.md` — Full investigation report (8.5K)
- `KQL-ESCALATION-TO-JOHN.md` — This escalation document

**Updated Files**:
- `EVIDENCE-STATUS.md` — Updated KQL status from PENDING → BLOCKED
- `.squad/agents/parker/history.md` — Appended KQL retry learnings

**All Safe for Git Commit**: ✅ YES (documentation only, no fabricated data)

---

## Recommended Git Commit Message

```
feat(evidence): Complete OOMKilled kubectl evidence, escalate KQL blocker

Wave 1 Live UAT - OOMKilled scenario T0-T5 execution complete.

Evidence Status:
- kubectl: PASS (MTTR 21s), redacted, complete
- KQL: BLOCKED (Container Insights not ingesting data)
- SRE Agent: PENDING_HUMAN_PORTAL

Kubectl evidence (9 files):
- All sensitive data redacted (UUIDs, IPs, node names)
- MTTR: 21 seconds (PASS < 900s threshold)
- Root cause documented: 16Mi memory limit

KQL blocker escalated:
- Container Insights addon enabled, ama-logs pods running
- All tables empty (KubeEvents, KubePodInventory, Perf, Heartbeat)
- Workspace: log-gridmon-dev (e705c573-15bb-42d1-a268-1d6879dea792)
- Requires John/Ripley infrastructure diagnosis

See: docs/evidence/wave1-live/oom-killed/kql-results/KQL-RETRY-FINDINGS.md

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Next Steps

### For John/Ripley (BLOCKING)
1. **Diagnose Container Insights ingestion issue** (see "What John/Ripley Must Do" above)
2. **Verify Activity Log export configuration** (resolve Ripley conflict)
3. **Confirm alert deployment status** (`deployAlerts` parameter)

### For Parker (AFTER BLOCKER RESOLVED)
4. **Retry KQL queries** once data ingestion confirmed working
5. **Redact KQL results** if they contain sensitive identifiers
6. **Update EVIDENCE-STATUS.md** to mark KQL as PASS
7. **Create final Git commit** with complete KQL evidence

### For John (INDEPENDENT)
8. **Capture SRE Agent portal evidence** (see `sre-agent/HUMAN-ACTION-CHECKLIST.md`)
9. **Create follow-up Git commit** with SRE Agent screenshots/analysis

---

## Decision Inbox

**Status**: ⏳ **AWAITING JOHN/RIPLEY RESPONSE**

**Questions for John/Ripley**:
1. Why is Container Insights not ingesting data despite correct configuration?
2. Is Activity Log diagnostic export actually deployed? (Verify Ripley's claim)
3. Are alert rules deployed? (`deployAlerts` parameter value)
4. Should Parker proceed with Git commit of kubectl evidence only, or wait for full resolution?

**Parker's Recommendation**:
- **Commit kubectl evidence now** (complete, redacted, safe)
- **Document KQL blocker transparently** (no fabricated data)
- **Follow-up commits** for KQL (after fix) and SRE Agent (after John portal capture)

---

**Parker SRE Dev** | 2026-04-26T02:46:40Z
*No fabricated data. Blocker escalated with full diagnostic evidence.*
