# KQL Query Library

Reusable Log Analytics queries for the Energy Grid demo. The checked-in queries use documented Azure Monitor schemas and follow the telemetry conventions in [Capability Contracts](../../CAPABILITY-CONTRACTS.md).

## Query catalog

| Query | Purpose | Primary tables |
|-------|---------|----------------|
| `stable/pod-lifecycle.kql` | Pod state, restart, and termination history | `KubePodInventory`, `KubeEvents` |
| `stable/alert-history.kql` | Alert-rule configuration changes, not alert firing history | `AzureActivity` |
| `stable/activity-log-rbac.kql` | ARM and role-assignment activity | `AzureActivity` |
| `stable/scenario-oom-killed.kql` | OOMKilled scenario evidence | `KubeEvents`, `KubePodInventory` |
| `stable/scenario-mongodb-down.kql` | MongoDB outage and dependency evidence | `KubePodInventory`, `KubeServices`, `KubeEvents` |
| `stable/scenario-service-mismatch.kql` | Service selector mismatch symptoms | `KubePodInventory`, `KubeServices` |
| `stable/slo-meter-ingest.kql` | Demo meter-ingest success, latency, freshness, and no-data state | `AppRequests` |

## Required parameters and output

Queries declare their configurable values with `let` statements near the top of each file. Common parameters include:

- `TimeRange`
- `timeBin`
- `sre_namespace`
- `sre_scenario`

Where the source table supports them, queries project:

- `TimeBucket`
- `ResourceId`
- `CorrelationId`

Empty correlation or resource identifiers are expected for Azure Monitor tables that do not expose those fields.

## Running a query

In the Azure portal, open the lab's Log Analytics workspace, select **Logs**, paste the query, adjust its parameters, and run it.

With Azure CLI:

```bash
WORKSPACE_ID=$(az monitor log-analytics workspace show \
  --resource-group <resource-group> \
  --workspace-name <workspace-name> \
  --query customerId -o tsv)

az monitor log-analytics query \
  --workspace "$WORKSPACE_ID" \
  --analytics-query @docs/evidence/kql/stable/pod-lifecycle.kql \
  --timespan P1D
```

## Alert firing history

`alert-history.kql` reads alert-rule configuration activity. It does **not** prove that an alert fired. Use the repository helper for firing history:

```powershell
.\scripts\get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 2
```

Save raw JSON outside the repository unless it has been redacted and is broadly reusable.

## Validation and safety

- Run `scripts/validate-alert-queries.ps1` after changing alert KQL.
- Treat an empty result as no matching data in the selected window, not as proof that a component is healthy.
- Do not add undocumented SRE Agent telemetry fields to the stable query set.
- Redact exported results before sharing or committing them.
