# RB-002: CrashLoop — Asset Service Configuration Failure

| Field | Value |
|-------|-------|
| **Runbook ID** | `RB-002-crash-loop` |
| **Scenario** | `crash-loop` |
| **Severity** | `critical` |
| **Services** | `asset-service` |
| **Components** | `api` |
| **Root cause category** | `configuration` |
| **Namespace** | `energy` |
| **K8s manifest** | `k8s/scenarios/crash-loop.yaml` |
| **Fix command** | `kubectl apply -f k8s/base/application.yaml` |
| **Last verified** | 2026-04-26 |

## Symptoms

- `asset-service` pods enter `CrashLoopBackOff`.
- Container exits with code `1` after startup.
- Logs show the scenario command exiting after invalid grid configuration.
- Baseline alert that may correlate: `alert-*-crashloop-oom`; broad symptom alert: `alert-*-pod-restarts`.

## Diagnosis Steps

1. Confirm pod state:
   ```bash
   kubectl get pods -n energy -l app=asset-service
   ```
2. Inspect exit reason and recent events:
   ```bash
   kubectl describe pod -n energy -l app=asset-service
   kubectl logs -n energy -l app=asset-service --tail=50
   ```
3. Compare the deployment environment and command to the healthy baseline:
   ```bash
   kubectl get deploy asset-service -n energy -o yaml
   ```
4. Run `docs/evidence/kql/stable/pod-lifecycle.kql` for restart and lifecycle evidence if workspace access is available.

## Remediation

1. In Review mode, ask Azure SRE Agent to explain the CrashLoopBackOff and identify the failing command/configuration.
2. Human operator verifies the recommendation points to the scenario deployment, not infrastructure capacity.
3. Restore the healthy baseline:
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
4. Verify `asset-service` pods are Running/Ready and no new `BackOff` events appear.

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Open-ended | "Why is asset-service in CrashLoopBackOff in the energy namespace?" |
| Direct | "Show me the logs and exit reason for the crashing asset-service pods." |
| Remediation | "Recommend the recovery action for asset-service startup failure." |

## Evidence

- Scenario manifest: `docs/evidence/scenarios/scenario-manifest.yaml`
- Pod lifecycle KQL: `docs/evidence/kql/stable/pod-lifecycle.kql`
- Alert mapping: `docs/evidence/ALERT-KQL-MAPPING.md`
- Wave 4 status: `docs/evidence/wave4-live/STATUS.md`

## Execution Boundary

This runbook supports recommendation and operator-confirmed recovery. It does not claim autonomous remediation or portal diagnosis until live portal evidence is captured.
