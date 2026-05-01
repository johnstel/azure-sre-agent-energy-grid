# Wave 2 Live Evidence Package

**Date**: 2026-04-26
**Validator**: Lambert (QA/Docs)
**Operators**: Parker (SRE Dev) + Ripley (Infrastructure)
**Scenarios**: OOMKilled (revalidation), MongoDBDown, ServiceMismatch
**Status**: 🟡 PASS_WITH_PENDING_HUMAN_PORTAL

---

## Wave 2 Scope

Wave 2 validates customer incident scenarios with automated evidence and preserves SRE Agent portal validation as a required human follow-up:

| Scenario | ID | Severity | Root Cause | Status |
|----------|-----|----------|------------|---------|
| **OOMKilled (Wave 1 carry-forward)** | `oom-killed` | critical | resource-exhaustion | ✅ CLOSED_WITH_PENDING_HUMAN_PORTAL |
| **MongoDBDown (Cascading Failure)** | `mongodb-down` | critical | dependency | ⚠️ PARTIAL PASS; portal pending |
| **ServiceMismatch (Silent Networking)** | `service-mismatch` | critical | networking | ✅ PASS; portal pending |

---

## Wave 2 Deliverables

### Required Evidence (Per Scenario)

**kubectl Evidence**:
- [ ] T0-T5 timeline with timestamps (baseline → inject → observe → diagnose → fix → verify)
- [ ] Pod status outputs at each stage
- [ ] Event logs capturing failure manifestation
- [ ] Describe outputs showing root cause indicators
- [ ] Post-fix recovery verification

**KQL Evidence**:
- [ ] Scenario-specific KQL queries executed against Log Analytics
- [ ] Pod lifecycle transitions (KubePodInventory, KubeEvents)
- [ ] Enhanced scenario queries (OOMKilled status, dependency tracking)
- [ ] Alert history (Activity Log — rule changes only)
- [ ] Ingestion delay documented if queries return no results

**Alert Firing Evidence** (via Azure Resource Graph):
- [ ] Alert firing history captured via `scripts/get-alert-firing-history.ps1`
- [ ] For scenarios with baseline alert mapping: Alert firing event documented with timestamp + properties
- [ ] For scenarios without guaranteed alert: Explicit `NO_ALERT_FIRED` with ARG command output showing 0 results
- [ ] Activity Log alert-history.kql remains rule-config evidence only (per Wave 1 limitation)

**SRE Agent Evidence** (Human-Only):
- [ ] Diagnosis prompt file with exact text
- [ ] Human portal interaction following HUMAN-ACTION-CHECKLIST.md
- [ ] Exact visible conversation response saved to `sre-agent/diagnosis-response.md` without paraphrasing
- [ ] Screenshot of SRE Agent portal interaction
- [ ] Accuracy assessment (PASS/FAIL/PARTIAL) with justification

**MTTR Metrics**:
- [ ] `metrics/mttr-summary.yaml` with T0-T5 timestamps
- [ ] MTTR calculation (T4 - T2)
- [ ] Detection time (T2 - T1)
- [ ] Recovery time (T5 - T4)
- [ ] Baseline comparison and pass/fail vs. 900s threshold

**Redaction & Quality**:
- [ ] All sensitive data redacted (UUIDs, IPs, node names, subscription IDs)
- [ ] Evidence structure matches Wave 1 conventions
- [ ] run-notes.md completed with observations and learnings
- [ ] Git commit readiness verified

---

## Wave 2 Pass Criteria

**Overall Gate Verdict Options**:
- `🟢 PASS` — All 3 scenarios complete, MTTR < 900s, SRE Agent accuracy confirmed, redaction complete
- `🟡 PASS_WITH_PENDING_HUMAN_PORTAL` — All automated evidence complete, SRE Agent portal pending human action
- `🟠 PARTIAL_WITH_LIMITATIONS` — 2/3 scenarios complete OR KQL evidence partial due to documented blockers
- `🔴 BLOCKED` — Infrastructure failure, scenario execution failure, or critical evidence gap

**Per-Scenario Pass Criteria**:
- kubectl evidence: T0-T5 complete with clear timeline
- KQL evidence: 2/3+ queries return results OR ingestion delay documented
- Alert firing evidence: ARG firing event captured OR explicit NO_ALERT_FIRED with command output
- MTTR: < 900 seconds (15 minutes) OR documented blocker
- Redaction: 0 UUIDs, 0 IPs, 0 node names in evidence files
- SRE Agent: Real portal evidence captures a useful root-cause diagnosis OR documents misdiagnosis/blocker with details

