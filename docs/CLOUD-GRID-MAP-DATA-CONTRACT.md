# Cloud Grid Map data contract

This document closes the placement and data-contract gate for the Interactive Grid Map. The grid map belongs in the deployed cloud demo, not in local Mission Control.

## Placement decision

| Decision | Value |
|---|---|
| Host | `ops-console` |
| Reason | `ops-console` is already the deployed Grid Operations Console and is the operator-facing cloud demo surface. |
| Non-host | `grid-dashboard` remains the consumer portal for usage, billing, outage-map, and service-health storytelling. |
| Not in scope | Local Mission Control UI and local Mission Control APIs are not runtime dependencies for the cloud grid map. |

The selected host is the `ops-console` nginx-served ConfigMap and Service in `k8s/base/application.yaml`.

## V1 data contract

V1 uses existing in-cluster HTTP health proxies exposed by `ops-console`:

| Node | Source | Healthy when | Notes |
|---|---|---|---|
| `asset-service` | `GET /api/assets/health` | HTTP 2xx | Proxied by `ops-console` nginx to `asset-service.energy.svc.cluster.local:3002`. |
| `meter-service` | `GET /api/meter/health` | HTTP 2xx | Proxied by `ops-console` nginx to `meter-service.energy.svc.cluster.local:3000`. |
| `dispatch-service` | `GET /api/dispatch/health` | HTTP 2xx | Proxied by `ops-console` nginx to `dispatch-service.energy.svc.cluster.local:3001`. |
| `mongodb` | Static `in-cluster` | Rendered as static/in-cluster in V1 | No browser-safe direct health endpoint exists today. |
| `rabbitmq` | Static `in-cluster` | Rendered as static/in-cluster in V1 | No browser-safe direct health endpoint exists today. |
| `grid-dashboard` | Static `in-cluster` | Rendered as static/in-cluster in V1 | Existing LoadBalancer service is separate from the selected host. |
| `ops-console` | Static `in-cluster` | Rendered as static/in-cluster in V1 | The current page proves the host is serving. |
| `load-simulator` | Static `in-cluster` | Rendered as static/in-cluster in V1 | No browser-safe health endpoint exists today. |
| `grid-worker` | Static `disabled` | Rendered as disabled/unknown in V1 | `application.yaml` sets `replicas: 0` because of an AMQP protocol mismatch. |
| `forecast-service` | Optional absent | Rendered as `unknown` if included | `application.yaml` documents it as optional and it is not deployed today. |

## Severity mapping

| Input | Grid map severity |
|---|---|
| HTTP 2xx from a live health endpoint | `healthy` |
| Timeout or network error from a live health endpoint | `critical` |
| HTTP 5xx from a live health endpoint | `critical` |
| HTTP 4xx from a live health endpoint | `warning` |
| Static in-cluster node without a browser-safe endpoint | `unknown` or neutral static state, as chosen by renderer issue |
| Optional absent node | `unknown` with explicit optional/absent label |

Edge severity derives from endpoint severity using the approved visual rule `healthy < warning < critical`. `unknown` is separate and non-propagating: if either endpoint is `unknown` and neither endpoint is `warning` or `critical`, render the edge as unknown/gray/dashed. Do not treat `unknown` as worse than `critical` or as causal impact. Edge severity is only a visual impact cue and must not be described as root cause.

## Static topology source

The reusable topology config is `k8s/base/grid-map-topology.json`.

It is reconciled with `k8s/base/application.yaml`:

- Deployments: `rabbitmq`, `mongodb`, `asset-service`, `meter-service`, `dispatch-service`, `grid-dashboard`, `ops-console`, `load-simulator`, `grid-worker`.
- Optional documented service: `forecast-service`.
- Services and proxy paths are taken from the `grid-dashboard` and `ops-console` nginx ConfigMaps in `application.yaml`.
- Runtime dependencies are taken from service URLs and environment variables in `application.yaml`, including `asset-service` to optional `forecast-service`, `load-simulator` to `meter-service`, and disabled `grid-worker` to `dispatch-service`.

If `application.yaml` adds, removes, or renames a service, update `grid-map-topology.json` in the same pull request.

## Explicit exclusions

V1 must not use:

- local Mission Control APIs such as `/api/inventory`, `/api/events`, `/api/pods/:name/logs`, or `/api/services/:name/endpoints`;
- arbitrary Kubernetes API access from browser JavaScript;
- pod logs, Kubernetes events, or endpoint details unless a future governed read-only in-cluster status endpoint is added;
- write, exec, shell, secret, scale, patch, restart, or remediation actions;
- any direct Azure SRE Agent chat/action API.

## Safe-language requirement

Required disclaimer:

> Demo topology only. This map visualizes Kubernetes service/application health for the Azure SRE Agent demo and is not connected to real grid telemetry, SCADA, GIS, or utility infrastructure.

The map may say that an application health endpoint is unreachable. It must not claim a real power outage, real grid telemetry, autonomous remediation, or Azure SRE Agent diagnosis unless separate portal evidence is captured.
