# Azure SRE Agent Energy Grid Demo Lab ⚡

A fully automated Azure environment for demonstrating **Azure SRE Agent** capabilities using an **Energy Grid Operations Platform**. Deploy a breakable multi-service energy grid application on AKS and let SRE Agent diagnose issues and recommend fixes!

## 🎯 What This Lab Provides

- **Azure Kubernetes Service (AKS)** with a multi-pod energy grid platform
- **10 breakable scenarios** for demonstrating SRE Agent diagnosis
- **Azure SRE Agent** deployed automatically via Bicep for AI-powered diagnostics
- **Full observability stack**: Log Analytics, Application Insights, Managed Grafana
- **Ready-to-use scripts** for deployment and teardown
- **Dev container** for consistent development experience

## 🛡️ Trust & Safety Model

> **Azure SRE Agent is in Public Preview.** This demo runs in **Review mode** — the agent recommends actions and the operator executes them unless a real Preview approval UI/API is captured during portal validation. Nothing should be presented as autonomous remediation.

| Trust Tier | Configuration | What the Agent Can Do | Approval |
|------------|--------------|----------------------|----------|
| **Diagnosis Only** | `accessLevel: 'Low'` | Read logs, query metrics, analyze state | N/A — read-only |
| **Recommend & Execute** | `accessLevel: 'High'`, `mode: 'Review'` | Diagnose + recommend remediation | ✅ Operator executes unless a real Preview approval UI/API is captured |
| **Autonomous** | `accessLevel: 'High'`, `mode: 'Auto'` | Diagnose + execute autonomously | ❌ **Not demonstrated** |

This lab deploys the **Recommend & Execute** tier. For the full RBAC matrix (demo vs. production), security guardrails, and safe language guidance, see:

- [Capability Contracts](docs/CAPABILITY-CONTRACTS.md) — shared contracts, RBAC matrix, data retention
- [Demo Narrative](docs/DEMO-NARRATIVE.md) — 20-minute customer story arc and Q&A prep
- [Safe Language Guardrails](docs/SAFE-LANGUAGE-GUARDRAILS.md) — what to claim and what not to claim
- [Local Analyst Governance](docs/LOCAL-ANALYST-GOVERNANCE.md) — read-only analyst tool, RBAC, audit, and approval boundaries
- [Analyst Safe Language](docs/ANALYST-SAFE-LANGUAGE.md) — approved Local Analyst wording, confidence levels, and redaction examples
- [Demo Runbook](docs/DEMO-RUNBOOK.md) — step-by-step operator checklist

## ⚡ Energy Grid Architecture

The platform simulates an electric energy producer with grid management and retail consumer services:

| Service | Role | Technology |
|---------|------|------------|
| **grid-dashboard** | Consumer portal (usage, billing, outage maps) | Vue.js |
| **ops-console** | Grid operations console | Vue.js |
| **meter-service** | Smart meter data ingestion & billing events | Node.js |
| **asset-service** | Energy asset catalog (generators, substations, rate plans) | Rust |
| **dispatch-service** | Energy dispatch & load balancing across grid zones | Go |
| **load-simulator** | Retail consumer usage pattern generator | Python |
| **rabbitmq** | Event bus (meter events, grid alerts, dispatch commands) | RabbitMQ |
| **mongodb** | Meter readings, energy transactions, grid state | MongoDB |

## 🚀 Quick Start

### Prerequisites

