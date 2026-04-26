# Wave 2 Alert Firing Evidence Plan

> **Version**: 1.0.0 (2026-04-26)
> **Status**: Wave 2 Architecture Decision
> **Owner**: Ripley (Infra Dev)
> **Reviewers**: Dallas (Architecture), Parker (SRE Evidence), Lambert (Gate QA)

---

## Problem Statement

Wave 1 accepted `alert-history.kql` as a **known limitation**: Activity Log "Alert" category only captures alert **rule configuration changes** (create/update/delete), not alert **firing events**.

**Wave 2 requirement**: Prove scheduled query alerts actually fire during scenario deployments with evidence that survives `kubectl delete -f` cleanup.

---

## Decision: Dual-Path Alert Firing Evidence

### Primary Path (Low Risk): Azure Resource Graph CLI

**Approach**: Use `az graph query` to retrieve alert firing history from `AlertsManagementResources` provider.

**Execution**: CLI command in UAT runbook (no IaC changes):

```bash
# Query all alerts fired in last 24 hours
az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(24h)
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity),
    State = tostring(properties.essentials.monitorCondition),
    TargetResource = tostring(properties.essentials.targetResourceName)
| project FiredTime, AlertName, Severity, State, TargetResource, resourceGroup
| order by FiredTime desc
"
```

**Evidence Capture**:
```bash
# Save to file for Wave 2 gate evidence
az graph query -q "[query]" > docs/evidence/wave2-live/alert-firing-history.json
```

**Pros**:
- ✅ Zero Bicep changes (no deployment risk)
- ✅ Works immediately (no diagnostic settings lag)
- ✅ Queries across subscriptions if needed
- ✅ Structured JSON output for automation

**Cons**:
- ⚠️ Manual CLI execution (not KQL in Log Analytics)
- ⚠️ Alert retention ~30 days (Azure platform limit)

**Risk**: **LOW** — Read-only query, no infrastructure changes

---

### Secondary Path (Optional): Alert Diagnostic Settings → AlertEvidence Table

**Approach**: Configure diagnostic settings on each alert rule to send firing events to Log Analytics.

**IaC Changes**: Update `infra/bicep/modules/alerts.bicep` to add diagnostic settings to each alert resource.

**Example Bicep Addition**:
```bicep
resource crashLoopOomAlertDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: crashLoopOomAlert
  name: '${crashLoopOomAlert.name}-diag'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'allLogs'  // Sends alert firing events
        enabled: true
      }
    ]
  }
}
```

**KQL Query After Implementation**:
```kql
// Query alert firing events from AlertEvidence table
AlertEvidence
| where TimeGenerated > ago(24h)
| where AlertRuleName contains "gridmon" or AlertRuleName contains "srelab"
| extend
    FiredTime = TimeGenerated,
    AlertName = AlertRuleName,
    Severity = tostring(Severity)
| project FiredTime, AlertName, Severity, State, TargetResource=Resource
| order by FiredTime desc
```

**Pros**:
- ✅ Native Log Analytics KQL (consistent with other queries)
- ✅ Survives alert cleanup (Log Analytics retention applies)
- ✅ Can correlate with other telemetry (joins via ResourceId/CorrelationId)

**Cons**:
- ⚠️ Requires Bicep module changes (4 diagnostic setting resources)
- ⚠️ Requires re-deployment to apply
- ⚠️ Diagnostic settings create lag (events appear 2-5 minutes after firing)
- ⚠️ API version may be Preview (check schema stability)

**Risk**: **MEDIUM** — Infrastructure changes, deployment required, schema validation needed

---

## Recommended Wave 2 Implementation

### Phase 1: Azure Resource Graph (Wave 2.0)

**Implementation**:
1. Create CLI wrapper script: `scripts/get-alert-firing-history.ps1`
2. Add Wave 2 UAT step: "Run alert firing history query after scenario deployment"
3. Save JSON output to `docs/evidence/wave2-live/alert-firing-history.json`
4. Update `docs/evidence/kql/README.md` to document Azure Resource Graph approach

**Evidence Requirements**:
- Capture alert name matching `{prefix}-crashloop-oom`
- Verify `FiredTime` within scenario deployment window (T0 to T2)
- Confirm `Severity` matches Bicep configuration (Sev 1)
- Prove alert survives `kubectl delete -f k8s/scenarios/oom-killed.yaml` cleanup

