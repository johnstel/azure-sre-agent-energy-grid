# Deep Context — Evaluation Results

## Status: LIVE_GATE_PENDING

Live evaluation requires an active Energy Grid deployment with SRE Agent and
configured deep context (Code Access + Knowledge Base). Results will be recorded
here after live execution.

---

## Pre-Live Validation

| Check | Status | Date |
|-------|--------|------|
| Manifest schema valid | ✅ | 2026-08-12 |
| All source files exist | ✅ | 2026-08-12 |
| No secrets detected | ✅ | 2026-08-12 |
| Evaluation harness valid | ✅ | 2026-08-12 |
| Expected citation files exist | ✅ | 2026-08-12 |

## Live Execution (Pending)

| Eval ID | Scenario | Citation Score | Root Cause | Safe Guidance | Uncertainty | Total | Pass |
|---------|----------|---------------|------------|---------------|-------------|-------|------|
| eval-oom-01 | oom-killed | — | — | — | — | — | — |
| eval-oom-02 | oom-killed | — | — | — | — | — | — |
| eval-mongodb-01 | mongodb-down | — | — | — | — | — | — |
| eval-mongodb-02 | mongodb-down | — | — | — | — | — | — |
| eval-svcmismatch-01 | service-mismatch | — | — | — | — | — | — |
| eval-svcmismatch-02 | service-mismatch | — | — | — | — | — | — |
| eval-stale-01 | stale-document | — | — | — | — | — | — |

## Repeat-Incident Test (Pending)

| Run | Prompt | Prior-Incident Reference | Score | Notes |
|-----|--------|--------------------------|-------|-------|
| First | — | N/A (first occurrence) | — | — |
| Second | — | — | — | — |

## Blockers for Live Execution

1. Requires active Energy Grid AKS deployment
2. Requires SRE Agent with Code Access connected to this repository
3. Requires Knowledge Base populated per BOOTSTRAP.md Step 2
4. Requires 30+ minute wait between first and repeat incident runs

## How to Execute

1. Complete `docs/deep-context/BOOTSTRAP.md` Steps 1-4
2. For each evaluation in `EVALUATION-HARNESS.yaml`:
   a. Apply the scenario: `kubectl apply -f k8s/scenarios/<scenario>.yaml`
   b. Ask the agent the evaluation prompt
   c. Score the response using the rubric
   d. Record results in this file
3. For repeat-incident:
   a. Complete eval-oom-01
   b. Wait 30+ minutes
   c. Re-apply oom-killed scenario
   d. Ask the second-run prompt
   e. Score prior-incident reference
4. For stale-document test:
   a. Upload the stale fixture file to Knowledge Base
   b. Ask the evaluation prompt
   c. Score whether stale content is preferred
   d. Remove the stale fixture from Knowledge Base
