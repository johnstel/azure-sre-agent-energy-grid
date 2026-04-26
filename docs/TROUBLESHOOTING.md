# Troubleshooting Guide

This guide covers common issues with the Energy Grid demo lab and how to diagnose and resolve them.

## 🌐 Public LoadBalancer Not Responding

### Understanding the Three-Layer Path

When you curl a public LoadBalancer IP, traffic follows this path:

```
Internet Client
    ↓
Public IP
    ↓
Azure Load Balancer (LB rules, probes, backend pools)
    ↓
VNet Subnet NSG (inbound rules — THIS IS OFTEN THE CULPRIT)
    ↓
AKS Node NSG (managed by AKS, usually allows necessary traffic)
    ↓
Kubernetes Node (iptables, kube-proxy)
    ↓
Kubernetes Service (ClusterIP, selectors, endpoints)
    ↓
Pod (container listening on containerPort)
```

**Critical:** Both the **AKS-managed node NSG** and the **VNet subnet NSG** can block traffic. The VNet subnet NSG is the usual culprit.

### Symptom
- Public LoadBalancer IPs for `grid-dashboard` or `ops-console` return timeout, connection refused, or empty reply
- Curl from outside Azure returns: `curl: (28) Operation timed out` or `curl: (52) Empty reply from server`
- Port-forward works: `kubectl port-forward` to service works fine
- In-cluster access works: `curl` from inside a pod returns 200 OK
- Pods, services, endpoints, and nodePorts all appear healthy
- Azure Load Balancer health probes show green

### Root Cause
The issue is almost always **VNet Subnet NSG (Network Security Group)** blocking Internet traffic, NOT Azure Load Balancer misconfiguration.

