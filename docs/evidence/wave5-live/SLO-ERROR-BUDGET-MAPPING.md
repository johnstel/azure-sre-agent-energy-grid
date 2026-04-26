# SLO and Error-Budget Mapping

**Scope**: Demo scenario mapping only
**Status**: Mapping complete; no real production SLO burn claimed
**Safe-language requirement**: Do not claim real production error-budget consumption unless production SLI data exists.

---

## How to read this mapping

The scenario manifest contains SLO impact metadata such as `availability` and `latency`. Wave 5 maps those scenario intents to an enterprise reliability narrative.

This mapping answers:

- Which user-facing reliability dimension would this scenario threaten?
- Which SLI would an enterprise team likely monitor?
- What error-budget conversation would the scenario trigger?

It does **not** prove:

- real customer traffic impact,
- production SLO burn,
- production error-budget consumption,
- App Insights request/dependency telemetry coverage for the workload services.

---

## Scenario-to-SLO mapping

| Scenario | Manifest SLO impact | Manifest target | Likely user-facing impact | Example SLI to use in production | Evidence status |
|----------|---------------------|-----------------|----------------------------|----------------------------------|-----------------|
| OOMKilled | Availability | 99.9% | Meter reads may fail when `meter-service` pods restart or crash | Successful meter API requests / total valid meter API requests | Scenario recovery measured at 147s; SRE Agent portal pending |
| MongoDBDown | Availability | 99.9% | Meter readings may be accepted by front-end paths but fail to process downstream when MongoDB is unavailable | Successful processing of meter readings / submitted readings | Root cause proven by kubectl; alert firing did not occur in rapid run; portal pending |
| ServiceMismatch | Availability | 99.9% | Service has zero endpoints even though pods are healthy; reads may fail due to routing/configuration mismatch | Successful service-routed requests / total valid service requests | Root cause proven by kubectl; `NO_ALERT_FIRED` expected; portal pending |
| High CPU | Latency | `<500ms p95` | Grid frequency calculations or neighboring services may slow under contention | p95 request latency below threshold / total valid requests | Metadata/runbook coverage only in this package |
| Pending Pods | Availability | 99.9% | New monitoring capacity cannot schedule | Available scheduled replicas / desired replicas | Metadata coverage only in this package |

---

## Error-budget narrative for the three measured/reference scenarios

### OOMKilled

If this occurred in production, repeated OOMKilled restarts could consume an availability error budget by causing failed or unavailable `meter-service` requests. In the demo, Wave 1 measured a 147-second scenario recovery duration against the 15-minute threshold.

Customer-safe statement:

> "OOMKilled maps to availability risk. The demo measured 147 seconds to recovery for the scenario, but it does not claim production SLO burn."

### MongoDBDown

If this occurred in production, MongoDB unavailability could consume an availability or processing-success error budget because dependent services cannot complete meter reading workflows. In the demo, kubectl evidence proves the root cause (`replicas: 0`) and cascading symptoms, but alert firing did not occur in the rapid automated run.

Customer-safe statement:

> "MongoDBDown maps to dependency-driven availability risk. The rapid run produced a documented `NO_ALERT_FIRED` limitation, so the demo should discuss what error-budget impact would be measured in a production SLI rather than claiming actual burn."

### ServiceMismatch

If this occurred in production, the Service could have zero endpoints while pods remain healthy. This is an availability risk that traditional pod-health alerts can miss. In the demo, `NO_ALERT_FIRED` is expected and is useful because it shows the detection gap.

Customer-safe statement:

> "ServiceMismatch maps to availability risk through a silent routing failure. The scenario is designed to test whether SRE Agent can diagnose configuration drift that standard pod-health alerts may not catch."

---

## Error-budget policy example for customer discussion

This is a proposed policy pattern, not measured production data:

```yaml
service: energy-metering
slos:
  - name: meter-api-availability
    sli: successful_valid_meter_api_requests / total_valid_meter_api_requests
    target: 99.9%
    window: 30d
    applies_to:
      - oom-killed
      - service-mismatch
  - name: meter-processing-success
    sli: successfully_processed_meter_readings / submitted_meter_readings
    target: 99.9%
    window: 30d
    applies_to:
      - mongodb-down
  - name: grid-frequency-latency
    sli: requests_under_500ms_p95 / total_valid_requests
    target: 99.0%
    window: 30d
    applies_to:
      - high-cpu
```

Decision rule:

- If the service is inside budget, reliability work and feature work can both proceed.
- If the service is burning budget quickly, prioritize diagnosis, alert coverage, and remediation automation.
- If a scenario repeatedly causes undetected burn, add or revise SLIs and alerts before claiming operational readiness.

---

## Claims to avoid

Do **not** claim:

- "The demo burned X% of error budget."
- "The customer production SLO was impacted."
- "App Insights proves request/dependency SLOs for the workload services."
- "SRE Agent reduced SLO burn."

Use instead:

> "The scenarios map to these SLO dimensions and are designed to test whether SRE Agent can reduce diagnosis time before error-budget burn becomes severe."
