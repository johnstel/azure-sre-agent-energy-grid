# RB-001: OOMKilled — Meter Service Memory Exhaustion

| Field | Value |
|-------|-------|
| **Runbook ID** | `RB-001-oom-killed` |
| **Scenario** | `oom-killed` |
| **Severity** | `critical` |
| **Services** | `meter-service` |
| **Components** | `api` |
| **Root cause category** | `resource-exhaustion` |
| **Namespace** | `energy` |
| **K8s manifest** | `k8s/scenarios/oom-killed.yaml` |
| **Fix command** | `kubectl apply -f k8s/base/application.yaml` |
| **Last verified** | 2026-04-26 |

## Symptoms

- `meter-service` pods repeatedly restart.
- Kubernetes events or Container Insights show `OOMKilled` or memory-limit termination.
- `ContainerRestartCount` increases for pods matching `app=meter-service`.
- Baseline alert that may correlate: `alert-*-crashloop-oom`; broad symptom alert: `alert-*-pod-restarts`.

## Diagnosis Steps

1. Confirm pod state and restart count:
   ```bash
   kubectl get pods -n energy -l app=meter-service
   ```
2. Inspect the latest termination reason and memory limits:
   ```bash
   kubectl describe pod -n energy -l app=meter-service
   kubectl get deploy meter-service -n energy -o yaml
   ```
3. Run stable KQL if workspace access is available:
   - `docs/evidence/kql/stable/scenario-oom-killed.kql`
   - `docs/evidence/kql/stable/pod-lifecycle.kql`
4. Check alert firing history with `scripts/get-alert-firing-history.ps1`; do not use Activity Log rule-change history as firing proof.

## Remediation

1. In Review mode, ask Azure SRE Agent for diagnosis and remediation recommendation.
2. Human operator verifies the recommendation names memory pressure/OOMKilled and low limits.
3. Restore the healthy baseline:
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
4. Verify `meter-service` pods return to Running/Ready and restart count stops increasing.

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Open-ended | "Why is the meter-service pod restarting repeatedly in the energy namespace?" |
| Direct | "I see OOMKilled events for meter-service. What resource setting is causing it?" |
| Remediation | "Recommend the safest recovery action for the meter-service memory exhaustion scenario." |

## Evidence

- Scenario manifest: `docs/evidence/scenarios/scenario-manifest.yaml`
- Scenario KQL: `docs/evidence/kql/stable/scenario-oom-killed.kql`
- Pod lifecycle KQL: `docs/evidence/kql/stable/pod-lifecycle.kql`
- Wave 2 status: `docs/evidence/wave2-live/WAVE2-FINAL-VERDICT.md`
- Wave 4 status: `docs/evidence/wave4-live/STATUS.md`

## Execution Boundary

Azure SRE Agent recommendation is in scope. Human execution and portal screenshot validation remain required before claiming end-to-end SRE Agent remediation performance.
