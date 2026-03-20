# Breakable Scenarios Guide

This guide explains each failure scenario available in the Energy Grid SRE Demo Lab and how to use them for demonstrating Azure SRE Agent capabilities.

## Quick Reference

| Scenario | File | Energy Narrative | SRE Agent Diagnosis |
|----------|------|-----------------|---------------------|
| OOMKilled | `oom-killed.yaml` | Meter service overwhelmed by smart meter data spike | Identifies OOM events, recommends memory limits |
| CrashLoop | `crash-loop.yaml` | Asset service crash — invalid grid configuration | Shows exit codes, logs analysis |
| ImagePullBackOff | `image-pull-backoff.yaml` | Dispatch service fails after botched image release | Registry/image troubleshooting |
| High CPU | `high-cpu.yaml` | Grid frequency calculation overload | Performance analysis |
| Pending Pods | `pending-pods.yaml` | Substation monitor pods can't schedule | Scheduling analysis |
| Probe Failure | `probe-failure.yaml` | Grid health monitor misconfigured after maintenance | Probe configuration analysis |
| Network Block | `network-block.yaml` | Meter service isolated by bad security policy | Network policy analysis |
| Missing Config | `missing-config.yaml` | Grid zone configuration missing | Configuration troubleshooting |
| MongoDB Down | `mongodb-down.yaml` | Meter database outage — cascading dispatch failure | Dependency tracing, root cause |
| Service Mismatch | `service-mismatch.yaml` | Meter service routing failure after "v2 upgrade" | Endpoint/selector analysis |

## Scenario Details

---

### 1. OOMKilled — Meter Service Memory Exhaustion

**File:** `k8s/scenarios/oom-killed.yaml`

**What happens:**
- Deploys meter-service with extremely low memory limits (16Mi)
- Smart meter data spike during peak demand overwhelms the service
- Pod starts, runs for a few seconds, then gets killed by OOM Killer
- Kubernetes restarts the pod, cycle repeats

**How to break:**
```bash
kubectl apply -f k8s/scenarios/oom-killed.yaml
```

**What to observe:**
```bash
# Watch pods restart
kubectl get pods -n energy -w

# See OOMKilled status
kubectl describe pod -l app=meter-service -n energy | grep -A 5 "Last State"
```

**SRE Agent prompts:**
- "Why is the meter-service pod restarting repeatedly?"
- "I see OOMKilled events. What memory should I allocate for meter data processing?"
- "Diagnose the memory issues in the energy namespace"

**How to fix:**
```bash
kubectl apply -f k8s/base/application.yaml
```

---

### 2. CrashLoopBackOff — Asset Service Configuration Failure

**File:** `k8s/scenarios/crash-loop.yaml`

**What happens:**
- Deploys asset-service with invalid grid configuration
- Container starts, runs invalid command, exits with code 1
- Kubernetes keeps restarting, enters CrashLoopBackOff

**How to break:**
```bash
kubectl apply -f k8s/scenarios/crash-loop.yaml
```

**What to observe:**
```bash
# See CrashLoopBackOff status
kubectl get pods -n energy | grep asset-service

# Check container logs
kubectl logs -l app=asset-service -n energy --previous
```

**SRE Agent prompts:**
- "Why is asset-service in CrashLoopBackOff?"
- "Show me the logs for the crashing asset catalog pods"
- "What's causing exit code 1 in the energy asset service?"

**How to fix:**
```bash
kubectl apply -f k8s/base/application.yaml
```

---

### 3. ImagePullBackOff — Failed Dispatch Service Deployment

**File:** `k8s/scenarios/image-pull-backoff.yaml`

**What happens:**
- Deploys dispatch-service referencing a non-existent image tag
- Kubelet can't pull the image from registry
- Pod stays in ImagePullBackOff state

**How to break:**
```bash
kubectl apply -f k8s/scenarios/image-pull-backoff.yaml
```

**What to observe:**
```bash
# See ImagePullBackOff status
kubectl get pods -n energy | grep dispatch

# Check events
kubectl describe pod -l app=dispatch-service -n energy | grep -A 10 Events
```

**SRE Agent prompts:**
- "Why can't my dispatch-service pods start? I see ImagePullBackOff"
- "Help me troubleshoot the container image issue for energy dispatch"
- "What's wrong with the dispatch-service deployment?"

