# KQL Query Library

Parameterised KQL queries for Azure SRE Agent demo evidence and UAT verification. Each query follows the telemetry dimension contract defined in [`docs/CAPABILITY-CONTRACTS.md`](../../CAPABILITY-CONTRACTS.md) §1 and Security MF-3 requirements.

---

## Directory Structure (Security SR-2 Compliance)

Per Security Wave 1 SR-2, KQL queries are physically separated by schema stability:

```
kql/
├── stable/                     # Stable Azure Monitor schemas (Container Insights, Activity Log, Alerts)
│   ├── pod-lifecycle.kql
│   ├── alert-history.kql
│   ├── activity-log-rbac.kql
│   ├── scenario-oom-killed.kql
│   ├── scenario-mongodb-down.kql
│   └── scenario-service-mismatch.kql
└── schema-tbd/                 # Preview schemas subject to change (SRE Agent App Insights)
    └── sre-agent-telemetry.kql
```

**Rationale:** Stable queries reference Azure Monitor tables with documented, GA-stable schemas (KubePodInventory, AzureActivity, etc.). SCHEMA_TBD queries reference Azure SRE Agent Preview telemetry that may change before GA. Physical separation prevents accidental mixing of stable and unstable fields.

---

## Required Columns (Security MF-3 Compliance)

Every Wave 1 KQL query **must** project these columns in results:

| Column | Source | Purpose | Fallback if unavailable |
|--------|--------|---------|------------------------|
| `TimeBucket` | `bin(TimeGenerated, timeBin)` or `bin(timestamp, timeBin)` | Time-series trending, incident timeline correlation | N/A — always derivable from timestamp |
| `ResourceId` | `_ResourceId` (Container Insights) or `column_ifexists("_ResourceId", "")` | ARM resource correlation (AKS cluster, App Insights app) | Empty string `""` with comment explaining unavailability |
| `CorrelationId` | `CorrelationId` (Activity Log) or `operation_Id` (App Insights) or `column_ifexists("CorrelationId", "")` | Cross-query correlation, distributed tracing | Empty string `""` with comment (Container Insights events lack native CorrelationId) |

**Why these columns matter:**
- **TimeBucket**: Enables MTTR timeline queries (T0→T1→T2→T3→T4→T5) and trend analysis over time
- **ResourceId**: Links telemetry to specific ARM resources for scoped investigation
- **CorrelationId**: Joins Activity Log operations, App Insights traces, and alert firings into a single incident timeline

**Fallback pattern for missing fields:**
```kql
| extend
    ResourceId = column_ifexists("_ResourceId", ""),  // Not all tables have _ResourceId
    CorrelationId = column_ifexists("CorrelationId", "")  // Container Insights events lack CorrelationId
```

---

## Required Parameters (Security MF-3 Compliance)

Every Wave 1 KQL query **must** include these parameters at the top:

| Parameter | Type | Purpose | Typical Values |
|-----------|------|---------|---------------|
| `TimeRange` | timespan | Time window for query | `30m`, `1h`, `24h`, `7d` |
| `timeBin` | timespan | Time bucket granularity for trending | `1m`, `5m`, `15m`, `1h` |
| `sre_namespace` | string | Kubernetes namespace filter | `"energy"` |
| `sre_scenario` | string | Scenario ID filter (optional) | `"oom-killed"`, `""` (empty = all) |

**Parameter format:**
```kql
// ─────────────────────────────────────────────────────────────────────────────
// PARAMETERS — Modify before running
// ─────────────────────────────────────────────────────────────────────────────
let sre_namespace = "energy";  // Parameter: Namespace to query
let sre_scenario = "";         // Parameter: Scenario filter (optional, empty = all)
let TimeRange = 30m;           // Parameter: Time window
let timeBin = 5m;              // Parameter: Time bucket granularity
```

---

## Query Catalog

### Stable Queries (docs/evidence/kql/stable/)

