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
| Complete Failure Bundle | `complete-failure-bundle/scenario.yaml` | Multi-component outage across dependencies + routing | Root cause prioritization and staged recovery |

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies `OOMKilled` as root cause AND recommends increasing memory limits
- ✅ **PASS**: Pod restarts are visible within 60 seconds of scenario injection
- ❌ **FAIL**: SRE Agent misidentifies root cause after 3 prompt attempts
- ❌ **FAIL**: Agent recommends unrelated fix (e.g., image pull, network issue)

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies `CrashLoopBackOff` and analyzes container exit codes/logs
- ✅ **PASS**: Agent traces root cause to invalid command or configuration
- ❌ **FAIL**: Agent does not check container logs or exit codes
- ❌ **FAIL**: Agent attributes crash to resource exhaustion instead of configuration

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies `ImagePullBackOff` and names the non-existent image tag
- ✅ **PASS**: Agent recommends verifying the image exists in the registry
- ❌ **FAIL**: Agent does not identify the image/registry issue
- ❌ **FAIL**: Agent attributes failure to application crash instead of image pull

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies excessive CPU consumption by frequency-calc-overload pods
- ✅ **PASS**: Agent recommends resource limits or scaling adjustments
- ❌ **FAIL**: Agent does not identify the CPU-intensive workload
- ❌ **FAIL**: Agent attributes slowness to network or memory issues

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies Pending state and traces to insufficient cluster resources (CPU/memory requests too high)
- ✅ **PASS**: Agent recommends reducing resource requests or scaling the cluster
- ❌ **FAIL**: Agent does not check scheduling events or resource requests
- ❌ **FAIL**: Agent attributes Pending to image pull or configuration issues

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies liveness probe failure and the misconfigured endpoint
- ✅ **PASS**: Agent recommends correcting the probe path or endpoint
- ❌ **FAIL**: Agent attributes restarts to application crash instead of probe misconfiguration
- ❌ **FAIL**: Agent does not inspect probe configuration

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies NetworkPolicy blocking traffic to meter-service
- ✅ **PASS**: Agent recommends removing or modifying the blocking network policy
- ❌ **FAIL**: Agent does not check NetworkPolicies
- ❌ **FAIL**: Agent attributes connectivity failure to DNS or application issues

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies missing ConfigMap reference as root cause
- ✅ **PASS**: Agent recommends creating the missing ConfigMap or correcting the reference
- ❌ **FAIL**: Agent does not check volume mounts or ConfigMap references
- ❌ **FAIL**: Agent attributes ContainerCreateError to image or resource issues

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent traces the cascading failure: MongoDB down → dispatch-service health check failures → meter events queuing
- ✅ **PASS**: Agent identifies MongoDB (0 replicas) as the root cause, not dispatch-service
- ✅ **PASS**: Agent recommends scaling MongoDB back to 1+ replicas
- ❌ **FAIL**: Agent treats dispatch-service failure as the root cause without tracing to MongoDB
- ❌ **FAIL**: Agent does not identify the dependency chain across services

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

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent identifies the Service selector mismatch (`meter-service-v2` vs `meter-service`)
- ✅ **PASS**: Agent checks Service endpoints (empty) and compares selector to pod labels
- ✅ **PASS**: Agent recommends correcting the Service selector to match pod labels
- ❌ **FAIL**: Agent reports "all pods healthy" without checking Service endpoints
- ❌ **FAIL**: Agent does not analyze Service selector vs pod label alignment

**How to fix:**
```bash
kubectl apply -f k8s/base/application.yaml
```

---

### 11. Complete Application Failure Bundle — Cascading Outage + Service Isolation

**File:** `k8s/scenarios/complete-failure-bundle/scenario.yaml`

**What happens:**
- Applies an orchestrated bundle of existing scenarios:
  - `mongodb-down.yaml` (data layer outage)
  - `network-block.yaml` (meter-service traffic isolation)
  - `service-mismatch.yaml` (meter-service endpoints empty)
- Simulates broad application failure where dependencies and request paths fail at once
- Forces root-cause prioritization: fix foundational dependencies before downstream symptoms

**How to break:**
```bash
kubectl apply -f k8s/scenarios/complete-failure-bundle/scenario.yaml
```

