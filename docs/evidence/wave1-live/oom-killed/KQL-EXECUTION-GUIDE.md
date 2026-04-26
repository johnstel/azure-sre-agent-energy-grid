# KQL Evidence Collection Guide — OOMKilled Scenario

**Execution Time**: Wait 5 minutes after T5 (completed at 2026-04-26T02:21:18Z)
**Earliest KQL Execution**: 2026-04-26T02:26:18Z
**Operator**: Parker or designated analyst

---

## Prerequisites

- [ ] T0-T5 kubectl evidence collection is complete
- [ ] At least 5 minutes have passed since T5 (allow Log Analytics ingestion)
- [ ] Access to Azure Portal with Log Analytics workspace permissions
- [ ] Resource group name known (likely `rg-srelab-eastus2`)
- [ ] Log Analytics workspace name known (likely `log-srelab`)

---

## Step 1: Access Log Analytics Workspace

1. Open Azure Portal: https://portal.azure.com
2. Navigate to your resource group (e.g., `rg-srelab-eastus2`)
3. Locate the Log Analytics workspace resource (name: `log-srelab` or similar)
4. Click on the workspace to open it
5. In the left navigation, click **"Logs"** under the Monitoring section

---

## Step 2: Run Query 1 — scenario-oom-killed.kql

### Query Source
File: `docs/evidence/kql/stable/scenario-oom-killed.kql`

### Instructions
1. Copy the entire contents of `scenario-oom-killed.kql`
2. Paste into the Log Analytics query editor
3. Click **"Run"**
4. Wait for results to load (may take 10-30 seconds)

### Expected Results
- **If ingestion successful**: 1+ rows showing:
  - `Reason` = OOMKilled
  - `Service` = meter-service
  - `Namespace` = energy
  - `RestartCount` > 0 (likely 3)
  - Timestamp within the incident window (T1-T4)

- **If no results**: Document ingestion delay in run-notes. Wait 5 more minutes and retry.

### Export Results
1. Click **"Export"** button in the query results pane
2. Select **"Export to CSV"**
3. Save file as: `docs/evidence/wave1-live/oom-killed/kql-results/scenario-oom-killed.csv`

---

## Step 3: Run Query 2 — pod-lifecycle.kql

### Query Source
File: `docs/evidence/kql/stable/pod-lifecycle.kql`

### Instructions
1. Copy the entire contents of `pod-lifecycle.kql`
2. Paste into the Log Analytics query editor (clear previous query)
3. Click **"Run"**
4. Wait for results to load

### Expected Results
- **If ingestion successful**: Multiple rows showing:
  - `Name` containing `meter-service`
  - `CurrentStatus` showing pod status progression
  - `TotalRestarts` > 0 (likely 3)
  - `FailureReasons` including OOMKilled, CrashLoopBackOff, BackOff

- **If no results**: Document ingestion delay. OOMKilled events may take longer to appear in KubePodInventory.

### Export Results
1. Click **"Export"** → **"Export to CSV"**
2. Save file as: `docs/evidence/wave1-live/oom-killed/kql-results/pod-lifecycle.csv`

---

## Step 4: Run Query 3 — alert-history.kql

### Query Source
File: `docs/evidence/kql/stable/alert-history.kql`

### Instructions
1. Copy the entire contents of `alert-history.kql`
2. Paste into the Log Analytics query editor
3. **IMPORTANT**: Verify the query parameters:
   - `let TimeRange = 24h;` (covers incident window)
   - `let sre_scenario = "oom-killed";` (filters to OOMKilled scenario)
4. Click **"Run"**

### Expected Results
- **If alert fired**: 1+ rows showing:
  - `AlertName` = crashloop-oom (or similar)
  - `AlertState` = Fired or Resolved
  - `Scenarios` containing "oom-killed"
  - Timestamp within incident window

- **If no results**: This is expected if:
  - Alert is not yet configured
  - Activity Log export is not yet ingesting to Log Analytics
  - Alert rule does not match the incident pattern

