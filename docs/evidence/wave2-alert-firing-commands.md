# Wave 2 Alert Firing Evidence — Parker/Lambert Commands

> **For**: Wave 2 UAT operators (Parker, Lambert)
> **Purpose**: Exact commands to capture alert firing evidence after scenario deployment
> **No secrets**: All commands are safe to include in evidence documentation

---

## Pre-Requisites

1. ✅ Azure CLI authenticated (`az login`)
2. ✅ Subscription context set (`az account show`)
3. ✅ At least 1 scenario deployed (e.g., `kubectl apply -f k8s/scenarios/oom-killed.yaml`)
4. ⏱️ Wait 2-3 minutes after scenario deployment (alerts evaluate every 1-5 minutes)

---

## Commands (Copy-Paste Ready)

### 1. Query Alert Firing History (Console Output)

**Basic query** — last 2 hours, table format:

```bash
az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(2h)
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity),
    State = tostring(properties.essentials.monitorCondition)
| project FiredTime, AlertName, Severity, State, resourceGroup
| order by FiredTime desc
" --output table
```

**Expected output** (if alerts fired):
```
FiredTime                    AlertName                           Severity  State  resourceGroup
---------------------------  ----------------------------------  --------  -----  -----------------
2026-04-26T03:15:42.123Z     alert-gridmon-dev-crashloop-oom     Sev1      Fired  rg-srelab-eastus2
2026-04-26T03:13:18.456Z     alert-gridmon-dev-pod-restarts      Sev2      Fired  rg-srelab-eastus2
```

---

### 2. Save to File (Wave 2 Gate Evidence)

**Save as JSON** — for gate submission:

```bash
# Create evidence directory if it doesn't exist
mkdir -p docs/evidence/wave2-live

# Query and save
az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(2h)
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity),
    State = tostring(properties.essentials.monitorCondition),
    Description = tostring(properties.essentials.description),
    TargetResource = tostring(properties.essentials.targetResourceName)
| project FiredTime, AlertName, Severity, State, Description, TargetResource, resourceGroup
| order by FiredTime desc
" --output json > docs/evidence/wave2-live/alert-firing-history.json

# Verify file created
ls -lh docs/evidence/wave2-live/alert-firing-history.json
cat docs/evidence/wave2-live/alert-firing-history.json | head -20
```

---

### 3. PowerShell Helper Script (Recommended)

**If PowerShell 7+ available**:

```bash
# Query last 2 hours, console output
./scripts/get-alert-firing-history.ps1 -Hours 2

# Save to file
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/alert-firing-history.json

# Filter to specific resource group
./scripts/get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 1
```

**Script features**:
- Formatted console output with time-ago summary
- Error handling and exit codes
- Optional resource group filtering
- Automatic JSON formatting

---

### 4. Filter to Specific Alert Rule

**Query single alert** — e.g., crashloop-oom alert only:

```bash
az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(2h)
| where properties.essentials.alertRule contains 'crashloop-oom'
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity)
| project FiredTime, AlertName, Severity, resourceGroup
| order by FiredTime desc
" --output table
```

---

### 5. Check Alert Timeline (After Scenario)

**Timeline query** — verify alert fired AFTER scenario deployment:

```bash
# Replace SCENARIO_START_TIME with actual deployment timestamp
# Example: 2026-04-26T03:12:00Z

az graph query -q "
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= datetime(SCENARIO_START_TIME)
| extend FiredTime = todatetime(properties.essentials.startDateTime)
| project FiredTime, AlertName=properties.essentials.alertRule, Severity=properties.essentials.severity
| order by FiredTime asc
" --output table
```

---

## Validation Checklist (Wave 2 Gate)

After running commands above, verify:

- [ ] **At least 1 alert** in results (count > 0)
- [ ] **Alert name matches** deployed rule (e.g., `alert-gridmon-dev-crashloop-oom`)
- [ ] **FiredTime within 2 minutes** of scenario deployment (T0 to T2)
- [ ] **Evidence persists** after `kubectl delete -f k8s/scenarios/oom-killed.yaml`
- [ ] **JSON file saved** to `docs/evidence/wave2-live/alert-firing-history.json`
- [ ] **File not empty** (`ls -lh` shows > 0 bytes)

**If no alerts found**:
1. Wait 2-3 more minutes (alerts evaluate every 1-5 minutes)
2. Check alert is enabled: `az monitor scheduled-query show --resource-group <rg> --name <alert-name> --query enabled`
3. Verify scenario deployed: `kubectl get pods -n energy` (should show OOMKilled or CrashLoopBackOff)
4. Check Container Insights: `kubectl get pods -n kube-system | grep ama-logs` (should be Running)

---

## Example Output File Format

**File**: `docs/evidence/wave2-live/alert-firing-history.json`

```json
{
  "count": 2,
  "data": [
    {
      "FiredTime": "2026-04-26T03:15:42.123Z",
      "AlertName": "alert-gridmon-dev-crashloop-oom",
      "Severity": "Sev1",
      "State": "Fired",
      "Description": "Energy Grid - CrashLoop/OOM detected",
      "TargetResource": "log-gridmon-dev",
      "resourceGroup": "rg-srelab-eastus2"
    }
  ]
}
```

---

## Redaction (Before Committing)

**If redacting for public docs**:
- Replace actual subscription IDs with `<subscription-id>`
- Replace actual workspace names with `<workspace-name>`
- Keep alert names, severity, state (these are safe)
- Keep FiredTime timestamps (these are useful for timeline validation)

**Example redacted**:
```json
{
  "AlertName": "alert-gridmon-dev-crashloop-oom",
  "Severity": "Sev1",
  "FiredTime": "2026-04-26T03:15:42.123Z",
  "resourceGroup": "<resource-group>"
}
```

---

## References

- **Architecture Plan**: `docs/evidence/wave2-alert-firing-evidence-plan.md`
- **Quick Reference**: `docs/evidence/wave2-alert-firing-quick-ref.md`
- **Decision Record**: `.squad/decisions/inbox/ripley-wave2-alert-firing.md`
- **Helper Script**: `scripts/get-alert-firing-history.ps1`

---

**Last Updated**: 2026-04-26T03:30:00Z
**Owner**: Ripley (Infra Dev)
**For**: Parker (SRE Evidence), Lambert (Gate QA)
