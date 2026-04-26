# Runbook Recommendation vs Execution

## Operating model

The Wave 4 runbooks support Azure SRE Agent **recommendation** workflows. The runbooks are written so the agent can reason over symptoms, identify likely root cause, and propose a recovery action. Human operators remain responsible for approving and applying changes.

## Recommendation evidence

| Scenario | Runbook | Expected recommendation |
|----------|---------|-------------------------|
| `oom-killed` | `RB-001-oom-killed` | Identify low memory limit/OOMKilled; restore healthy baseline or increase memory |
| `crash-loop` | `RB-002-crash-loop` | Identify startup command/config failure; restore healthy baseline |
| `network-block` | `RB-007-network-block` | Identify `deny-meter-service` NetworkPolicy; delete or narrow the policy |
| `mongodb-down` | `RB-009-mongodb-down` | Identify MongoDB scaled to 0; restore MongoDB via baseline |
| `service-mismatch` | `RB-010-service-mismatch` | Identify selector/label mismatch; restore baseline Service selector |

## Execution evidence

Execution must be proven separately with kubectl output, Azure activity evidence, or portal/audit screenshots. Current Wave 4 work does not add execution evidence beyond existing Wave 2 kubectl packages.

## Safe demo language

Use:

> "Azure SRE Agent is expected to recommend the runbook action; the human operator validates and executes it."

Do not use:

> "Azure SRE Agent remediated the issue automatically."

## Evidence requirements for final PASS

- Portal screenshot or exported conversation showing the SRE Agent recommendation.
- Operator action timestamp (`T4`) and recovery timestamp (`T5`) if claiming end-to-end recovery.
- Alert firing evidence from alert-management history or an explicit `NO_ALERT_FIRED` artifact.
