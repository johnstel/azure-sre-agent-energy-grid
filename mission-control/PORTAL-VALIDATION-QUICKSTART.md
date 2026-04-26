# Portal Validation Workflow — Quick Start

## Location

Open Mission Control (http://localhost:5173 in dev mode or http://localhost:3333 in production).

The **Portal Evidence Confirmation** section appears in the **Controls** panel. Click the "Controls" button in the top status strip to open/close the controls panel.

## Workflow

### Step 1: Inject a Scenario

In the **Scenarios** section of the Controls panel, click "Inject" for one of the three portal-validation scenarios:
- OOMKilled
- MongoDBDown
- ServiceMismatch

### Step 2: Capture Portal Evidence

1. Open the Azure SRE Agent portal
2. Copy the **Portal prompt** shown in the Portal Evidence Confirmation card for your scenario
3. Ask the SRE Agent using that exact prompt
4. Capture the portal response:
   - Take a screenshot with timestamp
   - Copy the exact transcript (no paraphrasing)
   - Redact subscription ID, tenant ID, resource IDs, principal IDs, and other sensitive identifiers
   - Save the evidence to a local path (e.g., `docs/evidence/wave1-live/oom-killed/sre-agent/screenshot-2026-04-26.png`)

### Step 3: Complete the Checklist

In the Portal Evidence Confirmation card for your scenario:

1. Check all four required items:
   - ✅ Portal screenshot captured with timestamp
   - ✅ Exact transcript copied (no paraphrasing)
   - ✅ Subscription ID, tenant ID, resource IDs redacted
   - ✅ Evidence path recorded in notes

2. Fill in the **Evidence path** field with the local path to your saved evidence

3. Optionally add **Notes** about the capture

### Step 4: Mark Confirmed

Once all checklist items are checked and the evidence path is filled in, the "Mark Confirmed" button becomes enabled. Click it to confirm the portal validation.

The scenario status changes from `Pending` to `Confirmed`, and the confirmation timestamp and user are recorded.

### Gate Status

The **Gate Status** badge shows:
- **PASS_WITH_PENDING_HUMAN_PORTAL** (yellow) — Default state; at least one scenario is still pending
- **PASS** (green) — All three scenarios are confirmed with complete checklists and evidence paths

## Safe Language Compliance

The section includes this reminder at the top:

> **Safe language reminder:** Do not claim "Azure SRE Agent diagnosed" until real portal evidence is captured and validated below.

This ensures compliance with:
- `docs/SAFE-LANGUAGE-GUARDRAILS.md`
- `docs/evidence/wave5-live/CHECKLISTS-AND-VERDICT.md`

## Data Persistence

Portal validations are stored locally in `mission-control/backend/.data/portal-validations.json`. This file is excluded from Git via `.gitignore`.

## Reset Workflow

- **Reset** button on each scenario card — Resets that scenario to pending and clears all data
- **Reset All** button at the bottom — Resets all three scenarios (requires confirmation)

## API Endpoints

All portal validation state is managed through REST endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/portal-validations` | Get all validations and gate status |
| GET | `/api/portal-validations/:scenarioName/prompt` | Get prepared prompt for scenario |
| PATCH | `/api/portal-validations/:scenarioName` | Update validation details |
| POST | `/api/portal-validations/:scenarioName/confirm` | Mark scenario as confirmed |
| POST | `/api/portal-validations/:scenarioName/reset` | Reset scenario to pending |
| POST | `/api/portal-validations/reset-all` | Reset all validations |

Example:

```bash
# Get current state
curl http://localhost:3333/api/portal-validations

# Get OOMKilled prompt
curl http://localhost:3333/api/portal-validations/OOMKilled/prompt

# Update evidence path
curl -X PATCH http://localhost:3333/api/portal-validations/OOMKilled \
  -H "Content-Type: application/json" \
  -d '{"evidencePath":"docs/evidence/wave1-live/oom-killed/sre-agent/screenshot.png"}'

# Confirm scenario
curl -X POST http://localhost:3333/api/portal-validations/OOMKilled/confirm
```
