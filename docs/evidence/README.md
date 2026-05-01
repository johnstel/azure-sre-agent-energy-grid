# Evidence Library

Reusable evidence collected during Azure SRE Agent demo runs. All artifacts follow the naming and layout conventions defined in [`docs/CAPABILITY-CONTRACTS.md`](../CAPABILITY-CONTRACTS.md).

## Directory Layout

```
evidence/
├── kql/               # Parameterised KQL queries (.kql files)
├── screenshots/       # Portal & SRE Agent screenshots (.png)
├── diagrams/          # Architecture, trust-tier, RBAC diagrams
├── runbooks/          # Structured runbook templates (.md)
└── scenarios/         # Per-scenario evidence folders
    ├── oom-killed/
    ├── crash-loop/
    ├── mongodb-down/
    ├── service-mismatch/
    ├── image-pull-backoff/
    ├── high-cpu/
    ├── pending-pods/
    ├── probe-failure/
    ├── network-block/
    └── missing-config/
```

## Conventions

- **KQL files**: `{query-purpose}.kql` — must use parameterised `sre_scenario`, `sre_namespace`, and time-range inputs per contract §2.
- **Screenshots**: `{scenario-id}_{step}.png` — e.g., `oom-killed_sre-agent-diagnosis.png`. PNG format, max 1920×1080. Redact secrets before committing. See [`screenshots/README.md`](screenshots/README.md).
- **Diagrams**: Mermaid source (`.mmd`) preferred; export `.png` alongside.
- **Runbooks**: `RB-{NNN}-{slug}.md` — must follow runbook template in contract §6.
- **Scenario evidence**: Each folder collects KQL output, screenshots, and notes for one end-to-end scenario run. Include a `run-notes.md` with timestamps when capturing.

---

## Evidence Capture Checklist

Use this checklist for every scenario run. Copy it into each scenario's `run-notes.md`.

### Per-Scenario Capture Template

```markdown
# Run Notes: {scenario-id}

**Date**: YYYY-MM-DD
**Operator**: {name}
**Scenario**: {scenario-id}
**Verdict**: PASS / FAIL / PARTIAL

## MTTR Timestamps

| Label | Timestamp | Notes |
|-------|-----------|-------|
| T0 — Scenario injected | | `kubectl apply -f k8s/scenarios/{id}.yaml` |
| T1 — Alert / symptom detected | | First observable signal |
| T2 — SRE Agent conversation started | | Operator submits first prompt |
| T3 — Diagnosis received | | Capture visible portal result; document blocker if unavailable |
| T4 — Remediation applied | | Operator executes fix; capture approval UI only if the Preview portal exposes it |
| T5 — Service healthy | | All pods Running/Ready |

**MTTR** (T5 − T1): ___
**Agent diagnosis time** (T3 − T2): ___

## Evidence Artifacts

| Artifact | Captured? | File Path | Notes |
|----------|-----------|-----------|-------|
| Screenshot: healthy baseline | ☐ | `screenshots/{scenario}_before.png` | |
| Screenshot: failure state | ☐ | `screenshots/{scenario}_failure.png` | |
| Screenshot: SRE Agent diagnosis | ☐ | `screenshots/{scenario}_sre-agent-diagnosis.png` | Real portal capture only |
| Screenshot: action proposal | ☐ | `screenshots/{scenario}_proposal.png` | |
| Screenshot: recovery state | ☐ | `screenshots/{scenario}_after-fix.png` | |
| KQL: diagnosis query | ☐ | `kql/{scenario}_diagnosis.kql` | |
| KQL: recovery verification | ☐ | `kql/{scenario}_recovery.kql` | |
| kubectl output: pod state | ☐ | (paste inline below) | |
| kubectl output: events | ☐ | (paste inline below) | |

## Pass/Fail Assessment

| Criterion | Pass? | Notes |
|-----------|-------|-------|
| Real portal evidence supports the root-cause diagnosis, or blocker/misdiagnosis is documented | ☐ | |
| Real portal evidence shows an appropriate recommendation, or recommendation blocker is documented | ☐ | |
| Fix restores healthy state | ☐ | |
| Evidence artifacts captured | ☐ | |

## Raw Output

(Paste kubectl output, KQL results, or other raw data below)
```

### Minimum Evidence Set Per Scenario

For UAT gating, each scenario folder must contain at minimum:

1. **`run-notes.md`** — completed template above with MTTR timestamps and pass/fail
2. **1 diagnosis screenshot** — real SRE Agent portal capture showing the visible diagnosis path, or an explicit run-notes blocker if portal evidence is unavailable
3. **1 KQL diagnosis query** — parameterised `.kql` file used during investigation
4. **1 KQL recovery query** — verifies the fix worked

### Screenshot Standards

- Format: PNG
- Resolution: max 1920×1080
- Naming: `{scenario-id}_{step}.png` (e.g., `oom-killed_sre-agent-diagnosis.png`)
- **Redaction**: Blur or mask subscription IDs, tenant IDs, and any real customer data
- **Annotation**: Annotate with red boxes/arrows to highlight key findings (optional but recommended)
- **No fabricated output**: Do not create placeholder screenshots for customer use. If a portal capture is missing, mark it `PENDING PORTAL EVIDENCE — do not present as captured` in run notes.

### KQL File Standards

Every `.kql` file must include a header comment:

```kql
// Scenario: {scenario-id}
// Purpose: {what this query shows}
// Time range: {required window, e.g., "last 30 minutes"}
// Parameters: sre_scenario="{id}", sre_namespace="energy"
// SCHEMA_TBD — if referencing SRE Agent App Insights fields
```

---

## Status

This layout was created in **Wave 0**. Folders are empty placeholders until Wave 1+ populates them with real evidence.