Azure uses two NSG layers for LoadBalancer traffic:
1. **AKS Node NSG** (managed by AKS) — typically allows necessary traffic
2. **VNet Subnet NSG** (your VNet's AKS subnet) — often has default `DenyAllInBound` rule with no custom allow rules

When the public LoadBalancer forwards Internet traffic to AKS nodes, the **VNet subnet NSG** inspects it and denies it before it reaches the pod.

### Quick Decision Table

Use this table to quickly determine the likely root cause:

| External IP Status | Public IP Response | Likely Root Cause | Next Step |
|---|---|---|---|
| **Pending** | N/A | Load Balancer creation in progress or service not fully deployed | Wait 2-3 minutes; check `kubectl get svc -n energy grid-dashboard -o wide` for external IP assignment |
| **Assigned** | **Timeout or Empty Reply** | **VNet subnet NSG blocking Internet traffic** | Follow diagnostic steps below to confirm and fix NSG rule |
| **Assigned** | **Connection Refused** | Service selector/endpoint mismatch OR port mapping incorrect | See [KUBERNETES-SERVICE-TROUBLESHOOTING.md](KUBERNETES-SERVICE-TROUBLESHOOTING.md) — K8s is rejecting the connection |
| **Assigned** | **HTTP 404 / 503 / 5xx** | Traffic reached the app but app is broken | Check pod logs: `kubectl logs -n energy -l app=grid-dashboard` |
| **Assigned** | **Page loads but looks wrong** | Traffic OK, app logic/routing issue | Check application configuration and logs; not a networking issue |

### Diagnostic Sequence

#### Step 1: Verify Pod & Service Health (Should Be OK)

Before checking Azure networking, establish a **Kubernetes baseline**. See [KUBERNETES-SERVICE-TROUBLESHOOTING.md](KUBERNETES-SERVICE-TROUBLESHOOTING.md) for comprehensive K8s diagnostics. Quick checks:

```bash
# 1. Check if pods are running
kubectl get pods -n energy -l app=grid-dashboard

# 2. Check service endpoints (should NOT be empty!)
kubectl get endpoints -n energy grid-dashboard
kubectl get endpointslices -n energy

# 3. Verify service definition and port mapping
kubectl describe svc grid-dashboard -n energy

# 4. Check service selector matches pod labels
kubectl get svc grid-dashboard -n energy -o jsonpath='{.spec.selector}'
kubectl get pods -n energy -l app=grid-dashboard --show-labels

# 5. Test in-cluster connectivity via DNS
kubectl run -n energy test-curl --image=curlimages/curl:latest --rm -it -- \
  sh -c 'curl -v -I http://grid-dashboard:80/'
# Should return 200 OK

# 6. Test via port-forward (bypasses service networking)
kubectl port-forward -n energy svc/grid-dashboard 18080:80 &
sleep 1
curl -v -I http://localhost:18080/
kill %1
```

**Expected results:**
- Pods show `Running` and `Ready 1/1`
- Endpoints show pod IPs (not empty)
- Service selector matches pod labels exactly
- In-cluster curl returns 200 OK
- Port-forward works and returns 200 OK
- DNS resolves service name to ClusterIP

**If all of these pass:** Kubernetes and service are healthy. **The problem is in Azure networking (Load Balancer or NSG).**

**If any of these fail:** See [KUBERNETES-SERVICE-TROUBLESHOOTING.md](KUBERNETES-SERVICE-TROUBLESHOOTING.md) for K8s-specific diagnostics.

#### Step 2: Check Azure Load Balancer Configuration
```bash
# Get the public IP
RESOURCE_GROUP="rg-srelab-eastus2"  # or your resource group
AKS_CLUSTER_NAME="aks-srelab"
NODE_RESOURCE_GROUP=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_CLUSTER_NAME" --query nodeResourceGroup -o tsv)

kubectl get svc -n energy grid-dashboard -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

# Verify from Azure Portal or CLI that:
# 1. The public IP is assigned to the Load Balancer
# 2. Backend pools contain the AKS nodes
# 3. Health probes are passing (green)

az network lb rule list -g "$NODE_RESOURCE_GROUP" --lb-name "kubernetes" -o table
```

**Expected results:**
- Load Balancer rules exist and point to backend pools
- Health probes show healthy status

#### Step 3: Identify Which NSG is Blocking (The Critical Step)

Two NSG layers can block LoadBalancer traffic. You must check both.

**Test 1: Get the AKS Node Resource Group and Check Both NSGs**

```bash
RESOURCE_GROUP="rg-srelab-eastus2"  # Your deployment resource group
AKS_CLUSTER_NAME="aks-srelab"

# Get the node resource group (where AKS-managed resources live)
AKS_RG=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_CLUSTER_NAME" --query nodeResourceGroup -o tsv)
echo "Node Resource Group: $AKS_RG"

# Get AKS Cluster Name
CLUSTER_NAME=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_CLUSTER_NAME" --query name -o tsv)
NODE_RG=$(az aks show -g "$RESOURCE_GROUP" -n "$AKS_CLUSTER_NAME" --query nodeResourceGroup -o tsv)
```

**Layer 1: Check AKS-Managed Node NSG (usually fine)**

```bash
# List all NSGs in the node resource group
az network nsg list -g "$AKS_RG" -o table

# Get the AKS node NSG (typically named like MC_*_aks-agentpool-*-nsg)
NODE_NSG=$(az network nsg list -g "$AKS_RG" --query '[0].name' -o tsv)
echo "Node NSG: $NODE_NSG"

# Check rules
az network nsg rule list -g "$AKS_RG" --nsg-name "$NODE_NSG" -o table

# Look for allow rules for ports 80, 443, and the nodePort range
```

**Expected result:** You should see allow rules for the ports you're using. AKS-managed NSGs typically handle this correctly.

**Layer 2: Check VNet Subnet NSG (usually the culprit)**

```bash
# VNet subnet NSG is in YOUR resource group, not the node resource group
VNET_NSG_NAME="vnet-srelab-snet-aks-nsg-eastus2"  # from network.bicep

# Verify the NSG exists
az network nsg show -g "$RESOURCE_GROUP" -n "$VNET_NSG_NAME" --query "name" -o tsv

# List all rules
az network nsg rule list -g "$RESOURCE_GROUP" --nsg-name "$VNET_NSG_NAME" -o table
```

**Key rule to look for:**

The rule below MUST exist for HTTP traffic to reach your pods. If missing, that's your problem:

```
Name: Allow-Internet-HTTP-To-AKS-LB
Priority: 400
Direction: Inbound
Access: Allow
Protocol: Tcp
Source: Internet
Source Port: *
Dest: *
Dest Port: 80
```

**Check if the rule exists:**

```bash
az network nsg rule show \
  -g "$RESOURCE_GROUP" \
  --nsg-name "$VNET_NSG_NAME" \
  -n "Allow-Internet-HTTP-To-AKS-LB" \
  2>/dev/null || echo "RULE MISSING — This is your problem!"
```

**Test 2: Verify NSG Is Associated With the Right Subnet**

```bash
# Get the VNet and AKS subnet
VNET_NAME="vnet-srelab"  # From network.bicep
SUBNET_NAME="snet-aks"

# Check which NSG is associated with the subnet
az network vnet subnet show \
  -g "$RESOURCE_GROUP" \
  --vnet-name "$VNET_NAME" \
  --name "$SUBNET_NAME" \
  --query "networkSecurityGroup.id" -o tsv

# Should show the VNet subnet NSG (vnet-srelab-snet-aks-nsg-*)
```

**Test 3: Verify Load Balancer Rules and Backend Pools**

```bash
# Get the Azure Load Balancer created by AKS in the node resource group
LB_NAME=$(az network lb list -g "$NODE_RG" --query '[0].name' -o tsv)
echo "Load Balancer: $LB_NAME"

# Check LB rules
az network lb rule list -g "$NODE_RG" --lb-name "$LB_NAME" -o table

# Check backend pools
az network lb address-pool list -g "$NODE_RG" --lb-name "$LB_NAME" -o table

# Check health probes
az network lb probe list -g "$NODE_RG" --lb-name "$LB_NAME" -o table

# Get the public IP associated with the LB
az network public-ip list -g "$NODE_RG" -o table
```

**Expected:** Rules should map ports (e.g., 80) to your service's nodePort. Backend pools should contain AKS nodes. Health probes should show healthy status.

**Test 4: Effective NSG Check on a Node NIC (Optional)**

```bash
# Show the effective NSGs on a node NIC. This helps confirm whether both
# the AKS-managed node NSG and the VNet subnet NSG are attached/effective.
NODE_NIC_NAME=$(az network nic list -g "$NODE_RG" --query '[0].name' -o tsv)

az network nic list-effective-nsg \
  -g "$NODE_RG" \
  -n "$NODE_NIC_NAME" \
  -o table

# Look for the VNet subnet NSG and its inbound Allow-Internet-HTTP-To-AKS-LB rule.
# If only default DenyAllInBound applies for HTTP, the public VIP will time out.
```

### How to Fix

#### Immediate Fix (Idempotent Azure CLI Command)

This command is safe to run multiple times — it won't error if the rule already exists:

```bash
RESOURCE_GROUP="rg-srelab-eastus2"
VNET_NSG_NAME="vnet-srelab-snet-aks-nsg-eastus2"

# Create or update the allow rule (idempotent)
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

echo "✓ Rule applied. Public IPs should now respond to HTTP on port 80."
```

**Verify the rule was created:**
```bash
az network nsg rule show \
  -g "$RESOURCE_GROUP" \
  --nsg-name "$VNET_NSG_NAME" \
  -n "Allow-Internet-HTTP-To-AKS-LB"
```

**Also add HTTPS (port 443) if needed:**
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
The rule is already persisted in `infra/bicep/modules/network.bicep` (lines 36–49):

```bicep
{
  name: 'Allow-Internet-HTTP-To-AKS-LB'
  properties: {
    priority: 400
    access: 'Allow'
    direction: 'Inbound'
    protocol: 'Tcp'
    sourceAddressPrefix: 'Internet'
    sourcePortRange: '*'
    destinationAddressPrefix: '*'
    destinationPortRange: '80'
  }
}
```

**If you don't have this rule in your NSG:**
- Re-deploy with latest Bicep: `.\scripts\deploy.ps1 -Location eastus2`
- Or manually add the rule using the Azure CLI command above

### Verification (After Fix)
```bash
PUBLIC_IP=$(kubectl get svc -n energy grid-dashboard -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Testing: http://$PUBLIC_IP"

curl -v "http://$PUBLIC_IP"
# Should return 200 OK (or redirect if app uses routing)

# Also test ops-console if deployed
PUBLIC_IP_OPS=$(kubectl get svc -n energy ops-console -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "Testing: http://$PUBLIC_IP_OPS"
curl -v "http://$PUBLIC_IP_OPS"
```

### Important Notes

⚠️ **Both NSG layers matter:**
- **AKS Node NSG** (`aks-agentpool-*-nsg` in the node resource group): Managed by AKS. If you need to add custom rules, do it carefully or use a network policy instead.
- **VNet Subnet NSG** (`vnet-srelab-snet-aks-nsg-*`): Your responsibility. Needs explicit allow rules for inbound traffic.

⚠️ **HTTPS (443) not working?**
Add a second rule with port 443:
```bash
az network nsg rule create \
  -g "$RESOURCE_GROUP" \
  --nsg-name "$NSG_NAME" \
  -n "Allow-Internet-HTTPS-To-AKS-LB" \
  --priority 401 \
  --source-address-prefixes "Internet" \
  --destination-port-ranges "443" \
  --access Allow \
  --protocol Tcp \
  --direction Inbound
```

⚠️ **Private clusters:**
If your AKS cluster is fully private (no public API endpoint), LoadBalancer services still work, but SRE Agent cannot access it. See [SRE-AGENT-SETUP.md](SRE-AGENT-SETUP.md#agent-cant-access-aks-resources).

---

## 🚀 Other Common Issues

### Pods Can't Reach External Services
Check NetworkPolicy in the namespace:
```bash
kubectl get networkpolicies -n energy
kubectl describe networkpolicy -n energy
```

### SRE Agent Can't Access Resources
See [SRE-AGENT-SETUP.md](SRE-AGENT-SETUP.md#troubleshooting-sre-agent).

### Dashboard Shows "Connection Refused"
- Verify pods are running: `kubectl get pods -n energy`
- Check logs: `kubectl logs -n energy -l app=grid-dashboard`
- Verify service exists: `kubectl get svc -n energy grid-dashboard`

---

## 📞 Need More Help?

Check the [SRE-AGENT-SETUP.md](SRE-AGENT-SETUP.md) for SRE Agent-specific issues, or [BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md) if you're intentionally breaking things for demo purposes.
