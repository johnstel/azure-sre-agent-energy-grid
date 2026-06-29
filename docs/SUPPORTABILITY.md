# Supportability Guide

> **Audience**: Customer support engineers, SRE teams, and operators responsible for this demo lab
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2026-01-01`, Stable channel)
> **Trust model**: Agent recommends, operator executes — unless real portal approval UI/API evidence is captured

This document is the starting point for anyone supporting the Azure SRE Agent Energy Grid demo lab. It defines what is supportable, how to verify health, when to escalate, and how to restore a working state.

---

## 1. What This Lab Supports

### Supported Configurations

| Component | Supported Configuration |
|-----------|------------------------|
| **Kubernetes** | AKS cluster (`aks-srelab`), `energy` namespace, 8 application pods |
| **Scenarios** | 10 breakable scenarios + 1 provisional bundle (see [Breakable Scenarios](BREAKABLE-SCENARIOS.md)) |
| **SRE Agent mode** | Review mode only (`mode: 'Review'`) |
| **Access levels** | `Low` (Reader + Log Analytics Reader) for diagnosis; `High` (adds Contributor) for internal remediation demos |
| **Regions** | East US 2, Sweden Central, Australia East |
| **Observability** | Log Analytics, Application Insights, Container Insights, Managed Grafana |

### Supported SRE Agent Interactions

- Diagnosing pod-level failures (OOM, CrashLoop, ImagePull, scheduling)
- Querying logs and metrics via natural language
- Recommending remediation actions (operator executes)
- Investigating dependency chains across services

### Explicitly NOT Supported

| Item | Reason |
|------|--------|
| Auto-remediation (`mode: 'Auto'`) | Not demonstrated; requires separate security review |
| Production workloads | This is a demo/sandbox environment |
| Multi-tenant isolation | Single resource group, single namespace |
| Alert-to-agent triggers | Not wired in current deployment |
| Application-level App Insights telemetry | Demo apps do not emit custom telemetry |
| Private AKS clusters | SRE Agent requires network access to the API server |

---

## 2. Operational Health Baseline

### What "Green State" Looks Like

All of the following must be true for the lab to be considered healthy:

- All pods in `energy` namespace are `Running` and `Ready`
- Service endpoints are populated (not empty)
- Public LoadBalancer IPs respond to HTTP requests
- SRE Agent portal is reachable and can query the cluster
- No active breakable scenarios injected

### Quick Health Check

Run this block to verify operational health in a single pass:

```bash
# 1. Pod status — all should show Running, Ready 1/1
kubectl get pods -n energy

# 2. Service endpoints — none should be empty
kubectl get endpoints -n energy

# 3. Public IPs — should be assigned (not <pending>)
kubectl get svc -n energy -o wide | grep LoadBalancer