**How to fix:**
```bash
kubectl apply -f k8s/base/application.yaml
```

---

### 4. High CPU — Grid Frequency Calculation Overload

**File:** `k8s/scenarios/high-cpu.yaml`

**What happens:**
- Deploys frequency-calc-overload pods that consume excessive CPU
- Simulates extreme weather triggering intensive grid frequency calculations
- Other workloads may slow down due to resource contention

**How to break:**
```bash
kubectl apply -f k8s/scenarios/high-cpu.yaml
```

**What to observe:**
```bash
# Watch CPU usage
kubectl top pods -n energy

# Check node pressure
kubectl top nodes
```

**SRE Agent prompts:**
- "Grid services are slow. What's consuming all the CPU?"
- "Analyze CPU usage across pods in the energy namespace"
- "Which pods are causing resource contention on the grid platform?"

**How to fix:**
```bash
kubectl delete deployment frequency-calc-overload -n energy
```

---

### 5. Pending Pods — Substation Monitor Can't Schedule

**File:** `k8s/scenarios/pending-pods.yaml`

**What happens:**
- Deploys substation-monitor pods requesting 32Gi memory and 8 CPUs each
- No nodes can satisfy these requests — cluster capacity exhausted
- Pods stay in Pending state indefinitely

**How to break:**
```bash
kubectl apply -f k8s/scenarios/pending-pods.yaml
```

**What to observe:**
```bash
# See pending pods
kubectl get pods -n energy | grep substation-monitor

# Check events
kubectl describe pod -l app=substation-monitor -n energy | grep -A 10 Events
```

**SRE Agent prompts:**
- "Why are the substation monitoring pods stuck in Pending?"
- "I can't schedule new grid monitoring workloads. What's wrong?"
- "Analyze cluster capacity for the energy platform"

**How to fix:**
```bash
kubectl delete deployment substation-monitor -n energy
```

---

### 6. Failed Liveness Probe — Grid Health Monitor Misconfigured

**File:** `k8s/scenarios/probe-failure.yaml`

**What happens:**
- Deploys grid-health-monitor with liveness probe to non-existent endpoint
- Probe was misconfigured after a maintenance window
- Kubernetes restarts the container repeatedly

**How to break:**
```bash
kubectl apply -f k8s/scenarios/probe-failure.yaml
```

**What to observe:**
```bash
# Watch restarts increase
kubectl get pods -n energy -l app=grid-health-monitor -w

# See probe failure events
kubectl describe pod -l app=grid-health-monitor -n energy | grep -A 5 "Liveness"
```

**SRE Agent prompts:**
- "Grid health monitor pods keep restarting but nothing seems wrong"
- "Diagnose the health check failures in the energy namespace"
- "What's wrong with the liveness probe on grid-health-monitor?"

**How to fix:**
```bash
kubectl delete deployment grid-health-monitor -n energy
```

---

### 7. Network Policy Blocking — Meter Service Isolated

**File:** `k8s/scenarios/network-block.yaml`

**What happens:**
- Applies NetworkPolicy that blocks all traffic to meter-service
- Meter service becomes isolated from the grid after a bad security policy update
- Grid dashboard can't submit meter readings

**How to break:**
```bash
kubectl apply -f k8s/scenarios/network-block.yaml
```

**What to observe:**
```bash
# Test connectivity from grid-dashboard
kubectl exec -n energy deploy/grid-dashboard -- curl -s meter-service:3000/health
# Should timeout or fail
```

**SRE Agent prompts:**
- "Why can't the grid dashboard reach meter-service?"
- "Diagnose network connectivity issues in the energy namespace"
- "What network policies are blocking meter data ingestion?"

**How to fix:**
```bash
kubectl delete networkpolicy deny-meter-service -n energy
```

---

### 8. Missing ConfigMap — Grid Zone Configuration Missing

**File:** `k8s/scenarios/missing-config.yaml`

**What happens:**
- Deploys grid-zone-config service referencing non-existent ConfigMaps
- Configuration was lost during environment promotion
- Pod can't start — shows ContainerCreateError

**How to break:**
```bash
kubectl apply -f k8s/scenarios/missing-config.yaml
```

**What to observe:**
```bash
# See the error
kubectl get pods -n energy | grep grid-zone-config

# Check events
kubectl describe pod -l app=grid-zone-config -n energy | grep -A 10 Events
```

