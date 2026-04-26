---
name: "contractor-engagement"
description: "Inventory-first contractor routing, Opus creative review, verbose developer handoffs, and safe vendoring rules for this Squad."
domain: "agent-governance"
confidence: "medium"
source: "user directive plus Opus contractor panel review"
---

## Context

Use this skill whenever a task may need expertise beyond Dallas, Ripley, Parker, Lambert, Scribe, or Ralph. The project now has a sanitized default Copilot inventory at `.squad/copilot-default-inventory.md` with 184 agents and 308 skills. That inventory is a discovery catalog, not a bulk-vendored prompt library.

The user wants more creativity and more complete developer handoffs. Contractors should be brought in deliberately, especially for creative work, architecture, governance, security, business/demo framing, SRE workflows, public documentation, and reviewer gates.

## Patterns

### Inventory-first routing

1. Classify the work: implementation, review, design, governance, documentation, business/demo, SRE, cost, security, or testing.
2. Search `.squad/copilot-default-inventory.md` for matching default Copilot agents or skills.
3. Select the most specific capability that matches the primary risk.
4. Decide whether to invoke it at runtime or vendor it into `.squad/skills/`.
5. Record the selection rationale in the spawn prompt, Scribe manifest, or a decision inbox entry.

### Contractor triggers

Bring contractors in before implementation when work includes:

- Mission Control UX/UI, wallboard layout, accessibility, or interaction design.
- Security, RBAC, Key Vault, NSG, network policy, agent tool governance, or trust boundaries.
- New architecture, new API families, WebSocket contracts, Bicep module architecture, or cross-module design.
- SRE Agent integration, observability, incident workflows, or new breakable scenario realism.
- Public docs, tutorials, README updates, demo scripts, or developer handoff documents.
- Business/demo positioning, executive framing, product scope, or customer value narrative.
- Cost-impacting Azure decisions.

Routine bug fixes, factual doc syncs, small K8s/Bicep edits, and session logging do not require contractors unless Dallas sees elevated risk.

### Model selection

- Use `claude-opus-4.6` for creative contractor work: UX/UI, brand, product, executive, architecture proposals, technical writing, diagrams, and high-stakes review.
- Use standard technical review models for narrow routine review when the work is not creative.
- Use the local Qwen coding preference for core implementation by Ripley, Parker, and Lambert when the runtime supports it.
- Keep Scribe and Ralph on cheap mechanical models.

### Verbose developer handoffs

Contractor handoffs should be summary-first but exhaustive below the fold:

1. Executive summary: problem, proposal, impact, decision needed, risk.
2. Implementation blueprint: target user, design principles, file-level impact map, API/data contracts, UX states, validation plan.
3. Acceptance criteria: binary, grouped, testable.
4. Diagrams: include Mermaid or other text diagrams when useful.
5. Appendices: alternatives, research, raw analysis, and capability provenance.

Diagrams are expected for UI layouts, workflows, data flow, architecture, governance, user journeys, incident lifecycle, and any multi-agent handoff.

### Invoke vs vendor

Default to runtime invocation. Vendor only when the capability becomes a reusable project asset.

Vendor a capability when:

- It is expected to be used 3 or more times.
- It needs energy-grid-specific customization.
- Multiple core agents need it.
- Workflow depends on deterministic project-local availability.
- The skill body is maintainable and can be adapted without copying irrelevant material.

Do not vendor:

- One-off creative or business reviews.
- Large raw agent prompts that are better invoked at runtime.
- Capabilities unrelated to this repo.
- Content that includes secrets, credentials, MCP configs, real external endpoints, or unrelated external operations.

### Vendored capability provenance

Every vendored capability must include provenance metadata:

- `source_path`
- `copied_at`
- `authorized_by`
- `reason`
- `modifications`
- `scope`
- `review_cadence`
- `next_review`
- `status`

Dallas approves vendoring. Lambert checks template quality and secret leakage. Scribe logs the decision and orchestration evidence.

## Examples

### Runtime contractor

Use a runtime contractor for a one-time Mission Control wallboard critique:

```text
Capability: design-ui-designer
Decision: invoke
Reason: creative one-off review; needs Opus 4.6 and diagrams; no recurring project-local skill required yet.
Model: claude-opus-4.6
Required output: executive summary, 1920x1080 layout diagram, file-level handoff, acceptance criteria.
```

### Vendored skill

Vendor a recurring K8s scenario QA checklist:

```yaml
---
name: "energy-scenario-validation"
description: "Reusable validation checklist for energy-grid breakable scenarios."
domain: "sre-testing"
confidence: "medium"
source: "vendored"
provenance:
  source_path: "~/.copilot/skills/example-scenario-validation/SKILL.md"
  copied_at: "2026-04-25T19:13:06Z"
  authorized_by: "Dallas"
  reason: "Parker and Lambert repeatedly validate scenario realism and docs alignment."
  modifications:
    - "Added energy namespace and sre-demo: breakable label requirements."
    - "Added BREAKABLE-SCENARIOS.md documentation checks."
  scope: "read-only guidance"
  review_cadence: "90d"
  next_review: "2026-07-24"
  status: "active"
---
```

## Anti-Patterns

- Do not bulk-copy all default Copilot agents or skills into the repo.
- Do not treat metadata-only inventory entries as executable instructions.
- Do not let contractors implement repo changes unless they have been made project agents and Dallas approved that authority.
- Do not skip diagrams for complex workflows just to keep the handoff short.
- Do not bury the decision in a long report; put the decision and risks in the executive summary.
- Do not vendor content without provenance, modification notes, and a freshness review date.
