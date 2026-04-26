# AKS Cluster Health Investigation - Wave 1 Blocker Resolution

**Date:** 2026-04-25T22:25:00Z
**Blocker Reporter:** Parker (SRE)
**Investigator:** Ripley (Infra Dev)
**Priority:** Critical - Wave 1 UAT blocker

## Initial Report

**Symptom:** 4/5 nodes NotReady, all energy pods Pending
**Impact:** Blocks Parker's OOMKilled scenario testing
**Status at Investigation:** ✅ RESOLVED - Cluster fully healthy

## Current Cluster Health Status

### Node Status - All Healthy ✅

```
NAME                               STATUS   AGE     VERSION
aks-system-33466352-vmss000004     Ready    10m     v1.34.4
aks-workload-33466352-vmss00000b   Ready    3h16m   v1.34.4
aks-workload-33466352-vmss00000c   Ready    11m     v1.34.4
aks-workload-33466352-vmss00000d   Ready    11m     v1.34.4
aks-workload-33466352-vmss00000e   Ready    10m     v1.34.4
```

**Total Nodes:** 5
**Ready Nodes:** 5/5 (100%)
**NotReady Nodes:** 0

### Pod Status - All Healthy ✅

```
Namespace: energy
Total Pods:     12
Running:        12/12 (100%)
Pending:        0
CrashLoop:      0
Error:          0
```

**Deployments:**
- asset-service: 2/2 available
- dispatch-service: 2/2 available
- grid-dashboard: 2/2 available
- grid-worker: 0/0 available (intentionally scaled to 0)
- load-simulator: 1/1 available
- meter-service: 2/2 available
- mongodb: 1/1 available
- ops-console: 1/1 available
- rabbitmq: 1/1 available

### Node Resource Usage

```
NODE                               CPU(%)   MEMORY(%)
aks-system-33466352-vmss000004     10%      27%
aks-workload-33466352-vmss00000b   19%      53%
aks-workload-33466352-vmss00000c   38%      36%
aks-workload-33466352-vmss00000d   40%      35%
aks-workload-33466352-vmss00000e   44%      29%
```

All nodes within healthy resource utilization thresholds.

### Node Pool Configuration

| Pool     | Count | VM Size          | Provisioning State | Power State |
|----------|-------|------------------|-------------------|-------------|
| system   | 1     | Standard_D2s_v4  | Succeeded         | Running     |
| workload | 4     | Standard_D2s_v4  | Succeeded         | Running     |

**Cluster Power State:** Running
**Provisioning State:** Succeeded

## Root Cause Analysis

### Timeline Reconstruction

Based on node ages and deployment logs:

1. **~3h16m ago:** Initial deployment completed
   - Original workload node: vmss00000b (oldest workload node)
   - All pods initially scheduled successfully

2. **~11-10m ago:** Node pool scaling/replacement event
   - 4 new nodes joined: vmss00000c, vmss00000d, vmss00000e, vmss000004 (system)
   - Nodes went through initialization: pulling images, starting kubelet, joining cluster
   - During this window: nodes show as NotReady while bootstrapping

3. **~4m ago:** Pod rescheduling activity
   - meter-service pods rescheduled (visible in events)
   - Pods redistributed across newly available nodes
   - All pods reached Running state

### Likely Root Cause

**Azure AKS node pool upgrade/replacement operation in progress**

The 10-11 minute node ages (compared to 3h16m for the oldest node) indicate AKS was:
- Replacing nodes (possibly due to VM maintenance, security patches, or cluster upgrade)
- Scaling up temporarily during replacement
- Following standard rolling upgrade pattern

This is **normal AKS behavior** during:
- Kubernetes version upgrades
- Node image updates
- VM maintenance events
- Auto-repair operations

### Evidence Supporting This Theory

1. **Node age distribution:**
   - 1 node at 3h16m (original survivor)
   - 4 nodes at 10-11m (replacement batch)

2. **Events show successful initialization:**
   - Images pulled successfully
   - Container runtime healthy
   - Kubelet healthy
   - No error conditions

3. **Timing matches Azure operations:**
   - Node replacement typically takes 10-15 minutes
   - Pods rescheduled automatically after nodes ready
   - Deployment rollout completed successfully

4. **No persistent issues:**
   - All node conditions healthy (no KernelDeadlock, FrequentContainerdRestart, etc.)
   - All pods running
   - Resource utilization normal

## Resolution

### Actions Taken

✅ **Investigation:** Verified current cluster state
✅ **Validation:** Confirmed all 5 nodes Ready
✅ **Validation:** Confirmed all 12 pods Running
✅ **Resource Check:** Verified healthy CPU/memory utilization
✅ **Event Analysis:** Reviewed recent cluster events
✅ **Azure State:** Confirmed cluster and node pools in Succeeded state

### No Remediation Required

The cluster self-healed through standard AKS automation. The NotReady condition Parker observed was a **transient state during node replacement**, not a persistent failure.

**Status:** Cluster is production-ready for OOMKilled scenario testing.

## Recommendations

### For Parker (SRE)

✅ **CLEARED FOR OOMKILLED TESTING**

The cluster is healthy and stable. Proceed with:
```bash
kubectl apply -f k8s/scenarios/oom-killed.yaml
```

### For Future Operations

1. **Expect brief NotReady windows during:**
   - Kubernetes version upgrades
   - Node image updates
   - Azure maintenance events
   - Auto-repair operations

2. **Wait 5-10 minutes** after initial NotReady observations before escalating — AKS often self-heals.

3. **Check node ages** (`kubectl get nodes`) to identify if replacement is in progress.

4. **Monitor Azure activity logs** for scheduled maintenance events.

### For Wave 2

Consider adding:
- Alert suppression during known maintenance windows
- Node NotReady alert with 5-minute delay before firing
- Documentation of expected transient states

## Cluster Readiness Verification

### Final Health Check Results

| Check | Status | Details |
|-------|--------|---------|
| All nodes Ready | ✅ | 5/5 nodes Ready |
| All pods Running | ✅ | 12/12 pods Running |
| No pending pods | ✅ | 0 Pending |
| No crash loops | ✅ | 0 CrashLoopBackOff |
| Resource utilization healthy | ✅ | CPU 10-44%, Memory 27-53% |
| Cluster provisioning state | ✅ | Succeeded |
| Node pools healthy | ✅ | All pools Running |
| Container runtime healthy | ✅ | No containerd issues |
| Kubelet healthy | ✅ | All kubelets up |

**Overall Status:** ✅ PRODUCTION-READY

## Evidence Captured

- Node status: All 5 nodes Ready
- Pod status: All 12 pods Running
- Node resource usage: Healthy
- Node pool configuration: All Succeeded
- Recent events: Normal initialization activity
- No error conditions detected

---

**Investigation Complete:** 2026-04-25T22:25:00Z
**Resolution:** Self-healed via standard AKS automation
**Status:** ✅ BLOCKER CLEARED — Ready for Parker's OOMKilled testing