### Export Results
1. Click **"Export"** → **"Export to CSV"**
2. Save file as: `docs/evidence/wave1-live/oom-killed/kql-results/alert-history.csv`

### If No Alert Results
Document in run-notes:
```
Alert Status: NO ALERT FIRED (or not yet ingested)
Possible reasons:
- Alert rule not yet configured for OOMKilled scenario
- Activity Log diagnostic export not yet active
- Ingestion delay (wait 10-15 minutes and retry)
- Alert threshold not met (RestartCount threshold may be higher than 3)
```

---

## Step 5: Verify CSV Exports

After exporting all 3 queries, verify files exist:

```bash
ls -la docs/evidence/wave1-live/oom-killed/kql-results/
```

Expected files:
- `scenario-oom-killed.csv`
- `pod-lifecycle.csv`
- `alert-history.csv`
- `README.md` (already created by Parker)

---

## Step 6: Redact Sensitive Data from CSV Files

**CRITICAL**: Before committing to Git, redact:

```bash
cd docs/evidence/wave1-live/oom-killed/kql-results/

# Redact subscription IDs
sed -i '' 's/[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}/<REDACTED_SUBSCRIPTION_ID>/g' *.csv

# Redact resource IDs
sed -i '' 's|/subscriptions/.*/resourceGroups/.*|<REDACTED_AKS_RESOURCE_ID>|g' *.csv

# Redact correlation IDs
sed -i '' 's/CorrelationId,[0-9a-f-]\{36\}/CorrelationId,<REDACTED_CORRELATION_ID>/g' *.csv
```

**Do NOT redact**: Pod names, namespace, event reasons, timestamps.

---

## Troubleshooting

### Issue: "No results found" for scenario-oom-killed.kql

**Symptoms**: Query returns 0 rows, but kubectl events showed OOMKilled

**Causes**:
1. **Ingestion delay**: Container Insights may take 2-10 minutes to ingest events
2. **Container Insights not enabled**: Verify with `az aks show -g <rg> -n <cluster> --query addonProfiles.omsagent.enabled`
3. **Time range mismatch**: Verify `TimeRange` parameter in query covers incident window

**Resolution**:
1. Wait 10 minutes and retry query
2. Verify Container Insights is enabled
3. Adjust `TimeRange` parameter to 1h or 2h and retry

---

### Issue: "Query timeout" or "Query too complex"

**Symptoms**: Query runs for >60 seconds and times out

**Causes**:
1. Large dataset (many pods, long time range)
2. Log Analytics workspace under load

**Resolution**:
1. Reduce `TimeRange` parameter to 30m or 1h
2. Add filter: `| where Name contains "meter-service"` early in query
3. Run query during off-peak hours

---

### Issue: "Access denied" or "Insufficient permissions"

**Symptoms**: Cannot run queries or access workspace

**Resolution**:
1. Verify you have "Log Analytics Reader" role on workspace
2. Verify you have "Reader" role on resource group
3. Contact admin to grant permissions

---

## Completion Checklist

- [ ] Waited 5+ minutes after T5 before running queries
- [ ] Ran scenario-oom-killed.kql successfully
- [ ] Exported scenario-oom-killed.csv
- [ ] Ran pod-lifecycle.kql successfully
- [ ] Exported pod-lifecycle.csv
- [ ] Ran alert-history.kql (results expected or documented as unavailable)
- [ ] Exported alert-history.csv (or documented "no alert fired")
- [ ] Redacted sensitive data from all CSV files
- [ ] Verified 3 CSV files exist in kql-results/ directory
- [ ] Documented any ingestion delays or issues in run-notes

---

## Next Steps

After completing KQL evidence collection:

1. Update `run-notes.md` with KQL evidence status (COMPLETE or PENDING)
2. Proceed to SRE Agent evidence collection (requires John)
3. Complete evidence redaction checklist
4. Finalize documentation and commit to Git

---

**Created**: 2026-04-26
**Last Updated**: 2026-04-26
**Status**: Ready for execution (wait 5 minutes after T5)