---

## Wave 2 Known Limitations (Pre-Documented)

From Wave 1 learnings:

1. **Alert Firing Events**: Activity Log `alert-history.kql` shows rule configuration changes only (AzureActivity). **Wave 2 solution**: Use Azure Resource Graph CLI via `scripts/get-alert-firing-history.ps1` to capture actual firing events from AlertsManagementResources provider.
2. **Container Insights Lag**: KQL queries may return no results if executed < 2-5 minutes after scenario injection. Document ingestion delay as non-critical blocker.
3. **SRE Agent Portal**: Human-only artifact. Cannot be automated. Requires John's manual action.
4. **Activity Log Export**: Configured in Wave 1, but full retention/querying verification deferred to Wave 2.

---

## Wave 2 Completion Tracker

### Infrastructure (Ripley)
- [x] AKS cluster target resolved and available for Wave 2 capture.
- [x] Baseline energy namespace health verified before live capture.
- [x] Container Insights availability confirmed for the active target.
- [x] Activity Log / alert-history limitations documented.

### Scenario Execution (Parker)

**OOMKilled (Wave 1 carry-forward)**:
- [x] T0-T5 execution complete in Wave 1 rerun.
- [x] kubectl evidence captured.
- [x] KQL evidence accepted as partial 2/3.
- [x] MTTR calculated and validated at 147 seconds.
- [x] Redaction complete.
- [ ] SRE Agent portal evidence pending human validation.

**MongoDBDown (Cascading Failure)**:
- [x] T0-T5 kubectl/root-cause evidence captured.
- [x] MongoDB `replicas: 0` root cause validated.
- [x] Alert evidence documented as `NO_ALERT_FIRED` for rapid automated run.
- [x] Redaction complete.
- [ ] SRE Agent portal evidence pending human validation.

**ServiceMismatch (Silent Networking)**:
- [x] Deterministic selector mismatch rerun complete.
- [x] kubectl evidence captured for selector `meter-service-v2` vs pod label `meter-service`.
- [x] Empty endpoints and healthy pods validated.
- [x] Alert evidence documented as expected `NO_ALERT_FIRED`.
- [x] Redaction complete.
- [ ] SRE Agent portal evidence pending human validation.

### Validation (Lambert)

- [x] Evidence structure validation completed.
- [x] Redaction validation completed.
- [x] Scenario metadata validation passed.
- [x] Safe language compliance reviewed.
- [x] Wave 2 gate verdict issued: `PASS_WITH_PENDING_HUMAN_PORTAL`.

---

## Wave 2 Next Actions

**Completed automated work**:
1. ✅ Validated evidence against Wave 1 conventions.
2. ✅ Ran scenario metadata validation.
3. ✅ Checked redaction completeness.
4. ✅ Verified supported MTTR evidence and documented automated-run limitations.
5. ✅ Issued Wave 2 gate verdict with justification.

**Human Action Required**:
- John must capture SRE Agent portal evidence for OOMKilled, MongoDBDown, and ServiceMismatch following each scenario's `sre-agent/HUMAN-ACTION-CHECKLIST.md`.

---

## Evidence Directory Structure

```
docs/evidence/wave2-live/
├── README.md                          # This file
├── STATUS.md                          # Real-time progress tracker
├── WAVE2-FINAL-VERDICT.md             # Lambert's gate verdict (after execution)
├── oom-killed-revalidation/
│   ├── kubectl-output/                # T0-T5 kubectl evidence
│   ├── kql-results/                   # KQL query results (JSON/CSV)
│   ├── sre-agent/                     # Diagnosis prompt + response + screenshots
│   ├── metrics/                       # mttr-summary.yaml
│   └── run-notes.md                   # Parker's execution notes
├── mongodb-down/
│   ├── kubectl-output/
│   ├── kql-results/
│   ├── sre-agent/
│   ├── metrics/
│   └── run-notes.md
└── service-mismatch/
    ├── kubectl-output/
    ├── kql-results/
    ├── sre-agent/
    ├── metrics/
    └── run-notes.md
```

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
| **Total Estimated** | — | **90-125 min** | — |

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
2026-04-26T05:00:00Z
