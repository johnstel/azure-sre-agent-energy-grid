# Alert to KQL Mapping — Wave 1

> **Version**: 1.0.0 (2026-04-25)
> **Status**: Implemented in `infra/bicep/modules/alerts.bicep`
> **Validation**: ✅ Bicep syntax validated, scenario metadata validation passing

This document maps each Azure Monitor alert to the corresponding KQL queries used for evidence capture and SRE Agent correlation.

---

## Alert Architecture

All alerts follow the contracts defined in `docs/CAPABILITY-CONTRACTS.md`:

- **§1 Telemetry Dimensions**: All alerts include `sre.*` custom properties
- **§4 Alert Severity Taxonomy**: Severity levels mapped to scenario impact
- **Custom Properties**: Every alert includes:
  - `source: azure-sre-agent-sandbox`
  - `workload: energy-grid`
  - `sre.namespace: energy`
  - `sre.version: 2026-04-25`
  - Additional scenario-specific properties where applicable

---

## Alert Inventory

### Baseline Alerts (General Signals)

| Alert Name | Display Name | Severity | Description | Scenarios |
|------------|--------------|----------|-------------|-----------|
| `{prefix}-pod-restarts` | Energy Grid - Pod restart spike | Sev 2 (Warning) | Broad signal for restart activity | oom-killed, crash-loop, probe-failure |
| `{prefix}-http-5xx` | Energy Grid - HTTP 5xx spike | Sev 1 (Error) | Application errors from App Insights | mongodb-down, crash-loop, oom-killed |
| `{prefix}-pod-failures` | Energy Grid - Failed or pending pods | Sev 2 (Warning) | Scheduling/startup failures | pending-pods, image-pull-backoff, missing-config |
| `{prefix}-crashloop-oom` | Energy Grid - CrashLoop/OOM detected | Sev 1 (Error) | OOMKilled or CrashLoopBackOff events | oom-killed, crash-loop |

**Note**: All 4 alerts include enhanced `sre.*` custom properties for scenario correlation. MongoDBDown and ServiceMismatch are Wave 1 evidence paths; they are not guaranteed to fire one of the four baseline alerts.

---

## Wave 1 Alert-to-Scenario Mappings

### 1. OOMKilled (Scenario 1) — Meter Service Memory Exhaustion

**Alert Fired**: `{prefix}-crashloop-oom` (Sev 1)

**Custom Properties**:
```json
{
  "sre.root-cause-category": "resource-exhaustion,configuration",
  "alert.scenarios": "oom-killed,crash-loop"
}
```

**KQL Evidence Queries**:
- `docs/evidence/kql/stable/scenario-oom-killed.kql`: Detect OOMKilled events and meter-service restarts
- `docs/evidence/kql/stable/pod-lifecycle.kql`: Track pod status, restarts, and failure reasons
- `docs/evidence/kql/stable/alert-history.kql`: Query alert rule configuration changes (create/update/delete) — NOT firing events. See Wave 2 limitation in kql/README.md.

**Alert Query**:
```kql
KubeEvents
| where TimeGenerated > ago(2m)
| where Namespace == "energy"
| where Reason in ("BackOff", "OOMKilled", "CrashLoopBackOff")
```

**Expected SRE Agent Correlation**:
- Agent sees OOMKilled events in KubeEvents
- Agent identifies container memory limits (16Mi)
- Agent recommends increasing memory limits

---

### 2. MongoDBDown (Scenario 9) — Cascading Dependency Failure

**Alert Correlation**: No dedicated or guaranteed Wave 1 alert.

**Detection Method**: No dedicated alert rule (per Dallas constraint). Detected via:
1. `scenario-mongodb-down.kql` provides pod/service/event symptom evidence.
2. `{prefix}-http-5xx` may fire if application instrumentation emits downstream 5xx errors.
3. Root-cause validation requires Kubernetes API inspection, such as `kubectl get deployment mongodb -n energy`.

> **Important:** The MongoDBDown scenario scales MongoDB to zero replicas. That usually produces no Failed/Pending MongoDB pod, so `{prefix}-pod-failures` is not expected to fire reliably for this scenario.

**KQL Evidence Queries**:
- `docs/evidence/kql/stable/scenario-mongodb-down.kql`: Shows MongoDB pod count, service-object observations, and dependent service event symptoms.
- `docs/evidence/kql/stable/pod-lifecycle.kql`: Shows namespace-wide pod state and failure reasons.
- `docs/evidence/kql/stable/alert-history.kql`: Shows alert rule configuration changes (Wave 1 limitation: does not show firing events; use Azure Resource Graph or alert diagnostic settings for firing history — see kql/README.md §Alert Firing Event Limitations)

**Manual Verification**:
```bash
kubectl get deployment mongodb -n energy
kubectl get pods -l app=mongodb -n energy
kubectl get endpoints mongodb -n energy
```

**Expected SRE Agent Investigation Path**:
- Agent reviews pod/service/event symptoms and any downstream HTTP 5xx alert if present.
- Agent uses Kubernetes API context to validate MongoDB replica intent and endpoint state.
- Agent traces likely dependency impact on meter-service and dispatch-service.
- Agent recommends scaling MongoDB back up only after verifying the scenario state.

**Complexity Tier**: COMPLEX — Multi-service cascading failure, dependency tracing required

**Wave 1 Status**: ✅ KQL mapping complete, no new alert rule needed

---

### 3. ServiceMismatch (Scenario 10) — Silent Networking Failure

**Alert Correlation**: No dedicated or reliable Wave 1 alert.

