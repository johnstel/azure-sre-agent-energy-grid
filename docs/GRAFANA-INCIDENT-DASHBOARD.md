# Azure Managed Grafana — Incident Dashboard Guide

> **Audience**: Demo operators, SRE presenters, QA reviewers
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2026-01-01`, Stable channel)
> **Pre-read**: [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) · [ANALYST-SAFE-LANGUAGE.md](ANALYST-SAFE-LANGUAGE.md)

---

## Purpose

The Azure Managed Grafana incident dashboard visualises infrastructure-level signals from the Energy Grid demo — Prometheus metrics, Container Insights pod state, and AKS node health. It is a **read-only observability surface**; it does not diagnose, remediate, or invoke Azure SRE Agent.

---

## What the Dashboard Shows

| Panel | Data Source | Signal |
|-------|-----------|--------|
| Pod Status Heatmap | Prometheus (kube_pod_status_phase) | Running / Pending / Failed pod counts per workload |
| Container Restart Rate | Prometheus (kube_pod_container_status_restarts_total) | Restart velocity over sliding 5 m window |
| CPU & Memory Utilisation | Prometheus (container_cpu_usage_seconds_total, container_memory_working_set_bytes) | Per-pod resource consumption vs. requests/limits |
| Node Readiness | Prometheus (kube_node_status_condition) | Node Ready/NotReady state across the cluster |
| OOMKilled Events | Prometheus (kube_pod_container_status_last_terminated_reason) | Containers terminated with reason `OOMKilled` |

All data is scoped to the `energy` namespace unless noted otherwise.

---

## What the Dashboard Does **Not** Show

- Application-level telemetry (no App Insights custom metrics from demo services).
- Azure SRE Agent conversation state, diagnosis output, or remediation proposals.
- Alert-to-agent trigger status. No alert→agent automation is configured in this demo.
- SLO burn-rate or error-budget panels (SLO measurement infrastructure is a future wave).

> **Safe-language note**: Do not describe the dashboard as an "incident management system" or claim it "detects incidents." It surfaces metrics that an operator interprets. Detection requires the operator to observe the data and initiate investigation — manually or via Azure SRE Agent.

---

## Accessing the Dashboard

1. Retrieve the Grafana endpoint after deployment:

   ```bash
   az grafana show -n <grafana-name> -g <resource-group> --query properties.endpoint -o tsv
   ```

   Or from deploy output: the `grafanaDashboardUrl` value.

2. Authenticate with your Entra ID credentials (Grafana Viewer role minimum).
3. Navigate to **Dashboards → Energy Grid — Incident Overview**.

> If the dashboard has not been provisioned yet (no JSON definition committed to this repo), the Managed Grafana instance deploys with the Azure Monitor Workspace data source pre-connected. Build or import the dashboard manually using the panel definitions in [§ What the Dashboard Shows](#what-the-dashboard-shows).

---

## Using the Dashboard During a Demo

### Before a scenario

- Confirm all panels show a healthy baseline (pods Running, zero restarts, CPU/memory within requests).
- Optionally capture a screenshot → `docs/evidence/screenshots/{scenario}_grafana-before.png`.

### After applying a breakable scenario

- Observe signal changes: restart spikes, OOMKilled markers, Pending pods.
- **Narrate what the dashboard shows, not what it diagnoses.**

  ✅ "The restart-rate panel shows meter-service restarts climbing after we applied the OOM scenario."
  ❌ "The dashboard detected an OOM incident."

### Handing off to Azure SRE Agent

- After observing dashboard signals, transition to SRE Agent with:

  > "The Grafana dashboard shows elevated restart rates. Let's ask Azure SRE Agent to investigate the root cause."

- Do **not** say the dashboard "triggered" or "invoked" SRE Agent. The operator initiates the conversation.

---

## Evidence Capture Convention

| Artifact | Path | Capture rule |
|----------|------|--------------|
| Healthy baseline | `docs/evidence/screenshots/{scenario}_grafana-before.png` | Real screenshot, redacted per [ANALYST-SAFE-LANGUAGE.md](ANALYST-SAFE-LANGUAGE.md) §Redaction |
| Failure state | `docs/evidence/screenshots/{scenario}_grafana-failure.png` | Capture after scenario is applied and metrics propagate (~60 s) |
| Post-fix | `docs/evidence/screenshots/{scenario}_grafana-after.png` | Capture after `kubectl apply -f k8s/base/application.yaml` and metrics settle |

Do not create placeholder images. If live Grafana is unavailable, document the gap in the scenario's `BLOCKER-NOTE.md`.

---

## Safe-Language Compliance Checklist

Use this checklist before referencing the incident dashboard in any customer-facing material.

- [ ] Dashboard is described as an **observability surface**, not a detection or diagnosis tool.
- [ ] No claim that the dashboard invokes, triggers, or communicates with Azure SRE Agent.
- [ ] No MTTR percentage claims derived from dashboard data.
- [ ] No SLO or error-budget claims unless measurement infrastructure is deployed and verified.
- [ ] GA + API-pin disclosure appears if the material also references SRE Agent.
- [ ] Screenshots are real captures, redacted, and not placeholders.
- [ ] Language is consistent with [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) and [ANALYST-SAFE-LANGUAGE.md](ANALYST-SAFE-LANGUAGE.md).

---

## Infrastructure Reference

The Managed Grafana workspace is deployed by `infra/bicep/modules/observability.bicep`:

- **Resource**: `Microsoft.Dashboard/grafana@2023-09-01`, Standard SKU, SystemAssigned identity.
- **Data source**: Azure Monitor Workspace (Prometheus) auto-integrated via `grafanaIntegrations`.
- **RBAC**: Grafana's managed identity receives Monitoring Reader on the subscription.
- **Toggle**: Set `deployObservability = true` in `infra/bicep/main.bicepparam` (default).

---

## Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-08-11 | 0.1 | Initial incident dashboard guide | Copilot draft for review |
