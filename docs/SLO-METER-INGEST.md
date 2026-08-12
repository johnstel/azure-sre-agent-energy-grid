# Demo Customer-Impact SLO: Meter Ingest

> **Status:** Implemented in source and IaC; live telemetry and alert evidence are still required.
>
> **Scope:** `slo-meter-ingest` is an accelerated **demo simulation**, not a production SLO or SLA.

This contract makes one customer journey observable without treating pod readiness as proof that meter readings can be persisted:

```text
synthetic CronJob -> meter-service -> RabbitMQ -> dispatch-service -> MongoDB
                                                           |
                                               GET /transactions/{correlationId}
```

The transaction is successful only when `dispatch-service` returns persisted completion metadata for the same correlation ID. A `202 Accepted` response from `meter-service`, running pods, or a ready Service alone is not success.

## Safe Golden Transaction

`synthetic-meter-ingest-probe` runs every two minutes in the `energy` namespace. It uses the meter-service image only to invoke the repository-owned Node runner; it receives no Kubernetes write permissions.

| Control | Contract |
|---|---|
| Correlation | One generated `synthetic-...` correlation ID is reused for every ingress retry and persistence poll in a run. |
| Ingress | The runner sends a normal `POST /events` request to `meter-service`; the normal RabbitMQ and dispatch path handles it. |
| Completion | The runner polls `GET /transactions/{correlationId}` on `dispatch-service`. A `200` is the only successful functional completion. |
| Bounds | Default total timeout: 30 seconds; request timeout: 2 seconds; maximum ingress retries: 3; polling interval: 250 ms. The CronJob has `activeDeadlineSeconds: 45`, `backoffLimit: 0`, and `concurrencyPolicy: Forbid`. |
| Test-data isolation | The event is tagged `synthetic: true`, `syntheticName: slo-meter-ingest`, and `syntheticMode: demo`, uses `SM-SYNTHETIC-0001`, and clamps the reading to `0.01` through `0.1`. |
| Duplicate safety | MongoDB enforces a partial unique index on synthetic `correlationId` values. A retry is idempotent only when it is the same event ID and synthetic identity; a conflicting duplicate is acknowledged rather than requeued forever. |
| Cleanup | Synthetic documents receive an `expiresAt` timestamp. The MongoDB TTL index removes them after expiry; TTL cleanup is asynchronous, so five minutes is a retention intent, not an exact deletion deadline. Normal meter readings receive no expiry metadata. |
| Readback safety | The completion endpoint returns only correlation ID, completion status, persistence timestamp, and synthetic flag. It never returns the meter reading. |
| Image delivery | `scripts/deploy.ps1` builds repository-owned images with the current commit tag, then updates meter-service, dispatch-service, and the CronJob to that immutable tag so the probe does not run against a cached `latest` image. |
| Telemetry delivery | Before the short-lived runner exits, it shuts down the Azure Monitor OpenTelemetry Distro so its batch processor flushes the root span. A flush failure makes the Job fail; absent telemetry still renders as no-data, never healthy. |

The CronJob's bounded job history and `ttlSecondsAfterFinished` also prevent Kubernetes Job objects from growing without limit.

## Telemetry Contract

Each runner invocation creates one OpenTelemetry `SERVER` span named `slo.meter-ingest.transaction`. Azure Monitor maps the validated root-span shape to workspace-based Application Insights `AppRequests`, where the first-class fields below support raw-run calculations.

| Field | Value or source |
|---|---|
| `Name` | `slo.meter-ingest.transaction` |
| `Success` | OpenTelemetry span status |
| `DurationMs` | End-to-end runner duration, including bounded polling |
| `TimeGenerated` | Synthetic transaction start time |
| `Properties["synthetic.name"]` | `slo-meter-ingest` |
| `Properties["synthetic.mode"]` | `demo` |
| `Properties["synthetic.correlation_id"]` | Per-run correlation ID |
| `Properties["synthetic.failure_stage"]` | `ingress`, `persistence`, or `success` |
| `Properties["synthetic.failure_reason"]` | Detail such as `persistence_confirmation_timeout`, `persistence_http_500`, `persistence_timeout`, or `persistence_request_error` |

The implementation retains existing `sre.*` resource attributes. It deliberately does **not** use custom metric histograms as the p95 source: Azure Monitor flattens OpenTelemetry histogram aggregates, so an AppMetrics percentile would not be the percentile of individual transactions. Use raw `AppRequests.DurationMs` records instead.

Official references:

