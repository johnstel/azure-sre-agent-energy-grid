# Wave 1 Live UAT — Final Gate Verdict

**Date**: 2026-04-26
**Validator**: Lambert (QA/Docs)
**Operator**: Parker (SRE Dev)
**Scenario**: OOMKilled

---

## Gate Verdict: 🟢 CLOSED_WITH_PENDING_HUMAN_PORTAL

Wave 1 OOMKilled evidence **PASSES** validation after successful rerun with Container Insights operational. kubectl evidence complete (T0-T5, MTTR 147s PASS, redaction complete). KQL evidence PARTIAL 2/3 PASS: scenario-oom-killed-enhanced PASS (OOMKilled in KubePodInventory), pod-lifecycle PASS (28 rows). alert-history blocked on known Wave 2 limitation (non-critical). **Wave 1 CLOSED** pending only SRE Agent portal evidence (human action required).

---

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **kubectl Evidence (Rerun)** | ✅ PASS | T0-T5 complete at 03:41-03:43Z, 10 files, redaction complete |
| **MTTR (Rerun)** | ✅ PASS | 147 seconds (16% of 900s threshold) |
| **Scenario Execution** | ✅ PASS | OOMKilled reproduced, diagnosed, remediated, recovered |
| **Container Insights** | ✅ FIXED | Ripley remediated, tables flowing in log-gridmon-dev |
| **KQL Evidence** | ✅ PARTIAL (2/3) | scenario-oom-killed-enhanced PASS, pod-lifecycle PASS |
| **KQL: alert-history** | ⚠️ BLOCKED (non-critical) | Known Wave 2 limitation (rule config only, not firing events) |
| **Activity Log Export** | ✅ PASS | Correctly configured, 86+ events verified |
| **KQL Documentation** | ✅ CORRECTED | alert-history.kql fixed (AzureActivity, rule changes) |
| **Redaction** | ✅ COMPLETE | All sensitive data removed (UUIDs, IPs, node names) |
| **SRE Agent Portal** | ⏳ PENDING | Human action required (John) |

---

## Ripley KQL Fix Applied

**Issue**: `alert-history.kql` used wrong table (AzureDiagnostics instead of AzureActivity) and made incorrect claim (alert firing events instead of rule configuration changes).

**Resolution**: Applied corrected query from `.squad/decisions/inbox/ripley-kql-alert-history-table-fix.md`:
- Corrected table: AzureDiagnostics → **AzureActivity**
- Corrected claim: "alert firing history" → **"alert rule configuration changes"**
- Added Wave 2 limitation: Alert firing events require Azure Resource Graph or alert diagnostic settings

**Files Updated**:
1. `docs/evidence/kql/stable/alert-history.kql` (73 lines) — Corrected query
2. `docs/evidence/kql/README.md` — Updated table reference, added §Alert Firing Event Limitations
3. `docs/evidence/ALERT-KQL-MAPPING.md` — Updated 2 references to clarify limitation

**Validation**: Scenario metadata validation rerun — 8/8 checks PASS, 0 errors, 0 warnings.

---

## Deliverables

| File | Lines | Purpose |
|------|-------|---------|
| `LAMBERT-VALIDATION-REPORT.md` | 294 | Comprehensive validation report with gate verdict |
| `docs/evidence/kql/stable/alert-history.kql` | 73 | Corrected KQL query (AzureActivity) |
| `docs/evidence/kql/README.md` | 319 | Added §Alert Firing Event Limitations |
| `docs/evidence/ALERT-KQL-MAPPING.md` | Updated | Corrected 2 alert-history references |
| `.squad/agents/lambert/history.md` | Updated | Wave 1 validation + KQL fix learning captured |

---

## Rerun Evidence After Container Insights Fix (Parker — Option A)

**Date**: 2026-04-26 (rerun after Container Insights remediation)
**Status**: ✅ **PASS** — Scenario re-executed successfully with telemetry-backed KQL evidence

**Container Insights Remediation** (Ripley):
- Intended cluster running, ama-logs healthy
- Heartbeat/KubePodInventory/KubeEvents flowing in `log-gridmon-dev`
- Original scenario window missed; coordinator chose Option A (rerun) per user's overnight completion directive

**Rerun Timeline** (2026-04-26T03:41-03:43Z):
- T0 (Baseline): 03:41:03Z — 12 pods Running
- T1 (Inject): 03:41:04Z — Applied oom-killed.yaml (16Mi limit)
- T2 (Detect): 03:42:27Z — Both meter-service pods CrashLoopBackOff (Detection: 83s)
- T3 (Diagnose): 03:42:29Z — OOMKilled confirmed in kubectl describe
- T4 (Fix): 03:42:45Z — Baseline restored (Diagnosis: 18s)
- T5 (Verify): 03:43:31Z — All pods Running (Recovery: 46s)

**MTTR**: **147 seconds** ✅ PASS (threshold: 900s, margin: 753s)

**kubectl Evidence** (10 files, kubectl-output-rerun/):
- ✅ T0-T5 complete with timestamps
- ✅ OOMKilled reason confirmed in T3-describe-pod.txt
- ✅ Memory limit 16Mi confirmed
- ✅ Redaction complete (0 UUIDs, 0 IPs, 0 node names)