**Gate Criteria**:
- [ ] At least 1 alert firing event captured for OOMKilled scenario
- [ ] Alert name matches deployed alert rule (`alert-gridmon-dev-crashloop-oom`)
- [ ] Alert fired within 2 minutes of scenario deployment
- [ ] Evidence saved to `docs/evidence/wave2-live/alert-firing-history.json`

**Estimated Effort**: 1-2 hours (script + UAT execution)

---

### Phase 2: Alert Diagnostic Settings (Wave 2.1 or Wave 3 — OPTIONAL)

**When to Implement**:
- If Azure Resource Graph approach proves insufficient for customer demos
- If Log Analytics correlation with KubeEvents/AppInsights is required for SRE Agent
- If alert retention beyond 30 days is needed
- If Wave 3+ runbook automation requires KQL-based alert queries

**Pre-Implementation Validation**:
1. Verify `Microsoft.Insights/diagnosticSettings@2021-05-01-preview` API is GA (not Preview)
2. Test diagnostic settings on 1 alert in dev environment
3. Confirm `AlertEvidence` table schema is documented and stable
4. Verify no breaking changes to existing alert behavior

**Implementation Plan**:
1. Update `infra/bicep/modules/alerts.bicep`:
   - Add 4 diagnostic setting resources (1 per alert)
   - Add parameter `enableAlertDiagnostics` (default: false for Wave 2.0)
2. Create KQL query: `docs/evidence/kql/stable/alert-firing-events.kql`
3. Update `docs/evidence/kql/README.md` to document AlertEvidence table
4. Test with single scenario deployment
5. Validate 2-5 minute lag acceptable for Wave 2 gates

**Gate Criteria** (if implemented):
- [ ] AlertEvidence table populated after alert fires
- [ ] KQL query returns alert firing events for OOMKilled scenario
- [ ] Events include `TimeBucket`, `ResourceId`, `CorrelationId` (Security MF-3)
- [ ] No impact to existing alerts or deployments

**Estimated Effort**: 4-6 hours (Bicep changes + validation + docs)

---

## Non-Goals (Wave 2)

- ❌ Action Group webhook integration (deferred to Wave 4)
- ❌ Email/SMS notification testing (Wave 4)
- ❌ Alert auto-remediation via Logic Apps/Functions (Wave 4)
- ❌ Custom AlertEvidence schema (use Azure platform schema as-is)

---

## Example PowerShell Script (Wave 2.0)

**File**: `scripts/get-alert-firing-history.ps1`

```powershell
#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
Query Azure Resource Graph for alert firing history.

.DESCRIPTION
Retrieves alert firing events from Azure Resource Graph AlertsManagementResources
provider. Used for Wave 2 evidence capture to prove alerts actually fire during
scenario deployments.

.PARAMETER Hours
Number of hours to look back (default: 24)

.PARAMETER OutputPath
Optional path to save JSON output (default: stdout)

.EXAMPLE
.\scripts\get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/alert-firing-history.json
#>

param(
    [int]$Hours = 24,
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$query = @"
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(${Hours}h)
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity),
    State = tostring(properties.essentials.monitorCondition),
    TargetResource = tostring(properties.essentials.targetResourceName)
| project FiredTime, AlertName, Severity, State, TargetResource, resourceGroup
| order by FiredTime desc
"@

Write-Host "Querying alert firing history (last $Hours hours)..." -ForegroundColor Cyan

if ($OutputPath) {
    az graph query -q $query --output json > $OutputPath
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Alert firing history saved to: $OutputPath" -ForegroundColor Green
        $results = Get-Content $OutputPath | ConvertFrom-Json
        Write-Host "  Found $($results.count) alert(s)" -ForegroundColor Gray
    } else {
        Write-Error "Failed to query Azure Resource Graph"
    }
} else {
    az graph query -q $query --output table
}
```

---

## Wave 2 UAT Checklist Addition

Add to `docs/evidence/wave2-live/checklist.md`:

```markdown
### Alert Firing Evidence

- [ ] **Azure Resource Graph query executed** — After scenario deployment, run:
  ```bash
  az graph query -q "alertsmanagementresources | where type == 'microsoft.alertsmanagement/alerts' | where properties.essentials.startDateTime >= ago(2h)"
  ```
- [ ] **Alert firing event captured** — Verify alert name matches deployed alert rule (e.g., `alert-gridmon-dev-crashloop-oom`)
- [ ] **Firing timestamp validated** — Alert `FiredTime` within 2 minutes of scenario deployment (T0 to T2)
- [ ] **Evidence saved** — JSON output saved to `docs/evidence/wave2-live/alert-firing-history.json`
- [ ] **Gate pass criteria** — At least 1 alert firing event for OOMKilled scenario
```

