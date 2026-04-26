# RB-007: NetworkBlock — Meter Service Isolated by NetworkPolicy

| Field | Value |
|-------|-------|
| **Runbook ID** | `RB-007-network-block` |
| **Scenario** | `network-block` |
| **Severity** | `critical` |
| **Services** | `meter-service` |
| **Components** | `network`, `network-policy` |
| **Root cause category** | `networking` |
| **Namespace** | `energy` |
| **K8s manifest** | `k8s/scenarios/network-block.yaml` |
| **Fix command** | `kubectl delete networkpolicy deny-meter-service -n energy` |
| **Last verified** | 2026-04-26 |

## Symptoms

- `meter-service` pods may remain Running/Ready but traffic fails.
- A `NetworkPolicy` named `deny-meter-service` selects `app=meter-service`.
- The policy has empty `ingress` and `egress` rules, denying all traffic for selected pods.
- Baseline pod health alerts may not fire; any HTTP 5xx alert depends on app/request telemetry being present.

## Diagnosis Steps

1. Confirm the service and selected pods:
   ```bash
   kubectl get svc,endpoints,pods -n energy -l app=meter-service
   ```
2. Inspect NetworkPolicies in the namespace:
   ```bash
   kubectl get networkpolicy -n energy
   kubectl describe networkpolicy deny-meter-service -n energy
   ```
3. Validate the policy selector:
   ```bash
   kubectl get networkpolicy deny-meter-service -n energy -o yaml
   kubectl get pods -n energy -l app=meter-service --show-labels
   ```
4. Use `docs/evidence/kql/stable/pod-lifecycle.kql` only for pod-health context; KQL may not prove network-policy isolation.

## Remediation

1. In Review mode, ask Azure SRE Agent to check NetworkPolicies affecting `meter-service`.
2. Human operator verifies the recommended action targets only the scenario policy.
3. Remove the blocking policy:
   ```bash
   kubectl delete networkpolicy deny-meter-service -n energy
   ```
4. Verify meter-service endpoints and application calls recover.

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Open-ended | "Meter service is unreachable in the energy namespace. What changed?" |
| Direct | "Check for NetworkPolicies selecting app=meter-service and explain their effect." |
| Remediation | "Recommend the narrowest safe fix for meter-service network isolation." |

## Evidence

- Scenario manifest: `docs/evidence/scenarios/scenario-manifest.yaml`
- Scenario K8s manifest: `k8s/scenarios/network-block.yaml`
- Pod lifecycle KQL: `docs/evidence/kql/stable/pod-lifecycle.kql`
- Wave 4 change-correlation evidence: `docs/evidence/wave4-live/CHANGE-CORRELATION.md`

## Execution Boundary

Deleting the NetworkPolicy is a human action. The demo may claim the runbook describes the safe action, but must not claim SRE Agent executed it unless portal/audit evidence exists.
