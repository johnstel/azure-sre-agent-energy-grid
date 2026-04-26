# Lambert — Wave 2 Preparation Summary

**Date**: 2026-04-26T05:30:00Z
**Validator**: Lambert (QA/Docs)
**Status**: ✅ WAVE 2 EVIDENCE PACKAGE PREPARED

---

## Summary

Wave 2 evidence package is **READY** for Parker and Ripley execution. All checklists, templates, and validation frameworks are in place. Awaiting scenario execution to validate evidence and issue gate verdict.

---

## Deliverables Created

| File | Size | Purpose |
|------|------|---------|
| `wave2-live/README.md` | 8.0 KB | Wave 2 overview, scope, pass criteria, timeline |
| `wave2-live/STATUS.md` | 8.6 KB | Real-time progress tracker with phase checklists |
| `wave2-live/mongodb-down/checklist.md` | 8.9 KB | Cascading failure scenario (217 lines, 12 phases) |
| `wave2-live/service-mismatch/checklist.md` | 9.9 KB | Silent networking scenario (230 lines, 12 phases) |
| `wave2-live/WAVE2-FINAL-VERDICT.md` | 6.5 KB | Gate verdict template with pass/fail criteria |

**Total**: 5 markdown files + 12 directories (3 scenarios × 4 evidence subdirectories)

---

## Wave 2 Scope

| Scenario | ID | Severity | Root Cause | Purpose |
|----------|-----|----------|------------|---------|
| **OOMKilled (Revalidation)** | `oom-killed` | critical | resource-exhaustion | Re-validate Wave 1 with fresh evidence |
| **MongoDBDown (Cascading Failure)** | `mongodb-down` | critical | dependency | Validate dependency tracing + cascade |
| **ServiceMismatch (Silent Networking)** | `service-mismatch` | critical | networking | Validate selector mismatch diagnosis |

---

## Pass Criteria (Pre-Defined)

**🟢 PASS** if:
- All 3 scenarios executed successfully (T0-T5 complete)
- kubectl evidence complete (10+ files per scenario)
- KQL evidence 2/3+ queries return results OR ingestion delay documented
- MTTR < 900s for all scenarios OR documented blocker
- Redaction complete (0 UUIDs, 0 IPs, 0 node names)
- SRE Agent portal evidence captured OR pending human with checklist ready

**🟡 PASS_WITH_PENDING_HUMAN_PORTAL** if:
- All automated evidence complete
- SRE Agent portal pending John's manual action

**�� PARTIAL_WITH_LIMITATIONS** if:
- 2/3 scenarios complete (acceptable)
- KQL partial due to Container Insights lag (documented)

**🔴 BLOCKED** if:
- Infrastructure failure
- Scenario execution failure
- Critical evidence gap

---

## Known Limitations (Pre-Documented from Wave 1)

1. **Alert Firing Events**: `alert-history.kql` shows rule config changes only (Wave 3+)
2. **Container Insights Lag**: 2-5 min ingestion delay — document as non-critical blocker
3. **SRE Agent Portal**: Human-only — John must capture after Parker completes
4. **ServiceMismatch KQL**: Silent failures = minimal KQL signals (kubectl primary)

---

## Validation Performed

✅ **Scenario Metadata Validation**: 8/8 checks PASS, 0 errors, 0 warnings
✅ **Wave 1 Convention Reuse**: T0-T5 timeline structure copied from Wave 1 checklist
✅ **Safe Language Compliance**: No MTTR overclaims, no SLO claims, no autonomous detection claims
✅ **Documentation Stale Check**: DEMO-RUNBOOK.md, SAFE-LANGUAGE-GUARDRAILS.md, CAPABILITY-CONTRACTS.md all current

---

## Current Blockers

**NONE** — Infrastructure is healthy from Wave 1 closure. Parker and Ripley are executing their lanes.

---

## Next Actions

### Parker (SRE Dev)
1. Wait for Ripley infrastructure readiness signal
2. Execute OOMKilled revalidation (follow `oom-killed-revalidation/checklist.md`)
3. Execute MongoDBDown scenario (follow `mongodb-down/checklist.md`)
4. Execute ServiceMismatch scenario (follow `service-mismatch/checklist.md`)
5. Complete run-notes.md for each scenario
6. Signal Lambert when evidence collection complete

### Ripley (Infrastructure)
1. Re-verify AKS cluster health (nodes Ready, pods Running)
2. Confirm Container Insights operational (ama-logs healthy, tables flowing)
3. Test Log Analytics responsiveness
4. Confirm SRE Agent portal accessible
5. Signal Parker when infrastructure ready

### Lambert (QA/Docs — After Parker Completes)
1. Validate kubectl evidence structure (T0-T5 files, timestamps)
2. Validate KQL evidence (queries executed, ingestion delay documented)
3. Validate MTTR calculations (< 900s threshold or blocker)
4. Validate redaction completeness (0 UUIDs/IPs/nodes)
5. Run scenario metadata validation (8/8 checks)
6. Check safe-language compliance (no overclaims)
7. Issue Wave 2 gate verdict (PASS/PASS_WITH_PENDING/PARTIAL/BLOCKED)
8. Update `.squad/agents/lambert/history.md` with learnings

### John (Human Portal Evidence — After Parker Completes)
1. Capture SRE Agent portal evidence for OOMKilled, MongoDBDown, ServiceMismatch
2. Follow `sre-agent/HUMAN-ACTION-CHECKLIST.md` for each scenario
3. Save diagnosis responses and screenshots to respective scenario folders

---

## Wave 2 Timeline (Estimated)

| Phase | Owner | Duration | Status |
|-------|-------|----------|---------|
| Infrastructure Readiness | Ripley | 15-20 min | ⏳ PENDING |
| OOMKilled Revalidation | Parker | 10-15 min | ⏳ PENDING |
| MongoDBDown Execution | Parker | 15-20 min | ⏳ PENDING |
| ServiceMismatch Execution | Parker | 15-20 min | ⏳ PENDING |
| Evidence Validation | Lambert | 20-30 min | ⏳ PENDING |
| SRE Agent Portal (Human) | John | 15-20 min | ⏳ PENDING |
| **Total** | — | **90-125 min** | — |

---

## References

- Wave 1 Final Verdict: `docs/evidence/wave1-live/WAVE1-FINAL-VERDICT.md`
- Wave 1 Checklist: `docs/evidence/wave1-live/checklist.md`
- Scenario Manifest: `docs/evidence/scenarios/scenario-manifest.yaml`
- Safe Language Guardrails: `docs/SAFE-LANGUAGE-GUARDRAILS.md`
- Capability Contracts: `docs/CAPABILITY-CONTRACTS.md`
- Alert KQL Mapping: `docs/evidence/ALERT-KQL-MAPPING.md`

---

**Lambert**
QA/Docs | Evidence Validation & Documentation Quality
2026-04-26T05:30:00Z
