---
title: "Mission Control Scenario Narration Panel"
category: "User Experience"
status: "🟢 Complete"
priority: "P1"
timebox: "1 day"
created: 2026-04-29
updated: 2026-04-29
owner: "Ripley"
tags: ["technical-spike", "user-experience", "mission-control", "safe-language", "research"]
---

# Mission Control Scenario Narration Panel

## Summary

**Spike Objective:** Design the impact map and implementation contract for a lightweight, read-only scenario narration panel in Mission Control.

**Why This Matters:** Presenters currently switch between Mission Control, `docs/DEMO-NARRATIVE.md`, and prompt docs during live demos. A small in-product narration aid can reduce presenter context-switching without turning Mission Control into a scripted slide deck or implying deterministic Azure SRE Agent behavior.

**Timebox:** 1 day

**Decision Deadline:** Before any Mission Control narration UI implementation begins.

## Research Question(s)

**Primary Question:** How should Mission Control expose scenario-specific presenter guidance while staying safe-language compliant and avoiding content drift from the demo narrative and prompt library?

**Secondary Questions:**

- Which Mission Control frontend/backend files would be affected?
- Should narration content be served by the existing scenario API or a new endpoint?
- How can the panel remain read-only, hideable, and useful on mobile presenter screens?
- What content must be explicitly forbidden?

## Investigation Plan

### Research Tasks

- [x] Read issue #42 requirements and acceptance criteria.
- [x] Review Mission Control README, package files, frontend scenario surfaces, backend scenario service, and portal validation workflow.
- [x] Review `docs/DEMO-NARRATIVE.md`, `docs/SRE-AGENT-PROMPTS.md`, `docs/PROMPTS-GUIDE.md`, and `docs/SAFE-LANGUAGE-GUARDRAILS.md`.
- [x] Review `.squad/routing.md` and `.squad/copilot-default-inventory.md`; UX and technical-writing contractors were consulted as runtime advisors per routing rules.
- [x] Document findings, recommendation, implementation impact map, and follow-up issues.

### Success Criteria

This spike is complete when:

- [x] Affected Mission Control components/files and backend/API needs are identified.
- [x] The content-source strategy explains how to avoid drift from demo narrative and prompt docs.
- [x] The panel is specified as read-only and hideable.
- [x] Deterministic or expected Azure SRE Agent response text is explicitly forbidden.
- [x] Follow-up implementation issue(s) are proposed for acceptance/review.

## Technical Context

**Related Components:**

- `mission-control/frontend/src/components/MissionWallboard.vue`
- `mission-control/frontend/src/components/ScenarioGrid.vue`
- `mission-control/frontend/src/components/PortalValidation.vue`
- `mission-control/frontend/src/composables/useApi.ts`
- `mission-control/frontend/src/types/api.ts`
- `mission-control/backend/src/services/ScenarioService.ts`
- `mission-control/backend/src/routes/scenarios.ts`
- `mission-control/backend/src/types/index.ts`
- `mission-control/README.md`
- `docs/DEMO-NARRATIVE.md`
- `docs/SRE-AGENT-PROMPTS.md`
- `docs/PROMPTS-GUIDE.md`
- `docs/SAFE-LANGUAGE-GUARDRAILS.md`

**Dependencies:** Review by Lambert for docs/safe-language consistency and Vasquez for narration quality before implementation.

**Constraints:**

- This is a spike only; do not implement the UI in this issue.
- No Bicep changes.
- Do not call or simulate Azure SRE Agent APIs from Mission Control.
- Do not display fabricated, deterministic, or expected Azure SRE Agent responses.
- Keep the feature lightweight and presenter-facing.

## Research Findings

### Current Mission Control Scenario Model

Mission Control already exposes 10 scenarios from `ScenarioService.ts` through `GET /api/scenarios`. The current `Scenario` contract contains only:

| Field | Current purpose |
|-------|-----------------|
| `name` | Scenario key, e.g. `oom-killed` |
| `file` | Kubernetes scenario manifest filename |
| `description` | Short operational description |
| `enabled` | Local in-memory active scenario state |

The active wallboard surface is `MissionWallboard.vue`, where scenario buttons live inside the collapsible Controls dock. `ScenarioGrid.vue` also exists as a card-based scenario surface, but the main app currently renders `MissionWallboard.vue`.

`PortalValidation.vue` already proves that Mission Control can show safe, presenter-oriented prompt copy and copy-to-clipboard actions. However, it hard-codes a subset of three scenario prompts/descriptions in both frontend and backend areas, creating a drift risk if reused as the narration source.

### Existing Content Sources

