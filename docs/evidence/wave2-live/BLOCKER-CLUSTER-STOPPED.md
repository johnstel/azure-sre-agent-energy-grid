# Wave 2 Live Evidence Capture — BLOCKED

**Blocker**: AKS cluster `aks-srelab` is in **Stopped** power state
**Date**: 2026-04-26T07:51:12Z
**Owner**: Parker (escalating to John)
**Impact**: Cannot execute Wave 2 kubectl evidence capture for MongoDBDown and ServiceMismatch scenarios

---

## Blocker Details

```
Cluster: aks-srelab
Resource Group: rg-srelab-eastus2
Provisioning State: Succeeded
Power State: Stopped
```

**Error Output**:
```
Unable to connect to the server: dial tcp: lookup aks-srelab-e4i9pn8v.hcp.eastus2.azmk8s.io: no such host
```

**Root Cause**: Cluster control plane is not responding because the cluster has been stopped (likely for cost management after Wave 1 completion).

---

## Decision Required: Restart Cluster?

**Options**:

### Option 1: Start cluster now for Wave 2 live capture (RECOMMENDED)
```bash
az aks start --resource-group rg-srelab-eastus2 --name aks-srelab
```
- **Pros**: Complete Wave 2 kubectl + KQL evidence capture with live telemetry
- **Cons**: ~$22-28/day cluster cost until stopped again
- **Time**: ~5-10 minutes to start, ~30-45 minutes total for Wave 2 capture (both scenarios)

### Option 2: Use existing Wave 1 OOMKilled evidence as template + dry-run validation
- **Pros**: Zero cost, faster completion
- **Cons**: No live kubectl evidence for MongoDBDown/ServiceMismatch, KQL queries cannot be validated
- **Approach**:
  - Document scenario manifests and expected evidence structure
  - Generate synthetic T0-T5 evidence templates based on Wave 1 OOMKilled patterns
  - Mark as `PENDING_LIVE_VALIDATION` until cluster is restarted

### Option 3: Wait for Wave 3+ deployment window
- **Pros**: Consolidate cluster restarts to reduce cost
- **Cons**: Delays Wave 2 completion, blocks downstream demo prep

---

## Parker's Recommendation

**Start cluster now** (Option 1) if the goal is "whole killer demo done" with complete evidence. Wave 1 OOMKilled evidence proves the capture methodology works. Wave 2 scenarios are already designed and KQL queries are stable. Estimated total time: 45 minutes including cluster start.

**Escalation Path**: John to approve cluster restart or select alternative option.

---

## Evidence Preparation Status (While Cluster Stopped)

| Scenario | Manifest | KQL Query | Wave 1 Template | kubectl Structure | Status |
|----------|----------|-----------|-----------------|-------------------|--------|
| MongoDBDown | ✅ k8s/scenarios/mongodb-down.yaml | ✅ scenario-mongodb-down.kql | ✅ Available | ✅ T0-T5 defined | ⏳ PENDING_CLUSTER_START |
| ServiceMismatch | ✅ k8s/scenarios/service-mismatch.yaml | ✅ scenario-service-mismatch.kql | ✅ Available | ✅ T0-T5 defined | ⏳ PENDING_CLUSTER_START |

**All scenario assets ready**. Cluster start is the only blocker for live capture.
