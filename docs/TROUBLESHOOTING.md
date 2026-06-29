# Troubleshooting Guide

> **Audience**: Operators and support engineers diagnosing issues in the Energy Grid demo lab
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2026-01-01`, Stable channel)
> **Trust model**: Agent recommends, operator executes

This guide is organized by **symptom**. Start with what you observe, follow the decision tree to the right section, and each section gives you diagnosis, fix, and verification steps.

For "what is supportable" and escalation criteria, see the [Supportability Guide](SUPPORTABILITY.md).

---

## How to Use This Guide

1. **Identify your symptom** in the Master Symptom Table below
2. **Follow the link** to the relevant section
3. **Run the diagnostic commands** — each section is self-contained
4. **Apply the fix** and verify

> **Safe language reminder**: When discussing SRE Agent's role in troubleshooting, say "SRE Agent recommends remediation; the operator executes the action." Do not claim the agent autonomously fixed anything unless portal evidence is captured.

---

## Master Symptom Table

| Symptom | Go To |
|---------|-------|
| Pod in `CrashLoopBackOff`, `OOMKilled`, `ImagePullBackOff`, or `Pending` | [Pod Health Issues](#pod-health-issues) |
| Public IP returns timeout or empty reply | [Public LoadBalancer Not Responding](#public-loadbalancer-not-responding) |
| Port-forward works but public IP fails | [Public LoadBalancer Not Responding](#public-loadbalancer-not-responding) |
| Service endpoints are empty | [Kubernetes Service Issues](#kubernetes-service-issues) |
| Connection refused on service port | [Kubernetes Service Issues](#kubernetes-service-issues) |
| DNS resolution failure inside cluster | [Kubernetes Service Issues](#kubernetes-service-issues) |
| SRE Agent can't read cluster or resources | [SRE Agent Issues](#sre-agent-issues) |
| SRE Agent permission errors | [SRE Agent Issues](#sre-agent-issues) |
| Pods can't reach external services | [Network Policy Issues](#network-policy-issues) |
| Dashboard shows "Connection Refused" | [Kubernetes Service Issues](#kubernetes-service-issues) |

---

## Pod Health Issues

### Quick Diagnosis

```bash
# Check pod status across the namespace
kubectl get pods -n energy

# Get detailed status for unhealthy pods
kubectl describe pod -n energy <pod-name>

# Check recent events (sorted by time)
kubectl get events -n energy --sort-by='.lastTimestamp' | tail -20

# Get logs from a crashing pod (including previous crash)
kubectl logs -n energy <pod-name> --previous
```

### Diagnosis by Status

| Pod Status | Likely Cause | Diagnostic Command | Fix |
|------------|--------------|-------------------|-----|
| `OOMKilled` | Memory limit too low for workload | `kubectl describe pod <name> -n energy` | Restore base manifest |
| `CrashLoopBackOff` | Application exits on start (bad config, invalid command) | `kubectl logs -n energy <pod-name> --previous` | Restore base manifest |
| `ImagePullBackOff` | Image tag doesn't exist or registry unreachable | `kubectl describe pod <name> -n energy` | Restore base manifest |
| `Pending` | Insufficient resources or scheduling constraints | `kubectl describe pod <name> -n energy` | Restore base manifest or check node capacity |
| `Running` but not `Ready` | Probe failing (liveness or readiness) | `kubectl describe pod <name> -n energy` | Restore base manifest |

### Is a Breakable Scenario Active?

Most pod health issues in this lab are caused by **intentionally injected scenarios**. Check if one is active:

```bash
# Compare current deployments against the base manifest
kubectl diff -f k8s/base/application.yaml
```

If differences exist, a scenario is likely active. See [Breakable Scenarios](BREAKABLE-SCENARIOS.md) for the full list.

### Fix

Restore the healthy baseline:

```bash
kubectl apply -f k8s/base/application.yaml
```

### Verification

```bash
# Wait for pods to stabilize (30-60 seconds), then check
kubectl get pods -n energy

