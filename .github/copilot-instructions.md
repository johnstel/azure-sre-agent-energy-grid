# Azure SRE Agent Energy Grid Demo Lab - Copilot Instructions

## Project Overview

This repository contains a fully automated Azure SRE Agent demo lab environment themed as an **Energy Grid Operations Platform**. It deploys:

- **Azure Kubernetes Service (AKS)** with a multi-pod energy grid platform
- **Azure Container Registry** for container images
- **Azure Key Vault** for secrets management
- **Observability stack**: Log Analytics, Application Insights, Managed Grafana
- **Breakable scenarios** for demonstrating SRE Agent diagnosis capabilities

The platform simulates an electric energy producer with grid management and retail consumer services using in-cluster MongoDB and RabbitMQ with Azure Managed Disk storage.

## Energy Grid Architecture

| Service | Role | Technology |
|---------|------|------------|
| `grid-dashboard` | Consumer portal (usage, billing, outage maps) | Vue.js |
| `ops-console` | Grid operations console | Vue.js |
| `meter-service` | Smart meter data ingestion & billing events | Node.js |
| `asset-service` | Energy asset catalog (generators, substations, rates) | Rust |
| `dispatch-service` | Energy dispatch & grid load balancing | Go |
| `load-simulator` | Retail consumer usage pattern generator | Python |
| `grid-worker` | Dispatch processing simulator (disabled) | Python |
| `rabbitmq` | Event bus (meter events, grid alerts, dispatch) | RabbitMQ |
| `mongodb` | Meter readings, energy transactions, grid state | MongoDB |

## Technology Stack

- **Infrastructure as Code**: Bicep (modular templates in `infra/bicep/`)
- **Container Orchestration**: Kubernetes (manifests in `k8s/`)
- **Scripting**: PowerShell (deployment scripts in `scripts/`)
- **Dev Environment**: Dev Containers with Azure CLI, kubectl, azd

## Key Directories

```
├── infra/bicep/           # Bicep IaC templates
│   ├── main.bicep         # Main deployment orchestration
│   ├── main.bicepparam    # Parameters file
│   └── modules/           # Modular Bicep templates
├── k8s/
│   ├── base/              # Healthy application manifests
│   └── scenarios/         # Breakable failure scenarios
├── scripts/               # Deployment and management scripts
├── docs/                  # Documentation
└── .devcontainer/         # Dev container configuration
```

## Azure SRE Agent Context

Azure SRE Agent is a Preview feature that provides AI-powered site reliability engineering automation:

- **Supported Regions**: East US 2, Sweden Central, Australia East
- **Firewall Requirement**: Allow `*.azuresre.ai`
- **RBAC Roles**: SRE Agent Admin, Standard User, Reader
- **Key Feature**: Natural language diagnosis and remediation

### SRE Agent Starter Prompts

For AKS issues:
- "Why are pods crashing in the energy namespace?"
- "Show me the health status of my AKS cluster"
- "What's causing high CPU usage on the grid calculation nodes?"

For general diagnosis:
- "Smart meter data isn't being processed — what's wrong?"
- "Analyze performance metrics and identify bottlenecks"

## Breakable Scenarios

Located in `k8s/scenarios/`:

| File | Energy Narrative | SRE Agent Can Diagnose |
|------|-----------------|----------------------|
| `oom-killed.yaml` | Meter service overwhelmed by smart meter data spike | OOMKilled events, memory limits |
| `crash-loop.yaml` | Asset service crash — invalid grid configuration | CrashLoopBackOff, exit codes |
| `image-pull-backoff.yaml` | Dispatch service fails after botched image release | Registry/image issues |
| `high-cpu.yaml` | Grid frequency calculation overload | CPU contention |
| `pending-pods.yaml` | Substation monitor can't schedule | Scheduling issues |
| `probe-failure.yaml` | Grid health monitor misconfigured | Probe configuration |
| `network-block.yaml` | Meter service isolated by bad security policy | Network policies |
| `missing-config.yaml` | Grid zone configuration missing | Configuration issues |
| `mongodb-down.yaml` | Meter database outage — cascading failure | Dependency tracing, root cause |
| `service-mismatch.yaml` | Meter service routing failure after "v2 upgrade" | Endpoint/selector analysis |

## Common Operations

### Dev Container Commands
Type `menu` in the terminal to see all available commands. Key shortcuts:
- `deploy` - Deploy infrastructure
- `destroy` - Tear down infrastructure  
- `site` - Show grid dashboard URL
- `kgp` - Get pods in energy namespace
- `break-oom`, `break-crash`, `break-image` - Apply scenarios
- `break-mongodb` - Cascading database failure
- `break-service` - Silent networking failure
- `fix-all` - Restore healthy state

### Deploy Infrastructure
```powershell
.\scripts\deploy.ps1 -Location eastus2 -Yes
```

### SRE Agent Deployment
SRE Agent is now deployed automatically via Bicep (`Microsoft.App/agents@2025-05-01-preview`).
Set `deploySreAgent = true` in parameters (default). To manage the agent after deployment:
- Portal: https://aka.ms/sreagent/portal
- The deploying user is automatically assigned SRE Agent Administrator role

### Apply Breakable Scenario
```bash
kubectl apply -f k8s/scenarios/oom-killed.yaml
```

### Restore Healthy State
```bash
kubectl apply -f k8s/base/application.yaml
```

### Destroy Infrastructure
```powershell
.\scripts\destroy.ps1 -ResourceGroupName "rg-srelab-eastus2"
```

## Important Constraints

1. **SRE Agent Regions**: Only deploy to eastus2, swedencentral, or australiaeast
2. **AKS Networking**: Must NOT be private cluster for SRE Agent access
3. **Authentication**: Use device code auth in dev containers (`az login --use-device-code`)
4. **RBAC**: Some role assignments may fail due to subscription policies - use scripts
5. **No SAS Tokens**: Use Workload Identity instead of connection strings where possible

## Cost Considerations

- **Core lab / SRE Agent skipped**: ~$24-30/day (~$660-870/month)
- **Full demo lab / SRE Agent enabled**: ~$34-40/day (~$970-1,170/month)
- **Canonical source**: `docs/COSTS.md` for detailed breakdown, assumptions, and caveats

## When Helping with This Project

1. **For Bicep changes**: Follow best practices in `infra/bicep/` patterns
2. **For K8s manifests**: Use namespace `energy`, label with `sre-demo: breakable`
3. **For scripts**: Use PowerShell, include error handling, support `-WhatIf`
4. **For docs**: Keep formatting consistent, include code examples
5. **For new scenarios**: Add to `k8s/scenarios/` and update `docs/BREAKABLE-SCENARIOS.md`
