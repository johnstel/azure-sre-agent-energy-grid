# Cost Estimation Guide

This document is the canonical cost model for running the Azure SRE Agent Energy Grid Demo Lab.

> **Note:** Costs are estimates based on the repository defaults for East US 2 and Azure retail price samples. Actual charges vary by region, telemetry volume, autoscaling, SRE Agent usage, discounts, and Azure pricing changes. Verify live spend in Azure Cost Management before leaving the lab running.

## Scope and Assumptions

The baseline estimate assumes the default `scripts/deploy.ps1 -Location eastus2` / `infra/bicep/main.bicepparam` shape unless stated otherwise:

| Setting | Default |
|---------|---------|
| Region | `eastus2` |
| Resource group | `rg-srelab-eastus2` |
| AKS tier | Standard |
| System node pool | 2 initial `Standard_D2s_v6` nodes, autoscale 1-5 |
| Workload node pool | 3 initial `Standard_D2s_v6` nodes, autoscale 1-10 |
| ACR | Basic SKU, admin disabled |
| Observability | `deployObservability=true` for Managed Grafana + Azure Monitor managed Prometheus |
| Alerts | `deployAlerts=true` for four scheduled query alert rules |
| Log retention | Log Analytics and Application Insights aligned to 90 days |
| SRE Agent | `deploySreAgent=true` unless `-SkipSreAgent` is used |

`deploy.ps1` defaults the SRE Agent access level to `Low` for diagnosis-only demos. `main.bicepparam` sets `High` for internal remediation demos. Access level affects permissions and demo risk more than the fixed infrastructure cost; SRE Agent usage/execution remains variable in either mode.

## Quick Cost Summary

| Component | Daily Cost | Monthly Cost | Notes |
|-----------|------------|--------------|-------|
| **AKS Control Plane** | ~$2.40 | ~$73 | Standard tier with SLA |
| **AKS Nodes (System)** | ~$4.85 | ~$147 | 2x Standard_D2s_v6 |
| **AKS Nodes (User)** | ~$7.30 | ~$221 | 3x Standard_D2s_v6 |
| **Container Registry** | ~$0.17 | ~$5 | Basic tier |
| **Log Analytics** | ~$1.50-2.50 | ~$40-60 | 90-day retention (Wave 1) + Activity Log |
| **Application Insights** | ~$0.30-0.70 | ~$10-20 | Based on data volume |
| **Managed Grafana** | ~$2.50 | ~$75 | Standard tier |
| **Azure Monitor (Prometheus)** | ~$0.50 | ~$15 | Based on metrics volume |
| **Key Vault** | ~$0.10 | ~$3 | Minimal operations |
| **Disks, Load Balancer, Public IPs, Alerts** | ~$0.50-1.00 | ~$15-30 | AKS node OS disks, MongoDB PVC, Standard LB/IPs, scheduled query rules |
| **SRE Agent** | ~$10-13 | ~$292-400 | Base + execution costs |
| **Core lab / SRE Agent skipped** | **~$24-30** | **~$660-870** | Use `-SkipSreAgent` |
| **Full demo lab / SRE Agent enabled** | **~$34-40** | **~$970-1,170** | Default deploy path when provider/API is available |

> **Wave 1 Changes:** 90-day Log Analytics retention and Activity Log export add ~$10-15/month vs. Wave 0 minimal config. This supports ARM-level audit correlation for demo evidence once live UAT verifies Activity Log export and Log Analytics retention.

## Detailed Cost Breakdown

### Azure Kubernetes Service (AKS)

#### Control Plane
- **Free Tier**: $0/month (no SLA, limited features)
- **Standard Tier**: $73/month (SLA, recommended for demos)
- **Premium Tier**: $438/month (LTS support)

**Recommendation:** Use Standard tier for demos to have SLA coverage.

#### Node Pools

| Node Pool | VM Size | Count | Unit Cost | Monthly Cost |
|-----------|---------|-------|-----------|--------------|
| System | Standard_D2s_v6 | 2 | $73.73/month | $147.46 |
| User | Standard_D2s_v6 | 3 | $73.73/month | $221.19 |

The initial deployment creates five nodes. Cluster autoscaler can reduce to two nodes at idle (`system` min 1 + `workload` min 1) or scale up to fifteen nodes (`system` max 5 + `workload` max 10). Node costs therefore move materially if demos, break/fix scenarios, or background workloads trigger scale-out.