# All pods should show Running and Ready 1/1
```

If pods remain unhealthy after restoring the base manifest, check for node-level issues:

```bash
kubectl get nodes
kubectl describe node <node-name> | grep -A 10 "Conditions"
```

For persistent scheduling issues from `maxPods` drift, see the [AKS maxPods Maintenance Runbook](AKS-MAXPODS-MAINTENANCE-RUNBOOK.md).

---

## Kubernetes Service Issues

This section covers service discovery, endpoint resolution, port mapping, and in-cluster connectivity.

### Step 1: Service Definition & Endpoints

```bash
# Check service definition
kubectl describe svc <service-name> -n energy

# Expected output includes:
# - Selector: correct labels that match your pods
# - Port: the service port (e.g., 80)
# - TargetPort: container port (e.g., 3000)
# - Endpoints: list of pod IPs and ports

# Get all endpoints (includes unready pods)
kubectl get endpoints <service-name> -n energy

# Get endpoint slices (newer API, more details)
kubectl get endpointslices -n energy
kubectl describe endpointslice -n energy -l kubernetes.io/service-name=<service-name>
```

**Expected healthy results:**
- Service has a ClusterIP (e.g., `10.0.0.100`)
- Selector matches your pod labels
- Port/TargetPort mapping is correct (service:container)
- Endpoints section shows running pod IPs
- EndpointSlices show Ready conditions: `true`

### Step 2: Pod Labels & Selector Alignment

```bash
# Get service selector
SELECTOR=$(kubectl get svc <service-name> -n energy -o jsonpath='{.spec.selector}' | jq -r 'to_entries|map("\(.key)=\(.value)")|join(",")')
echo "Service selector: $SELECTOR"

# Get pods matching that selector
kubectl get pods -n energy -l "$SELECTOR" --show-labels

# Compare service selector to actual pod labels
kubectl get svc <service-name> -n energy -o jsonpath='{.spec.selector}'
echo ""
kubectl get pods -n energy -l app=<app-name> -o jsonpath='{.items[0].metadata.labels}'
```

**Expected healthy results:**
- All pods matching selector show `Running` and `Ready 1/1`
- Pod labels include the selector keys
- No label mismatches (e.g., `app=meter-service-v2` vs `app=meter-service`)

### Step 3: In-Cluster Port Mapping Validation

```bash
# Test from a pod inside the cluster (in-cluster DNS)
kubectl run -n energy test-curl --image=curlimages/curl:latest --rm -it -- \
  sh -c 'curl -v -I http://<service-name>:80/'

# Or using the FQDN
kubectl run -n energy test-curl --image=curlimages/curl:latest --rm -it -- \
  sh -c 'curl -v -I http://<service-name>.energy.svc.cluster.local:80/'

# Test with exec into an existing pod
kubectl exec -n energy deploy/<existing-deployment> -- \
  curl -v -I http://<service-name>:80/
```

**Expected healthy results:**
- HTTP request succeeds (200 OK, or app-specific response)
- No timeout or connection refused errors
- Response shows the application is handling requests

### Step 4: DNS Resolution

```bash
# Test DNS resolution from inside the cluster
kubectl run -n energy test-dns --image=curlimages/curl:latest --rm -it -- \
  sh -c 'nslookup <service-name>.energy.svc.cluster.local'

# Should resolve to the ClusterIP
# Example output:
# Name:   meter-service.energy.svc.cluster.local
# Address: 10.0.0.100
```

**Expected healthy results:**
- Service name resolves to ClusterIP
- Both short name (`meter-service`) and FQDN work
- No "nslookup: nameserver unreachable" errors

### Step 5: Port-Forward Test (Bypass Service & LB)

```bash
# Establish port-forward to the service
kubectl port-forward -n energy svc/<service-name> 18080:80 &
# In another terminal, test locally:
curl -v -I http://localhost:18080/
# Then stop the port-forward process
```

**Expected healthy results:**
- Port-forward establishes without error
- Curl returns 200 OK or app-specific response
- Shows pods are running and responding correctly

### Port Mapping Validation

```bash
# Full port mapping chain:
# Client -> Service.Port -> TargetPort -> Container.ContainerPort

# 1. Get service port mapping
echo "Service Port -> TargetPort:"
kubectl get svc <service-name> -n energy -o jsonpath='{.spec.ports[0].port} -> {.spec.ports[0].targetPort}'
echo ""

