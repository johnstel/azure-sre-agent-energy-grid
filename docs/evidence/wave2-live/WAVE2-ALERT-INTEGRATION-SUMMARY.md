# Wave 2 Alert Firing Evidence Integration — Parker Summary

**Date**: 2026-04-26T08:00:00Z
**Task**: Integrate Ripley's Wave 2 alert-firing evidence path into MongoDBDown and ServiceMismatch execution guides
**Status**: ✅ COMPLETE

---

## What Was Done

### 1. Reviewed Ripley's Wave 2 Alert Firing Assets ✅
- **Script**: `scripts/get-alert-firing-history.ps1` — PowerShell 7 helper for Azure Resource Graph CLI queries
- **Documentation**: `docs/evidence/wave2-alert-firing-*.md` — Evidence plan, commands, quick reference
- **Alert Rules**: `docs/evidence/wave1-live/scheduled-query-alerts.json` — 4 alerts deployed:
  - `alert-srelab-crashloop-oom` (Sev1)
  - `alert-srelab-pod-restarts` (Sev2)
  - `alert-srelab-http-5xx` (Sev2)
  - `alert-srelab-pod-failures` (Sev2)

### 2. Updated MongoDBDown Execution Guide ✅
**Added**:
- Alert firing evidence capture step after T2 (wait 2-3 minutes for alert evaluation)
- Azure Resource Graph query using `get-alert-firing-history.ps1` script
- Alternative direct `az graph query` command
- Expected alerts: Possible `pod-failures` or `http-5xx` (if dependent services error)
- NO_ALERT_FIRED documentation template if no alerts fire
- Validation commands to check alert count

**Location**: `docs/evidence/wave2-live/mongodb-down/EXECUTION-GUIDE.md`

### 3. Updated ServiceMismatch Execution Guide ✅
**Added**:
- Alert firing evidence capture step after T2 (wait 2-3 minutes for alert evaluation)
- Azure Resource Graph query using `get-alert-firing-history.ps1` script
- Alternative direct `az graph query` command
- **Expected result**: NO_ALERT_FIRED (silent failure — pods healthy, no crash/OOM/restart)
- Detailed rationale: Service selector mismatch causes unreachability but does not trigger traditional failure alerts
- NO_ALERT_FIRED documentation template (expected for this scenario)
- Validation commands to verify count = 0

**Location**: `docs/evidence/wave2-live/service-mismatch/EXECUTION-GUIDE.md`

### 4. Updated Evidence Status Trackers ✅
**Added** to both scenarios:
- Alert Firing Evidence (ARG) row in evidence status matrix
- Status: ⏳ PENDING (blocked by cluster stopped)
- Owner: Parker
- Blocker: AKS cluster stopped

**Locations**:
- `docs/evidence/wave2-live/mongodb-down/EVIDENCE-STATUS.md`
- `docs/evidence/wave2-live/service-mismatch/EVIDENCE-STATUS.md`

### 5. Updated Evidence Plans ✅
**Added** to both scenarios:
- Alert Firing Evidence section with ARG query details
- Expected results (MongoDBDown: possible alerts, ServiceMismatch: NO_ALERT_FIRED)
- Evidence file: `alert-firing-history.json`
- NO_ALERT_FIRED documentation examples
- Validation commands

**Locations**:
- `docs/evidence/wave2-live/mongodb-down/EVIDENCE-PLAN.md`
- `docs/evidence/wave2-live/service-mismatch/EVIDENCE-PLAN.md`

### 6. Updated File Inventory ✅
**Updated**:
- Total expected evidence files: 40 → **42 files** (added 1 alert ARG file per scenario)
- MongoDBDown: 21 → **22 evidence files** (16 kubectl + 1 alert ARG + 2 KQL + 1 MTTR + 2 SRE Agent)
- ServiceMismatch: 19 → **20 evidence files** (14 kubectl + 1 alert ARG + 2 KQL + 1 MTTR + 2 SRE Agent)
- Updated validation checklists to include alert firing evidence

**Location**: `docs/evidence/wave2-live/FILE-INVENTORY.md`

### 7. Updated Parker Final Report ✅
**Updated**:
- MongoDBDown live capture checklist includes alert ARG evidence
- ServiceMismatch live capture checklist includes alert ARG evidence (NO_ALERT_FIRED expected)
- Scenario comparison table includes alert firing row
- Evidence tree diagrams include `alert-firing-history.json` file

**Location**: `docs/evidence/wave2-live/PARKER-FINAL-REPORT.md`

---

## Key Integration Points

### Azure Resource Graph Query (ARG)
**Why ARG, not Activity Log**:
- Activity Log shows alert **rule config changes** (create/update/delete)
- ARG shows alert **firing events** (actual alert triggers)
- Wave 1 KQL `alert-history.kql` correctly queries Activity Log for rule changes
- Wave 2 ARG query adds firing history evidence (separate from rule config)

**Query Details**:
- **Table**: `alertsmanagementresources`
- **Type**: `microsoft.alertsmanagement/alerts`
- **Time Window**: Last 2 hours (configurable via `-Hours` parameter)
- **Filter**: Optional resource group filter (`rg-srelab-eastus2`)
- **Output**: JSON with FiredTime, AlertName, Severity, State, TargetResource