# 4. Quick external connectivity test
PUBLIC_IP=$(kubectl get svc -n energy grid-dashboard -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -sI "http://$PUBLIC_IP" | head -1
# Expected: HTTP/1.1 200 OK

# 5. SRE Agent reachability (from operator workstation)
# Verify *.azuresre.ai is accessible through your firewall
```

### Expected Healthy Output

```
NAME               READY   STATUS    RESTARTS   AGE
grid-dashboard-*   1/1     Running   0          Xh
ops-console-*      1/1     Running   0          Xh
meter-service-*    1/1     Running   0          Xh
asset-service-*    1/1     Running   0          Xh
dispatch-service-* 1/1     Running   0          Xh
load-simulator-*   1/1     Running   0          Xh
rabbitmq-*         1/1     Running   0          Xh
mongodb-*          1/1     Running   0          Xh
```

If any pod is not Running/Ready, or endpoints are empty, proceed to the [Troubleshooting Guide](TROUBLESHOOTING.md).

---

## 3. Escalation Decision Tree

### Symptom-to-Action Routing

Use this table to determine your next step based on the symptom you observe:

| Symptom | Self-Service? | Action | Doc Section |
|---------|:---:|--------|-------------|
| Pod in CrashLoopBackOff / OOMKilled | ✅ | Check if a scenario is active; restore with base manifest | [Troubleshooting → Pod Health](TROUBLESHOOTING.md#pod-health-issues) |
| Public IP timeout or empty reply | ✅ | NSG rule likely missing; follow diagnostic sequence | [Troubleshooting → LoadBalancer](TROUBLESHOOTING.md#public-loadbalancer-not-responding) |
| Service endpoints empty | ✅ | Selector/label mismatch; validate service definition | [Troubleshooting → K8s Services](TROUBLESHOOTING.md#kubernetes-service-issues) |
| SRE Agent can't read cluster | ✅ | Check RBAC, network access, firewall | [Troubleshooting → SRE Agent](TROUBLESHOOTING.md#sre-agent-issues) |
| Node NotReady / scheduling failures | ⚠️ | May require node pool or infrastructure action | [Troubleshooting → Pod Health](TROUBLESHOOTING.md#pod-health-issues) |
| maxPods drift (pods can't schedule on full nodes) | ⚠️ | Maintenance window required | [AKS maxPods Runbook](AKS-MAXPODS-MAINTENANCE-RUNBOOK.md) |
| Infrastructure deployment failure | ❌ | Escalate to demo lab owner | See below |
| SRE Agent service outage | ❌ | Escalate to Azure support | See below |

### When to Escalate

Escalate (do not self-service) when:

1. **Infrastructure is broken** — Bicep deployment fails, AKS cluster is unreachable, or resource group resources are missing
2. **SRE Agent service itself is down** — Portal returns errors unrelated to RBAC or networking
3. **Security concern** — Unexpected role assignments, leaked credentials, or suspicious activity
4. **Problem persists after full reset** — `kubectl apply -f k8s/base/application.yaml` does not restore health
5. **Node-level issues** — Nodes in `NotReady` state, persistent scheduling failures not caused by a breakable scenario

### Escalation Contacts

| Situation | Escalate To | Channel |
|-----------|-------------|---------|
| Demo lab infrastructure | Demo lab owner (deployer) | GitHub issue on this repo |
| Azure SRE Agent service issues | Azure Support | [Azure Portal support request](https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade) |
| RBAC / permission policy blocks | Subscription administrator | Internal team channel |

---

## 4. Restoring Healthy State

### Full Reset (All Scenarios)

This single command restores all application workloads to their healthy baseline:

```bash
kubectl apply -f k8s/base/application.yaml
```

In the dev container, you can also use:

```bash
fix-all
```

### Per-Scenario Reset

If you know which scenario is active, restore it individually:

| Scenario | Break Command | Fix Command |
|----------|---------------|-------------|
| OOMKilled | `kubectl apply -f k8s/scenarios/oom-killed.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| CrashLoop | `kubectl apply -f k8s/scenarios/crash-loop.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| ImagePullBackOff | `kubectl apply -f k8s/scenarios/image-pull-backoff.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| High CPU | `kubectl apply -f k8s/scenarios/high-cpu.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| Pending Pods | `kubectl apply -f k8s/scenarios/pending-pods.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| Probe Failure | `kubectl apply -f k8s/scenarios/probe-failure.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| Network Block | `kubectl apply -f k8s/scenarios/network-block.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| Missing Config | `kubectl apply -f k8s/scenarios/missing-config.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| MongoDB Down | `kubectl apply -f k8s/scenarios/mongodb-down.yaml` | `kubectl apply -f k8s/base/application.yaml` |
| Service Mismatch | `kubectl apply -f k8s/scenarios/service-mismatch.yaml` | `kubectl apply -f k8s/base/application.yaml` |

### When Reset Isn't Enough

If `kubectl apply -f k8s/base/application.yaml` does not restore health, check:

1. **NSG rules** — Public LoadBalancer may be blocked at the Azure networking layer (not a Kubernetes problem). See [Troubleshooting → LoadBalancer](TROUBLESHOOTING.md#public-loadbalancer-not-responding).
2. **Node health** — Run `kubectl get nodes` to verify all nodes are `Ready`.
3. **maxPods drift** — If pods are pending due to node capacity, see the [AKS maxPods Maintenance Runbook](AKS-MAXPODS-MAINTENANCE-RUNBOOK.md).
4. **Full redeploy** — As a last resort, redeploy infrastructure:
   ```powershell
   .\scripts\deploy.ps1 -Location eastus2 -Yes
   ```

---

## 5. Safe Language for Support Interactions

When communicating with customers or documenting support activities for this lab, follow these rules:

### Key Phrases

| Context | Use This Phrasing |
|---------|-------------------|
| Remediation | "SRE Agent recommends remediation; the operator executes the action" |
| Diagnosis | "SRE Agent investigated the issue and surfaced a hypothesis" |
| Access level | "Low access enables diagnosis (read-only). High access adds Contributor for internal remediation demos." |
| Automation | "This demo runs in Review mode. Auto mode exists but is not demonstrated." |
| Detection | "SRE Agent diagnoses issues you point it to. It does not autonomously detect incidents in this configuration." |

### Do NOT Claim

- SRE Agent "fixed" or "automatically resolved" anything (unless portal evidence is captured)
- Specific MTTR reductions (no measurement infrastructure exists)
- Alert-to-agent triggers are configured (they are not in this deployment)
- Production-grade RBAC (demo uses broad permissions for convenience)

For the complete guardrail table, see [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md).

---

## 6. Known Limitations & Workarounds

| Limitation | Impact | Workaround | Reference |
|------------|--------|------------|-----------|
| Subscription provider metadata may expose only preview API versions | SRE Agent deployment is skipped instead of falling back to a legacy preview API | Wait for `Microsoft.App/agents@2026-01-01` provider exposure, then rerun deployment | [SRE Agent Setup](SRE-AGENT-SETUP.md) |
| `maxPods=30` on existing node pools | Pod scheduling pressure at scale | Maintenance-window node pool replacement | [AKS maxPods Runbook](AKS-MAXPODS-MAINTENANCE-RUNBOOK.md) |
| `SCHEMA_TBD` telemetry fields | SRE Agent App Insights dimensions may change | Do not build production dashboards against these fields | [Capability Contracts §8](CAPABILITY-CONTRACTS.md) |
| Private clusters not supported | SRE Agent cannot access private API servers | Use public or authorized-IP clusters | [SRE Agent Setup](SRE-AGENT-SETUP.md) |
| Region constraints | SRE Agent only in East US 2, Sweden Central, Australia East | Deploy to supported region | [SRE Agent Setup](SRE-AGENT-SETUP.md) |
| Firewall requirements | Agent needs `*.azuresre.ai` access | Allowlist the domain in corporate firewall/proxy | [Troubleshooting → SRE Agent](TROUBLESHOOTING.md#sre-agent-issues) |
| Demo RBAC overprovisioning | Broad roles for convenience, not production-ready | See demo vs. production matrix | [Capability Contracts §10](CAPABILITY-CONTRACTS.md) |

---

## 7. Related Documentation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [Troubleshooting Guide](TROUBLESHOOTING.md) | Symptom-first diagnosis and fix procedures | Something is broken and you need to fix it |
| [Breakable Scenarios](BREAKABLE-SCENARIOS.md) | Scenario definitions, prompts, pass/fail criteria | Understanding or injecting a specific scenario |
| [SRE Agent Setup](SRE-AGENT-SETUP.md) | Initial setup, RBAC configuration, portal connection | First-time deployment or reconfiguration |
| [Capability Contracts](CAPABILITY-CONTRACTS.md) | Shared contracts: telemetry, evidence, RBAC, SLOs | Architecture decisions and schema references |
| [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md) | What to claim and what not to claim | Before any customer-facing communication |
| [AKS maxPods Maintenance Runbook](AKS-MAXPODS-MAINTENANCE-RUNBOOK.md) | Node pool replacement for maxPods drift | Scheduling pressure from immutable maxPods |

---

*Last updated: 2026-05-06 · Maintainer: SRE Lab Team*