**KQL Evidence** (kql-results-rerun/):
- ✅ scenario-oom-killed-enhanced.json — 1 row with OOMKilled ContainerStatusReason in KubePodInventory
- ✅ pod-lifecycle.json — 28 rows showing pod state transitions and BackOff events
- ⚠️ alert-history.kql — BLOCKED (schema issue, non-critical — known Wave 2 limitation)

**Pre-Flight Verification**:
- ✅ Verified active ingestion: 72 Running pods at 03:39:46Z (1 min before T0)
- ✅ No timing gap — full telemetry capture achieved

**Overall**: ✅ **PASS** — Scenario executed successfully with complete kubectl evidence + telemetry-backed KQL evidence (2/3 queries)

---

## Container Insights KQL Blocker (Parker's Final Retry)

**Date**: 2026-04-26 (final retry update — RESOLVED)
**Issue**: Container Insights KQL tables (`KubeEvents`, `KubePodInventory`) were empty for 24 hours in corrected Log Analytics workspace
**Resolution**: ✅ **FIXED** by Ripley — intended cluster running, ama-logs healthy, tables flowing in log-gridmon-dev
**Status**: ✅ **RESOLVED** — Wave 1 rerun successful with telemetry-backed KQL evidence

**Remediation Actions** (Ripley):
1. ✅ Investigated Container Insights ingestion failure
2. ✅ Restored KubeEvents/KubePodInventory ingestion
3. ✅ Verified ingestion: Heartbeat/KubePodInventory/KubeEvents flowing

**Rerun Decision** (Coordinator):
- Original scenario window (02:19-02:21Z) missed during Container Insights downtime
- Coordinator chose Option A (rerun) per user's overnight completion directive
- Parker re-executed OOMKilled scenario at 03:41-03:43Z with full telemetry capture

**Note**: This blocker is now RESOLVED. Wave 1 evidence is complete.

---

## Next Actions

### Immediate (Wave 1 Closed)

**Wave 1 Status**: ✅ **CLOSED** — All non-human evidence complete

**Remaining Human-Only Artifact**:
1. **John**: Capture SRE Agent portal evidence following `sre-agent/HUMAN-ACTION-CHECKLIST.md`
   - Navigate to https://aka.ms/sreagent/portal
   - Submit prompt from `sre-agent/diagnosis-prompt.txt`
   - Save response to `sre-agent/diagnosis-response.md`
   - Take screenshot: `sre-agent/screenshots/diagnosis-complete.png`
   - Document accuracy assessment (PASS/FAIL/PARTIAL)

### Final (After Human Portal Capture)

2. **Parker**: Update run-notes with SRE Agent portal evidence status
3. **Parker**: Final commit of all evidence to Git with Wave 1 completion summary
4. **Dallas**: Review Wave 1 evidence package and gate Wave 2 launch

### Final

5. **Parker**: Update run-notes with KQL and SRE Agent status
6. **Parker**: Commit all evidence to Git with summary
7. **Dallas**: Review Wave 1 evidence package and gate Wave 2 launch

---

## Wave 2 Recommendations

1. **Alert Diagnostic Settings**: Configure alert rules to send firing events to `AlertEvidence` table (requires Bicep update)
2. **Automated Redaction**: Pre-commit hook to block commits with UUIDs/IPs in evidence/ directory
3. **Evidence Template Generator**: Codify T0-T5 structure into script for remaining 9 scenarios

---

## Validation Sign-Off

**kubectl Evidence (Rerun)**: ✅ COMPLETE — T0-T5 at 03:41-03:43Z, redaction complete
**Activity Log Export**: ✅ VERIFIED — 86+ events in AzureActivity (Ripley)
**Container Insights**: ✅ FIXED — Ripley remediated, tables flowing (Heartbeat/KubePodInventory/KubeEvents)
**KQL Documentation**: ✅ CORRECTED — alert-history.kql accurate with Wave 2 limitation
**KQL Evidence**: ✅ PARTIAL (2/3) — scenario-oom-killed-enhanced PASS, pod-lifecycle PASS
**KQL: alert-history**: ⚠️ BLOCKED (non-critical) — Known Wave 2 limitation (rule config only)
**MTTR**: ✅ PASS — 147 seconds (threshold: 900 seconds, margin: 753s)
**Scenario Execution**: ✅ PASS — OOMKilled reproduced, diagnosed, remediated, recovered
**Redaction**: ✅ COMPLETE — All sensitive data removed (0 UUIDs, 0 IPs, 0 node names)
**SRE Agent Portal**: ⏳ PENDING — Human action required (John)

**Final Verdict**: **🟢 CLOSED_WITH_PENDING_HUMAN_PORTAL**

Wave 1 **CLOSED** — All non-human evidence complete. kubectl/MTTR/KQL/redaction all PASS. alert-history blocked on known/documented Wave 2 limitation (non-critical). Only SRE Agent portal evidence remains (human-only artifact, does not block Wave 1 closure).

---

**Lambert**
QA/Docs | Evidence Validation & Documentation Quality
2026-04-26T03:30:00Z (Updated: 2026-04-26T04:00:00Z — BLOCKED on Container Insights; 2026-04-26T04:15:00Z — CLOSED after rerun)