**Cost-Saving Options:**
- Use `Standard_D2as_v6` (AMD) for ~10% savings where available
- Reduce node count during non-demo hours
- Use Reserved Instances for 30-55% savings (if running long-term)
- Use Spot instances for non-critical workloads

#### AKS-Related Platform Charges

AKS also creates supporting resources outside the Bicep modules:

| Resource | Cost impact |
|----------|-------------|
| Node OS disks | Included in the AKS node resource group; scales with node count |
| MongoDB PVC | 8 GiB `managed-csi` Azure Managed Disk for in-cluster MongoDB |
| Standard Load Balancer / Public IPs | Created by Kubernetes `LoadBalancer` services such as the dashboards |
| Network egress | Usually low for demos, but charged if traffic leaves Azure or crosses billing boundaries |

#### Maintenance-Window Node Pool Recreation Cost

When executing the blue/green `maxPods=30` drift fix (see [AKS-MAXPODS-MAINTENANCE-RUNBOOK.md](./AKS-MAXPODS-MAINTENANCE-RUNBOOK.md)), temporary `sys50` and `work50` pools run alongside the old pools before the originals are deleted. The estimate below assumes the current issue #4 maintenance shape: one temporary system node and four temporary workload nodes on `Standard_D2s_v6`. Recalculate if live node counts, VM sizes, or temporary autoscaling differ.

| Temporary Pool | VM Size | Extra Nodes | Cost/hour |
|----------------|---------|-------------|-----------|
| `sys50` | Standard_D2s_v6 | 1 | ~$0.101 |
| `work50` | Standard_D2s_v6 | 4 | ~$0.404 |
| **Total overlap** | | **5** | **~$0.51** |

A typical 2-4 hour maintenance window adds **~$1-2 per run** - negligible relative to the ~$30-40/day baseline. Once the old pools are deleted, node count returns to its pre-maintenance level with **no net cost increase**.

### Azure Container Registry

| SKU | Storage | Cost | Notes |
|-----|---------|------|-------|
| Basic | 10 GB | $5/month | Sufficient for demos |
| Standard | 100 GB | $20/month | If storing many images |

### Log Analytics Workspace

Cost is based on data ingestion:

| Data Volume | Cost |
|-------------|------|
| First 5 GB/day | Free |
| Additional data | $2.30/GB |

**Expected usage for demo:** 1-3 GB/day = $0-50/month

**Wave 1 retention:** 90 days (aligned with App Insights for evidence consistency)

The workspace has no daily ingestion cap in the default deployment. Container Insights, AKS diagnostics, Activity Log export, alert queries, and scenario churn can increase ingestion above the expected demo range.

**Retention cost impact:**
- 90 days vs. 30 days adds ~$8-12/month in retained data costs
- Supports ARM-level audit correlation per capability contracts after live retention/export validation

**Cost-Saving Options:**
- Use commitment tiers for predictable workloads
- Filter unnecessary log types (keep Container Insights, Activity Log, alerts)
- Production deployments can adjust retention based on compliance needs

### Application Insights

| Component | Pricing |
|-----------|---------|
| Data ingestion | $2.30/GB |
| First 5 GB/month | Free |

**Expected usage for demo:** ~$10-20/month

Application Insights is workspace-based in this lab. Its ingestion and retention contribute to the same evidence-retention posture as Log Analytics.

### Activity Log Export (Wave 1)

**What it does:** Exports subscription-level ARM operations to Log Analytics for SRE Agent-related ARM audit correlation.

**Cost:**
- No separate charge for Activity Log itself (included in subscription)
- Data ingestion cost: ~$2-5/month (Activity Log typically generates 0.5-2 GB/month)
- Retention cost: Included in Log Analytics retention (90 days)

**Why it's needed:**
- Enables SRE Agent to correlate K8s failures with ARM deployments, RBAC denials, or policy violations
- Supports change and RBAC correlation during complex scenario analysis

### Azure Managed Grafana

| Tier | Cost | Features |
|------|------|----------|
| Essential | $0 | Basic dashboards |
| Standard | $75/month | Full features, RBAC |

**Recommendation:** Standard tier for proper demo experience.

### Azure Monitor (Prometheus)

| Component | Pricing |
|-----------|---------|
| Metrics ingestion | $0.18/million samples |
| Query | $0.30/million samples queried |

**Expected usage for demo:** ~$10-20/month

Prometheus costs are sample-volume dependent. High-cardinality labels, aggressive scrape intervals, and long-running scenarios can increase Azure Monitor workspace charges.

### Key Vault

