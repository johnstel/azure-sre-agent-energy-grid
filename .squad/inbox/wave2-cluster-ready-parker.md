---
from: Ripley
to: Parker
date: 2026-04-26T08:20:00Z
subject: Wave 2 Cluster Ready - aks-srelab Running
priority: HIGH
---

# Wave 2 Cluster Ready for Live Capture

## TL;DR

**aks-srelab** is running, healthy, and ready for MongoDBDown + ServiceMismatch live evidence capture. All baseline pods healthy, Container Insights active, workspace confirmed as `log-srelab`.

---

## Cluster Details (VERIFIED)

| Resource | Value |
|----------|-------|
| **Cluster** | `aks-srelab` |
| **Resource Group** | `rg-srelab-eastus2` |
| **Workspace** | `log-srelab` |
| **Location** | `eastus2` |
| **Power State** | ✅ **Running** |
| **Provisioning State** | ✅ **Succeeded** |

---

## Readiness Verification

### Nodes: ✅ 4/4 Ready
- `aks-system-33466352-vmss000005` (9% CPU, 30% memory)
- `aks-workload-33466352-vmss00000f` (27% CPU, 44% memory)
- `aks-workload-33466352-vmss00000g` (20% CPU, 26% memory)
- `aks-workload-33466352-vmss00000h` (25% CPU, 35% memory)

### Baseline Workload: ✅ 12/12 Running
All `energy` namespace pods healthy:
- `asset-service` (2 replicas)
- `dispatch-service` (2 replicas)
- `grid-dashboard` (2 replicas)
- `meter-service` (2 replicas)
- `load-simulator` (1 replica)
- `mongodb` (1 replica)
- `ops-console` (1 replica)
- `rabbitmq` (1 replica)

### Container Insights: ✅ Active
- 5 `ama-logs` pods running (4 DaemonSet + 1 ReplicaSet)
- Workspace target confirmed: `/subscriptions/[REDACTED]/resourceGroups/rg-srelab-eastus2/providers/Microsoft.OperationalInsights/workspaces/log-srelab`
- Data ingestion expected within 5-10 minutes

### Kubectl Context: ✅ `aks-srelab`
Current context set correctly. Your execution guides use the right cluster.

---

## Wave 1 vs Wave 2 Clusters (Clarification)

| Wave | Cluster | Resource Group | Workspace | Status |
|------|---------|----------------|-----------|--------|
| **Wave 1** | `aks-gridmon-dev` | `rg-gwsrelab-eastus2` | `log-gridmon-dev` | Stopped (completed) |
| **Wave 2** | `aks-srelab` | `rg-srelab-eastus2` | `log-srelab` | **Running (active)** |

Your Wave 2 execution guides (`mongodb-down/EXECUTION-GUIDE.md`, `service-mismatch/EXECUTION-GUIDE.md`) already reference the correct cluster (`aks-srelab`). No changes needed.

---

## Next Actions for Parker

1. ✅ Cluster is ready - proceed with MongoDBDown live capture
2. ✅ All pre-flight checks in your guides will pass
3. ✅ Use `log-srelab` workspace for KQL queries (not `log-gridmon-dev`)
4. ⏸️ **DO NOT STOP CLUSTER** until Wave 2 evidence complete (Lambert + you confirm)

---

## Timeline

- **08:03 UTC**: Cluster start initiated (`az aks start`)
- **08:05 UTC**: Power state transitioned to `Running`
- **08:11 UTC**: All 4 nodes Ready, API server responsive
- **08:13 UTC**: Baseline workload verified (12/12 Running)
- **08:15 UTC**: Container Insights pods running (ama-logs active)
- **08:20 UTC**: Readiness verification complete

---

## Cost Note

Cluster will remain running until you and Lambert close Wave 2 live capture. Estimated cost: ~$1.50-2.00/hour for 4-node cluster. Stop immediately after evidence complete.

---

**Ripley's Verdict**: ✅ **UNBLOCKED** - Execute MongoDBDown + ServiceMismatch at will.
