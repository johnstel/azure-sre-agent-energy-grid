# Runbooks

Structured runbooks following the `RB-{NNN}-{slug}.md` ID format and template defined in `docs/CAPABILITY-CONTRACTS.md` §5.

## Wave 4 runbooks

| Runbook | Scenario | Root cause category | Recommendation mode |
|---------|----------|---------------------|---------------------|
| [`RB-001-oom-killed.md`](RB-001-oom-killed.md) | `oom-killed` | `resource-exhaustion` | SRE Agent recommends; human applies `k8s/base/application.yaml` |
| [`RB-002-crash-loop.md`](RB-002-crash-loop.md) | `crash-loop` | `configuration` | SRE Agent recommends; human applies `k8s/base/application.yaml` |
| [`RB-007-network-block.md`](RB-007-network-block.md) | `network-block` | `networking` | SRE Agent recommends; human deletes the blocking NetworkPolicy |
| [`RB-009-mongodb-down.md`](RB-009-mongodb-down.md) | `mongodb-down` | `dependency` | SRE Agent recommends; human applies `k8s/base/application.yaml` |
| [`RB-010-service-mismatch.md`](RB-010-service-mismatch.md) | `service-mismatch` | `configuration` | SRE Agent recommends; human applies `k8s/base/application.yaml` |

## Issue #37 runbook — Complete Failure Bundle

| Runbook | Scenario | Root cause category | Recommendation mode |
|---------|----------|---------------------|---------------------|
| [`RB-011-complete-failure-bundle.md`](RB-011-complete-failure-bundle.md) | `complete-failure-bundle` | `dependency` + `networking` + `configuration` (composite) | SRE Agent recommends; human deletes NetworkPolicy then applies `k8s/base/application.yaml` |

RB-011 covers the composite bundle scenario (`k8s/scenarios/complete-failure-bundle/scenario.yaml`). It is intentionally outside the locked Wave 0 scenario registry (10-scenario schema) and is tracked separately via issue #37.

These runbooks are intentionally explicit about the boundary between **recommendation** and **execution**. The customer demo scope is Azure SRE Agent Service capability in Review mode; portal output and human approval evidence remain separate artifacts under the live wave folders.