| Source | Best use | Drift risk |
|--------|----------|------------|
| `docs/DEMO-NARRATIVE.md` | Human-readable demo flow, scenario ordering, hooks, what to observe, fix path | Markdown is not ideal as runtime UI data; parsing headings would be brittle |
| `docs/SRE-AGENT-PROMPTS.md` | Per-scenario prompt variants | Prompt variants can diverge from Mission Control if copied into code |
| `docs/PROMPTS-GUIDE.md` | Broad prompt library | Too broad for scenario-card narration |
| `ScenarioService.ts` | Scenario manifest names and enable/disable state | Contains operational metadata but not presenter narration |
| `PortalValidation.vue` / `PortalValidationService.ts` | Evidence-validation workflow for three scenarios | Existing hard-coded copy should not become a second narration source |

### Safe-Language Implications

The narration panel is customer-facing presenter support. It must inherit the constraints in `docs/SAFE-LANGUAGE-GUARDRAILS.md`, especially:

- Azure SRE Agent is GA, while this lab pins `Microsoft.App/agents@2026-01-01` with the Stable channel and skips SRE Agent deployment if a subscription exposes only older preview provider metadata.
- Say "diagnoses issues you point it to" rather than "autonomously detects incidents."
- Say "recommends; operator executes" for this demo unless real approval evidence exists.
- Do not claim production readiness, production-grade RBAC, full audit trail, or quantified MTTR reduction.
- Do not claim Azure SRE Agent diagnosed a scenario until real portal evidence has been captured and validated.

## Decision

### Recommendation

Build a **read-only, hideable Scenario Narration Panel** as a follow-up implementation issue. The panel should appear near the Mission Control scenario controls, provide just-in-time presenter guidance for the selected or active scenario, and serve content from a single structured scenario narration catalog shared by backend and docs.

### Proposed UX

#### Placement

Preferred placement is inside `MissionWallboard.vue` within the existing Controls dock, adjacent to the Scenarios card:

```text
Controls dock
├─ Preflight
├─ Deploy
├─ Destroy
├─ Scenarios
│  ├─ Inject/Repair buttons
│  └─ Narration toggle / selected scenario affordance
├─ Scenario Narration Panel (hideable, read-only)
└─ Portal Evidence Validation
```

This keeps narration close to the "Inject Fault" action and avoids adding another primary wallboard region. If `ScenarioGrid.vue` becomes the rendered scenario surface later, the same panel contract can be embedded below each scenario card or in a side drawer.

#### Information Hierarchy

For each scenario, show only:

1. **Scenario hook** — one or two safe-language presenter sentences.
2. **Observe** — what to inspect in Mission Control or terminal, e.g. pod restarts, endpoint count, active incidents, or event stream.
3. **Suggested SRE Agent prompt** — one approved prompt from `docs/SRE-AGENT-PROMPTS.md`.
4. **Restore path** — repair scenario or `kubectl apply -f k8s/base/application.yaml`.
5. **Evidence reminder** — if applicable, use Portal Validation before making diagnosis claims.
6. **Source links** — references to `DEMO-NARRATIVE.md`, `SRE-AGENT-PROMPTS.md`, and scenario YAML.

Do **not** show expected SRE Agent answers, sample transcripts, or deterministic root-cause wording in this panel.

#### States

| State | Behavior |
|-------|----------|
| Hidden | Default available from a "Narration" toggle; no scenario content consumes wallboard space |
| Collapsed | Shows selected scenario name and one-line hook |
| Expanded | Shows hook, observe bullets, prompt, restore path, source links, and safe-language reminder |
| No scenario selected | Shows "Select a scenario to view presenter notes" |
| Active scenario | Auto-suggests the active scenario but does not force-open the panel |
| Multiple active scenarios | Shows a selector sorted by active scenarios first; does not combine narratives |
| Missing content | Shows "Narration unavailable; use DEMO-NARRATIVE.md" and logs a non-fatal warning |

#### Read-Only and Hideable Requirements

- The panel must not mutate scenario state.
- No freeform editing, notes capture, transcript capture, or validation state belongs in this panel.
- Existing scenario actions remain the only inject/repair controls.
- Hide/collapse state may be kept in component state or `localStorage`; either is acceptable because it is a presenter preference, not operational state.
- Copying the suggested prompt is acceptable; copying expected answers is forbidden because expected answers must not exist in the data contract.

#### Mobile / Presenter View

For narrow screens, use a bottom-sheet or full-width collapsible card under the scenario controls:

