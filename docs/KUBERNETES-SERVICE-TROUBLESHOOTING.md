# Kubernetes Service Troubleshooting Guide

This guide covers Kubernetes service and networking diagnostics for the Energy Grid demo lab.

## Quick Diagnostic Baseline

Before troubleshooting the Azure networking layer, verify Kubernetes service health:

### Step 1: Service Definition & Endpoints

```bash
# Check service definition
kubectl describe svc <service-name> -n energy

# Expected output includes:
# - Selector: correct labels that match your pods
# - Port: the service port (e.g., 80)
# - TargetPort: container port (e.g., 3000)
# - Endpoints: list of pod IPs and ports
# Example: 10.244.0.15:3000,10.244.0.16:3000

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
# Name:	meter-service.energy.svc.cluster.local
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

# In another terminal, test locally
curl -v -I http://localhost:18080/

# Stop the port-forward
kill %1
```

**Expected healthy results:**
- Port-forward establishes without error
- Curl returns 200 OK or app-specific response
- Shows pods are running and responding correctly

---

## Escalation Decision Tree

**If all K8s diagnostics above are healthy**, the issue is NOT in Kubernetes — it's in the **Azure networking layer** (Load Balancer or VNet subnet NSG).

### Decision Table

| External IP Status | Public IP Response | Root Cause | Troubleshooting Path |
|---|---|---|---|
| **Pending** | N/A | Load Balancer creation in progress OR service spec issue | Wait 2-3 minutes; check `kubectl get svc <service> -o wide`; verify `type: LoadBalancer` |
| **Assigned** | **Timeout / Empty Reply** | VNet subnet NSG blocking Internet traffic | See [TROUBLESHOOTING.md — Public LoadBalancer Not Responding](TROUBLESHOOTING.md#-public-loadbalancer-not-responding) |
| **Assigned** | **Connection Refused** | Service/selector mismatch OR port mapping wrong; K8s is rejecting connections | Go back to Step 2 & 3 above; check pod logs |
| **Assigned** | **HTTP 200 but wrong page** | Traffic is reaching the app; app logic/routing issue | Check pod logs; verify app config; not a networking issue |
| **Assigned** | **HTTP 404 / 503 / 5xx** | Traffic reaching the app but app is broken | Check pod logs; not a networking issue |

---

## Common Scenarios & Diagnostics

### Scenario: Pod Is Running But Endpoints Show Empty

```bash
# Pod status shows Running
kubectl get pods -n energy -l app=meter-service

# But endpoints are empty
kubectl get endpoints -n energy meter-service
# Output: <none>

# Root cause: Pod labels don't match service selector
kubectl get pods -n energy -l app=meter-service --show-labels
kubectl get svc meter-service -n energy -o jsonpath='{.spec.selector}'

# Fix: Correct the service selector or pod labels to align
```

### Scenario: Port-Forward Works But Public IP Fails

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
# → Go to TROUBLESHOOTING.md → Public LoadBalancer Not Responding section
```

### Scenario: Service Has Wrong TargetPort

```bash
# Service definition shows:
kubectl describe svc meter-service -n energy | grep -A 5 "Port:"
# Port:              80
# TargetPort:        8080
# Endpoints:         <none>

# But pods actually listen on port 3000, not 8080
kubectl get pod -n energy -l app=meter-service -o jsonpath='{.items[0].spec.containers[0].ports[0].containerPort}'
# Output: 3000

# Fix: Update service TargetPort to match container port
kubectl patch svc meter-service -n energy -p '{"spec":{"ports":[{"port":80,"targetPort":3000}]}}'
```

### Scenario: Multiple Containers With Different Ports

```bash
# Check which container and which port you're targeting
kubectl get pod -n energy pod-name -o jsonpath='{.spec.containers[*].{name:.name,ports:.ports[*].containerPort}}'

# Ensure service TargetPort matches the right container port
kubectl describe svc <service> -n energy | grep -A 3 "Endpoints"
```

---

## Port Mapping Validation

```bash
# Full port mapping chain:
# Client → Service.Port → TargetPort → Container.ContainerPort

# 1. Get service port mapping
echo "Service Port → TargetPort:"
kubectl get svc <service-name> -n energy -o jsonpath='{.spec.ports[0].port} → {.spec.ports[0].targetPort}{"\n"}'

# 2. Get container port
echo "Container Port:"
kubectl get pod -n energy -l app=<app-name> -o jsonpath='{.items[0].spec.containers[0].ports[0].containerPort}{"\n"}'

# 3. Verify they match (TargetPort should equal ContainerPort)

# 4. For LoadBalancer, also check NodePort
echo "NodePort (LoadBalancer traffic):"
kubectl get svc <service-name> -n energy -o jsonpath='{.spec.ports[0].nodePort}{"\n"}'

# 5. Verify nodes listen on that port
kubectl get nodes -o wide
# Node IPs are private in this lab. Test nodePort from inside the VNet/cluster:
kubectl run -n energy test-nodeport --image=curlimages/curl:latest --rm -it -- \
  sh -c 'curl -v -I http://<node-internal-ip>:<nodeport>/'
```

---

## Service Type Reference

| Service Type | Access From | Primary Use |
|---|---|---|
| **ClusterIP** | Inside cluster only | Internal communication |
| **NodePort** | Inside cluster + node IP:port | Testing, internal NodePort |
| **LoadBalancer** | Internet (via public IP) + node IP:port | Public access (grid-dashboard, ops-console) |
| **ExternalName** | Inside cluster (CNAME redirect) | External services |

---

## Related Documentation

- **If K8s diagnostics pass but public IP fails:** See [TROUBLESHOOTING.md — Public LoadBalancer Not Responding](TROUBLESHOOTING.md#-public-loadbalancer-not-responding)
- **For SRE Agent troubleshooting:** See [SRE-AGENT-SETUP.md — Troubleshooting SRE Agent](SRE-AGENT-SETUP.md#troubleshooting-sre-agent)
- **For breakable scenarios:** See [BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md)
