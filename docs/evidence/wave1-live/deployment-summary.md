# Wave 1 Live Azure UAT - Deployment Evidence

**Date:** 2026-04-25
**Location:** eastus2
**Resource Group:** rg-srelab-eastus2
**Deployment Status:** ✅ SUCCESS (31/31 validation checks passed)

## Deployment Configuration

- **Workload Name:** srelab
- **Deployment Name:** sre-demo-20260425-220520
- **SRE Agent:** Enabled
- **Kubernetes Version:** 1.34
- **System Pool VM Size:** Standard_D2s_v4
- **User Pool VM Size:** Standard_D2s_v4

## Resource Inventory

All resources deployed successfully to eastus2:

| Resource Name | Type | Status |
|--------------|------|--------|
| rg-srelab-eastus2 | ResourceGroup | Succeeded |
| acrsrelabwb3prn | ContainerRegistry | Deployed |
| kv-srelab-wb3prn | KeyVault | Deployed |
| vnet-srelab | VirtualNetwork | Deployed |
| log-srelab | LogAnalytics | Deployed |
| appi-srelab | ApplicationInsights | Deployed |
| sre-srelab-wb3prnlny2wvs | ManagedIdentity | Deployed |
| sre-srelab | SRE Agent (Microsoft.App/agents) | Succeeded |
| aks-srelab | AKS Cluster | Succeeded |
| grafana-srelab-wb3prn | Managed Grafana | Deployed |
| prometheus-srelab | Prometheus (Monitor Account) | Deployed |

### Alert Rules Deployed

| Alert Name | Type |
|-----------|------|
| alert-srelab-crashloop-oom | ScheduledQueryRule |
| alert-srelab-pod-restarts | ScheduledQueryRule |
| alert-srelab-http-5xx | ScheduledQueryRule |
| alert-srelab-pod-failures | ScheduledQueryRule |

**Total Scheduled Query Alerts:** 4 ✅

## Log Analytics Validation

**Workspace:** log-srelab
**Retention:** 90 days ✅
**Location:** eastus2

## Activity Log Diagnostics

**Diagnostic Setting:** activity-log-srelab
**Status:** Deployed at subscription scope ✅
**Target Workspace:** log-srelab
**Enabled Categories:**
- Administrative ✅
- Security ✅
- ServiceHealth ✅
- Alert ✅
- Recommendation ✅
- Policy ✅
- Autoscale ✅
- ResourceHealth ✅

## SRE Agent Validation

**Resource Name:** sre-srelab
**Type:** Microsoft.App/agents
**Location:** eastus2
**Provisioning State:** Succeeded ✅
**API Version:** 2025-05-01-preview

## AKS & Container Insights

**Cluster Name:** aks-srelab
**Provisioning State:** Succeeded ✅
**Container Insights:** Enabled ✅
**OMS Agent:** Enabled with AAD Auth
**Workspace Integration:** log-srelab

## Kubernetes Application Status

**Namespace:** energy
**Total Pods:** 12/12 running ✅

**Services Deployed:**
- asset-service (ClusterIP)
- dispatch-service (ClusterIP)
- grid-dashboard (LoadBalancer)
- meter-service (ClusterIP)
- mongodb (ClusterIP)
- ops-console (LoadBalancer)
- rabbitmq (ClusterIP)

**External Endpoints:**
- Grid Dashboard: http://4.152.140.46
- Ops Console: (LoadBalancer)

## Validation Results

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VALIDATION SUMMARY: 31/31 checks passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ All checks passed! Your deployment is healthy.
```

### Validation Checklist

- [x] Resource Group exists
- [x] AKS Cluster exists and running
- [x] AKS API is public (required for SRE Agent)
- [x] Container Registry exists
- [x] Log Analytics Workspace exists with 90-day retention
- [x] Application Insights exists
- [x] Key Vault exists
- [x] Managed Grafana exists
- [x] kubectl can connect to cluster
- [x] All nodes are Ready
- [x] Namespace 'energy' exists
- [x] 12/12 pods running
- [x] All services deployed
- [x] Activity Log diagnostic setting exists at subscription scope
- [x] 4 scheduled query alerts deployed
- [x] SRE Agent resource exists and provisioned
- [x] Container Insights enabled

## Evidence Verification Criteria ✅

Per Wave 1 requirements:

1. **Resource group and resource inventory** ✅ — 15+ resources deployed
2. **Log Analytics retention is 90** ✅ — Confirmed: 90 days
3. **Activity Log diagnostic setting exists at subscription scope and targets the workspace** ✅ — activity-log-srelab configured
4. **Exactly four scheduled query alerts are deployed** ✅ — crashloop-oom, pod-restarts, http-5xx, pod-failures
5. **SRE Agent resource exists** ✅ — sre-srelab (Microsoft.App/agents) in Succeeded state
6. **AKS exists and Container Insights is enabled** ✅ — aks-srelab with omsagent enabled

## Next Steps

1. Open SRE Agent Portal: https://aka.ms/sreagent/portal
2. Apply breakable scenario: `kubectl apply -f k8s/scenarios/oom-killed.yaml`
3. Test SRE Agent diagnosis: "Why are pods crashing in the energy namespace?"
4. Restore healthy state: `fix-all` or `kubectl apply -f k8s/base/application.yaml`

---

**Deployment Completed:** 2026-04-25T22:05:20Z
**Evidence Captured:** 2026-04-25T22:15:00Z
**Validator:** Ripley (Infra Dev)