**Detection Method**: No dedicated alert rule (per Dallas constraint). Detected via:
1. `scenario-service-mismatch.kql` provides symptom evidence such as healthy pods and possible client errors.
2. Existing alerts may remain quiet because pods are healthy and the failure is a selector/config mismatch.
3. **Manual kubectl or Kubernetes API inspection REQUIRED** to diagnose root cause.

**⚠️ IMPORTANT LIMITATION**:
Log Analytics **KubeServices** table does NOT expose Service `selector` configuration. **KQL alone cannot diagnose this scenario's root cause.** SRE Agent must use kubectl API to compare Service selector vs Pod labels.

**KQL Evidence Queries**:
- `docs/evidence/kql/stable/scenario-service-mismatch.kql`: Shows meter-service pod health, service-object observations, and client symptom events.
- `docs/evidence/kql/stable/pod-lifecycle.kql`: Shows that pods can be Running even when traffic routing is broken.

**Manual Inspection (REQUIRED)**:
```bash
# Compare Service selector vs Pod labels
kubectl describe service meter-service -n energy | grep Selector
kubectl get pods -l app=meter-service -n energy --show-labels

# Expected mismatch:
# Service selector: app=meter-service-v2
# Pod labels:       app=meter-service
```

**Expected SRE Agent Correlation**:
- Alert is not expected to fire reliably in Wave 1.
- KQL queries show symptom evidence but cannot identify selector mismatch.
- **Agent must use kubectl API** to compare Service selector vs Pod labels
- Agent identifies `app: meter-service-v2` (Service) vs `app: meter-service` (Pod)
- Agent recommends correcting selector mismatch

**Complexity Tier**: SUBTLE — Requires out-of-band kubectl inspection, KQL alone insufficient

**Wave 1 Status**: ✅ KQL mapping documented, kubectl inspection workflow defined

---

## Alert Deployment Status

**Wave 1 State:**
- `deployAlerts = true` in `main.bicep` and `main.bicepparam`.
- 4 alerts are defined with enhanced taxonomy and `alert.scenarios` custom properties.
- MongoDBDown and ServiceMismatch remain KQL/manual-inspection evidence paths, not dedicated alert rules.
- Live UAT must still verify deployment, alert firing, Activity Log export, and query execution.

**Production Guidance:**
- Customers decide based on incident workflow integration
- Connect alerts to Action Groups for paging/incident systems
- Consider adding scenario-specific alerts if operational needs justify them

---

## Custom Properties Reference

### Base Properties (All Alerts)

```json
{
  "source": "azure-sre-agent-sandbox",
  "workload": "energy-grid",
  "sre.namespace": "energy",
  "sre.version": "2026-04-25"
}
```

### Scenario Correlation Properties

**Wave 1 implementation**: All 4 alerts use multi-scenario correlation properties.

**Example from crashloop-oom alert**:
```json
{
  "sre.root-cause-category": "resource-exhaustion,configuration",
  "alert.scenarios": "oom-killed,crash-loop"
}
```

**Example from pod-failures alert**:
```json
{
  "sre.root-cause-category": "scheduling,image,configuration",
  "alert.scenarios": "pending-pods,image-pull-backoff,missing-config"
}
```

### Future Scope (Wave 2+)

If dedicated scenario-specific alerts are added in future waves, they may include additional 1:1 mapping properties:

```json
{
  "sre.scenario": "scenario-id",        // Single scenario ID (1:1 mapping)
  "sre.service": "service-name",        // Specific affected service
  "sre.component": "component-name",    // Infrastructure component
  "sre.severity": "critical",           // Scenario severity from manifest
  "alert.runbook-id": "RB-XXX-Name"     // Link to automated remediation
}
```

**Note**: Wave 1 does NOT include scenario-specific alerts. MongoDBDown and ServiceMismatch are verified via KQL queries and manual inspection, not dedicated alert rules.

---

## KQL Query Development Guidelines

When writing KQL queries for scenario evidence:

1. **Use parameterization**: Accept `sre_scenario`, `sre_namespace`, and `TimeRange` as parameters
2. **Never hardcode**: Don't hardcode scenario names or service names
3. **Include timestamps**: Always filter `TimeGenerated` appropriately
4. **Document limitations**: If KQL cannot detect root cause, document manual steps
5. **Test with scenarios**: Validate queries fire when scenario is deployed

---

## Next Steps (Wave 2+)

1. ✅ **Alert Firing Evidence (Wave 2.0)**: Azure Resource Graph CLI query via `scripts/get-alert-firing-history.ps1` — no Bicep changes required
2. 🔄 **Alert Diagnostic Settings (Wave 2.1+)**: Optional Bicep implementation for KQL-based correlation with telemetry (only if business need emerges)
3. **Test alert firing**: Deploy scenarios and verify which of the four Wave 1 alerts fire
4. **Capture KQL output**: Save output from the actual `docs/evidence/kql/stable/*.kql` files
5. **Measure MTTR**: Compare alert-to-resolution time with/without SRE Agent after Wave 2 incident proof
6. **Build runbooks**: Reference alert custom properties in runbook automation
7. **SLO tracking**: Add SLO/burn-rate evidence in Wave 5 after app telemetry and SLO definitions are in place

**Wave 2 Architecture Decision**: See `.squad/decisions/inbox/ripley-wave2-alert-firing.md` for dual-path alert firing evidence plan (Azure Resource Graph primary, diagnostic settings optional).

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-25 | Wave 1 implementation — 4 alerts with scenario correlation, KQL-based verification for MongoDBDown/ServiceMismatch (no new alert rules per Dallas constraint) |