| Operation | Price |
|-----------|-------|
| Secrets operations | $0.03/10,000 |
| Keys operations | $0.03/10,000 |
| Storage | Included |

**Expected usage for demo:** ~$3/month

### Alert Rules

The default deployment enables four Azure Monitor scheduled query rules when `deployAlerts=true`:

- Pod restart spike
- HTTP 5xx spike
- Failed or pending pods
- CrashLoop/OOM detected

Alert-rule charges are small compared with AKS nodes and SRE Agent, but they are recurring while the resource group exists. If action groups are enabled, notification channels may add separate charges depending on configuration.

### Azure SRE Agent

SRE Agent uses Azure AI Units (AAU) billing:

| Component | Calculation | Cost |
|-----------|-------------|------|
| Base compute | 4 AAU × 730 hours × $0.10 | $292/month |
| Execution | Variable based on usage | $30-100/month |

**Total SRE Agent cost:** ~$322-400/month

Use `-SkipSreAgent` for the lower core-lab estimate. This repository pins the SRE Agent resource to `Microsoft.App/agents@2026-01-01` with `upgradeChannel: 'Stable'`; pricing, regional availability, and execution costs may change. Treat the SRE Agent line as a planning estimate and confirm actual charges in Azure Cost Management.

## Cost Optimization Strategies

### For Development/Testing

1. **Delete when not in use**
    ```powershell
    .\scripts\destroy.ps1 -ResourceGroupName "rg-srelab-eastus2"
    ```
   Confirm the resource group deletion completes in Azure Portal or Azure Cost Management. This stops most recurring charges for the lab.

2. **Scale down nodes**
    ```bash
    az aks nodepool scale --resource-group rg-srelab-eastus2 \
        --cluster-name aks-srelab --name workload --node-count 1
    ```
   Autoscaler settings may scale the pool back out during active demos.

3. **Use spot instances** for user node pool

4. **Disable optional components**
    - Set `deployObservability = false` to skip Grafana/Prometheus
    - Use `.\scripts\deploy.ps1 -SkipSreAgent` to skip SRE Agent
    - Set `deployAlerts = false` if alert rules are not needed

### For Sustained Usage

1. **Azure Reservations**
   - 1-year: ~31% savings on VMs
   - 3-year: ~53% savings on VMs

2. **Savings Plans**
   - Commit to hourly spend for discounts

3. **Right-size VMs**
   - Monitor actual usage and adjust

## Cost by Deployment Configuration

### Minimal Configuration (~$450/month)
- AKS Standard + 2 nodes
- Basic ACR
- Log Analytics (minimal retention)
- Essential Grafana (free tier)

### Standard Configuration (~$750/month)
- AKS Standard + 4 nodes
- Basic ACR
- Log Analytics
- App Insights
- Standard Grafana

### Full Demo Configuration (~$1,000/month)
- Everything enabled
- Standard Grafana + Prometheus
- Best for comprehensive demos
- Includes SRE Agent costs

## Monitoring Costs

Use Azure Cost Management to track spending:

1. Go to **Cost Management + Billing** in Azure Portal
2. Create a **Budget** with alerts
3. Set up **Cost alerts** at 50%, 75%, 100%
4. Review **Cost analysis** regularly

### Sample Budget Alert

```powershell
# Create budget via CLI
az consumption budget create `
    --budget-name "sre-demo-budget" `
    --amount 500 `
    --time-grain Monthly `
    --category Cost `
    --resource-group rg-srelab-eastus2
```

## Free Tier Resources

Take advantage of Azure Free Tier:

| Service | Free Amount |
|---------|-------------|
| Log Analytics | 5 GB/month ingestion |
| App Insights | 5 GB/month |
| Key Vault | 10,000 operations |
| Managed Grafana | Essential tier (basic features) |

## When to Consider Alternatives

### If cost is critical:
- Use **Azure Container Apps** instead of AKS (~50% cheaper)
- Use **App Service** for simpler demos
- Use **local Kubernetes** (minikube/kind) for development

### If you need more power:
- Scale up VM sizes
- Add more nodes
- Enable zone redundancy

## Summary

| Scenario | Monthly Cost |
|----------|--------------|
| Run demo for 1 hour | ~$2-3 |
| Run core lab for 1 day | ~$24-30 |
| Run full demo lab for 1 day | ~$34-40 |
| Always-on core lab | ~$660-870 |
| Always-on full demo lab | ~$970-1,170 |
| With all optimizations | ~$400-500 |

**Recommended approach:** Deploy when needed, destroy after demos, use minimal config for testing.