- [Add custom spans with Azure Monitor OpenTelemetry](https://learn.microsoft.com/azure/azure-monitor/app/opentelemetry-add-modify?tabs=nodejs#add-custom-spans)
- [AppRequests table schema](https://learn.microsoft.com/azure/azure-monitor/reference/tables/apprequests)
- [Kusto percentile aggregation](https://learn.microsoft.com/kusto/query/percentiles-aggregation-function?view=azure-monitor)

The canonical evidence query is [`docs/evidence/kql/stable/slo-meter-ingest.kql`](evidence/kql/stable/slo-meter-ingest.kql).

## `slo-meter-ingest` Semantics

| Measure | Demo evaluation | Target | Meaning |
|---|---|---|---|
| Success rate | Unique correlation IDs over rolling 10 minutes | `>= 95%` | A transaction counts only after persistence confirmation. |
| End-to-end p95 | `percentile(DurationMs, 95)` over those unique runs | `<= 30 seconds` | Includes ingress, queueing, dispatch, and persistence polling. |
| Freshness | `now() - max(TimeGenerated where Success)` | `<= 5 minutes` | The two-minute schedule should leave room for normal execution and ingestion delay. |
| Error budget | `5%` of unique transactions over 10 minutes | Burn rate `failure ratio / 0.05` | `1` consumes the demo error budget at its planned rate. |

The Bicep rules expose five signals:

| Logical alert | Meaning |
|---|---|
| `slo-meter-ingest-burn` | Unique-run success rate is below the 95% demo target. |
| `slo-meter-ingest-customer-impact` | Actual runs all failed or the last successful run is older than five minutes. |
| `slo-meter-ingest-mongodb-down` | Any post-ingress `persistence` confirmation failure maps to MongoDBDown; `synthetic.failure_reason` distinguishes timeout, HTTP, and network detail. It does not auto-mitigate without functional recovery evidence. |
| `slo-meter-ingest-service-mismatch` | `ingress` failures map to ServiceMismatch; it does not auto-mitigate without functional recovery evidence. |
| `slo-meter-ingest-no-data` | No transaction telemetry in 10 minutes; warning/unknown, never healthy. |

These are Azure Monitor alert rules only. They do not automatically invoke Azure SRE Agent.

### Status and no-data policy

| State | Condition | Presenter language |
|---|---|---|
| `healthy` | Actual telemetry exists, all targets are met, and no scenario-impact evidence is present. | "The demo probe has recently completed the meter-ingest path." |
| `degraded` | Actual runs include some success, but the success-rate, latency, or recovery criteria are not met. | "The journey is degraded according to the demo probe." |
| `critical` | Actual runs all fail, the last success is stale, a latest `persistence` or `ingress` failure has no later success, or MongoDBDown/ServiceMismatch has conclusive Kubernetes evidence. | "The synthetic meter-ingest journey cannot currently be confirmed." |
| `no-data` | The query completed but found no synthetic run in its window. | "No probe telemetry is present; this is not a healthy result." |
| `unknown` | The query, identity, workspace, or Kubernetes evidence source was unavailable. | "The evidence source is unavailable; do not infer health." |

Mission Control renders these states separately. After a failure, pod readiness or scenario removal cannot turn the state healthy; a newer successful functional transaction is required.

## Scenario Expectations

| Scenario | Expected functional result | Customer-impact state |
|---|---|---|
| Healthy baseline | A unique transaction reaches MongoDB and the readback endpoint returns `200`. | `healthy` when the demo targets are met. |
| MongoDBDown | Meter ingress can be accepted, but dispatch cannot persist before the deadline. | `critical`, affected stage: MongoDB persistence. |
| ServiceMismatch | Meter-service ingress is unreachable because its Service has no endpoints, even if pods are ready. | `critical`, affected stage: meter-service routing. |
| Recovery | A post-repair synthetic transaction is persisted and observed in telemetry. | May return to `healthy` only after the actual run meets the windowed criteria. |

## Production Recommendation Boundary

Do not transplant these accelerated windows, traffic shape, or target into production. A production SLO must be owned by the product and operations teams and should define real customer populations, expected demand, authenticated probe policy, data classification, durable retention, error-budget policy, alert routing, and a statistically meaningful review period. This lab makes no availability, revenue, customer-count, energy-not-served, or MTTR-improvement claim.

## Code Scanning Disposition

The MongoDB completion lookup accepts a correlation ID only after strict allowlist validation and constructs a fixed `bson.D` filter with literal `correlationId` and `synthetic` keys. It never decodes request data into a BSON query, permits a caller-selected operator, or interpolates a database query string.

GitHub CodeQL rule `go/sql-injection` currently treats a scalar value in this Go MongoDB filter as a query-taint sink, even though the filter structure is fixed. The repository records this as a narrow false positive in code-scanning alert #5 rather than disabling the rule globally. The inline source comment identifies the fixed-filter constraint; future changes must preserve that constraint and reopen the finding if the query becomes structure-controlled by input.

## Live Proof Gate

Source and static validation are not live proof. Before presenting this as an observed customer-impact signal, capture all of the following from the target demo environment:

1. A healthy trace and `AppRequests` record with the documented name, properties, `Success`, and `DurationMs`.
2. One failed MongoDBDown transaction and one failed ServiceMismatch transaction, each with the same correlation ID visible through the expected path.
3. Grafana screenshots for healthy, degraded or critical, recovered, and no-data states.
4. Alert state timestamps for the relevant SLO rule and the no-data distinction.
5. A post-repair successful transaction proving functional recovery.

Until that evidence exists, use the safe description: **"The repository defines and tests the demo SLO path; live telemetry proof is pending."**