**What to observe:**
```bash
# Dependency outage
kubectl get deployment mongodb -n energy

# Silent routing failure (selector mismatch)
kubectl get endpoints meter-service -n energy

# Traffic isolation
kubectl get networkpolicy deny-meter-service -n energy

# Overall blast radius snapshot
kubectl get pods,svc,endpoints -n energy
kubectl get events -n energy --sort-by=.lastTimestamp | tail -30
```

**Expected Kubernetes signals:**

| Signal | Command | Expected degraded evidence |
|--------|---------|----------------------------|
| Data layer unavailable | `kubectl get deployment mongodb -n energy` | MongoDB desired/ready replicas are `0/0` |
| Meter API Service unroutable | `kubectl get endpoints meter-service -n energy` | Endpoint list is empty (`<none>`) |
| Traffic isolation present | `kubectl get networkpolicy deny-meter-service -n energy` | Deny policy exists for `app=meter-service` |
| Blast radius visible | `kubectl get pods,svc,endpoints -n energy` | Dependencies, Services, and endpoints disagree |
| Recent change/event timeline | `kubectl get events -n energy --sort-by=.lastTimestamp | tail -30` | Recent scenario application and rollout events are visible |

**SRE Agent prompts:**
- "Why is the entire energy grid platform down?"
- "Separate root cause from downstream symptoms across the energy namespace"
- "Recommend the safest recovery order for this outage"
- "After each step, re-check health and tell me what to do next"

**Recovery pattern (safe language):**
1. Ask SRE Agent for prioritized recovery recommendations.
2. **Operator executes** first dependency recovery step (typically restore data layer).
3. **Operator validates** health signals after each step.
4. Continue until endpoints, connectivity, and pod health are restored.

**Suggested operator execution order:**
```bash
# 1) Restore dependency and Service specs first
kubectl apply -f k8s/base/application.yaml

# 2) Confirm data layer and routing specs recovered
kubectl get deployment mongodb -n energy
kubectl get endpoints meter-service -n energy

# 3) Remove the extra NetworkPolicy that baseline apply does not delete
kubectl delete networkpolicy deny-meter-service -n energy

# 4) Verify platform recovery
kubectl get pods -n energy
kubectl get networkpolicy -n energy
```

Expected recovery evidence: MongoDB returns to `READY 1/1`, `meter-service` endpoints are populated, `deny-meter-service` is absent, and application pods return to `Running` / `Ready`.

**Pass/Fail Criteria:**
- ✅ **PASS**: SRE Agent distinguishes upstream root cause(s) from downstream symptoms
- ✅ **PASS**: SRE Agent recommends staged recovery (dependencies first, then service path checks)
- ✅ **PASS**: Operator can restore healthy baseline cleanly with documented steps
- ❌ **FAIL**: Recommendations treat every symptom as an independent root cause
- ❌ **FAIL**: Recovery leaves `meter-service` endpoints empty or network policy still blocking

---

## Demo Flow Suggestions

### Quick Demo (5 minutes)

1. Apply MongoDBDown scenario — `kubectl apply -f k8s/scenarios/mongodb-down.yaml`
2. Show the cascade: MongoDB at 0 replicas → dispatch-service fails → meter events queue in RabbitMQ
3. Ask SRE Agent: "Smart meter data isn't being processed — what's wrong?"
4. Highlight: SRE Agent traces the dependency chain to MongoDB as root cause
5. Fix: `kubectl apply -f k8s/base/application.yaml`

### Comprehensive Demo (20 minutes)

See [DEMO-NARRATIVE.md](DEMO-NARRATIVE.md) for the canonical 20-minute story arc with scenario ordering, dramatic escalation, and Q&A prep. The recommended sequence is:

1. **OOMKilled** (Opener) → 2. **MongoDBDown** (Climax — cascading failure) → 3. **ServiceMismatch** (Trust anchor — catches what humans miss)

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
- ✅ If public LoadBalancer IPs stop responding, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#-public-loadbalancer-not-responding) before assuming a scenario broke it
- ✅ For Kubernetes service issues (endpoints empty, selectors wrong, port mismatches), see [KUBERNETES-SERVICE-TROUBLESHOOTING.md](KUBERNETES-SERVICE-TROUBLESHOOTING.md)
- ❌ Don't apply multiple breaking scenarios simultaneously (except the explicit `complete-failure-bundle` scenario)
- ❌ Don't leave scenarios running unattended
