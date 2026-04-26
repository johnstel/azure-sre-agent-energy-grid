# App and Dependency Telemetry Coverage

## Current finding

The Kubernetes workload uses external sample container images in `k8s/base/application.yaml`:

- `ghcr.io/azure-samples/aks-store-demo/order-service:latest` for `meter-service`
- `ghcr.io/azure-samples/aks-store-demo/product-service:latest` for `asset-service`
- `ghcr.io/azure-samples/aks-store-demo/makeline-service:latest` for `dispatch-service`
- `mongo:4.4`, `rabbitmq:3.11-management-alpine`, and `nginx:alpine`

This repo does not contain source code for those application services. Mission Control has source code, but it is out of customer scope for Wave 4 and was not modified.

## What is covered today

| Telemetry type | Current coverage | Evidence |
|----------------|------------------|----------|
| Kubernetes pod lifecycle | Covered through Container Insights/Kube tables and kubectl evidence | `docs/evidence/kql/stable/pod-lifecycle.kql` |
| Kubernetes events | Covered for OOM/CrashLoop style scenarios | `docs/evidence/kql/stable/scenario-oom-killed.kql` |
| Service selector/dependency root cause | Requires Kubernetes API/kubectl, not App Insights | Wave 2 kubectl evidence and runbooks |
| Alert rule metadata | Covered in Bicep custom properties | `infra/bicep/modules/alerts.bicep` |
| Alert firing history | Requires alert-management history script or explicit `NO_ALERT_FIRED` | Wave 2 evidence |

## What is not proven

- Application Insights `AppRequests` for the workload services is not validated in this pass.
- Application Insights dependency telemetry from `dispatch-service` to MongoDB is not proven.
- Distributed tracing across `meter-service`, RabbitMQ, `dispatch-service`, and MongoDB is not present in repo-owned source code.
- The `http-5xx` alert exists, but its usefulness depends on request telemetry being emitted into `AppRequests`.

## Precise implementation delta

To make app/dependency telemetry demo-grade without relying on external image internals:

1. Replace external sample service images with repo-owned service source or forked images.
2. Add OpenTelemetry or Azure Monitor Application Insights SDK instrumentation to:
   - HTTP server request spans/metrics for `meter-service`, `asset-service`, and `dispatch-service`.
   - dependency spans for RabbitMQ publish/consume and MongoDB writes.
   - custom dimensions from `docs/CAPABILITY-CONTRACTS.md`: `sre.scenario`, `sre.service`, `sre.namespace`, `sre.component`, `sre.version`.
3. Inject `APPLICATIONINSIGHTS_CONNECTION_STRING` or OpenTelemetry exporter settings through Kubernetes Secret/ConfigMap.
4. Add correlation IDs to request logs and message metadata.
5. Validate with real KQL output from `AppRequests`, `AppDependencies`, and trace tables before claiming coverage.

## Demo-safe statement

> "Wave 4 validates Kubernetes and scenario-level telemetry and documents the precise app/dependency telemetry delta. Full App Insights request/dependency coverage for workload containers is not yet proven."