**Helper Script**: `scripts/get-alert-firing-history.ps1`
```bash
# Query and save to file
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/mongodb-down/alert-firing-history.json

# Filter to resource group
./scripts/get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 1
```

### NO_ALERT_FIRED Documentation
**When to document NO_ALERT_FIRED**:
- ServiceMismatch (expected — silent failure, pods healthy)
- MongoDBDown (possible — if pod-failures/http-5xx alerts don't trigger)

**Template**:
```json
{
  "count": 0,
  "data": [],
  "note": "NO_ALERT_FIRED - [Scenario-specific explanation]"
}
```

**Rationale**: Proving "no alert fired" is still valid evidence. Some scenarios (like ServiceMismatch) are designed to test SRE Agent's ability to diagnose silent failures that don't trigger traditional alerts.

---

## Scenario Alert Expectations

| Scenario | Expected Alerts | Rationale |
|----------|----------------|-----------|
| **MongoDBDown** | Possible: `pod-failures`, `http-5xx` | MongoDB scaled to 0 → dependent services may error → alerts may fire if error thresholds met |
| **ServiceMismatch** | NO_ALERT_FIRED | Pods Running/Ready, no crashloop/OOM/restarts → traditional failure alerts don't trigger |

---

## Evidence Capture Timeline (Updated)

### MongoDBDown
1. T0-T1: Baseline + inject scenario
2. T2: Detect failure (MongoDB 0 pods, dispatch-service errors)
3. **Wait 2-3 minutes** for alert evaluation
4. **Capture alert firing evidence** via ARG query
5. T3: Diagnose root cause (kubectl API validation)
6. T4-T5: Restore + verify recovery
7. Run KQL queries + redaction

### ServiceMismatch
1. T0-T1: Baseline + inject scenario
2. T2: Detect failure (pods Running, 0 endpoints)
3. **Wait 2-3 minutes** for alert evaluation
4. **Document NO_ALERT_FIRED** via ARG query (expected result)
5. T3: Diagnose root cause (K8s API selector vs. labels)
6. T4-T5: Restore + verify recovery
7. Run KQL queries + redaction

---

## Files Updated (7 files)

1. `docs/evidence/wave2-live/mongodb-down/EXECUTION-GUIDE.md` — Added alert capture step
2. `docs/evidence/wave2-live/mongodb-down/EVIDENCE-STATUS.md` — Added alert evidence row
3. `docs/evidence/wave2-live/mongodb-down/EVIDENCE-PLAN.md` — Added alert evidence section
4. `docs/evidence/wave2-live/service-mismatch/EXECUTION-GUIDE.md` — Added NO_ALERT_FIRED step
5. `docs/evidence/wave2-live/service-mismatch/EVIDENCE-STATUS.md` — Added alert evidence row
6. `docs/evidence/wave2-live/service-mismatch/EVIDENCE-PLAN.md` — Added NO_ALERT_FIRED section
7. `docs/evidence/wave2-live/PARKER-FINAL-REPORT.md` — Updated evidence counts + trees
8. `docs/evidence/wave2-live/FILE-INVENTORY.md` — Updated file counts + validation
9. `docs/evidence/wave2-live/WAVE2-ALERT-INTEGRATION-SUMMARY.md` — This file

---

## No Bicep Changes Required ✅

**Confirmed**: No Bicep changes made. Alert rules already deployed via:
- `infra/bicep/modules/alerts.bicep` (existing)
- Scheduled query rules in `rg-srelab-eastus2` resource group
- Alert rules visible in `docs/evidence/wave1-live/scheduled-query-alerts.json`

Azure Resource Graph query uses **read-only** access to query existing alert firing history. No infrastructure changes needed.

---

## Validation Checklist

- [x] Reviewed Ripley's Wave 2 alert-firing evidence plan
- [x] Understood ARG vs. Activity Log distinction
- [x] Identified existing alert rules (4 alerts deployed)
- [x] Updated MongoDBDown execution guide with alert capture
- [x] Updated ServiceMismatch execution guide with NO_ALERT_FIRED
- [x] Updated both evidence status trackers
- [x] Updated both evidence plans
- [x] Updated file inventory with new counts
- [x] Updated Parker final report with alert evidence
- [x] Verified no Bicep changes required
- [x] Documented NO_ALERT_FIRED rationale for ServiceMismatch

---

## Parker's Summary

Wave 2 alert firing evidence path **successfully integrated** into MongoDBDown and ServiceMismatch execution guides. MongoDBDown may fire pod-failures or http-5xx alerts (if dependent services error). ServiceMismatch expects NO_ALERT_FIRED (silent failure — pods healthy, no traditional alert triggers). Both scenarios now include Azure Resource Graph query steps via `get-alert-firing-history.ps1` script. Evidence output file: `alert-firing-history.json` (ARG query output, NOT Activity Log). No Bicep changes required. Total evidence files updated from 40 to **42 files**. Integration complete and ready for live cluster execution.
