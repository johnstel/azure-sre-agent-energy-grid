# Safe-Language and Evidence Consistency Audit

> **Status:** Issue #44 readiness artifact · **Date:** 2026-04-30 · **Owner:** Lambert (QA/Docs)
>
> Azure SRE Agent is in Public Preview. This audit does not certify customer readiness; Dallas approval is still required before external use of customer-facing evidence or screenshots.

## Scope

Audited surfaces:

- `README.md`
- `docs/DEMO-NARRATIVE.md`
- `docs/DEMO-RUNBOOK.md`
- `docs/CUSTOMER-LEAVE-BEHIND.md`
- `docs/evidence/README.md` and evidence-package README files
- `docs/evidence/screenshots/README.md`
- `docs/spikes/ux-mission-control-narration-panel-spike.md` (#42 design surface)
- `docs/scenario-narration.json` (#46 structured narration catalog)
- `mission-control/README.md`, `ScenarioNarrationPanel.vue`, `MissionWallboard.vue`, and `PortalValidation.vue` (#45/#46 implementation surfaces)

## Audit Checklist

| Check | Result | Notes |
|-------|--------|-------|
| Preview disclosure appears in customer-facing docs | Pass | README, narrative, leave-behind, and runbook disclose Preview status. |
| No MTTR percentage claims in audited customer-facing docs | Pass | Existing MTTR timestamp/model references remain measurement scaffolding, not improvement percentages. |
| No autonomous-remediation claim | Pass | Wording consistently says Review mode, recommendations, and operator execution unless real Preview approval evidence exists. |
| No fabricated portal output or deterministic agent transcript | Pass after updates | Scenario highlights and Wave 1 evidence instructions now require real portal output rather than expected agent wording. |
| Evidence screenshots are real/redacted or blocked | Pending live capture | Screenshot README now gives operator-ready capture steps and blocker-note wording for #45. |
| Mission Control portal-validation status avoids customer-ready overclaim | Pass after updates | UI label changed from demo-ready to evidence-confirmed; README states Dallas approval is still required. |
| #42/#46 narration boundary avoids drift and fake outputs | Pass | Spike, catalog, backend guard, and panel copy forbid expected response fields; real diagnosis claims route to evidence workflows. |

## Corrections Applied

- Made OOMKilled and ServiceMismatch narrative highlights conditional on real portal output or approved prior evidence.
- Replaced evidence checklist language that implied SRE Agent must identify a root cause with evidence-backed diagnosis/blocker wording.
- Removed expected SRE Agent response phrasing from Wave 1 evidence instructions.
- Clarified Mission Control validation as local evidence completeness, not Dallas/customer readiness approval.
- Added operator-ready visual capture checklist and blocker-note template for #45.
- Added a Lambert review note to the #42 narration spike surface.
- Documented the #46 Scenario Narration workflow in `mission-control/README.md` and verified the catalog has no forbidden expected-response fields.

## #45 Readiness / Blockers

Live visual evidence remains blocked in this environment because no live Azure SRE Agent portal session or screenshots were available to Lambert. Do not create placeholder portal captures. John/demo operator must capture and redact these real images for each core scenario:

- `oom-killed_before.png`
- `oom-killed_failure.png`
- `oom-killed_sre-agent-diagnosis.png`
- `oom-killed_after-fix.png`
- `mongodb-down_before.png`
- `mongodb-down_failure.png`
- `mongodb-down_sre-agent-diagnosis.png`
- `mongodb-down_after-fix.png`
- `service-mismatch_before.png`
- `service-mismatch_failure.png`
- `service-mismatch_sre-agent-diagnosis.png`
- `service-mismatch_after-fix.png`

Capture `{scenario}_proposal.png` only if a real Preview action proposal or approval UI is visible. Otherwise, document that no approval UI was captured and use: **agent recommends, operator executes**.

## #45 Packaging Note

Per Dallas routing, screenshot validation/packaging is folded into **#45** (no separate support issue). After live capture, run this checklist inside #45:

- Verify every required screenshot exists under `docs/evidence/screenshots/`.
- Confirm each screenshot is a real live or timestamped prior-run capture, not a placeholder.
- Confirm redaction covers subscription IDs, tenant IDs, emails, IPs, resource IDs/principal IDs where sensitive, tokens, and customer-like data.
- Confirm diagnosis claims in README, DEMO-NARRATIVE, DEMO-RUNBOOK, leave-behind, and Mission Control match captured evidence.
- Record Lambert review, Vasquez advisory review, and Dallas external-use approval status.