**SRE Agent prompts:**
- "Grid zone configuration pod won't start. Something about ConfigMap?"
- "What configuration is missing for the grid zone deployment?"
- "Troubleshoot the ConfigMap reference error in the energy namespace"

**How to fix:**
```bash
kubectl delete deployment grid-zone-config -n energy
```

---

### 9. MongoDB Down — Meter Database Outage (Cascading Failure)

**File:** `k8s/scenarios/mongodb-down.yaml`

**What happens:**
- Scales MongoDB deployment to 0 replicas (meter database goes offline)
- dispatch-service can't connect to MongoDB, starts failing health checks
- Meter readings can still be submitted (queued in RabbitMQ) but never processed
- This is the most realistic scenario: requires tracing a dependency chain

**How to break:**
```bash
kubectl apply -f k8s/scenarios/mongodb-down.yaml
```

**What to observe:**
```bash
# MongoDB has 0 replicas
kubectl get deployment mongodb -n energy

# dispatch-service becomes unhealthy
kubectl get pods -n energy -l app=dispatch-service

# Meter events queue up in RabbitMQ but never get dispatched
kubectl exec -n energy deploy/rabbitmq -- rabbitmqctl list_queues
```

**SRE Agent prompts:**
- "Meter readings are being accepted but never dispatched. What's wrong?"
- "Why is dispatch-service failing health checks?"
- "Trace the dependency chain — what broke first?"
- "Scale the mongodb deployment back to 1 replica"

**How to fix:**
```bash
kubectl apply -f k8s/base/application.yaml
```

---

### 10. Service Selector Mismatch — Meter Service Routing Failure

**File:** `k8s/scenarios/service-mismatch.yaml`

**What happens:**
- Replaces the meter-service Service with a wrong selector (`app: meter-service-v2`)
- The meter-service pods are perfectly healthy (Running, Ready)
- But the Service has zero endpoints — traffic doesn't reach any pod
- The grid dashboard loads fine, but submitting meter readings fails silently

**Why this is interesting:**
- All pods show green — no crashes, no restarts, no OOM
- `kubectl get pods` looks completely healthy
- SRE Agent must check Service endpoints and selector labels, not just pod status
- This mimics a common real-world misconfiguration after a "v2 upgrade"

**How to break:**
```bash
kubectl apply -f k8s/scenarios/service-mismatch.yaml
```

**What to observe:**
```bash
# Pods are healthy!
kubectl get pods -n energy -l app=meter-service

# But the Service has no endpoints
kubectl get endpoints meter-service -n energy

# Compare selector vs. pod labels
kubectl get svc meter-service -n energy -o jsonpath='{.spec.selector}'
kubectl get pods -n energy -l app=meter-service --show-labels
```

**SRE Agent prompts:**
- "The grid dashboard loads but meter readings fail. Everything looks healthy."
- "Why does meter-service have no endpoints?"
- "Compare the meter-service Service selector to the actual pod labels"
- "Fix the selector on the meter-service Service to match the pods"

**How to fix:**
```bash
kubectl apply -f k8s/base/application.yaml
```

---

## Demo Flow Suggestions

### Quick Demo (5 minutes)

1. Apply OOMKilled scenario (meter service memory exhaustion)
2. Show pods crashing in kubectl
3. Ask SRE Agent to diagnose
4. Apply fix and show recovery

### Comprehensive Demo (20 minutes)

1. **Introduction** - Show healthy energy grid platform
2. **Break #1** - OOMKilled (meter service memory exhaustion)
3. **Break #2** - Network Policy (meter service isolated)
4. **Break #3** - CrashLoopBackOff (asset service config failure)
5. **Advanced** - Show scheduled monitoring task
6. **Cleanup** - Restore all scenarios

### "Baking" for Advisor Recommendations

Some scenarios benefit from running longer to gather metrics:

1. Deploy grid frequency overload scenario
2. Wait 30-60 minutes
3. Check Azure Advisor for right-sizing recommendations
4. Use SRE Agent to analyze historical patterns

## Best Practices

- ✅ Always test scenarios in dev environment first
- ✅ Have baseline metrics before breaking things
- ✅ Document what you did and when for demos
- ✅ Keep fix commands ready
- ❌ Don't apply multiple breaking scenarios simultaneously
- ❌ Don't leave scenarios running unattended