| Query File | Purpose | Parameters | Schema Source | Required Columns |
|------------|---------|------------|---------------|------------------|
| `pod-lifecycle.kql` | Track pod state transitions, restarts, OOMKilled events | `sre_namespace`, `sre_scenario`, `TimeRange`, `timeBin` | KubePodInventory, KubeEvents | TimeBucket, ResourceId, CorrelationId |
| `alert-history.kql` | Query alert rule configuration changes (create/update/delete) — NOT firing events | `TimeRange`, `timeBin` | AzureActivity | TimeBucket, ResourceId, CorrelationId |
| `activity-log-rbac.kql` | Audit ARM operations, RBAC role assignments | `TimeRange`, `timeBin` | AzureActivity | TimeBucket, ResourceId, CorrelationId |
| `scenario-oom-killed.kql` | Verify OOMKilled scenario detection | `sre_scenario`, `sre_namespace`, `sre_service`, `TimeRange`, `timeBin` | KubeEvents, KubePodInventory | TimeBucket, ResourceId, CorrelationId |
| `scenario-mongodb-down.kql` | Verify MongoDB outage and cascading failure detection | `sre_scenario`, `sre_namespace`, `sre_component`, `TimeRange`, `timeBin` | KubePodInventory, KubeServices, KubeEvents | TimeBucket, ResourceId, CorrelationId |
| `scenario-service-mismatch.kql` | Capture symptom evidence for service selector mismatch (silent failure) | `sre_scenario`, `sre_namespace`, `sre_service`, `TimeRange`, `timeBin` | KubePodInventory, KubeServices | TimeBucket, ResourceId, CorrelationId |

### SCHEMA_TBD Queries (docs/evidence/kql/schema-tbd/)

| Query File | Purpose | Parameters | Schema Source | Required Columns |
|------------|---------|------------|---------------|------------------|
| `sre-agent-telemetry.kql` | Query SRE Agent App Insights telemetry (SCHEMA_TBD) | `TimeRange`, `timeBin` | traces, dependencies (SCHEMA_TBD) | TimeBucket, ResourceId, CorrelationId |

**SCHEMA_TBD Warning:** Queries in `schema-tbd/` reference Azure SRE Agent Preview telemetry fields that may change before GA. All field names are tagged with `// SCHEMA_TBD` comments. Do not reference these fields in stable queries.

---

## Alert Firing Event Limitations (Wave 1)

**Known Limitation:** `alert-history.kql` queries alert rule **configuration changes** (create/update/delete), NOT alert **firing events**.

**Root Cause:** Azure Monitor alert firing events are not exposed in Activity Log. The "Alert" category in Activity Log captures alert rule configuration changes only.

**Workarounds for Alert Firing Events:**

1. **Azure Resource Graph** (recommended for Wave 1 UAT):
   ```bash
   az graph query -q "alertsmanagementresources | where type == 'microsoft.alertsmanagement/alerts' | where properties.essentials.startDateTime >= ago(24h) | project firedTime=properties.essentials.startDateTime, alertName=properties.essentials.alertRule, severity=properties.essentials.severity"
   ```

2. **Azure Portal** → Alerts → Alert History (manual inspection)

3. **Action Group Notifications** — webhook payloads, email logs (if configured)

**Wave 2 Recommendation:** Configure alert diagnostic settings to send firing events to `AlertEvidence` table in Log Analytics. Requires updating `infra/bicep/modules/alerts.bicep` to add diagnostic settings to each alert rule.

See: `.squad/decisions/inbox/ripley-kql-alert-history-table-fix.md` for detailed investigation.

---

## Wave 2 Alert Firing Evidence (Azure Resource Graph)

**Implemented:** Wave 2.0
**Status:** Low-risk CLI approach (no Bicep changes)
**Decision:** `.squad/decisions/inbox/ripley-wave2-alert-firing.md`