---

## Documentation Updates Required

### 1. Update `docs/evidence/kql/README.md`

Add section after "Alert Firing Event Limitations (Wave 1)":

```markdown
### Wave 2 Alert Firing Evidence (Azure Resource Graph)

**Implemented:** Wave 2.0
**Approach:** CLI-based Azure Resource Graph query (no Bicep changes)

**Query Command**:
```bash
az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(24h)
| project FiredTime=properties.essentials.startDateTime, AlertName=properties.essentials.alertRule, Severity=properties.essentials.severity
| order by FiredTime desc
"
```

**Helper Script**: `scripts/get-alert-firing-history.ps1`

**Evidence Location**: `docs/evidence/wave2-live/alert-firing-history.json`

**Future Enhancement (Wave 2.1+)**: Alert diagnostic settings to send firing events to `AlertEvidence` table for KQL correlation.
```

### 2. Update `docs/ALERT-KQL-MAPPING.md`

Add under "Next Steps (Wave 2+)":

```markdown
1. ✅ **Alert Firing Evidence (Wave 2.0)**: Azure Resource Graph CLI query (`scripts/get-alert-firing-history.ps1`)
2. 🔄 **Alert Diagnostic Settings (Wave 2.1+)**: Optional Bicep implementation for KQL-based correlation
```

---

## Decision Log Entry

**Decision ID**: `WAVE2-ALERT-FIRING-001`
**Date**: 2026-04-26
**Owner**: Ripley (Infra Dev)
**Status**: APPROVED for Wave 2.0 (Azure Resource Graph); Wave 2.1 (diagnostic settings) deferred pending business need

**Summary**: Wave 2 uses Azure Resource Graph CLI (`az graph query`) for alert firing evidence. No Bicep changes required. Alert diagnostic settings deferred to Wave 2.1+ if KQL correlation or extended retention is needed.

**Rationale**:
- **Lowest Risk**: CLI-only approach, zero deployment changes
- **Sufficient for Gate**: Proves alerts fire, evidence survives scenario cleanup
- **Customer-Presentable**: CLI command can be shown in demo runbooks
- **Extensible**: Can add diagnostic settings later if business need emerges

**Alternatives Considered**:
1. ❌ Immediate diagnostic settings implementation — Rejected due to Bicep change risk and unclear schema stability
2. ❌ Activity Log parsing — Rejected (Activity Log doesn't contain firing events)
3. ❌ Action Group webhook — Rejected (Wave 4 scope, requires external endpoint)

---

## Success Metrics (Wave 2 Gate)

**Gate Pass Criteria**:
- [ ] Azure Resource Graph query returns ≥1 alert firing event for OOMKilled scenario
- [ ] Alert name matches deployed rule (`alert-{prefix}-crashloop-oom`)
- [ ] Alert fired within 2 minutes of `kubectl apply -f k8s/scenarios/oom-killed.yaml`
- [ ] Evidence persists after `kubectl delete -f k8s/scenarios/oom-killed.yaml`
- [ ] JSON output saved to `docs/evidence/wave2-live/alert-firing-history.json`

**Non-Blocking (nice-to-have)**:
- Alert `TargetResource` identifies specific pod (may be generic for scheduled query rules)
- Multiple firing events if scenario creates sustained failure

---

## References

- [Azure Resource Graph AlertsManagement API](https://learn.microsoft.com/en-us/azure/governance/resource-graph/reference/supported-tables-resources#alertsmanagementresources)
- [Azure Monitor Diagnostic Settings API](https://learn.microsoft.com/en-us/rest/api/monitor/diagnosticsettings)
- Wave 1 KQL limitation: `.squad/decisions/inbox/ripley-kql-alert-history-table-fix.md`
- Alert contracts: `docs/CAPABILITY-CONTRACTS.md` §4 (Alert Severity Taxonomy)

---

**Next Actions**:
1. Dallas: Review and approve Wave 2.0 approach
2. Ripley: Create `scripts/get-alert-firing-history.ps1` (if approved)
3. Parker: Add alert firing validation step to Wave 2 UAT runbook
4. Lambert: Add gate criteria to Wave 2 checklist
