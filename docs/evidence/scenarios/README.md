# Scenario Evidence & Metadata

> **Wave 0 Status:** Metadata locked as docs-only source of truth
> **Runtime Sync:** NO — K8s manifests in `k8s/scenarios/` are NOT annotated yet

This directory contains evidence artifacts and metadata for all 10 breakable scenarios in the Energy Grid SRE Demo Lab.

---

## Quick Links

| File | Purpose |
|------|---------|
| `scenario-manifest.yaml` | **Wave 0 metadata source of truth** — Stable scenario IDs, severity, signals, root causes, runbook/alert/SLO mappings |
| `oom-killed/` | Evidence for Scenario 1: OOMKilled |
| `mongodb-down/` | Evidence for Scenario 9: MongoDB Down (cascading) |
| `service-mismatch/` | Evidence for Scenario 10: Service Selector Mismatch |
| *(other scenarios)* | Evidence folders TBD in Wave 1+ |

---

## Wave 0 Architecture Decision: Docs-Only Metadata

### Why This Exists

Wave 0 **cannot pass** without locking the scenario metadata schema. The current K8s manifests in `k8s/scenarios/*.yaml` lack structured metadata that other capabilities depend on:

- **Alerts** need stable scenario IDs to correlate fired alerts with scenarios
- **Runbooks** need stable scenario IDs to link remediation steps
- **KQL queries** need stable scenario IDs to filter telemetry
- **SLO tracking** needs scenario-to-SLO mappings
- **MTTR measurement** needs expected baselines per scenario

**Problem:** Wave 0 must avoid runtime changes to K8s manifests to minimize deployment risk and change review overhead.

**Solution:** This `scenario-manifest.yaml` is the **external metadata source of truth**. It defines all metadata fields without modifying the K8s YAML files that run in the cluster.

### Drift Risk & Mitigation

⚠️ **HIGH DRIFT RISK** — This manifest is docs-only. Changes to `k8s/scenarios/*.yaml` must be manually synchronized here.

**Mitigation Strategy:**

1. **Wave 0:** All scenario changes must update BOTH files:
   - Runtime manifest: `k8s/scenarios/{id}.yaml`
   - Metadata manifest: `docs/evidence/scenarios/scenario-manifest.yaml`

2. **Automated Drift Guard (Wave 0):**
   ```powershell
   # Run validation before committing changes
   .\scripts\validate-scenario-metadata.ps1

   # Or run in strict mode (warnings fail validation)
   .\scripts\validate-scenario-metadata.ps1 -Strict
   ```

   The drift guard validates:
   - All 10 scenario IDs exist in manifest and match K8s files
   - Scenario severity → alert severity mapping follows CAPABILITY-CONTRACTS §4 taxonomy
   - root_cause_category values align between CAPABILITY-CONTRACTS §3 and manifest
   - All k8s_manifest paths point to existing files
   - Required metadata fields are present in every scenario

   **Run this before committing** any changes to scenario metadata or K8s manifests.

3. **Wave 3+ (Future):** After approval, may propagate stable annotations into K8s manifests:
   ```yaml
   metadata:
     annotations:
        alert.scenarios: "oom-killed"
       sre.severity: "critical"
       sre.category: "resource-exhaustion"
       sre.runbook-id: "RB-001-OOMKilled"
       # ... etc
   ```
   This requires:
   - Change approval from John/leadership
   - Validation that annotations don't break AKS deployment
   - Testing in dev environment first

---

## Scenario Metadata Schema

Every scenario in `scenario-manifest.yaml` includes these fields:

### Core Identity
- `id` (string) — Stable kebab-case ID (e.g., `oom-killed`, `mongodb-down`)
- `number` (integer) — Scenario number 1–10
- `title` (string) — Human-readable title
- `severity` (enum) — `critical`, `warning`, `info`

