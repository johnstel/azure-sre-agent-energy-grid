# Azure Managed Grafana — Incident Dashboard Guide

> **Audience**: Demo operators, SRE presenters, QA reviewers
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2026-01-01`, Stable channel)
> **Pre-read**: [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) · [ANALYST-SAFE-LANGUAGE.md](ANALYST-SAFE-LANGUAGE.md)

---

## Purpose

The Azure Managed Grafana incident dashboard visualises infrastructure- and application-level signals from the Energy Grid demo — Prometheus metrics, Container Insights pod state, AKS node health, and Azure Monitor / Log Analytics telemetry for AppRequests and AppDependencies using the repo-owned `sre.namespace`, `sre.service`, and `sre.scenario` dimensions. It is a **read-only observability surface**; it does not diagnose, remediate, or invoke Azure SRE Agent.

---

## Variables and Filter Semantics

- The `environment` variable is intentionally non-interactive context. It is retained for handoff and documentation, but it does not drive a verified telemetry dimension in the emitted AppRequests/AppDependencies data.
- The `namespace` variable filters every panel that accepts a namespace scope.
- The `service` variable is a single-select filter. It uses the repo-owned service names (for example `meter-service`, `asset-service`, `dispatch-service`). Prometheus queries use regex prefix matching (`pod=~"^($service)(-|$)"`) and KQL queries use `startswith`, so selection still works even when workload pods have hashed suffixes.
- The `scenario` variable filters the app-telemetry panels by the repo-owned `sre.scenario` dimension. It is limited to the breakable scenarios that are intentionally represented in this lab.

---

## What the Dashboard Shows

| Panel | Data Source | Signal |
|-------|-----------|--------|
| Namespace health | Prometheus (kube_pod_status_phase) | Running / Pending / Failed pod counts per workload |
| Readiness / restarts | Prometheus (kube_pod_container_status_restarts_total) | Restart velocity over the selected namespace/service scope |
| CPU & Memory Utilisation | Prometheus (container_cpu_usage_seconds_total, container_memory_working_set_bytes) | Per-pod resource consumption vs. requests/limits |
| Requests and errors | Azure Monitor / Log Analytics (AppRequests) | Request volume and 5xx error trends filtered by the selected namespace, service, and scenario |
| Dependency failures | Azure Monitor / Log Analytics (AppDependencies) | Dependency failure counts by dependency type and service |
| Scenario timeline and annotations | Azure Monitor / Log Analytics (AppRequests) | Error trend over time and scenario-aware context for the selected scope, with manual timeline annotations surfaced as **Annotations & Alerts** |

All data is scoped to the `energy` namespace unless noted otherwise.

The built-in Grafana annotation group is labeled **Annotations & Alerts**. It is used for operator timeline markers and evidence notes on the dashboard rather than for automated detection; if a future version of the dashboard needs to represent explicit fault-injection events, that label should be reconsidered and documented separately.

---

## What the Dashboard Does **Not** Show

- Application-level telemetry is only shown when the deployment emits AppRequests and AppDependencies with the repo-owned `sre.*` dimensions; otherwise the relevant panels remain empty rather than implying healthy zeros.
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

> The dashboard is now provisioned during deployment by `scripts/provision-grafana-dashboard.ps1`, which imports `infra/grafana/energy-grid-incident-dashboard.json` into the Managed Grafana workspace with overwrite semantics and fails the deployment if the import or verification step fails. If a live deployment is unavailable, the dashboard definition in this repo remains the source of truth for the intended layout and variables.

---

## Using the Dashboard During a Demo

### Before a scenario

- Confirm the baseline shows healthy pod lifecycle signals and that the request/dependency panels either return data or remain explicitly empty when telemetry is unavailable.
- Optionally capture a screenshot → `docs/evidence/screenshots/{scenario}_grafana-before.png`.

### After applying a breakable scenario

- Observe signal changes: restart spikes, OOMKilled markers, Pending pods, and any request/dependency failures that appear for the selected namespace/service/scenario.
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
- **Data sources**: Azure Monitor Workspace (Prometheus) for kube-state/container metrics and a provisioned Azure Monitor datasource for `AppRequests` / `AppDependencies` queries, bound to the deployment's subscription, resource group, and Log Analytics workspace at import time.
- **RBAC**: Grafana's managed identity receives Monitoring Reader on the subscription.
- **Toggle**: Set `deployObservability = true` in `infra/bicep/main.bicepparam` (default).

---

## Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-08-11 | 0.2 | Updated guide for Azure Monitor-backed telemetry, no-data semantics, and non-interactive context variables | Copilot draft for review |
