# RB-010: ServiceMismatch — Meter Service Routing Failure

| Field | Value |
|-------|-------|
| **Runbook ID** | `RB-010-service-mismatch` |
| **Scenario** | `service-mismatch` |
| **Severity** | `critical` |
| **Services** | `meter-service` |
| **Components** | `network`, `service` |
| **Root cause category** | `configuration` |
| **Namespace** | `energy` |
| **K8s manifest** | `k8s/scenarios/service-mismatch.yaml` |
| **Fix command** | `kubectl apply -f k8s/base/application.yaml` |
| **Last verified** | 2026-04-26 |

## Symptoms

- `meter-service` pods are Running/Ready.
- `meter-service` Service has zero endpoints.
- Service selector is `app=meter-service-v2` while pods are labeled `app=meter-service`.
- Traditional pod-health alerts do not fire; Wave 2 explicitly documented `NO_ALERT_FIRED` for this silent configuration failure.

## Diagnosis Steps

1. Compare Service selector with pod labels:
   ```bash
   kubectl get svc meter-service -n energy -o yaml
   kubectl get pods -n energy -l app=meter-service --show-labels
   ```
2. Confirm endpoint emptiness:
   ```bash
   kubectl get endpoints meter-service -n energy
   kubectl describe svc meter-service -n energy
   ```
3. Run stable KQL for supporting context if workspace access is available:
   - `docs/evidence/kql/stable/scenario-service-mismatch.kql`
4. Do not expect pod restart or crash alerts; lack of alert firing is part of the detection-gap evidence.

## Remediation

1. In Review mode, ask Azure SRE Agent to diagnose pods Running but service unreachable.
2. Human operator verifies the recommendation identifies selector/label mismatch.
3. Restore the healthy baseline:
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
4. Verify endpoints are populated and meter-service traffic recovers.

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Open-ended | "All pods are Running but meter-service is unreachable. Diagnose the issue." |
| Direct | "Check whether the meter-service Service selector matches pod labels." |
| Remediation | "Recommend the safest fix for meter-service zero endpoints after a selector change." |

## Evidence

- Scenario manifest: `docs/evidence/scenarios/scenario-manifest.yaml`
- Scenario KQL: `docs/evidence/kql/stable/scenario-service-mismatch.kql`
- Wave 2 evidence: `docs/evidence/wave2-live/service-mismatch/EVIDENCE-STATUS-FINAL.md`
- Wave 4 alert noise narrative: `docs/evidence/wave4-live/ALERT-NOISE-REDUCTION.md`

## Execution Boundary

This runbook supports diagnosis and manual restore. It does not claim portal diagnosis until the pending human SRE Agent portal evidence is captured.
