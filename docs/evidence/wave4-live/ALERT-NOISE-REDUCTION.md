# Alert Noise Reduction and Grouping Narrative

## Existing baseline alerts

Wave 4 does not add or claim new alerts. The only baseline scheduled query alerts are defined in `infra/bicep/modules/alerts.bicep`:

| Alert slug | Signal | Noise-reduction role |
|------------|--------|----------------------|
| `pod-restarts` | `ContainerRestartCount > 0` | Broad symptom signal for restarts |
| `http-5xx` | `AppRequests` result code >= 500 | Application symptom signal; depends on app request telemetry |
| `pod-failures` | Pod status `Failed` or `Pending` | Broad startup/scheduling symptom signal |
| `crashloop-oom` | Kubernetes events `BackOff`, `OOMKilled`, `CrashLoopBackOff` | More specific crash/OOM symptom signal |

## Grouping strategy

The demo narrative should group alerts by shared dimensions and root-cause category:

- `sre.namespace=energy`
- `alert.scenarios`
- `sre.root-cause-category`
- affected service/component from scenario metadata
- runbook ID from scenario metadata or annotations

This supports a single incident narrative rather than separate pages for every symptom.

## Scenario grouping examples

| Scenario | Potential symptom alerts | Root-cause grouping |
|----------|--------------------------|---------------------|
| `oom-killed` | `crashloop-oom`, `pod-restarts` | One `resource-exhaustion` incident for `meter-service` |
| `crash-loop` | `crashloop-oom`, `pod-restarts` | One `configuration` incident for `asset-service` |
| `mongodb-down` | `pod-restarts`, maybe `crashloop-oom`, maybe `http-5xx` if app telemetry exists | One `dependency` incident rooted at `mongodb` |
| `network-block` | Maybe `http-5xx` if request telemetry exists; pod alerts may stay quiet | One `networking` incident for `meter-service` |
| `service-mismatch` | Expected `NO_ALERT_FIRED` for pod-health alerts | One `configuration` incident found by configuration inspection, not alert firing |

## Noise reduction principle

Symptoms are useful detection signals, but the operator should page or track the root-cause incident once identified. For MongoDBDown, do not open separate incidents for dispatch crashes, meter backlog, and MongoDB absence when the dependency chain points to MongoDB scaled to zero.

## Current limitation

No alert processing rule, action-group suppression rule, or incident-management grouping resource is added in this pass. The evidence is a documented grouping narrative plus custom properties already present in the baseline alert module. This is intentional to avoid overclaiming and avoid runtime risk before the demo.
