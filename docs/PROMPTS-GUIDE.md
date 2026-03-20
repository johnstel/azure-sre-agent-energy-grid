# SRE Agent Prompts Guide

A curated collection of prompts to use with Azure SRE Agent when demoing the Energy Grid SRE Lab. Organized by scenario and intent.

## Getting Started (Healthy Cluster)

Start here when the cluster is healthy to show SRE Agent's baseline capabilities:

| Prompt | What It Shows |
|--------|---------------|
| "Show me the health status of my AKS cluster" | Cluster overview, node status, system pods |
| "Are there any issues in the energy namespace?" | Baseline health check, confirms everything is green |
| "What workloads are running on the energy grid platform?" | Inventory of deployments, replica counts |
| "Show me resource utilization across my energy grid pods" | CPU/memory usage, identifies headroom |
| "What changes were made to my cluster recently?" | Audit trail / event history |

---

## Per-Scenario Diagnosis Prompts

### OOMKilled (`break-oom`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "Something seems wrong with the meter-service. Can you take a look?" |
| **Direct** | "Why is the meter-service pod restarting repeatedly?" |
| **Specific** | "I see OOMKilled events in the energy namespace. What's going on?" |
| **Remediation** | "What memory limits should I set for meter-service to handle peak smart meter data?" |
| **Action** | "Can you increase the memory limit for meter-service to 256Mi?" |

### CrashLoopBackOff (`break-crash`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "The energy asset catalog isn't loading. What's wrong?" |
| **Direct** | "Why is asset-service in CrashLoopBackOff?" |
| **Specific** | "Show me the logs for the crashing asset-service pods" |
| **Remediation** | "What's causing exit code 1 in asset-service?" |
| **Action** | "Restart the asset-service deployment" |

### ImagePullBackOff (`break-image`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "The dispatch service pods won't start. Help?" |
| **Direct** | "Why is dispatch-service stuck in ImagePullBackOff?" |
| **Specific** | "Is there an issue with the container image for dispatch-service?" |
| **Remediation** | "What image should dispatch-service be using?" |

### High CPU (`break-cpu`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "Grid services feel slow. What's going on?" |
| **Direct** | "Which pods are consuming the most CPU in the energy namespace?" |
| **Specific** | "Analyze CPU usage across all energy grid pods and identify contention" |
| **Remediation** | "What should I do about the frequency-calc-overload workload?" |
| **Action** | "Delete the frequency-calc-overload deployment" |

### Pending Pods (`break-pending`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "I deployed a new substation monitoring workload but it's not starting" |
| **Direct** | "Why are the substation-monitor pods stuck in Pending?" |
| **Specific** | "Analyze cluster capacity vs. what the substation monitor is requesting" |
| **Remediation** | "Should I scale the node pool or reduce resource requests for the monitor?" |

### Probe Failure (`break-probe`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "Grid health monitor pods keep restarting but the app looks fine" |
| **Direct** | "Diagnose the health check failures in the energy namespace" |
| **Specific** | "What's wrong with the liveness probe on grid-health-monitor?" |
| **Remediation** | "How should I fix the probe configuration?" |

### Network Policy Block (`break-network`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "Meter readings aren't being processed anymore. What happened?" |
| **Direct** | "Why can't the grid dashboard reach meter-service?" |
| **Specific** | "Are there any network policies blocking traffic in the energy namespace?" |
| **Remediation** | "How do I fix the network connectivity to meter-service?" |
| **Action** | "Delete the deny-meter-service network policy" |

### Missing ConfigMap (`break-config`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "A grid zone configuration pod won't start — says something about missing config?" |
| **Direct** | "What configuration is missing for grid-zone-config?" |
| **Specific** | "Check for ConfigMap or Secret reference errors in the energy namespace" |

### MongoDB Down (`break-mongodb`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "Meter readings are accepted but never dispatched. What's wrong?" |
| **Direct** | "Why is dispatch-service failing health checks?" |
| **Follow-up** | "Is MongoDB running? What depends on it?" |
| **Root cause** | "Trace the dependency chain — what broke first?" |
| **Action** | "Scale the mongodb deployment back to 1 replica" |

### Service Selector Mismatch (`break-service`)

| Stage | Prompt |
|-------|--------|
| **Open-ended** | "The grid dashboard loads but submitting meter readings fails. Everything looks healthy." |
| **Direct** | "Why does meter-service have no endpoints?" |
| **Specific** | "Compare the meter-service Service selector to the actual pod labels" |
| **Remediation** | "Fix the selector on the meter-service Service to match the pods" |

---

## Proactive & Exploratory Prompts

Use these to demo SRE Agent's ability to investigate and report without a specific incident:

| Prompt | Demonstrates |
|--------|-------------|
| "Give me a health report for the energy namespace" | Comprehensive status review |
| "Are there any pods that have restarted in the last hour?" | Proactive monitoring |
| "What's the resource utilization trend for the energy grid cluster?" | Capacity planning |
| "Check if any containers are running without resource limits" | Best practice enforcement |
| "Are there any deprecated API versions in the energy grid workloads?" | Upgrade readiness |
| "Show me error trends from the last 24 hours" | Log analysis / App Insights |
| "What are the most common exceptions in Application Insights?" | Observability integration |

---

## Remediation Prompts

Show that SRE Agent can take action, not just report:

| Prompt | Action |
|--------|--------|
| "Restart the meter-service pods" | Rolling restart |
| "Scale the asset-service to 3 replicas" | Scaling |
| "Delete the frequency-calc-overload deployment" | Resource cleanup |
| "Remove the deny-meter-service network policy" | Policy management |
| "Scale MongoDB back to 1 replica" | Dependency restoration |

> **Note**: Remediation requires the SRE Agent to have write permissions (Contributor + AKS Cluster Admin). See [SRE-AGENT-SETUP.md](SRE-AGENT-SETUP.md) for RBAC configuration.

---

## Scheduled Tasks & Subagents

Demo proactive SRE automation:

| Prompt | What It Sets Up |
|--------|----------------|
| "Check the health of my AKS cluster every hour and alert if anything is unhealthy" | Recurring health check |
| "Monitor pod restarts in the energy namespace and notify me if any pod restarts more than 3 times" | Threshold-based alerting |
| "Run a daily capacity analysis and report if any node is above 80% utilization" | Capacity monitoring |

To set these up in the portal:
1. Go to **Subagent builder** in your SRE Agent resource
2. Click **Create scheduled task**
3. Enter the prompt and set the schedule (e.g., cron: `0 * * * *` for hourly)

---

## "What Changed?" Correlation

After applying a break scenario, instead of asking "what's wrong," try asking about changes:

| Prompt | Why It's Interesting |
|--------|---------------------|
| "What changed in my cluster in the last 10 minutes?" | Shows audit/event correlation |
| "Were any deployments modified recently?" | Traces the break to a specific change |
| "Show me the diff between the current and previous deployment of meter-service" | Rollback context |

---

## Tips for Effective Prompts

1. **Start vague, get specific** — Open with "something seems wrong with the grid" and let SRE Agent discover the issue, then drill down with follow-up questions
2. **Ask for root cause** — "Why?" is more powerful than "show me the status"
3. **Request action** — Don't just diagnose; ask SRE Agent to fix it
4. **Use follow-ups** — SRE Agent maintains context within a conversation, so build on previous answers
5. **Try the "naive user" approach** — Phrase prompts like someone who doesn't know Kubernetes: "consumer billing is broken" is a great starting point
6. **Combine observability** — Ask about logs, metrics, and events together: "Correlate the pod restarts with any CPU or memory spikes"
