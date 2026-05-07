# Azure SRE Agent Setup Guide

This guide walks you through setting up Azure SRE Agent to work with the demo lab environment.

## What is Azure SRE Agent?

Azure SRE Agent (GA) is an AI-powered site reliability engineering automation tool that helps you:

- **Diagnose issues** in Azure resources using natural language
- **Investigate incidents** across AKS, App Service, Container Apps, and more
- **Prepare operator-controlled remediation** in Review mode for supported flows
- **Keep diagnosis evidence-oriented** using connected resource context and approved demo signals

## Prerequisites

Before creating an SRE Agent, ensure you have:

- ✅ Deployed the demo lab infrastructure (`scripts/deploy.ps1`)
- ✅ Access to a supported Azure region (East US 2, Sweden Central, Australia East)
- ✅ `Microsoft.Authorization/roleAssignments/write` permission
- ✅ Firewall allows access to `*.azuresre.ai`

## Step 1: Create an SRE Agent

### Automated via Bicep (Default)

The SRE Agent is deployed automatically as part of `scripts/deploy.ps1` using the `Microsoft.App/agents@2026-01-01` resource type and `upgradeChannel: 'Stable'`. The deployment:

- Creates the SRE Agent resource
- Creates a user-assigned managed identity
- Assigns roles based on `sreAgentAccessLevel` (default `Low`: Reader + Log Analytics Reader only)
- Grants the deploying user the **SRE Agent Administrator** role

> **Access level**: `main.bicepparam` sets `sreAgentAccessLevel = 'High'` for the internal remediation demo. This is intentional — see `docs/SRE-AGENT-SETUP.md` for the access-level guide. For external demos, pass `-SreAgentAccessLevel Low` (the parameter default) to `deploy.ps1`.

> **API version pin**: This lab pins the latest documented GA ARM API, `Microsoft.App/agents@2026-01-01`, and does not fall back to the legacy preview API. If provider metadata in the active subscription has not exposed `2026-01-01` yet, `scripts/deploy.ps1` deploys the core lab and skips SRE Agent with a clear warning.
> Use `.\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2 -MetadataOnly` to confirm provider metadata exposure before a demo.

To skip SRE Agent deployment, set `deploySreAgent = false` in `infra/bicep/main.bicepparam`.

### Via Azure Portal (Alternative)

You can also create the agent manually:

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Search for "SRE Agent" in the search bar
3. Click **Create SRE Agent**
4. Configure:
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new or use existing (separate from demo resources)
   - **Name**: `sre-agent-demo` (or your preferred name)
   - **Region**: Must match one of: `East US 2`, `Sweden Central`, `Australia East`

5. Click **Review + Create**, then **Create**

### What Gets Created

When you create an SRE Agent, Azure automatically provisions:
- Application Insights instance
- Log Analytics Workspace
- Managed Identity for the agent

## Step 2: Configure Agent Permissions

The SRE Agent needs access to your Azure resources to diagnose issues — and, for internal demos only, prepare operator-controlled Review-mode remediation.

> **Note**: When deployed via Bicep (default), the agent's managed identity receives roles determined by `sreAgentAccessLevel` (default `Low`). The script below can grant additional roles and aligns to the same access-level gate.

### Grant Access to Demo Resources

1. Get the SRE Agent's managed identity Object ID from the portal
2. Run the RBAC configuration script:

```powershell
.\scripts\configure-rbac.ps1 `
    -ResourceGroupName "rg-srelab-eastus2" `
    -SreAgentPrincipalId "<sre-agent-object-id>"
```

### Permissions Granted to SRE Agent

The permissions granted depend on the `SreAgentAccessLevel` parameter (default: `Low`).

#### Low access (default) — diagnosis only

Safe for external/customer-facing demos. Set via `sreAgentAccessLevel = 'Low'` in Bicep or `-SreAgentAccessLevel Low` in scripts.

| Scope | Role | What It Allows |
|-------|------|----------------|
| **Resource Group** | Reader | Read metadata for all resources |
| **Resource Group** | Log Analytics Reader | Query and analyze logs |
| **Log Analytics** | Log Analytics Reader | Query and analyze logs (explicit) |
| **Key Vault** | Key Vault Secrets User | Read secrets (get/list only) |
| **Container Registry** | AcrPull | Pull container images |

SRE Agent can diagnose issues, query logs, surface hypotheses, and recommend remediations. It **cannot** write to or modify any resource.

#### High access — remediation demos (internal only)

Required for internal demo flows where SRE Agent prepares or proposes operator-controlled Review-mode remediation. Set via `sreAgentAccessLevel = 'High'` in `main.bicepparam` and `-SreAgentAccessLevel High` in scripts.

> ⚠️ **Do not use High access for external or customer-facing demos.**

| Scope | Role | What It Allows |
|-------|------|----------------|
| **Resource Group** | Reader | Read metadata for all resources |
| **Resource Group** | Log Analytics Reader | Query and analyze logs |
| **Resource Group** | Contributor | Read/write access to all resources |
| **Subscription** | Reader | Broader context for diagnosis |
| **AKS Cluster** | AKS Cluster Admin Role | kubectl access to cluster |
| **AKS Cluster** | AKS RBAC Cluster Admin | Full Kubernetes RBAC permissions |
| **AKS Cluster** | AKS Contributor Role | Scale nodes, update cluster config |
| **Log Analytics** | Log Analytics Reader | Query and analyze logs |
| **Key Vault** | Key Vault Secrets User | Read secrets (get/list only) |
| **Container Registry** | AcrPull | Pull container images |

> **Note (M-8, fixed)**: Key Vault Secrets Officer was downgraded to Secrets User. If a demo flow requires secret rotation via SRE Agent, grant Secrets Officer manually for that session only.