### Technical Details
- `affected_services` (array) — Services impacted (e.g., `["meter-service"]`)
- `affected_components` (array) — Components impacted (e.g., `["database", "api"]`)
- `expected_signals` (array) — Observable K8s/Azure signals (e.g., `["OOMKilled", "pod restarts"]`)
- `root_cause_category` (enum) — One of:
  - `resource-exhaustion`
  - `configuration`
  - `dependency`
  - `networking`
  - `image`
  - `scheduling`
  - `probe`

### Observability Linkage
- `runbook_id` (string) — Reserved `RB-{NNN}` ID (implemented in Wave 4)
- `slo_impact` (enum) — `availability`, `latency`, `error-rate`, `none`
- `slo_target` (string) — SLO threshold (e.g., `"99.9%"`, `"<500ms p95"`)
- `alert_name` (string) — Planned scenario-specific alert name; Wave 1 deploys only the four baseline alerts in `infra/bicep/modules/alerts.bicep`
- `alert_severity` (string) — Azure Monitor severity (e.g., `Sev 1 (Error)`)
- `audit_evidence` (array) — Resolvable KQL file paths used for scenario evidence (e.g., `["docs/evidence/kql/stable/scenario-oom-killed.kql"]`)

### Change & Audit
- `change_source` (enum) — `deployment`, `config-change`, `scale-event`, `manual-kubectl`, `unknown`
- `change_description` (string) — How the break is injected
- `k8s_manifest` (string) — Path to scenario YAML file
- `fix_command` (string) — Command to restore healthy state

### Success Criteria
- `expected_pass_criteria` (array) — What SRE Agent must achieve for scenario to pass
- `expected_fail_criteria` (array) — What indicates SRE Agent failed to diagnose
- `mttr_baseline` (string) — Expected manual MTTR without SRE Agent (e.g., `"15m"`)

### Demo Support
- `evidence_folder` (string) — Path to evidence artifacts (screenshots, KQL, etc.)
- `capabilities` (array) — Which capabilities this scenario exercises
- `energy_narrative` (string) — Demo story context
- `sre_agent_prompts` (array) — Suggested prompts for demos

---

## All 10 Scenarios — Complete Wave 0 Metadata

**All 10 scenarios** in `scenario-manifest.yaml` have **complete Wave 0 metadata** with all required fields:
- Core identity (id, number, title, severity)
- Technical details (affected services/components, expected signals, root cause category)
- Observability linkage (runbook ID, SLO impact, alert mappings, KQL evidence)
- Change & audit (change source/description, K8s manifest path, fix command)
- Success criteria (pass/fail criteria, MTTR baseline)
- Demo support (evidence folder, capabilities, energy narrative, SRE Agent prompts)

### Reference Scenarios for Wave 2 Validation

Three scenarios are designated as **reference scenarios** for Wave 2 SRE Agent proof-of-concept validation:

| ID | # | Title | Why Reference |
|----|---|-------|---------------|
| `oom-killed` | 1 | Meter Service Memory Exhaustion | Simple resource exhaustion, clear diagnosis |
| `mongodb-down` | 9 | Meter Database Outage (Cascading) | Complex dependency tracing, multi-service impact |
| `service-mismatch` | 10 | Meter Service Routing Failure | Subtle networking issue, requires configuration analysis |

These three represent different complexity tiers (simple/complex/subtle) for SRE Agent capability validation. **The remaining 7 scenarios have identical metadata completeness** and are ready for Wave 1+ implementation.

---

## Usage

### For SRE Demos
1. Choose a scenario from `scenario-manifest.yaml`
2. Note the `sre_agent_prompts` for that scenario
3. Apply the scenario: `kubectl apply -f k8s/scenarios/{id}.yaml`
4. Use prompts to guide Azure SRE Agent diagnosis
5. Verify SRE Agent meets `expected_pass_criteria`
6. Restore: Run the `fix_command`

### For Alert/Runbook/KQL Development (Wave 1+)
1. Reference `scenario-manifest.yaml` for stable scenario IDs
2. Use `alert_name`, `runbook_id`, `audit_evidence` fields to link artifacts
3. Do NOT hardcode scenario names — use stable IDs
4. Tag alert evidence with `alert.scenarios` when it maps to one or more scenarios; future one-to-one alerts may add `sre.scenario`

