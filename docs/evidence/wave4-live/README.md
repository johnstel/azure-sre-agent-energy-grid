# Wave 4 Live Evidence — Azure SRE Agent Reliability Capabilities

**Scope**: Azure SRE Agent Service demo capability only. Mission Control UI is intentionally out of scope.
**Status**: Documentation and manifest metadata complete; SRE Agent portal validation remains pending from Wave 2.
**Verdict recommendation**: `PASS_WITH_PENDING_HUMAN_PORTAL`.

## Delivered artifacts

| Artifact | Purpose |
|----------|---------|
| [`STATUS.md`](STATUS.md) | Gate-ready status and blockers |
| [`RUNBOOK-RECOMMENDATION-VS-EXECUTION.md`](RUNBOOK-RECOMMENDATION-VS-EXECUTION.md) | Defines Review-mode runbook boundary |
| [`DEPENDENCY-REASONING.md`](DEPENDENCY-REASONING.md) | MongoDBDown dependency-chain narrative |
| [`ALERT-NOISE-REDUCTION.md`](ALERT-NOISE-REDUCTION.md) | Symptom-vs-root-cause grouping narrative using existing alerts only |
| [`APP-TELEMETRY-COVERAGE.md`](APP-TELEMETRY-COVERAGE.md) | Honest app/dependency telemetry coverage and precise deltas |
| [`CHANGE-CORRELATION.md`](CHANGE-CORRELATION.md) | Kubernetes annotation and scenario metadata support |

## Runbooks created

- `docs/evidence/runbooks/RB-001-oom-killed.md`
- `docs/evidence/runbooks/RB-002-crash-loop.md`
- `docs/evidence/runbooks/RB-007-network-block.md`
- `docs/evidence/runbooks/RB-009-mongodb-down.md`
- `docs/evidence/runbooks/RB-010-service-mismatch.md`

## Evidence boundary

Wave 4 does **not** fabricate portal output, KQL results, alert firing, screenshots, or MTTR measurements. Where evidence is not present, the status is explicitly marked as pending or a documented gap.
