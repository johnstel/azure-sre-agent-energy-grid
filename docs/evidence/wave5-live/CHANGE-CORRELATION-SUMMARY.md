# Change Correlation Summary

**Scope**: Summary of Wave 4 change-correlation support
**Status**: Metadata support documented; portal consumption pending
**Source**: `../wave4-live/CHANGE-CORRELATION.md`

---

## What Wave 4 added

Wave 4 added non-runtime Kubernetes annotations to five scenario manifests:

- `k8s/scenarios/oom-killed.yaml`
- `k8s/scenarios/crash-loop.yaml`
- `k8s/scenarios/mongodb-down.yaml`
- `k8s/scenarios/network-block.yaml`
- `k8s/scenarios/service-mismatch.yaml`

The annotations provide stable change-correlation metadata:

| Annotation | Purpose |
|------------|---------|
| `sre.scenario` | Stable scenario ID |
| `sre.service` | Primary affected service |
| `sre.namespace` | Kubernetes namespace |
| `sre.component` | Affected component or dependency |
| `sre.runbook_id` | Stable runbook mapping |
| `sre.root_cause_category` | Root-cause grouping |
| `sre.change_source` | How the break is injected |
| `sre.version` | Schema version |

---

## How this supports enterprise reliability

Change correlation helps a human operator or SRE Agent-style workflow connect an active failure to:

1. **What changed**: deployment, scale event, config change, network policy, or other change source.
2. **What is affected**: service, component, dependency, and namespace.
3. **What runbook applies**: stable `RB-*` runbook IDs.
4. **What SLO dimension is at risk**: availability, latency, or another manifest-defined impact.

For customer discussion, this supports the statement:

> "Scenario manifests now carry stable metadata for change correlation. This improves traceability but does not replace pending SRE Agent portal validation."

---

## Remaining gaps

| Gap | Status | Customer-safe language |
|-----|--------|------------------------|
| Azure SRE Agent portal consumption of annotations | `PENDING_HUMAN_PORTAL` | "No portal screenshot proves Azure SRE Agent consumed these annotations yet." |
| Base healthy manifests annotated everywhere | Not complete by design | "Wave 4 limited changes to scenario manifests to avoid broad refactors." |
| Container Insights propagation of annotations | Not guaranteed | "Kubernetes annotations do not automatically appear in every Container Insights table." |
| App/dependency telemetry correlation | Not proven | "Workload services use external sample images; full App Insights dependency telemetry is not yet validated." |

---

## Demo-safe statement

Use:

> "Wave 4 added scenario metadata that supports change correlation and runbook linkage. Wave 5 maps that metadata into the reliability measurement narrative. Portal validation remains pending before claiming Azure SRE Agent consumed or reasoned over the annotations."

Avoid:

> "SRE Agent used the annotations to diagnose the issue."

Avoid:

> "Application dependency telemetry is complete."

Avoid:

> "Change correlation is fully automated end-to-end."