### Choosing an access level

| Context | Use |
|---------|-----|
| External / customer-facing demo | `Low` |
| Internal lab — diagnosis walkthrough | `Low` |
| Internal lab — Review-mode remediation demo | `High` |
| Production / security review | `Low` (or omit SRE Agent entirely) |

To deploy with explicit access level control:

```powershell
# External demo — diagnosis only (default):
.\scripts\deploy.ps1 -Location eastus2 -Yes

# Internal remediation demo:
.\scripts\deploy.ps1 -Location eastus2 -SreAgentAccessLevel High -Yes
```

Or standalone RBAC configuration:

```powershell
# Low (diagnosis only):
.\scripts\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>"

# High (remediation):
.\scripts\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>" -SreAgentAccessLevel High
```

### SRE Agent User Roles

Assign these roles to **users** who will interact with SRE Agent:

| Role | Description |
|------|-------------|
| **SRE Agent Admin** | Full access - create agents, manage settings, assign roles |
| **SRE Agent Standard User** | Chat with agent, run diagnostics, and run operator-approved Review-mode remediation |
| **SRE Agent Reader** | View-only access to agent and chat history |

Assign roles to users via Azure Portal:
1. Navigate to your SRE Agent resource
2. Go to **Access control (IAM)**
3. Click **Add role assignment**
4. Select the appropriate role and assign to users/groups

## Step 3: Connect Resources to SRE Agent

### Connect AKS Cluster

1. In the SRE Agent portal, go to **Connected resources**
2. Click **Add resource**
3. Select your AKS cluster: `aks-srelab`
4. Review permissions and confirm

### Connect Other Resources

You can also connect:
- Log Analytics Workspace
- Application Insights
- Azure Monitor Workspace (Prometheus)
- Managed Grafana

## Step 4: Start Diagnosing!

Once connected, you can interact with SRE Agent using natural language:

### Starter Prompts for AKS

- "Show me the health status of my AKS cluster"
- "Why are pods crashing in the energy namespace?"
- "What's causing high CPU usage on my nodes?"
- "List all pods that have restarted in the last hour"
- "Diagnose the CrashLoopBackOff error for the meter-service pod"

### Starter Prompts for General Diagnosis

- "What issues are affecting my application right now?"
- "Show me errors from the last 24 hours"
- "Analyze the performance metrics and identify bottlenecks"
- "What changes were made to my resources recently?"

## Using SRE Agent with Demo Scenarios

### Example: Diagnosing OOMKilled Pods

1. **Break the application:**
   ```bash
   kubectl apply -f k8s/scenarios/oom-killed.yaml
   ```

2. **Wait for pods to crash** (1-2 minutes)

3. **Ask SRE Agent:**
   > "I'm seeing pods crash in the energy namespace. Can you diagnose the issue?"

4. **Expected Response:**
   - SRE Agent will identify OOMKilled events
   - Recommend increasing memory limits
   - May offer to prepare a Review-mode remediation action for operator approval

5. **Fix the issue:**
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```

### Example: Diagnosing Network Issues

1. **Apply network policy:**
   ```bash
   kubectl apply -f k8s/scenarios/network-block.yaml
   ```

2. **Ask SRE Agent:**
   > "The meter-service seems to be unreachable. What's blocking traffic?"

3. **Expected Response:**
   - Identifies blocking network policy
   - Shows affected pods
   - Recommends removing or modifying the policy

### Troubleshooting: Public LoadBalancer Not Responding

If you break a scenario and the public LoadBalancer stops responding, it's **not** the scenario — it's an Azure networking issue. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#public-loadbalancer-not-responding) for a complete diagnostic guide.

**Quick check:**
```bash
# Does kubectl port-forward work?
kubectl port-forward -n energy svc/grid-dashboard 18080:80 &
curl -sI http://127.0.0.1:18080/

# Does in-cluster curl work?
kubectl run -n energy test --image=curlimages/curl --rm -it -- \
  curl -sI http://grid-dashboard:80/

# Both work? It's a VNet subnet NSG issue, not your scenario.
# For detailed K8s service diagnostics, see [KUBERNETES-SERVICE-TROUBLESHOOTING.md](KUBERNETES-SERVICE-TROUBLESHOOTING.md)
```

## Supportability and troubleshooting summary

The current lab supportability path is operator-led: deploy or connect SRE Agent, grant the selected RBAC level, ask diagnosis prompts, review cited evidence, and apply any fix deliberately in Review mode. Scheduled tasks, incident-triggered automatic diagnosis, and external tool integrations are not wired or validated in this repository, so they are not part of the current supportability path.

For symptom-first diagnosis and setup validation, use these links:

| Need | Link |
|------|------|
| Full troubleshooting guide | [Troubleshooting Guide](TROUBLESHOOTING.md) |
| SRE Agent setup issues | [Troubleshooting → SRE Agent Issues](TROUBLESHOOTING.md#sre-agent-issues) |
| Public LoadBalancer not responding | [Troubleshooting → Public LoadBalancer](TROUBLESHOOTING.md#public-loadbalancer-not-responding) |
| Kubernetes service diagnostics | [Kubernetes Service Troubleshooting](KUBERNETES-SERVICE-TROUBLESHOOTING.md) |
| Cost planning | [Cost Breakdown](COSTS.md) |

## Additional Resources

- [Azure SRE Agent Documentation](https://learn.microsoft.com/azure/sre-agent/)
- [SRE Agent FAQs](https://learn.microsoft.com/azure/sre-agent/faq)
- [Supported Azure Services](https://learn.microsoft.com/azure/sre-agent/overview#supported-services)
