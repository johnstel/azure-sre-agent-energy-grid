# Cost Estimation Guide

This document provides estimated costs for running the Azure SRE Agent Energy Grid Demo Lab.

> **Note:** Costs are estimates based on US East 2 region pricing as of 2024. Actual costs may vary based on region, usage patterns, and Azure pricing changes.

## Quick Cost Summary

| Component | Daily Cost | Monthly Cost | Notes |
|-----------|------------|--------------|-------|
| **AKS Control Plane** | ~$2.40 | $73 | Standard tier with SLA |
| **AKS Nodes (System)** | ~$4.70 | ~$140 | 2x Standard_D2s_v5 |
| **AKS Nodes (User)** | ~$7.00 | ~$210 | 3x Standard_D2s_v5 |
| **Container Registry** | ~$0.17 | ~$5 | Basic tier |
| **Log Analytics** | ~$1.50-2.50 | ~$40-60 | 90-day retention (Wave 1) + Activity Log |
| **Application Insights** | ~$0.30-0.70 | ~$10-20 | Based on data volume |
| **Managed Grafana** | ~$2.50 | ~$75 | Standard tier |
| **Azure Monitor (Prometheus)** | ~$0.50 | ~$15 | Based on metrics volume |
| **Key Vault** | ~$0.10 | ~$3 | Minimal operations |
| **SRE Agent** | ~$10-13 | ~$292-400 | Base + execution costs |
| **Total (without SRE Agent)** | **~$24-30** | **~$660-870** | Wave 1 config |
| **Total (with SRE Agent)** | **~$34-40** | **~$970-1,170** | Wave 1 config |

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
| System | Standard_D2s_v5 | 2 | $70.08/month | $140.16 |
| User | Standard_D2s_v5 | 3 | $70.08/month | $210.24 |

**Cost-Saving Options:**
- Use `Standard_D2as_v5` (AMD) for ~10% savings
- Reduce node count during non-demo hours
- Use Reserved Instances for 30-55% savings (if running long-term)
- Use Spot instances for non-critical workloads

#### Maintenance-Window Node Pool Recreation Cost

When executing the blue/green `maxPods=30` drift fix (see [AKS-MAXPODS-MAINTENANCE-RUNBOOK.md](./AKS-MAXPODS-MAINTENANCE-RUNBOOK.md)), temporary `sys50` and `work50` pools run alongside the old pools before the originals are deleted.

| Temporary Pool | VM Size | Extra Nodes | Cost/hour |
|----------------|---------|-------------|-----------|
| `sys50` | Standard_D2s_v5 | 1 | ~$0.096 |
| `work50` | Standard_D2s_v5 | 4 | ~$0.384 |
| **Total overlap** | | **5** | **~$0.48** |

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

### Key Vault

| Operation | Price |
|-----------|-------|
| Secrets operations | $0.03/10,000 |
| Keys operations | $0.03/10,000 |
| Storage | Included |

**Expected usage for demo:** ~$3/month

### Azure SRE Agent

SRE Agent uses Azure AI Units (AAU) billing:

| Component | Calculation | Cost |
|-----------|-------------|------|
| Base compute | 4 AAU × 730 hours × $0.10 | $292/month |
| Execution | Variable based on usage | $30-100/month |

**Total SRE Agent cost:** ~$322-400/month

## Cost Optimization Strategies

### For Development/Testing

1. **Delete when not in use**
   ```powershell
   .\scripts\destroy.ps1
   ```

2. **Scale down nodes**
   ```bash
   az aks nodepool scale --resource-group rg-srelab-eastus2 \
       --cluster-name aks-srelab-dev --name workload --node-count 1
   ```

3. **Use spot instances** for user node pool

4. **Disable optional components**
   - Set `deployObservability = false` to skip Grafana/Prometheus

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
| Run demo for 1 day | ~$30-40 |
| Always-on development | ~$750-1,100 |
| With all optimizations | ~$400-500 |

**Recommended approach:** Deploy when needed, destroy after demos, use minimal config for testing.
