# Review Note — Incident Dashboard Doc Integration

> **Date**: 2026-08-11 · **Author**: Copilot draft · **For**: johnstel review

## New document

| File | Description |
|------|-------------|
| `docs/GRAFANA-INCIDENT-DASHBOARD.md` | Evidence-safe guide for the Managed Grafana incident dashboard: what it shows, what it doesn't, demo usage, evidence capture, and safe-language checklist. |

---

## Proposed updates to existing documents

### 1. `docs/DEMO-NARRATIVE.md`

**Section: Act 1 — "What You're Looking At"** (≈ line 65)
- Add a bullet introducing the Grafana incident dashboard alongside the existing `kubectl get pods` and grid-dashboard mentions.
- Use: *"Grafana incident overview — infrastructure metrics (restart rate, CPU/memory, OOMKilled markers). This is an observability surface, not a detection system."*

**Section: Act 2 — each scenario's "Show the failure" step**
- Add optional line: *"If Grafana is open, note the metric change on the restart-rate or CPU panel before switching to SRE Agent."*
- Do **not** add language implying the dashboard triggers SRE Agent.

### 2. `docs/DEMO-RUNBOOK.md`

**Section: Step 2 — "Verify Healthy Baseline"** (≈ line 95)
- Add checklist item: `- [ ] Grafana incident dashboard shows zero restarts, all pods Running (optional — only if Grafana is deployed)`.

**Section: Step 3+ — per-scenario steps**
- Add optional evidence-capture line for Grafana screenshots using the `{scenario}_grafana-{before,failure,after}.png` convention defined in the new guide.

### 3. `docs/SAFE-LANGUAGE-GUARDRAILS.md`

**Guardrail table** (new row):

| Topic | ❌ Do Not Claim | ✅ Say Instead | Why |
|-------|----------------|---------------|-----|
| **Grafana Dashboard** | "The dashboard detects/triggers incidents" | "The dashboard surfaces infrastructure metrics that an operator interprets. The operator initiates diagnosis manually or via SRE Agent." | No alert→agent trigger exists; the dashboard is passive. |

**"Where to Apply" checklist**: Add `docs/GRAFANA-INCIDENT-DASHBOARD.md`.

### 4. `docs/ANALYST-SAFE-LANGUAGE.md`

**Observation rules table** (new row):

| Snapshot data | Approved observation | Avoid |
|---|---|---|
| Grafana restart-rate panel shows spike | "The Grafana dashboard shows a restart-rate increase for `meter-service`." | "The dashboard detected an incident." |

### 5. `docs/CAPABILITY-CONTRACTS.md`

- If/when a §"Observability" or §"Dashboards" section is added, reference `GRAFANA-INCIDENT-DASHBOARD.md` as the dashboard contract and note that no dashboard-to-SRE-Agent trigger is configured.

### 6. `docs/evidence/screenshots/README.md`

- Add `{scenario}_grafana-before.png`, `{scenario}_grafana-failure.png`, `{scenario}_grafana-after.png` to the screenshot naming convention table.

---

## Key safe-language constraints applied

1. **No autonomous invocation**: The dashboard never "triggers" or "invokes" SRE Agent.
2. **No detection claim**: The dashboard "surfaces metrics"; detection is an operator activity.
3. **No MTTR claims**: No quantitative improvement percentages.
4. **No SLO panels**: SLO measurement infrastructure does not exist yet.
5. **No application telemetry**: Demo services do not emit App Insights custom metrics.
6. **Evidence-first**: Screenshots must be real captures; placeholders are prohibited.
