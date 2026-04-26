# Toil Comparison — Manual Steps vs Intended SRE Agent-Assisted Workflow

**Scope**: Azure SRE Agent Service capabilities only
**Status**: Manual toil documented; portal-assisted workflow remains pending validation
**Safe-language requirement**: Use "intended" or "scenario is designed to test whether SRE Agent..." until portal evidence exists.

---

## Summary

The current evidence package proves that operators can reproduce, diagnose, and restore the selected scenarios through manual CLI-driven steps. Wave 5 documents the toil that exists today and the intended SRE Agent-assisted path that should be validated through the portal.

This is a **workflow comparison**, not a measured productivity claim. No time-saved number is claimed because human/SRE Agent portal measurements have not been captured.

---

## Manual evidence workflow today

| Scenario | Manual detection and diagnosis steps shown by evidence | Manual restore path | Current toil characteristics |
|----------|--------------------------------------------------------|---------------------|------------------------------|
| OOMKilled | Inspect pods, events, pod descriptions, memory limits, previous logs, KQL pod lifecycle/OOM signals | Re-apply baseline application manifest | Multiple kubectl/KQL checks needed to confirm OOMKilled and low memory limit |
| MongoDBDown | Inspect dependent pod states, inspect MongoDB deployment YAML, verify `replicas: 0`, correlate dispatch symptoms to database root cause | Re-apply baseline application manifest or scale MongoDB back up | Requires dependency reasoning across service symptoms and database deployment state |
| ServiceMismatch | Inspect Service selector, endpoints, EndpointSlice, pod labels, events, pod health | Patch selector back or re-apply baseline application manifest | Requires checking configuration objects despite pods being Running/Ready |

---

## Intended SRE Agent-assisted workflow

| Scenario | Intended user prompt/workflow | Scenario is designed to test whether SRE Agent can... | Portal status |
|----------|-------------------------------|--------------------------------------------------------|---------------|
| OOMKilled | Ask why `meter-service` pods are restarting or crashing | Detect OOMKilled, identify the 16Mi memory limit as too low, recommend increasing memory limits | `PENDING_HUMAN_PORTAL` |
| MongoDBDown | Ask why dispatch-service cannot process meter readings or what happened to MongoDB | Trace dependency chain to MongoDB, identify `replicas: 0`, recommend scaling MongoDB back up | `PENDING_HUMAN_PORTAL` |
| ServiceMismatch | Ask why the dashboard loads but meter readings fail or why Service has zero endpoints | Distinguish healthy pods from unreachable service, identify selector/label mismatch, recommend correcting the selector | `PENDING_HUMAN_PORTAL` |

---

## Toil reduction hypothesis

The intended enterprise value proposition is:

1. **Reduce command-hunting toil** by replacing scattered kubectl/KQL inspection with a guided diagnosis response.
2. **Reduce dependency-tracing toil** by correlating symptoms across deployments, services, endpoints, and dependency metadata.
3. **Reduce runbook lookup toil** by linking the diagnosed root cause to stable runbook IDs.
4. **Reduce alert triage toil** by explaining when alerts did not fire and why the scenario still matters.

This remains a **hypothesis pending portal validation**. The package does not claim:

- minutes saved,
- percentage MTTR reduction,
- autonomous remediation,
- alert-to-resolution automation,
- successful SRE Agent portal diagnosis.

---

## Demo-safe statements

Use:

> "The manual workflow currently requires several kubectl/KQL checks. These scenarios are designed to test whether SRE Agent can consolidate diagnosis and runbook guidance in the portal."

Use:

> "Wave 5 documents the toil comparison and measurement model. Portal validation is still required before claiming measured toil reduction."

Avoid:

> "SRE Agent reduced toil by X%."

Avoid:

> "SRE Agent diagnosed all three scenarios."

Avoid:

> "SRE Agent automatically remediated the outage."
