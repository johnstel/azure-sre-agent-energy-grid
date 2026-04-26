# 🎯 Wave 1 Container Insights UNBLOCKED

**To:** Parker (SRE)
**From:** Ripley (Infra Dev)
**Status:** ✅ RESOLVED
**Date:** 2026-04-27

## Problem

KQL queries targeting `aks-gridmon-dev` in `rg-gwsrelab-eastus2` returned zero Container Insights data for 24+ hours.

## Root Cause

Cluster `aks-gridmon-dev` was **STOPPED** (powerState). All previous troubleshooting targeted the WRONG cluster (`aks-srelab`).

## Resolution

✅ Started cluster: `az aks start --resource-group rg-gwsrelab-eastus2 --name aks-gridmon-dev`
✅ Verified cluster health: 5/5 nodes Ready, 5/5 ama-logs pods Running
✅ Confirmed data ingestion: Heartbeat, KubePodInventory, KubeEvents all flowing
✅ Validated alert targets: All 4 Wave 1 alerts correctly point to `log-gridmon-dev`

## Evidence

**File:** `docs/evidence/wave1-live/gridmon-dev-verification.md`

**Key Metrics (last 20 minutes):**
- Heartbeat: 11 records (5 nodes)
- KubePodInventory: 202 records
- KubeEvents: 106 records
- Ingestion latency: < 5 minutes

**Workspace:** `log-gridmon-dev` (30-day retention)

## KQL Validation Queries

All queries now returning data. You can retry:

```kql
// Heartbeat check
Heartbeat
| where TimeGenerated > ago(20m)
| summarize count() by Computer

// KubePodInventory check
KubePodInventory
| where TimeGenerated > ago(20m)
| summarize count() by Namespace

// KubeEvents check
KubeEvents
| where TimeGenerated > ago(20m)
| summarize count() by ObjectKind
```

## Alert Rules Verified

All 4 Wave 1 alerts enabled and targeting correct workspace:

| Alert | Workspace | Table | Namespace Filter |
|-------|-----------|-------|-----------------|
| alert-gridmon-dev-crashloop | log-gridmon-dev | KubePodInventory | utility-grid |
| alert-gridmon-dev-oom-kill | log-gridmon-dev | KubePodInventory | utility-grid |
| alert-gridmon-dev-pod-pending | log-gridmon-dev | KubePodInventory | utility-grid |
| alert-gridmon-dev-data-staleness | log-gridmon-dev | ContainerLog | utility-grid |

**Note:** `utility-grid` namespace currently has no pods. Alerts are ready but won't fire until workload is deployed.

## Next Steps

1. **Retry your KQL queries** on workspace `log-gridmon-dev` — should now return data
2. **Deploy workload to utility-grid** if you need to test alert firing (optional)
3. **Capture Wave 1 evidence** if this satisfies your KQL gate criteria
4. **Notify me to stop cluster** after evidence captured to minimize costs (~$140/month if left running)

## Cluster Details

- **Cluster:** aks-gridmon-dev
- **Resource Group:** rg-gwsrelab-eastus2
- **Workspace:** log-gridmon-dev
- **Nodes:** 5 (1 system, 4 workload)
- **VM Size:** Standard_B2ms
- **Power State:** **RUNNING** ⚡
- **Cost:** ~$4.50/day if left running

## Questions?

Let me know if:
- KQL queries still failing (shouldn't be!)
- Need help deploying test workload to utility-grid
- Want cluster stopped after evidence capture
- Need any additional verification

**Wave 1 Container Insights blocker is RESOLVED.** 🎉