# 2. Get container port
echo "Container Port:"
kubectl get pod -n energy -l app=<app-name> -o jsonpath='{.items[0].spec.containers[0].ports[0].containerPort}'
echo ""

# 3. Verify they match (TargetPort should equal ContainerPort)

# 4. For LoadBalancer, also check NodePort
echo "NodePort (LoadBalancer traffic):"
kubectl get svc <service-name> -n energy -o jsonpath='{.spec.ports[0].nodePort}'
echo ""
```

### Common Scenarios

#### Pod Is Running But Endpoints Show Empty

```bash
# Pod status shows Running
kubectl get pods -n energy -l app=meter-service

# But endpoints are empty
kubectl get endpoints -n energy meter-service
# Output: <none>

# Root cause: Pod labels don't match service selector
kubectl get pods -n energy -l app=meter-service --show-labels
kubectl get svc meter-service -n energy -o jsonpath='{.spec.selector}'

# Fix: Restore base manifest to realign labels and selectors
kubectl apply -f k8s/base/application.yaml
```

#### Port-Forward Works But Public IP Fails

```bash
# This works (kubectl port-forward to service):
kubectl port-forward -n energy svc/grid-dashboard 18080:80
curl -I http://localhost:18080
# Returns 200 OK

# But this fails (curl to public IP):
PUBLIC_IP=$(kubectl get svc -n energy grid-dashboard -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl http://$PUBLIC_IP
# Timeout or empty reply

# Diagnosis: Kubernetes and service are healthy; issue is Azure networking
# -> Go to "Public LoadBalancer Not Responding" section below
```

#### Service Has Wrong TargetPort

```bash
# Service definition shows:
kubectl describe svc meter-service -n energy | grep -A 5 "Port:"
# Port:              80
# TargetPort:        8080

# But pods actually listen on port 3000, not 8080
kubectl get pod -n energy -l app=meter-service -o jsonpath='{.items[0].spec.containers[0].ports[0].containerPort}'
# Output: 3000

# Fix: Restore base manifest (preferred) or patch manually
kubectl apply -f k8s/base/application.yaml
```

### Escalation Decision

**If all Kubernetes diagnostics above are healthy**, the issue is NOT in Kubernetes — it's in the **Azure networking layer** (Load Balancer or VNet subnet NSG). Proceed to [Public LoadBalancer Not Responding](#public-loadbalancer-not-responding).

### Service Type Reference

| Service Type | Access From | Primary Use |
|---|---|---|
| **ClusterIP** | Inside cluster only | Internal communication |
| **NodePort** | Inside cluster + node IP:port | Testing, internal NodePort |
| **LoadBalancer** | Internet (via public IP) + node IP:port | Public access (grid-dashboard, ops-console) |
| **ExternalName** | Inside cluster (CNAME redirect) | External services |

---

## Public LoadBalancer Not Responding

### Understanding the Traffic Path

When you curl a public LoadBalancer IP, traffic flows through these layers:

```
Internet Client
    |
Public IP
    |
Azure Load Balancer (LB rules, probes, backend pools)
    |
VNet Subnet NSG (inbound rules -- THIS IS OFTEN THE CULPRIT)
    |
AKS Node NSG (managed by AKS, usually allows necessary traffic)
    |
Kubernetes Node (iptables, kube-proxy)
    |
Kubernetes Service (ClusterIP, selectors, endpoints)
    |
Pod (container listening on containerPort)
```

**Critical:** Both the **AKS-managed node NSG** and the **VNet subnet NSG** can block traffic. The VNet subnet NSG is the usual culprit.

### Symptoms

- Public LoadBalancer IPs for `grid-dashboard` or `ops-console` return timeout, connection refused, or empty reply
- Curl from outside Azure returns: `curl: (28) Operation timed out` or `curl: (52) Empty reply from server`
- Port-forward works: `kubectl port-forward` to service works fine
- In-cluster access works: `curl` from inside a pod returns 200 OK
- Pods, services, endpoints, and nodePorts all appear healthy
- Azure Load Balancer health probes show green

### Root Cause

The issue is almost always a **VNet Subnet NSG (Network Security Group)** blocking Internet traffic — NOT Azure Load Balancer misconfiguration.

Azure uses two NSG layers for LoadBalancer traffic:
1. **AKS Node NSG** (managed by AKS) — typically allows necessary traffic
2. **VNet Subnet NSG** (your VNet's AKS subnet) — often has default `DenyAllInBound` rule with no custom allow rules

### Quick Decision Table

| External IP Status | Public IP Response | Likely Root Cause | Next Step |
|---|---|---|---|
| **Pending** | N/A | LB creation in progress or service not deployed | Wait 2-3 min; check `kubectl get svc -n energy grid-dashboard -o wide` |
| **Assigned** | **Timeout or Empty Reply** | **VNet subnet NSG blocking Internet traffic** | Follow diagnostic steps below |
| **Assigned** | **Connection Refused** | Service selector/endpoint mismatch or port mapping | See [Kubernetes Service Issues](#kubernetes-service-issues) |
| **Assigned** | **HTTP 404 / 503 / 5xx** | Traffic reached app but app is broken | Check pod logs: `kubectl logs -n energy -l app=grid-dashboard` |
| **Assigned** | **Page loads but looks wrong** | Traffic OK, app logic issue | Check app config; not a networking issue |

### Diagnostic Sequence

#### Step 1: Confirm Kubernetes Is Healthy

Before checking Azure networking, verify the Kubernetes layer is working:

```bash
# 1. Pods are running
kubectl get pods -n energy -l app=grid-dashboard

# 2. Endpoints are populated (NOT empty)
kubectl get endpoints -n energy grid-dashboard

# 3. In-cluster curl works
kubectl run -n energy test-curl --image=curlimages/curl:latest --rm -it -- \
  sh -c 'curl -v -I http://grid-dashboard:80/'

# 4. Port-forward works
kubectl port-forward -n energy svc/grid-dashboard 18080:80 &
sleep 1 && curl -v -I http://localhost:18080/
# Then stop the background port-forward process
```

**If all pass:** Kubernetes is healthy. The problem is Azure networking. Continue below.

**If any fail:** See [Kubernetes Service Issues](#kubernetes-service-issues) first.

#### Step 2: Check Azure Load Balancer Configuration

```bash
RESOURCE_GROUP="rg-srelab-eastus2"
AKS_CLUSTER_NAME="aks-srelab"
NODE_RESOURCE_GROUP=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_CLUSTER_NAME" --query nodeResourceGroup -o tsv)

# Verify LB rules exist and backend pools are populated
az network lb rule list -g "$NODE_RESOURCE_GROUP" --lb-name "kubernetes" -o table

# Check health probes
az network lb probe list -g "$NODE_RESOURCE_GROUP" --lb-name "kubernetes" -o table
```

**Expected:** LB rules exist, backend pools contain AKS nodes, health probes are healthy.

#### Step 3: Identify Which NSG Is Blocking (The Critical Step)

Two NSG layers can block LoadBalancer traffic. You must check both.

**Layer 1: AKS-Managed Node NSG (usually fine)**

```bash
AKS_RG=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_CLUSTER_NAME" --query nodeResourceGroup -o tsv)

# Get the AKS node NSG
NODE_NSG=$(az network nsg list -g "$AKS_RG" --query '[0].name' -o tsv)
echo "Node NSG: $NODE_NSG"

# Check its rules
az network nsg rule list -g "$AKS_RG" --nsg-name "$NODE_NSG" -o table
```

**Layer 2: VNet Subnet NSG (usually the culprit)**

```bash
VNET_NSG_NAME="vnet-srelab-snet-aks-nsg-eastus2"  # from network.bicep

# Check if it exists
az network nsg show -g "$RESOURCE_GROUP" -n "$VNET_NSG_NAME" --query "name" -o tsv

# List all rules -- look for Allow-Internet-HTTP-To-AKS-LB
az network nsg rule list -g "$RESOURCE_GROUP" --nsg-name "$VNET_NSG_NAME" -o table
```

**The rule below MUST exist.** If missing, that is your problem:

```
Name: Allow-Internet-HTTP-To-AKS-LB
Priority: 400
Direction: Inbound
Access: Allow
Protocol: Tcp
Source: Internet
Dest Port: 80
```

**Confirm the rule exists (or identify it is missing):**

```bash
az network nsg rule show \
  -g "$RESOURCE_GROUP" \
  --nsg-name "$VNET_NSG_NAME" \
  -n "Allow-Internet-HTTP-To-AKS-LB" \
  2>/dev/null || echo "RULE MISSING -- This is your problem!"
```

**Verify the NSG is associated with the correct subnet:**

```bash
az network vnet subnet show \
  -g "$RESOURCE_GROUP" \
  --vnet-name "vnet-srelab" \
  --name "snet-aks" \
  --query "networkSecurityGroup.id" -o tsv
```

### How to Fix

#### Immediate Fix (Idempotent CLI Command)

This command is safe to run multiple times:

```bash
RESOURCE_GROUP="rg-srelab-eastus2"
VNET_NSG_NAME="vnet-srelab-snet-aks-nsg-eastus2"

az network nsg rule create \
  -g "$RESOURCE_GROUP" \
  --nsg-name "$VNET_NSG_NAME" \
  -n "Allow-Internet-HTTP-To-AKS-LB" \
  --priority 400 \
  --source-address-prefixes "Internet" \
  --source-port-ranges "*" \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --destination-address-prefixes "*" \
  --destination-port-ranges "80" || \
  echo "Rule already exists (or created successfully)"
```

**Add HTTPS (port 443) if needed:**

```bash
az network nsg rule create \
  -g "$RESOURCE_GROUP" \
  --nsg-name "$VNET_NSG_NAME" \
  -n "Allow-Internet-HTTPS-To-AKS-LB" \
  --priority 401 \
  --source-address-prefixes "Internet" \
  --source-port-ranges "*" \
  --direction Inbound \
  --access Allow \
  --protocol Tcp \
  --destination-address-prefixes "*" \
  --destination-port-ranges "443" || \
  echo "HTTPS rule already exists"
```

#### Permanent Fix (Bicep)

The HTTP rule is persisted in `infra/bicep/modules/network.bicep` (lines 36-49). If your deployment is missing it, re-deploy:

```powershell
.\scripts\deploy.ps1 -Location eastus2
```

### Verification

```bash
PUBLIC_IP=$(kubectl get svc -n energy grid-dashboard -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Testing: http://$PUBLIC_IP"
curl -v "http://$PUBLIC_IP"
# Expected: HTTP/1.1 200 OK

# Also test ops-console
PUBLIC_IP_OPS=$(kubectl get svc -n energy ops-console -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl -v "http://$PUBLIC_IP_OPS"
```

### Important Notes

- **Both NSG layers matter.** AKS Node NSG (`aks-agentpool-*-nsg`) is managed by AKS. VNet Subnet NSG (`vnet-srelab-snet-aks-nsg-*`) is your responsibility.
- **Private clusters:** If your AKS cluster is fully private, LoadBalancer services still work, but SRE Agent cannot access the cluster. See [SRE Agent Issues](#sre-agent-issues).

---

## SRE Agent Issues

### Agent Can't Access AKS Resources

**Symptom:** SRE Agent says it can't read namespaces or pods

**Diagnosis:**
1. Verify the cluster is **not** a fully private cluster (SRE Agent needs network access to the API server)
2. Check the agent's managed identity has the correct roles:
   ```bash
   RESOURCE_GROUP="rg-srelab-eastus2"
   # List role assignments for the SRE Agent managed identity
   az role assignment list -g "$RESOURCE_GROUP" --query "[?principalType=='ServicePrincipal']" -o table
   ```
3. Verify the cluster is in a supported region (East US 2, Sweden Central, Australia East)

**Fix:** Ensure the cluster is publicly accessible (or has authorized IP ranges that include SRE Agent). Re-run RBAC configuration if roles are missing:

```powershell
.\scripts\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>"
```

### Permission Errors

**Symptom:** "Insufficient permissions" errors in SRE Agent portal

**Diagnosis:**
- For `Low` access (diagnosis only): Agent needs Reader + Log Analytics Reader
- For `High` access (remediation demo): Agent additionally needs Contributor

**Fix:**
1. Verify the managed identity has the expected roles for the configured access level
2. Ensure the deploying user has `Microsoft.Authorization/roleAssignments/write` permission
3. Re-run the RBAC configuration script:
   ```powershell
   # Low access (diagnosis only):
   .\scripts\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>"

   # High access (remediation demo):
   .\scripts\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>" -SreAgentAccessLevel High
   ```

### Firewall Blocking

**Symptom:** Agent can't connect or times out

**Fix:** Ensure `*.azuresre.ai` is allowed through your firewall/proxy. This domain must be reachable from the operator's workstation and (for agent-to-cluster communication) from the Azure control plane.

### Agent Returns Unhelpful or Generic Responses

**Symptom:** SRE Agent acknowledges the question but doesn't provide specific diagnostics

**Diagnosis:**
1. Verify the agent is connected to the correct resources (AKS cluster, Log Analytics workspace)
2. Check that Container Insights is enabled and collecting data
3. Ensure sufficient time has passed since scenario injection (signals need 1-2 minutes to propagate)

**Fix:**
- Wait 2-3 minutes after injecting a scenario before asking SRE Agent
- Use specific prompts: "Why is the meter-service pod in CrashLoopBackOff in the energy namespace?" rather than "What's wrong?"
- Re-verify connected resources in the SRE Agent portal under **Connected resources**

### SRE Agent Not Deployed

**Symptom:** No SRE Agent resource exists in the resource group

**Fix:** Re-deploy with SRE Agent enabled:

```powershell
.\scripts\deploy.ps1 -Location eastus2 -Yes
```

To verify deployment status:
```bash
az resource list -g "rg-srelab-eastus2" --resource-type "Microsoft.App/agents" -o table
```

---

## Network Policy Issues

### Symptom

Pods in the `energy` namespace can't reach each other or external services after a scenario injection.

### Diagnosis

```bash
# List all network policies in the namespace
kubectl get networkpolicies -n energy

# Describe the blocking policy
kubectl describe networkpolicy -n energy

# Test connectivity between pods
kubectl exec -n energy deploy/meter-service -- curl -sI http://mongodb:27017/ 2>&1 | head -5
```

### Common Cause

The `network-block` breakable scenario injects a NetworkPolicy that isolates meter-service. This is **intentional** for demo purposes.

### Fix

Restore the base manifest to remove injected network policies:

```bash
kubectl apply -f k8s/base/application.yaml

# If the policy persists, delete it explicitly
kubectl delete networkpolicy -n energy --all
```

### Verification

```bash
# Verify no blocking policies remain
kubectl get networkpolicies -n energy
# Expected: No resources found

# Verify inter-pod connectivity
kubectl exec -n energy deploy/meter-service -- curl -sI http://mongodb:27017/ 2>&1 | head -3
```

---

## Full Reset Procedure

When troubleshooting is inconclusive or you need to return to a known-good state quickly:

```bash
# 1. Restore all application workloads
kubectl apply -f k8s/base/application.yaml

# 2. Remove any leftover network policies
kubectl delete networkpolicy -n energy --all 2>/dev/null

# 3. Wait for stabilization
sleep 30

# 4. Verify health
kubectl get pods -n energy
kubectl get endpoints -n energy
```

If this doesn't resolve the issue, see [Supportability Guide -> Restoring Healthy State](SUPPORTABILITY.md#4-restoring-healthy-state) for infrastructure-level recovery options.

---

## Related Documentation

| Document | Use When |
|----------|----------|
| [Supportability Guide](SUPPORTABILITY.md) | Understanding what's supportable, escalation paths, known limitations |
| [Breakable Scenarios](BREAKABLE-SCENARIOS.md) | You need to understand or inject a specific failure scenario |
| [SRE Agent Setup](SRE-AGENT-SETUP.md) | First-time setup, RBAC configuration, portal connection |
| [AKS maxPods Runbook](AKS-MAXPODS-MAINTENANCE-RUNBOOK.md) | Node pool replacement for scheduling pressure |
| [Capability Contracts](CAPABILITY-CONTRACTS.md) | Architecture decisions, telemetry schemas, RBAC matrix |

---

*Last updated: 2026-05-06 | Maintainer: SRE Lab Team*