### For MTTR Measurement (Wave 5)
1. Use `mttr_baseline` as comparison target
2. Record timestamps per §7 in `docs/CAPABILITY-CONTRACTS.md`
3. Compare SRE Agent MTTR to baseline
4. Store run notes in `{evidence_folder}/run-notes.md`

---

## Folder Structure

```
docs/evidence/scenarios/
├── README.md                    # This file
├── scenario-manifest.yaml       # Metadata source of truth
├── oom-killed/                  # Scenario 1 evidence
│   ├── run-notes.md            # Manual run observations
│   ├── screenshots/            # Portal/SRE Agent screenshots
│   └── kql/                    # Scenario-specific queries
├── crash-loop/                  # Scenario 2 evidence (TBD)
├── image-pull-backoff/          # Scenario 3 evidence (TBD)
├── high-cpu/                    # Scenario 4 evidence (TBD)
├── pending-pods/                # Scenario 5 evidence (TBD)
├── probe-failure/               # Scenario 6 evidence (TBD)
├── network-block/               # Scenario 7 evidence (TBD)
├── missing-config/              # Scenario 8 evidence (TBD)
├── mongodb-down/                # Scenario 9 evidence (TBD)
└── service-mismatch/            # Scenario 10 evidence (TBD)
```

> **Note:** Evidence folders will be populated in Wave 1+ as scenarios are validated with SRE Agent.

---

## Contract Compliance

This metadata manifest implements the contracts defined in:

- `docs/CAPABILITY-CONTRACTS.md` §3 — Scenario Metadata Schema
- `docs/CAPABILITY-CONTRACTS.md` §4 — Alert Naming & Severity Taxonomy
- `docs/CAPABILITY-CONTRACTS.md` §5 — Runbook ID & Template Standard
- `docs/CAPABILITY-CONTRACTS.md` §7 — SLO & MTTR Timestamp Model

It provides the stable identifiers that enable:
- Parameterized KQL queries (no hardcoded scenario names)
- Alert-to-scenario correlation via custom properties
- Runbook linkage via stable `RB-{NNN}` IDs
- SLO burn-rate calculations via scenario-to-SLO mappings
- MTTR measurement via baseline expectations

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-25 | Initial Wave 0 lock — 10 scenarios, metadata schema, reference implementations |

---

## Next Steps (Wave 1+)

After Wave 0 approval:

1. **Wave 1:** Local implementation complete, live UAT pending — Four baseline alerts emit `alert.scenarios` custom properties (see `docs/evidence/ALERT-KQL-MAPPING.md`)
2. **Wave 1:** KQL queries use scenario IDs from this manifest
3. **Wave 2:** Validate reference scenarios (oom-killed, mongodb-down, service-mismatch)
4. **Wave 3:** Optionally propagate annotations into K8s manifests after approval
5. **Wave 4:** Implement runbooks linked via `runbook_id`
6. **Wave 5:** Measure MTTR against baselines

---

## Wave 1 Alert Implementation Status

✅ **Alert taxonomy aligned** (2026-04-25):
- 4 Wave 1 baseline alerts implemented in `infra/bicep/modules/alerts.bicep`
- Custom properties use shared `sre.*` dimensions plus multi-scenario `alert.scenarios`
- Severity mapping validated against scenario manifest
- OOMKilled has a direct alert mapping; MongoDBDown and ServiceMismatch use KQL/manual-inspection evidence paths in Wave 1
- See `docs/evidence/ALERT-KQL-MAPPING.md` for complete alert-to-scenario mapping

**Deployment Status**: `deployAlerts = true` in Wave 1 Bicep parameters; live deployment validation pending

---

## Questions?

See `.squad/decisions/inbox/parker-wave0-scenario-manifest.md` for the decision record behind this architecture.