### Approach

Use `az graph query` to retrieve alert firing history from `AlertsManagementResources` provider. No infrastructure changes required.

### Helper Script

**File**: `scripts/get-alert-firing-history.ps1`

**Usage**:
```bash
# Query last 2 hours, output to console
./scripts/get-alert-firing-history.ps1 -Hours 2

# Save to file for Wave 2 gate evidence
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/alert-firing-history.json

# Filter to specific resource group
./scripts/get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 1
```

### Evidence Requirements

**Wave 2 Gate Criteria**:
- Alert name matches deployed rule (e.g., `alert-gridmon-dev-crashloop-oom`)
- Alert fired within 2 minutes of scenario deployment (T0 to T2)
- Evidence persists after `kubectl delete -f k8s/scenarios/oom-killed.yaml`
- At least 1 firing event for OOMKilled scenario
- JSON output saved to `docs/evidence/wave2-live/alert-firing-history.json`

### Future Enhancement (Wave 2.1+)

**Optional**: Alert diagnostic settings to send firing events to `AlertEvidence` table for KQL-based correlation with KubeEvents/AppInsights. See `docs/evidence/wave2-alert-firing-evidence-plan.md` for implementation plan.

**Trigger Conditions** (implement only if needed):
- Azure Resource Graph insufficient for customer demos
- KQL correlation with telemetry required for SRE Agent diagnostics
- Alert retention beyond 30 days needed
- Wave 3+ runbook automation requires KQL queries

---

## Usage

### Running queries in Azure Portal

1. Navigate to your Log Analytics workspace in Azure Portal
2. Select **Logs** from the left menu
3. Copy the entire `.kql` file content into the query editor
4. Modify parameter values at the top of the query (e.g., `let sre_namespace = "energy";`)
5. Click **Run** to execute
6. Verify results include `TimeBucket`, `ResourceId`, `CorrelationId` columns (per Security MF-3)

### Running queries with Azure CLI

```bash
# Get workspace ID
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group <rg-name> \
  --workspace-name <workspace-name> \
  --query customerId -o tsv)

# Run query from file
az monitor log-analytics query \
  --workspace "$WORKSPACE_ID" \
  --analytics-query @docs/evidence/kql/stable/pod-lifecycle.kql \
  --timespan P1D
```

### Parameter modification

All queries use `let` statements for parameters at the top of the file:

```kql
let sre_namespace = "energy";  // Change to your namespace
let TimeRange = 30m;           // Change to 1h, 24h, 7d, etc.
let timeBin = 5m;              // Change to 1m, 15m, 1h, etc.
let sre_scenario = "oom-killed";  // Optional scenario filter
```

Modify these values before running the query. Do NOT hardcode scenario names in the query body — always use parameters per the telemetry dimension contract (§1).

---

## Preview Caveats & Prerequisites

### Wave 1 Prerequisites

Several queries require Wave 1 infrastructure that is now **defined in Bicep** but still requires live deployment validation:

| Query | Prerequisite | Bicep status | Live validation status |
|-------|-------------|--------------|------------------------|
| `alert-history.kql` | Activity Log diagnostic export to Log Analytics | Defined via `activity-log-diagnostics.bicep` | Pending deployment/UAT |
| `alert-history.kql` | Alerts deployed (`deployAlerts = true`) | Enabled in `main.bicep` and `main.bicepparam` | Pending deployment/UAT |
| `activity-log-rbac.kql` | Activity Log diagnostic export | Defined via `activity-log-diagnostics.bicep` | Pending deployment/UAT |
| `sre-agent-telemetry.kql` | SRE Agent deployed with App Insights | Defined in Bicep | Pending Preview schema verification |

**Expected behavior during Wave 1 UAT:**
- Queries will **parse successfully** but may **return no results** until prerequisites are deployed
- This is expected and documented in each query file
- UAT checklist includes "verify query syntax" as a separate step from "verify query returns data"