- Keep "Copy Prompt" and "Hide" reachable without horizontal scrolling.
- Limit expanded content to short bullets; avoid long paragraphs.
- Put restore path below the prompt so presenters can copy the prompt first.
- Ensure `aria-expanded`, `aria-controls`, focus return on close, and keyboard operation.
- Do not auto-open on mobile after injecting a scenario; unexpected movement can disrupt screen sharing.

### Content Source Contract

#### Preferred Source of Truth

Create one structured content catalog in a follow-up issue, for example:

- `docs/scenario-narration.json`

Mission Control should load narration content from the backend, and documentation should reference the same catalog when possible. Avoid parsing Markdown at runtime; Markdown headings in `DEMO-NARRATIVE.md` are optimized for humans and will be fragile as API input.

#### Proposed Data Contract

```ts
interface ScenarioNarration {
  scenarioName: string;              // matches Scenario.name
  title: string;                     // display title
  demoTier: 'core' | 'extended';
  order?: number;                    // recommended demo order
  hook: string[];                    // 1-2 safe-language sentences
  observe: string[];                 // Mission Control or terminal observations
  suggestedPrompt: {
    stage: 'open-ended' | 'direct' | 'specific' | 'remediation';
    text: string;
    source: 'docs/SRE-AGENT-PROMPTS.md';
  };
  restorePath: {
    label: string;
    command?: string;                // e.g. kubectl apply -f k8s/base/application.yaml
    missionControlAction?: 'repair-scenario' | 'repair-all';
  };
  sourceRefs: Array<{
    label: string;
    path: string;
    section?: string;
  }>;
  safetyNotes: string[];
}
```

#### Explicitly Forbidden Fields

The content catalog must not include fields such as:

- `expectedAgentResponse`
- `expectedDiagnosis`
- `rootCauseAnswer`
- `sampleTranscript`
- `agentWillSay`
- `successCriteriaForAgentText`

Use observable system signals and presenter prompts instead. If the team needs evidence of Azure SRE Agent output, use the existing Portal Validation workflow and real redacted artifacts, not narration data.

### Backend/API Impact Map

| File | Proposed impact |
|------|-----------------|
| `mission-control/backend/src/types/index.ts` | Add `ScenarioNarration` and optionally extend `Scenario` with `narration?: ScenarioNarration` if bundled |
| `mission-control/backend/src/services/ScenarioService.ts` | Load structured narration catalog and join by `scenario.name`; keep enable/disable logic unchanged |
| `mission-control/backend/src/routes/scenarios.ts` | Either extend `GET /api/scenarios` to include narration or add `GET /api/scenarios/:name/narration` |
| `mission-control/backend/src/server.ts` | No change if using existing scenario route; route registration only if a new narration route is chosen |
| `mission-control/backend/src/services/PortalValidationService.ts` | No direct dependency; future cleanup could consume shared prompt metadata to remove hard-coded duplicates |

**Recommended API shape:** extend `GET /api/scenarios` with optional `narration` for each scenario. Mission Control already fetches scenarios for the controls; bundling avoids an extra request and keeps selected/active scenario narration synchronized with the scenario list.

### Frontend Impact Map

| File | Proposed impact |
|------|-----------------|
| `mission-control/frontend/src/types/api.ts` | Mirror `ScenarioNarration` and extend `Scenario` |
| `mission-control/frontend/src/composables/useApi.ts` | No change if `getScenarios()` remains the only API call |
| `mission-control/frontend/src/components/MissionWallboard.vue` | Host the panel near scenario controls, pass selected/active scenario, persist hidden/collapsed preference if desired |
| `mission-control/frontend/src/components/ScenarioGrid.vue` | Keep compatible if this component becomes active again; optionally render compact narration affordance per card |
| `mission-control/frontend/src/components/ScenarioNarrationPanel.vue` | New component recommended for separation; read-only props in, events only for hide/collapse/copy prompt |
| `mission-control/frontend/src/styles/theme.css` | Add minimal panel/bottom-sheet styles using existing card, badge, command-button, and field-control patterns |
| `mission-control/frontend/src/components/PortalValidation.vue` | No change for v1; later dedupe prompt copy from the shared catalog |

### Documentation Impact Map

| File | Proposed impact |
|------|-----------------|
| `mission-control/README.md` | Add narration panel feature and any new API contract |
| `docs/DEMO-NARRATIVE.md` | Reference the structured catalog as the Mission Control narration source or keep a manually reviewed alignment table |
| `docs/SRE-AGENT-PROMPTS.md` | Identify which prompt is the preferred `suggestedPrompt` per scenario |
| `docs/SAFE-LANGUAGE-GUARDRAILS.md` | No required change; cite it from implementation PR |

### Validation Plan for Implementation

