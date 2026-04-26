# AKS maxPods maintenance-window node-pool replacement runbook

Use this runbook to replace AKS node pools whose immutable `maxPods` value drifted from the desired source configuration. This procedure is designed for issue [#4](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/4): plan maintenance-window AKS node pool recreation to eliminate `maxPods=30` drift.

> **Production safety rule:** Do not run this procedure outside an approved maintenance window. Do not weaken Defender, Retina, monitoring, admission policies, security policies, resource requests/limits, affinity, or tolerations to make scheduling easier.
>
> **Dallas posture:** Defer live remediation to a maintenance window tracked by issue #4. If pod-density pressure returns before the window, use only approved temporary scale-out mitigation.

## Purpose and scope

The live `aks-srelab` cluster has canonical node pools named `system` and `workload` with `maxPods=30`. The source configuration now targets `maxPods=50` for new clusters, but AKS treats node-pool `maxPods` as immutable. Regular redeploys preserve the live value to avoid deployment failure, so drift remains until the pools are replaced.

This runbook covers a blue/green replacement of the canonical AKS node pools:

- Add temporary pools with `maxPods=50`.
- Migrate pods by cordoning and draining old nodes one at a time.
- Delete and recreate the canonical pool names with `maxPods=50`.
- Remove temporary pools after validation.

This runbook does not cover full cluster rebuilds, SKU resizing, permanent scale-out, disabling security controls, or live emergency remediation.

## When to use this runbook

Use this runbook when all of the following are true:

- GitHub issue [#4](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/4) is the active production-tracking issue.
- Dallas has approved the maintenance-window strategy and temporary cost overlap.
- Lambert or the assigned validator is available for live validation.
- The maintenance window is declared and stakeholders know that single-replica demo dependencies can restart.
- Preflight checks confirm enough subnet IP capacity, node capacity, and healthy security/observability coverage.

## When not to use this runbook

Do not use this runbook when:

- You are outside an approved maintenance window.
- Defender, Retina, Azure Monitor Agent, Azure Policy, Gatekeeper, Calico, CSI, Secrets Store, or other security/observability add-ons are already degraded.
- The cluster has active pod-density pressure that requires immediate mitigation. In that case, use only the approved temporary scale-out path until a maintenance window is available.
- Subnet IP capacity cannot support old pools plus temporary replacement pools.
- A drain requires `--force` or would violate PodDisruptionBudget behavior without explicit approval.
- The desired change is a permanent node count or SKU increase. That requires separate cost approval and documentation.

## Preconditions and approvals

Before you begin, confirm and record:

- **Approval:** Dallas approved blue/green node-pool replacement and temporary overlap cost.
- **Security review:** Security reviewer approved that the plan preserves Defender, Retina, monitoring, admission/security policies, requests/limits, affinity, and tolerations.
- **Validation owner:** Lambert or another named owner is online for validation.
- **Maintenance window:** Window start/end time, expected interruption risk, and rollback decision time are declared.
- **Access:** The operator has Azure RBAC for AKS node-pool add/delete operations and Kubernetes permissions to cordon/drain nodes.
- **Context:** Azure CLI is authenticated to the intended subscription and `kubectl` points to the intended AKS cluster.

Target environment for issue #4:

| Item | Value |
| --- | --- |
| Subscription | `ME-MngEnvMCAP550731-jostelma-2` |
| Resource group | `rg-srelab-eastus2` |
| AKS cluster | `aks-srelab` |
| Region | `eastus2` |
| AKS subnet | `vnet-srelab/snet-aks`, currently planned as `10.0.0.0/22` |
| Canonical system pool | `system`, target `maxPods=50` |
| Canonical workload pool | `workload`, target `maxPods=50` |
| Temporary system pool | `sys50` |
| Temporary workload pool | `work50` |

## Security guardrails

Keep the security posture intact throughout the maintenance window:

- Do **not** disable Microsoft Defender for Containers components.
- Do **not** disable Retina.
- Do **not** disable Container Insights, Azure Monitor Agent, Prometheus scraping, alerts, or log export.
- Do **not** disable Azure Policy, Gatekeeper, Calico network policy, admission controls, CSI drivers, or Secrets Store CSI.
- Do **not** remove requests, limits, affinity, tolerations, or taints to force scheduling.
- Do **not** delete pods blindly. Use node-scoped cordon and drain operations with evidence.
- Treat Pending `kube-system` security/observability pods as degraded coverage and stop for review.
- Use `kubectl drain` without `--force` by default. If `--force` appears necessary, pause and obtain explicit Dallas and Security approval before proceeding.

## Cost impact and maintenance-window expectations

Temporary overlap increases AKS VM cost while old and new pools exist together. The final target state should return to the current live node count and SKU unless Dallas approves a permanent sizing change.

Expected temporary overlap for the current plan:

| Pool | Old nodes | Temporary nodes | Target maxPods |
| --- | ---: | ---: | ---: |
| `system` → `sys50` → `system` | 1 | 1 | 50 |
| `workload` → `work50` → `workload` | 4 | 4 | 50 |

Because single-replica demo dependencies such as MongoDB and RabbitMQ can restart during drains, expect brief workload disruption inside the maintenance window. If the maintenance cannot complete before the rollback decision time, stop at the current safe checkpoint and follow the rollback plan.

## Preflight checks

Run these checks before adding any temporary node pool. Capture command output for issue #4 evidence.

### 1. Confirm Azure and Kubernetes context

```bash
az account show --query '{name:name,id:id,tenantId:tenantId,user:user.name}' -o json
kubectl config current-context
kubectl cluster-info
```

Expected: the Azure subscription and Kubernetes context match `aks-srelab`.

### 2. Capture current node pools

```bash
az aks nodepool list \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --query '[].{name:name,mode:mode,vmSize:vmSize,count:count,enableAutoScaling:enableAutoScaling,minCount:minCount,maxCount:maxCount,maxPods:maxPods,provisioningState:provisioningState}' \
  -o table
```

Expected before maintenance: canonical `system` and `workload` pools still show `maxPods=30`.

### 3. Validate subnet and IP capacity

```bash
az network vnet subnet show \
  --resource-group rg-srelab-eastus2 \
  --vnet-name vnet-srelab \
  --name snet-aks \
  --query '{addressPrefix:addressPrefix,addressPrefixes:addressPrefixes,privateEndpointNetworkPolicies:privateEndpointNetworkPolicies,delegations:delegations}' \
  -o json
```

Also inspect the subnet in the Azure portal or approved IPAM source for current allocated IPs. The planned old-plus-temporary pod slots are approximately:

```text
(old system nodes * 30) + (old workload nodes * 30) + (temporary sys50 nodes * 50) + (temporary work50 nodes * 50)
= (1 * 30) + (4 * 30) + (1 * 50) + (4 * 50)
= 400 pod IP slots, before node/private-endpoint overhead
```

Stop if the subnet does not have enough usable IP capacity for overlap.

### 4. Check pending pods and scheduling pressure

```bash
kubectl get pods -A --field-selector=status.phase=Pending -o wide
kubectl get nodes -o wide
kubectl describe nodes
```

If any pod is Pending, describe it before proceeding:

```bash
kubectl describe pod -n <namespace> <pod-name>
```

Stop if Pending security, monitoring, or admission pods indicate degraded coverage.

### 5. Check security and observability add-ons

```bash
kubectl get ds -A
kubectl get deploy -A
kubectl get pods -n kube-system -o wide
```

Confirm readiness for Defender, Retina, Azure Monitor Agent, Azure Policy, Gatekeeper, Calico, CoreDNS, CSI drivers, Secrets Store CSI, `kube-proxy`, `azure-cns`, and `konnectivity-agent`.

### 6. Check energy workload health

```bash
kubectl get deploy,pods -n energy -o wide
```

Expected deployment readiness from the plan:

| Deployment | Expected readiness |
| --- | --- |
| `asset-service` | `2/2` |
| `dispatch-service` | `2/2` |
| `grid-dashboard` | `2/2` |
| `load-simulator` | `1/1` |
| `meter-service` | `2/2` |
| `mongodb` | `1/1` |
| `ops-console` | `1/1` |
| `rabbitmq` | `1/1` |
| `grid-worker` | `0/0` |

### 7. Validate source and deployment behavior

```bash
az bicep build --file infra/bicep/main.bicep --stdout
az bicep build-params --file infra/bicep/main.bicepparam --stdout
pwsh -NoProfile -Command '$tokens=$null; $errs=$null; [System.Management.Automation.Language.Parser]::ParseFile("scripts/deploy.ps1", [ref]$tokens, [ref]$errs) | Out-Null; if ($errs.Count -gt 0) { $errs | Format-List; exit 1 }'
pwsh -NoProfile -File scripts/deploy.ps1 -Location eastus2 -WorkloadName srelab -WhatIf -Yes -SkipRbac
```

Expected: `scripts/deploy.ps1` preserves live immutable `maxPods` values on existing pools before the maintenance action, so the what-if should not try to mutate `maxPods=30` in place.

## Blue/green replacement procedure

This section contains commands with placeholders and explicit gates. Review each gate before you run the next command group.

### Phase 1: Add temporary system pool `sys50`

```bash
az aks nodepool add \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name sys50 \
  --mode System \
  --node-vm-size Standard_D2s_v4 \
  --node-count 1 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 5 \
  --max-pods 50 \
  --node-taints CriticalAddonsOnly=true:NoSchedule \
  --labels nodepool-type=system
```

Validate readiness:

```bash
kubectl get nodes -l agentpool=sys50 -o wide
kubectl get pods -n kube-system -o wide
kubectl get ds -A
```

**Gate:** Continue only when all `sys50` nodes are Ready and security/observability add-ons remain healthy.

### Phase 2: Drain old `system` nodes

For each old `system` node, run:

```bash
kubectl cordon <old-system-node-name>
kubectl drain <old-system-node-name> --ignore-daemonsets --delete-emptydir-data --timeout=10m
```

**Gate:** Stop if drain requires `--force`, security/observability pods degrade, or required system pods fail to reschedule.

### Phase 3: Recreate canonical `system` pool

> **Destructive action gate:** The next command deletes the old canonical `system` node pool. Before running it, confirm that all old `system` nodes are drained, `sys50` is Ready, and required add-ons are healthy. Record approval in issue #4 evidence.

```bash
az aks nodepool delete \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name system
```

Re-add canonical `system` with `maxPods=50`:

```bash
az aks nodepool add \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name system \
  --mode System \
  --node-vm-size Standard_D2s_v4 \
  --node-count 1 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 5 \
  --max-pods 50 \
  --node-taints CriticalAddonsOnly=true:NoSchedule \
  --labels nodepool-type=system
```

Validate:

```bash
kubectl get nodes -l agentpool=system -o wide
az aks nodepool show \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name system \
  --query '{name:name,mode:mode,vmSize:vmSize,count:count,minCount:minCount,maxCount:maxCount,maxPods:maxPods,provisioningState:provisioningState}' \
  -o json
```

Expected: `maxPods` is `50`.

### Phase 4: Remove temporary system pool `sys50`

For each temporary `sys50` node, run:

```bash
kubectl cordon <sys50-node-name>
kubectl drain <sys50-node-name> --ignore-daemonsets --delete-emptydir-data --timeout=10m
```

> **Destructive action gate:** Delete `sys50` only after the canonical `system` pool is Ready and add-ons remain healthy.

```bash
az aks nodepool delete \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name sys50
```

### Phase 5: Add temporary workload pool `work50`

```bash
az aks nodepool add \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name work50 \
  --mode User \
  --node-vm-size Standard_D2s_v4 \
  --node-count 4 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 10 \
  --max-pods 50 \
  --labels nodepool-type=user
```

Validate readiness and capacity:

```bash
kubectl get nodes -l agentpool=work50 -o wide
kubectl describe nodes
kubectl get deploy,pods -n energy -o wide
```

**Gate:** Continue only when `work50` nodes are Ready and have enough allocatable CPU, memory, and pod slots for workload migration.

### Phase 6: Drain old `workload` nodes

For each old `workload` node, run:

```bash
kubectl cordon <old-workload-node-name>
kubectl drain <old-workload-node-name> --ignore-daemonsets --delete-emptydir-data --timeout=10m
kubectl get deploy,pods -n energy -o wide
```

**Gate:** Stop if the drain requires `--force`, energy workloads fail to reschedule, Pending pods appear, or security/observability coverage degrades.

### Phase 7: Recreate canonical `workload` pool

> **Destructive action gate:** The next command deletes the old canonical `workload` node pool. Before running it, confirm that all old `workload` nodes are drained, `work50` is Ready, and energy workloads are healthy or within the approved maintenance-window interruption tolerance.

```bash
az aks nodepool delete \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name workload
```

Re-add canonical `workload` with `maxPods=50`:

```bash
az aks nodepool add \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name workload \
  --mode User \
  --node-vm-size Standard_D2s_v4 \
  --node-count 4 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 10 \
  --max-pods 50 \
  --labels nodepool-type=user
```

Validate:

```bash
kubectl get nodes -l agentpool=workload -o wide
az aks nodepool show \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name workload \
  --query '{name:name,mode:mode,vmSize:vmSize,count:count,minCount:minCount,maxCount:maxCount,maxPods:maxPods,provisioningState:provisioningState}' \
  -o json
```

Expected: `maxPods` is `50`.

### Phase 8: Remove temporary workload pool `work50`

For each temporary `work50` node, run:

```bash
kubectl cordon <work50-node-name>
kubectl drain <work50-node-name> --ignore-daemonsets --delete-emptydir-data --timeout=10m
```

> **Destructive action gate:** Delete `work50` only after canonical `workload` nodes are Ready and the energy namespace is healthy.

```bash
az aks nodepool delete \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --name work50
```

## Rollback plan

Prefer rollback by stopping at the latest safe blue/green checkpoint. Do not delete working capacity while investigating.

| Failure point | Rollback action |
| --- | --- |
| Temporary pool cannot be created | Stop. Do not modify existing pools. Resolve quota, subnet IP capacity, RBAC, or policy issue before retrying. |
| Temporary pool created but not Ready | Stop. Keep old canonical pool untouched. Capture events and node-pool provisioning state. Delete the temporary pool only after confirming it is not hosting required workloads. |
| Drain blocks before canonical pool deletion | Uncordon the affected old node with `kubectl uncordon <node-name>`. Stop for review. Do not use `--force` without explicit approval. |
| Canonical pool deleted but replacement cannot be added | Keep the temporary pool running. Recreate the canonical pool with the last approved settings or pause with temporary pool capacity in place while Azure support/RBAC/quota issues are resolved. |
| Workloads degrade after migration | Stop deleting pools. Keep both old and new capacity where available. Uncordon previously cordoned nodes if they still exist. Validate events, Pending pods, and deployment rollouts before retrying. |
| Security or observability add-ons degrade | Stop immediately. Preserve current capacity. Do not disable controls. Escalate to Security and platform owner with DaemonSet, pod, and event evidence. |

Useful rollback commands:

```bash
kubectl uncordon <node-name>
kubectl get pods -A --field-selector=status.phase=Pending -o wide
kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp
az aks nodepool list --resource-group rg-srelab-eastus2 --cluster-name aks-srelab -o table
```

## Post-change validation

Run these checks after temporary pools are removed.

### 1. Confirm final node-pool state

```bash
az aks nodepool list \
  --resource-group rg-srelab-eastus2 \
  --cluster-name aks-srelab \
  --query '[].{name:name,mode:mode,vmSize:vmSize,count:count,minCount:minCount,maxCount:maxCount,maxPods:maxPods,provisioningState:provisioningState}' \
  -o table
```

Expected: canonical `system` and `workload` pools exist, both have `maxPods=50`, and temporary `sys50`/`work50` pools are absent.

### 2. Confirm no Pending pods

```bash
kubectl get pods -A --field-selector=status.phase=Pending -o wide
```

Expected: no Pending pods.

### 3. Confirm security and observability health

```bash
kubectl get ds -A
kubectl get deploy -A
kubectl get pods -n kube-system -o wide
```

Expected: Defender, Retina, monitoring, admission/security, networking, DNS, and CSI components are Running and Ready.

### 4. Confirm energy workload health

```bash
kubectl get deploy,pods -n energy -o wide
```

Expected: energy deployments match the readiness table in the preflight section.

### 5. Review recent warning events

```bash
kubectl get events -A --field-selector type=Warning --sort-by=.lastTimestamp
```

Review for new critical scheduling, security, or energy workload failures.

### 6. Confirm source alignment

```bash
pwsh -NoProfile -File scripts/deploy.ps1 -Location eastus2 -WorkloadName srelab -WhatIf -Yes -SkipRbac
```

Expected: no immutable-property drift remains for `maxPods`, and no node-pool replacement is planned by the what-if.

## Evidence to attach to GitHub issue #4

Attach or paste the following evidence to issue [#4](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/4):

- Approval record: Dallas approval, security review, validation owner, and maintenance-window timing.
- Azure context: sanitized `az account show` output showing the intended subscription.
- Kubernetes context: `kubectl config current-context` and cluster identity evidence.
- Before/after `az aks nodepool list` showing `maxPods=30` before and `maxPods=50` after for canonical pools.
- Subnet/IP capacity check and overlap calculation.
- Before/after Pending pod checks.
- Before/after Defender and Retina readiness.
- Before/after monitoring/admission/security add-on health.
- Before/after `energy` namespace deployment and pod readiness.
- Drain notes: node names, time started, time completed, and any blocked drains.
- Final deployment what-if output showing no remaining immutable `maxPods` drift.
- Any rollback or exception decisions, including who approved them.

## References

- GitHub issue [#4: Plan maintenance-window AKS node pool recreation to eliminate maxPods drift](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/4)
- AKS module: [`infra/bicep/modules/aks.bicep`](../infra/bicep/modules/aks.bicep)
- Main Bicep parameters: [`infra/bicep/main.bicep`](../infra/bicep/main.bicep) and [`infra/bicep/main.bicepparam`](../infra/bicep/main.bicepparam)
- Deployment script: [`scripts/deploy.ps1`](../scripts/deploy.ps1)
- Cost guide: [`docs/COSTS.md`](COSTS.md)