### SCHEMA_TBD — Preview Telemetry Warning

Queries in `docs/evidence/kql/schema-tbd/` reference **SRE Agent App Insights telemetry** and are tagged with `// SCHEMA_TBD` comments per [`CAPABILITY-CONTRACTS.md`](../../CAPABILITY-CONTRACTS.md) §8 and Security SR-2.

**What this means:**
- Azure SRE Agent is in **Public Preview** (`2025-05-01-preview` API)
- App Insights telemetry fields (custom dimensions, trace formats) **may change** before GA
- Queries marked `SCHEMA_TBD` require field name verification after deployment
- **Physical separation**: SCHEMA_TBD queries live in `schema-tbd/` directory, stable queries in `stable/` directory

**Affected queries:**
- `schema-tbd/sre-agent-telemetry.kql` — All SRE Agent telemetry fields are SCHEMA_TBD

**Verification procedure (Wave 1 UAT):**
1. Deploy infrastructure with `deploySreAgent = true`
2. Trigger a test SRE Agent conversation in the portal
3. Wait 2-5 minutes for telemetry ingestion
4. Run `schema-tbd/sre-agent-telemetry.kql` in Log Analytics
5. **Document observed field names** in this README:
   - API version: `2025-05-01-preview`
   - Date observed: `YYYY-MM-DD`
   - Field name: `customDimensions["actual.field.name"]`
   - Purpose: what the field represents
6. Update query if field names differ from expected
7. Keep `// SCHEMA_TBD` comments until GA schema is confirmed

### Data Retention & Evidence Gaps

| Source | Retention | KQL Queryable | Evidence Gap |
|--------|-----------|---------------|--------------|
| Log Analytics (Container Insights) | 90 days configured in Bicep | ✅ Yes | Live deployment validation pending |
| App Insights (SRE Agent telemetry) | 90 days | ✅ Yes | Sufficient |
| Activity Log | 90 days platform retention; export configured in Bicep | ✅ After diagnostic setting deployment | Live export validation pending |
| SRE Agent conversations | Unknown (Preview) | Unknown | Microsoft Preview data handling TBD |

**Wave 1 implementation:** Log Analytics retention is configured to 90 days and Activity Log export is defined in Bicep. UAT must still verify the deployed workspace retention and that Activity Log records arrive in Log Analytics. See [`CAPABILITY-CONTRACTS.md`](../../CAPABILITY-CONTRACTS.md) §11.

---

## Observed SRE Agent Telemetry Fields (SCHEMA_TBD)

This section will be populated during Wave 1 UAT after SRE Agent is deployed and telemetry is verified.

**Template for documenting observed fields:**

```markdown
### Observed on: YYYY-MM-DD
### API Version: 2025-05-01-preview
### Observed by: [Name]

| Field Name | Location | Type | Purpose | Status |
|------------|----------|------|---------|--------|
| `customDimensions["sre.agent.conversationId"]` | traces | string | Unique conversation session ID | SCHEMA_TBD |
| `customDimensions["sre.agent.action"]` | traces | string | Proposed remediation action | SCHEMA_TBD |
| ... | ... | ... | ... | ... |
```

**Instructions:**
1. After deploying SRE Agent, trigger a test conversation
2. Query App Insights: `traces | where cloud_RoleName contains "sre-agent" | take 10`
3. Inspect `customDimensions` column
4. Document observed fields above
5. Update `schema-tbd/sre-agent-telemetry.kql` if field names differ

---

## Known Limitations

1. **Activity Log export requires deployment validation** — `alert-history.kql` and `activity-log-rbac.kql` will return no results until the diagnostic setting is deployed and Activity Log records have ingested.
   - **Workaround:** Use Azure Portal > Activity Log (90-day retention, but not KQL queryable) or `az monitor activity-log list` Azure CLI command.