- `npm run lint -w frontend`
- `npm run lint -w backend`
- `npm run build`
- If backend content loading has parser/validation logic, add a small Node test or TypeScript unit test that asserts:
  - every `SCENARIO_REGISTRY` item has narration content;
  - every narration item maps to an existing scenario;
  - forbidden fields do not appear in the catalog;
  - `suggestedPrompt.text` is present in `docs/SRE-AGENT-PROMPTS.md` or has an explicit source reference.
- Manual accessibility smoke test:
  - keyboard can open, collapse, copy, and close panel;
  - screen reader labels describe the selected scenario and copy action;
  - mobile viewport does not overlap scenario action buttons.
- Safe-language review by Lambert before customer-facing use.

## Alternatives Considered

| Option | Decision | Rationale |
|--------|----------|-----------|
| Hard-code narration in Vue component | Reject | Fast but repeats the current PortalValidation drift problem |
| Parse `DEMO-NARRATIVE.md` at runtime | Reject | Markdown structure is human-oriented and brittle |
| Add a CMS/editable panel | Reject | Overbuilt for a local demo tool; violates read-only scope |
| Store narration in backend TypeScript constants only | Acceptable fallback | Better than frontend duplication, but docs drift remains unless validation checks are added |
| Structured catalog loaded by backend | Recommend | Best balance of lightweight implementation, validation, and docs alignment |


## Lambert Safe-Language Review

Reviewed for issue #44 readiness on 2026-04-30. The design stays within safe-language boundaries because it keeps the panel read-only, forbids expected SRE Agent response fields, and routes real diagnosis claims to the Portal Validation/evidence workflow instead of narration content. Implementation issue #46 must preserve those constraints and require Dallas approval before any captured portal evidence is used externally.

## Follow-up Actions

- [ ] Lambert reviews this spike for safe-language and documentation consistency.
- [ ] Vasquez reviews the hook/observe/prompt content quality before implementation.
- [ ] Create implementation issue after acceptance.
- [ ] Consider a cleanup issue to dedupe Portal Validation prompt copy from the shared catalog.

## Recommended Follow-up GitHub Issues

### Issue A — Implement Mission Control Scenario Narration Panel

**Title:** `Implement Mission Control Scenario Narration Panel`

**Labels:** `squad`, `squad:ripley`, `type:feature`, `priority:p1`, `release:backlog`

**Owner route:** Ripley implementation; Lambert safe-language/docs review; Vasquez narration quality review.

**Body outline:**

- Context: accepted issue #42 spike; presenter guidance should appear near Mission Control scenario controls.
- Scope:
  - Add structured scenario narration catalog.
  - Extend scenario API/types to include read-only narration.
  - Add hideable `ScenarioNarrationPanel` in `MissionWallboard.vue` near scenario controls.
  - Support mobile bottom-sheet/collapsible behavior.
  - Add copy suggested prompt action.
  - Update `mission-control/README.md`.
- Guardrails:
  - No Bicep changes.
  - No Azure SRE Agent API calls.
  - No deterministic/expected SRE Agent response text.
  - Read-only; no editing or evidence capture in this panel.
- Acceptance criteria:
  - Every existing scenario has hook, observe bullets, suggested prompt, restore path, and source refs.
  - Panel can be hidden/collapsed and remains keyboard accessible.
  - Mobile layout remains usable at narrow viewport.
  - Forbidden response fields are absent from content.
  - Lint/build pass.

### Issue B — Dedupe Portal Validation Prompt Metadata

**Title:** `Deduplicate Mission Control scenario prompt metadata`

**Labels:** `squad`, `squad:ripley`, `type:chore`, `priority:p2`, `release:backlog`

**Owner route:** Ripley for implementation; Lambert for prompt/docs verification.

**Body outline:**

- Context: `PortalValidation.vue` and `PortalValidationService.ts` hard-code prompts/descriptions for three scenarios. After narration catalog acceptance, those prompts should come from shared metadata or be validated against it.
- Scope:
  - Reuse shared prompt metadata for OOMKilled, MongoDBDown, and ServiceMismatch where appropriate.
  - Preserve existing Portal Validation behavior and storage.
  - Add validation to prevent prompt drift.
- Guardrails:
  - Do not alter evidence-confirmation semantics.
  - Do not add expected SRE Agent responses.
  - Do not broaden Portal Validation beyond approved scenarios unless Dallas approves.

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-04-29 | 🟡 In Progress | Issue read, Mission Control and safe-language sources reviewed |
| 2026-04-29 | 🟢 Complete | Design/impact map and follow-up issue recommendations documented |

---

_Last updated: 2026-04-29 by Ripley_