- Azure subscription with Owner/Contributor access
- Azure region supporting SRE Agent: `East US 2`, `Sweden Central`, or `Australia East`
- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli) installed
- [VS Code](https://code.visualstudio.com/) with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) (optional but recommended)

![Menu](media/menu.png)

### Deploy

```powershell
# 1. Login to Azure
az login --use-device-code

# 2. Deploy infrastructure (~15-25 minutes)
.\scripts\deploy.ps1 -Location eastus2 -Yes
```

> 💡 **Tip**: Type `menu` in the terminal to see all available commands including break scenarios, fix commands, and kubectl shortcuts.

## 💥 Breaking Things (The Fun Part!)

Once deployed, you can break the application using shortcut commands:

```bash
# Meter service memory exhaustion during peak demand
break-oom

# Asset service crash — invalid grid configuration
break-crash

# Dispatch service deployment failure — bad image release
break-image

# See all scenarios
menu
```

> 💡 **Best demo impact**: Start with `break-oom`, then try `break-mongodb` for cascading failure diagnosis — see [Demo Narrative](docs/DEMO-NARRATIVE.md) for the recommended 20-minute story arc.

To restore:
```bash
kubectl apply -f k8s/base/application.yaml
# Or in the dev container: fix-all
```

## 🤖 Using SRE Agent

After deployment:

1. **Open the SRE Agent Portal** — the URL is displayed in deployment output, or visit [aka.ms/sreagent/portal](https://aka.ms/sreagent/portal)
2. **Connect it to your resources** (AKS, Log Analytics)
3. **Ask it to diagnose**:
   - "Why are pods crashing in the energy namespace?"
   - "Smart meter data isn't being processed — what's wrong?"
   - "What's causing high CPU on the grid calculation nodes?"

See [docs/SRE-AGENT-SETUP.md](docs/SRE-AGENT-SETUP.md) for detailed instructions, or [docs/PROMPTS-GUIDE.md](docs/PROMPTS-GUIDE.md) for a full catalog of prompts to try.

## 💰 Cost Estimate

| Configuration | Daily Cost | Monthly Cost |
|--------------|------------|--------------|
| Default deployment | ~$24-30 | ~$660-870 |
| + SRE Agent | ~$34-40 | ~$970-1,170 |

See [docs/COSTS.md](docs/COSTS.md) for detailed breakdown and optimization tips.

## 🔧 Available Scenarios

| Scenario | Energy Narrative | Scenario Is Designed To Test Whether SRE Agent Can Diagnose |
|----------|-----------------|---------------------|
| OOMKilled | Meter service overwhelmed by smart meter data spike | Memory exhaustion, limit recommendations |
| CrashLoop | Asset service crashes — invalid grid configuration | Exit codes, log analysis |
| ImagePullBackOff | Dispatch service fails after botched image release | Registry/image troubleshooting |
| HighCPU | Grid frequency calculation overload during extreme weather | Performance analysis |
| PendingPods | Substation monitoring pods can't schedule | Scheduling analysis |
| ProbeFailure | Grid health monitor misconfigured after maintenance | Probe configuration |
| NetworkBlock | Meter service isolated after security policy update | Connectivity analysis |
| MissingConfig | Grid zone configuration missing after promotion | Configuration troubleshooting |
| MongoDBDown | Meter database offline — cascading dispatch failure | Dependency tracing, root cause |
| ServiceMismatch | Meter service routing failure after "v2 upgrade" | Endpoint/selector analysis |

## 🛠️ Commands Reference

### Deployment Scripts (PowerShell)

> **Note**: These PowerShell scripts deploy to Azure and can be run from the dev container, locally on Windows, or on any system with PowerShell Core installed.

| Command | Description |
|---------|-------------|
| `.\scripts\deploy.ps1 -Location eastus2` | Deploy all infrastructure to Azure |
| `.\scripts\deploy.ps1 -WhatIf` | Preview what would be deployed |
| `.\scripts\validate-deployment.ps1 -ResourceGroupName <rg>` | Verify resources and app are healthy |
| `.\scripts\destroy.ps1 -ResourceGroupName <rg>` | Tear down all infrastructure |

**Deploy script parameters:**
- `-Location`: Azure region (`eastus2`, `swedencentral`, `australiaeast`) - Default: `eastus2`
- `-WorkloadName`: Resource prefix - Default: `srelab`
- `-SkipRbac`: Skip RBAC assignments if subscription policies block them
- `-SkipSreAgent`: Skip Azure SRE Agent deployment (useful for regions/subscriptions without Preview access)
- `-WhatIf`: Preview deployment without making changes
- `-Yes`: Skip confirmation prompts (non-interactive mode)

### Kubernetes Commands (kubectl)

| Command | Description |
|---------|-------------|
| `kubectl apply -f k8s/base/application.yaml` | Deploy healthy application |
| `kubectl apply -f k8s/scenarios/<scenario>.yaml` | Apply a break scenario |
| `kubectl get pods -n energy` | Check pod status |
| `kubectl get events -n energy --sort-by='.lastTimestamp'` | View recent events |

## 📚 Documentation

- [Demo Runbook](docs/DEMO-RUNBOOK.md) — operator checklist for running the demo
- [Demo Narrative](docs/DEMO-NARRATIVE.md) — 20-minute customer story arc
- [Safe Language Guardrails](docs/SAFE-LANGUAGE-GUARDRAILS.md) — claims to avoid during demos
- [Local Analyst Governance](docs/LOCAL-ANALYST-GOVERNANCE.md) — read-only analyst tool, RBAC, audit, and approval boundaries
- [Analyst Safe Language](docs/ANALYST-SAFE-LANGUAGE.md) — approved Local Analyst wording, confidence levels, and redaction examples
- [Capability Contracts](docs/CAPABILITY-CONTRACTS.md) — shared contracts, RBAC, retention
- [SRE Agent Setup Guide](docs/SRE-AGENT-SETUP.md)
- [Prompts Guide](docs/PROMPTS-GUIDE.md)
- [Breakable Scenarios Guide](docs/BREAKABLE-SCENARIOS.md)
- [Kubernetes Service Troubleshooting](docs/KUBERNETES-SERVICE-TROUBLESHOOTING.md)
- [Azure Networking Troubleshooting](docs/TROUBLESHOOTING.md)
- [Cost Estimation](docs/COSTS.md)
- [Interactive Grid Map Spec](docs/INTERACTIVE-GRID-MAP-SPEC.md) — design spec for the topology map screen (pending expert review)

## 🤝 Contributing

Contributions welcome! Feel free to open issues or submit PRs.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**⚠️ Important Notes:**

- SRE Agent is currently in **Preview**
- Only available in **East US 2**, **Sweden Central**, and **Australia East**
- AKS cluster must **NOT** be a private cluster for SRE Agent to access
- Firewall must allow `*.azuresre.ai`