2. **Alerts require deployment and a firing scenario** — Alert history queries will return no results until alerts are deployed and a breakable scenario triggers one of the four Wave 1 alerts.
   - **Workaround:** Confirm `deployAlerts = true`, redeploy, then inject a scenario that maps to an existing Wave 1 alert.

3. **SRE Agent telemetry schema is opaque** — Field names in `schema-tbd/sre-agent-telemetry.kql` are **educated guesses** based on typical App Insights patterns. Actual field names must be verified post-deployment.
   - **Workaround:** Run exploratory query after deployment to discover actual schema.

4. **Retention configuration requires live verification** — Bicep configures Log Analytics retention to 90 days, but UAT must verify the deployed workspace setting.
   - **Validation:** Check the workspace retention after deployment and include the result in Wave 1 evidence.

5. **SRE Agent conversation retention unknown** — Microsoft Preview service data retention policy is not documented.
   - **Mitigation:** Capture screenshots and KQL output immediately after demo runs.

6. **CorrelationId may be empty** — Container Insights events (KubeEvents, KubePodInventory) do not have native CorrelationId fields. Queries use `column_ifexists("CorrelationId", "")` to satisfy Security MF-3 without failing.
   - **Impact:** Cross-query correlation limited to Activity Log ↔ App Insights; K8s events cannot be joined via CorrelationId.

---

## Troubleshooting

### Query returns no results

**Possible causes:**
1. **Prerequisites not deployed** — Check Wave 1 prerequisites table above
2. **Telemetry ingestion delay** — Wait 2-10 minutes after event occurrence
3. **Incorrect parameters** — Verify `sre_namespace`, `sre_scenario`, `TimeRange` values
4. **Container Insights not enabled** — Verify with `az aks show -g <rg> -n <cluster> --query addonProfiles.omsagent.enabled`

**Debug steps:**
1. Verify workspace connection: `az monitor log-analytics workspace show --resource-group <rg> --workspace-name <workspace>`
2. Run simple test query: `Heartbeat | take 10` (should always return results)
3. Check Container Insights data: `KubePodInventory | take 10` (should return data if AKS is monitored)
4. Verify scenario is injected: `kubectl get pods -n energy`

### Query is missing TimeBucket, ResourceId, or CorrelationId columns

**Cause:** Query does not comply with Security MF-3 requirements.

**Fix:** All Wave 1 queries **must** project these columns. Use fallback patterns:
```kql
| extend
    TimeBucket = bin(TimeGenerated, timeBin),  // Always derivable from timestamp
    ResourceId = column_ifexists("_ResourceId", ""),  // Fallback to empty string
    CorrelationId = column_ifexists("CorrelationId", "")  // Fallback to empty string
```

### SCHEMA_TBD query fails

**Possible causes:**
1. **SRE Agent telemetry field names changed** — Update field names in query
2. **SRE Agent not emitting telemetry** — Check App Insights connection in `sre-agent.bicep`
3. **App Insights sampling** — High-volume telemetry may be sampled

**Debug steps:**
1. Query all traces: `traces | where timestamp > ago(1h) | take 100`
2. Filter by cloud role: `traces | where cloud_RoleName != "" | distinct cloud_RoleName`
3. Inspect custom dimensions: `traces | where customDimensions != "" | project timestamp, customDimensions | take 10`
4. Document observed field names in "Observed SRE Agent Telemetry Fields" section above

---

## Version History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-04-26 | 1.1 | Security MF-3 fixes — Added TimeBucket/ResourceId/CorrelationId to all queries, physical separation (stable/ vs schema-tbd/), required parameters documentation | Lambert (QA/Docs) |
| 2026-04-26 | 1.0 | Wave 1 — Added 7 parameterised queries, usage docs, Preview caveats | Lambert (QA/Docs) |
| 2026-04-25 | 0.1 | Wave 0 — Placeholder README | Lambert (QA/Docs) |
