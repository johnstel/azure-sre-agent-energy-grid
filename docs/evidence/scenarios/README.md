# Scenario Metadata

`scenario-manifest.yaml` is the machine-readable metadata source for the ten individual breakable scenarios in `k8s/scenarios/`.

The complete-failure bundle is intentionally tracked separately because it combines multiple failure modes and does not belong to the numbered 1-10 scenario registry.

## Change rule

When a scenario manifest changes, update both:

1. `k8s/scenarios/<scenario>.yaml`
2. `docs/evidence/scenarios/scenario-manifest.yaml`

Then run:

```powershell
.\scripts\validate-scenario-metadata.ps1 -Strict
```

The validator checks stable IDs, severities, root-cause categories, Kubernetes paths, fix commands, and linked artifacts.

## Metadata fields

Each scenario records:

- Stable ID, number, title, and severity
- Affected services and components
- Expected signals and root-cause category
- Runbook, alert, KQL, and SLO linkage
- Break manifest and restore command
- Pass/fail criteria
- Energy-grid narrative and suggested prompts

Use the manifest for automation and cross-document references. Use [Breakable Scenarios](../../BREAKABLE-SCENARIOS.md) for operator instructions.
