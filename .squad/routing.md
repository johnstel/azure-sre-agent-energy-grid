# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Bicep IaC, Azure modules | Ripley | New Bicep modules, parameter changes, deployment scripts |
| K8s manifests, scenarios | Parker | Application YAML, breakable scenarios, namespace config |
| Validation, docs, QA | Lambert | validate-deployment.ps1, docs/, testing scenarios |
| Architecture, scope, review | Dallas | Bicep architecture, cross-cutting decisions, code review |
| PowerShell scripts | Ripley + Lambert | Ripley implements, Lambert validates |
| Observability, monitoring | Parker | Grafana, Prometheus, alerting, App Insights config |
| SRE Agent config | Dallas + Parker | Dallas decides scope, Parker implements |
| DevContainer setup | Ripley | .devcontainer/ changes, tooling |
| Contractor review | Dallas | Use `.squad/copilot-default-inventory.md` first; route to specialist bench agents/skills when triggers below match |
| Session logging | Scribe | Automatic — never needs routing |

## Contractor Engagement

Contractors are used to improve creativity, domain depth, and developer handoff quality without permanently bloating the core team. Dallas owns contractor selection and approval. Contractors advise, review, design, and recommend; core project agents implement unless Dallas explicitly creates a permanent project-local agent/skill.

### Inventory-First Routing

Before spawning a contractor or invoking a skill:

1. Check `.squad/copilot-default-inventory.md` for matching default Copilot agents or skills.
2. Prefer the most specific capability that matches the work type.
3. Decide whether to **invoke** it as a one-shot runtime contractor/skill or **vendor** it into `.squad/skills/` or a project agent charter.
4. Log the selection rationale in the Scribe manifest or a decision inbox entry.

### Contractor Trigger Matrix

| Trigger | Requirement | Recommended Capabilities |
|---------|-------------|--------------------------|
| Mission Control UX/UI, wallboard, interaction model, accessibility | **MUST** use contractors before implementation | `design-ux-architect`, `design-ui-designer`, `testing-accessibility-auditor`, `design-brand-guardian` |
| Security, RBAC, Key Vault, network policy, NSG, agent tool governance | **MUST** use contractors before implementation/review | `engineering-security-engineer`, `agentic-identity-trust`, `automation-governance-architect`, `security-review`, `threat-model-analyst` |
| New architecture, API families, WebSocket contracts, cross-module Bicep design | **MUST** use contractors before implementation | `engineering-software-architect`, `engineering-backend-architect`, `azure-architecture-autopilot` |
| SRE Agent integration, observability, breakable-scenario realism, incident workflows | **MUST/SHOULD** use contractors depending on scope | `engineering-sre`, `engineering-incident-response-commander`, `azure-resource-health-diagnose` |
| Public docs, tutorials, README, developer handoffs, demo scripts | **MUST** use verbose contractor handoff for creative/public-facing material | `engineering-technical-writer`, `documentation-writer`, `developer-advocate`, `create-readme` |
| Business/demo positioning, executive narrative, GTM or customer value framing | **SHOULD** use contractors before developers build visible flows | `product-manager`, `design-brand-guardian`, `executive-summary-generator`, `developer-advocate` |
| Cost-impacting Azure changes | **SHOULD** use contractors before approval | `azure-pricing`, `engineering-devops-automator`, `engineering-software-architect` |
| Small bug fixes, factual doc syncs, routine K8s/Bicep edits | Contractor optional | Route to core owner and Dallas/Lambert review |

### Model Policy

| Lane | Applies To | Model |
|------|------------|-------|
| Creative contractor work | UX/UI, brand, product, executive, technical writing, architecture proposals, diagrams, high-stakes reviews | `claude-opus-4.6` |
| Technical contractor triage | Focused code review, routine DevOps advice, simple advisory checks | `claude-sonnet-4.5` or platform default if not creative |
| Core implementation | Ripley, Parker, Lambert coding or scripts | Local Qwen preference from `.squad/config.json`, with platform coding fallback |
| Scribe/Ralph | Logging and monitoring | `claude-haiku-4.5` |

Creative contractor output must be verbose, implementation-ready, and include diagrams when they clarify workflows, architecture, data flow, UI layout, governance, or incident lifecycle.

### Invoke vs Vendor

Default: **invoke at runtime**. Vendor only when the capability becomes a reusable project asset.

| Condition | Decision |
|-----------|----------|
| One-off review, creative exploration, business narrative, or broad specialist advice | Invoke runtime contractor/skill |
| Expected use 3+ times, multiple core agents need it, or workflow depends on it | Consider vendoring |
| Needs energy-grid-specific paths, namespace constraints, Azure/SRE conventions, or local model rules | Prefer vendoring a project-local skill |
| Full raw agent prompt is large, generic, or not project-specific | Do not vendor; invoke contractor |
| Skill/agent content references secrets, credentials, MCP configs, or unrelated external operations | Do not vendor until redacted and approved |

Vendored capabilities must include provenance metadata: source path, copied_at, authorized_by, reason, modifications, scope, review cadence, next_review, and status. Dallas approves vendoring; Lambert verifies template quality and secret leakage; Scribe logs the decision.

### Developer Handoff Standard

Contractor handoffs should use summary-first, exhaustive-detail structure:

1. Executive summary: problem, proposal, impact, decision needed, risks.
2. Implementation blueprint: target user, design principles, file-level impact map, API/data contracts, UX states, validation plan.
3. Acceptance criteria: binary, grouped, testable.
4. Diagrams: Mermaid or other text diagrams when useful, each with a caption and what-to-look-for note.
5. Appendices: alternatives, research, raw analysis, inventory capability provenance, and vendored capability notes.

Dallas decides whether the handoff is sufficient for implementation. If rejected, reviewer lockout applies and a different agent/contractor revises.

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
8. **Inventory-first contractor routing** — before contractor work, check `.squad/copilot-default-inventory.md` and record invoke/vendor rationale.
9. **Creative handoffs use Opus 4.6** — design, docs, architecture, product, brand, executive, and diagram-heavy contractor work uses `claude-opus-4.6`.
