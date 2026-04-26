# Wave 4 Status

**Date**: 2026-04-26
**Scope owner**: SRE Wave 4
**Customer scope**: Azure SRE Agent Service capabilities only
**Mission Control**: Not modified
**Wave 3 security/RBAC docs**: Not modified

## Verdict recommendation

🟡 **PASS_WITH_PENDING_HUMAN_PORTAL**

Wave 4 reliability documentation, runbooks, and change-correlation metadata are ready for gate review. The remaining blocker is the same final blocker inherited from Wave 2: human SRE Agent portal validation must be captured before customer-facing claims that the agent diagnosed MongoDBDown or ServiceMismatch.

## Deliverable status

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| OOMKilled runbook | ✅ Complete | `docs/evidence/runbooks/RB-001-oom-killed.md` |
| CrashLoop runbook | ✅ Complete | `docs/evidence/runbooks/RB-002-crash-loop.md` |
| MongoDBDown runbook | ✅ Complete | `docs/evidence/runbooks/RB-009-mongodb-down.md` |
| NetworkBlock runbook | ✅ Complete | `docs/evidence/runbooks/RB-007-network-block.md` |
| ServiceMismatch runbook | ✅ Complete | `docs/evidence/runbooks/RB-010-service-mismatch.md` |
| Runbook recommendation vs execution | ✅ Complete | `RUNBOOK-RECOMMENDATION-VS-EXECUTION.md` |
| MongoDBDown dependency reasoning | ✅ Complete | `DEPENDENCY-REASONING.md` |
| Alert noise reduction/grouping | ✅ Complete | `ALERT-NOISE-REDUCTION.md` |
| App/dependency telemetry narrative | ✅ Complete with limitations | `APP-TELEMETRY-COVERAGE.md` |
| Change correlation metadata | ✅ Complete | `CHANGE-CORRELATION.md`; annotations added to five scenario manifests |

## Customer-safe claims

- The repo now has structured runbooks for five reliability scenarios using stable runbook IDs and capability-contract fields.
- MongoDBDown has a documented dependency reasoning path from `dispatch-service` to `mongodb`.
- Existing baseline alerts are broad symptom signals, not a complete root-cause alert catalog.
- ServiceMismatch and NetworkBlock intentionally demonstrate gaps where pod-health alerts can remain quiet.
- App/dependency telemetry is not fully proven for the workload containers because the application services are external sample images and no service source tree exists in this repo.

## Claims to avoid until portal validation

- Do not claim SRE Agent portal diagnosed MongoDBDown, ServiceMismatch, or any Wave 4 scenario.
- Do not claim SRE Agent executed remediations.
- Do not claim alert firing unless `scripts/get-alert-firing-history.ps1` or equivalent alert-management evidence shows it.
- Do not claim App Insights dependency maps are complete for the workload.
- Do not claim MTTR reduction or measured human diagnosis time.

## Remaining blockers before customer demo

1. **Human portal validation**: Capture SRE Agent portal diagnosis evidence for MongoDBDown and ServiceMismatch; Wave 2 already identified this as critical.
2. **Optional alert soak**: Re-run MongoDBDown with a 5+ minute soak if alert firing proof is needed; otherwise retain the honest `NO_ALERT_FIRED` limitation.
3. **Optional KQL execution**: Run prepared KQL in the live workspace if the customer needs log-query evidence beyond kubectl proof.
