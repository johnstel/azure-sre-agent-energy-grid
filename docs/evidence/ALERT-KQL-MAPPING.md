# Alert-to-KQL Mapping

This document maps the Azure Monitor alerts in `infra/bicep/modules/alerts.bicep` to the reusable queries and manual checks used by the demo.

## Alert inventory

| Alert suffix | Severity | Signal | Primary scenarios |
|--------------|----------|--------|-------------------|
| `pod-restarts` | Sev 2 | Restart activity | OOMKilled, CrashLoop, ProbeFailure |
| `http-5xx` | Sev 1 | Application HTTP failures | MongoDBDown, CrashLoop, OOMKilled when telemetry is present |
| `pod-failures` | Sev 2 | Failed or pending pods | PendingPods, ImagePullBackOff, MissingConfig |
| `crashloop-oom` | Sev 1 | CrashLoopBackOff or OOMKilled events | OOMKilled, CrashLoop |

Alert rules include shared workload and scenario-correlation properties. The exact checked-in values are authoritative in `infra/bicep/modules/alerts.bicep`.

## Scenario mappings

### OOMKilled

- Primary alert: `crashloop-oom`
- Queries:
  - `kql/stable/scenario-oom-killed.kql`
  - `kql/stable/pod-lifecycle.kql`
- Confirm the container termination reason and configured memory limit before recommending a change.

### MongoDBDown

There is no dedicated guaranteed alert. The `http-5xx` alert may fire when application telemetry contains downstream failures.

Use:

- `kql/stable/scenario-mongodb-down.kql`
- `kql/stable/pod-lifecycle.kql`
- `kubectl get deployment mongodb -n energy`
- `kubectl get endpoints mongodb -n energy`

Scaling MongoDB to zero usually leaves no failed MongoDB pod, so pod-failure alerts alone are insufficient.

### ServiceMismatch

There is no dedicated reliable alert. Pods remain healthy while the Service selector no longer matches them.

Use:

- `kql/stable/scenario-service-mismatch.kql`
- `kubectl describe service meter-service -n energy`
- `kubectl get pods -n energy --show-labels`

The `KubeServices` table does not expose the selector comparison needed to prove the root cause; Kubernetes API inspection is required.

## Alert firing evidence

`kql/stable/alert-history.kql` reads alert-rule configuration activity, not firing events. Query firing history with:

```powershell
.\scripts\get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 2
```

Treat an absent alert as an absent signal, not as proof that a scenario did not occur.

## Query rules

- Parameterize time range, namespace, scenario, and service filters.
- Filter by a bounded time window.
- Document when KQL shows symptoms but cannot prove root cause.
- Keep raw exported results outside the repository until redacted and reviewed.
