# Change Correlation Support

## Implemented metadata

Wave 4 adds non-runtime Kubernetes annotations to the five Wave 4 scenario manifests:

- `k8s/scenarios/oom-killed.yaml`
- `k8s/scenarios/crash-loop.yaml`
- `k8s/scenarios/mongodb-down.yaml`
- `k8s/scenarios/network-block.yaml`
- `k8s/scenarios/service-mismatch.yaml`

Annotations use the capability-contract fields:

| Annotation | Purpose |
|------------|---------|
| `sre.scenario` | Stable scenario ID |
| `sre.service` | Primary affected service |
| `sre.namespace` | Kubernetes namespace |
| `sre.component` | Affected component/dependency |
| `sre.runbook_id` | Stable runbook mapping |
| `sre.root_cause_category` | Root-cause grouping |
| `sre.change_source` | How the break is injected |
| `sre.version` | Schema version |

## Why annotations are safe

The change only adds metadata. It does not change container images, commands, ports, selectors, resource limits, probes, replicas, or NetworkPolicy rules. Deployment pod-template annotations are included for deployment scenarios so created pods carry the scenario correlation metadata.

## Correlation workflow

1. Scenario is applied with `kubectl apply -f k8s/scenarios/{id}.yaml`.
2. Kubernetes object annotations identify scenario, root-cause category, runbook, and change source.
3. Azure SRE Agent or a human operator can correlate the active object metadata with:
   - `docs/evidence/scenarios/scenario-manifest.yaml`
   - `docs/evidence/runbooks/RB-*.md`
   - baseline alert custom properties in `infra/bicep/modules/alerts.bicep`

## Known gaps

- Base healthy manifests are not fully annotated across every resource in this pass to avoid broad refactors.
- Kubernetes annotations do not automatically appear in every Container Insights table; kubectl/Kubernetes API inspection remains the reliable source for this metadata.
- No portal screenshot proves Azure SRE Agent consumed these annotations yet.

## Demo-safe statement

> "Scenario manifests now carry stable metadata for change correlation. This improves traceability but does not replace the pending SRE Agent portal validation."
