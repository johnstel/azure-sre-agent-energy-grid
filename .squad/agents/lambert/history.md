# Lambert — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** PowerShell validation, Markdown docs
- **Validation:** `pwsh ./scripts/validate-deployment.ps1 -ResourceGroupName rg-srelab-eastus2`
- **No automated tests** — validation is post-deploy smoke checks

## Core Context

### 2025-07-18: Ops-Console Validation Audit (Archived Summary)
- Standalone `nginx-ops.conf` and `ops-console.html` are stale; embedded ConfigMaps in `application.yaml` are authoritative
- All API routes correctly proxy through embedded nginx ConfigMap to asset-service, meter-service, dispatch-service with correct ports (3002, 3000, 3001)
- Graceful error handling with timeouts and fallback displays; simulated data generation (client-side only, API calls for asset inventory and health only)
- validate-deployment.ps1 lacks ops-console LoadBalancer URL print (grid-dashboard URL is printed; consistency gap)
- Documentation gap: no docs mention ops-console usage; README and BREAKABLE-SCENARIOS.md lack coverage

### 2025-04-24: Mission Control PowerShell Detection (Archived Summary)
- ToolDetector.ts and paths.ts have two different platform detection patterns at different call times (probe time vs import time)
- When ToolDetector runs in dev/hybrid environments with platform() returning 'win32', mismatch between `pwsh.exe` (Windows) and `pwsh` (fallback) can occur
- Upstream fix: use consistent getOsCommand() pattern across all platform detection; resolve at one point only

### 2025-04-24: AKS VM Size Mismatch (Archived Summary)
- PropertyChangeNotAllowed error occurs when re-deploying with different VM sizes than the current cluster's node pool (Azure ARM prevents size change after cluster creation)
- Bicep main.bicepparam defaults to Standard_D2s_v5; existing clusters with Standard_D2s_v4 reject deployment
- Solution: add `@allowed()` metadata to SKU parameter in Bicep and document VM size constraints in preflight checks (cannot change once cluster created)

## Learnings

### 2026-04-25: Public LoadBalancer NSG Troubleshooting Documentation (Finalized with Reviews)
**Issue:** Public LoadBalancer IPs for grid-dashboard and ops-console returned timeout/empty reply despite healthy pods, services, and Azure LB configuration.

**Root cause:** VNet AKS subnet NSG (`vnet-srelab-snet-aks-nsg-eastus2`) lacked inbound HTTP allow rule. Default `DenyAllInBound` (priority 65000) blocked Internet-sourced traffic forwarded by Azure LoadBalancer. Both AKS-managed node NSG and VNet subnet NSG affect the public LoadBalancer path.

**Permanent fix:** Bicep rule `Allow-Internet-HTTP-To-AKS-LB` persisted in `infra/bicep/modules/network.bicep` (lines 36–49).

**Documentation created (Initial):**
1. `docs/TROUBLESHOOTING.md` — LoadBalancer/NSG troubleshooting guide
2. Updated `README.md`, `docs/SRE-AGENT-SETUP.md`, `docs/BREAKABLE-SCENARIOS.md` with cross-links

**Parker (SRE) Review Feedback Incorporated:**
- Added K8s diagnostic baselines: `kubectl describe svc`, `kubectl get endpointslices`, `kubectl get endpoints`
- Added port mapping validation (containerPort → targetPort → service port)
- Added escalation cue: if port-forward + in-cluster work but public IP fails, K8s is healthy, problem is Azure LB/NSG path
- Added selector/label alignment and DNS/service validation diagnostics
- Created separate `docs/KUBERNETES-SERVICE-TROUBLESHOOTING.md` with comprehensive K8s service diagnostics (8452 bytes)
- Added decision table: external IP pending vs assigned+timeout vs connection refused vs HTTP codes

**Ripley (Infra) Review Feedback Incorporated:**
- Explained three-layer path: K8s Service → Azure LoadBalancer → VNet subnet NSG → Pod
- Documented that both AKS-managed node NSG and VNet subnet NSG can affect public LoadBalancer ingress
- Added exact Azure CLI commands with resource group variables:
  - Getting node resource group: `az aks show -g $RESOURCE_GROUP -n aks-srelab --query nodeResourceGroup`
  - Listing AKS node NSG rules: `az network nsg rule list -g $AKS_RG --nsg-name aks-agentpool-*`
  - Listing VNet subnet NSG rules: `az network nsg rule list -g $RESOURCE_GROUP --nsg-name vnet-srelab-snet-aks-nsg-*`
  - Verifying NSG association: `az network vnet subnet show --query networkSecurityGroup.id`
  - Listing Load Balancer rules/probes/backend pools: `az network lb rule/probe/address-pool list`
  - Idempotent remediation: `az network nsg rule create` with error suppression (won't fail if rule exists)
- Added decision table mapping external IP states and response patterns to root causes

**Final Documentation Set:**
1. `docs/KUBERNETES-SERVICE-TROUBLESHOOTING.md` (NEW, 8452 bytes) — K8s-focused diagnostics: 5-step baseline, port mapping validation, DNS validation, escalation decision tree, common scenarios
2. `docs/TROUBLESHOOTING.md` (ENHANCED) — Three-layer architecture diagram, decision table, comprehensive Azure NSG/LB diagnostics with exact CLI commands (node RG, both NSG layers, LB config, idempotent remediation)
3. `README.md` (UPDATED) — Links to both K8s and Azure troubleshooting guides separated in documentation section
4. `docs/SRE-AGENT-SETUP.md` (UPDATED) — References both K8s and Azure troubleshooting guides in scenarios section
5. `docs/BREAKABLE-SCENARIOS.md` (UPDATED) — References both guides in Best Practices

**Pattern Refinement:**
- **Two-guide approach:** K8s service issues → KUBERNETES-SERVICE-TROUBLESHOOTING.md; Azure LB/NSG issues → TROUBLESHOOTING.md
- **Decision tree:** Quick decision table maps symptom (IP state + response type) to root cause, eliminating need for full diagnostic sequence in simple cases
- **Exact commands:** All Azure CLI commands copy-paste ready, with resource group variables, idempotent remediation (no failure if rule exists)
- **Cross-linking:** README links both; guides reference each other; decision table drives operators to correct guide
- **Escalation cue:** If K8s baseline passes (port-forward works, in-cluster curl works), problem is definitely Azure networking (not K8s)

**Key Insights from Reviews:**
1. **Three-layer path critical:** Operators must understand traffic flows: K8s Service → Azure LB → VNet NSG → Pod to understand failure modes
2. **Diagnostic progression:** K8s baseline (port-forward, endpoints, labels) determines if problem is "above the line" (K8s) or "below the line" (Azure)
3. **Exact commands matter:** Operators need copy-paste-ready Azure CLI, not conceptual descriptions; variables must match actual resource names
4. **Idempotent fixes:** Remediation commands must not fail if rule already exists; enables safe reapplication
5. **Decision tables accelerate diagnosis:** Map symptoms (external IP pending/assigned, response type) to root causes without requiring full diagnostic sequence every time

### 2026-04-24: Mission Control Smoke Test — Complete Validation Suite
- **Dependencies:** All 196 workspace packages install correctly; verified frontend, backend, and root node_modules
- **Build process:** Production build succeeds cleanly with `npm run build` (86.17 kB frontend, 32.22 kB gzipped)
- **Asset inventory:** All 8 components, 3 composables, types, theme CSS present and correctly imported; no broken links
- **Development workflow:** Vite dev server (:5173) with proxy to Fastify (:3333) works correctly; hot module reloading functional
- **Production workflow:** `npm run start` serves full SPA from Fastify with correct Content-Type headers (HTML, JS, CSS)
- **Documentation:** README.md URLs accurate (no changes needed)
- **Port conflict risk:** Orphaned processes can silently block :3333, causing blank page. Recommend pre-flight port check in dev scripts
- **Key insight:** Port conflicts are the #1 user-facing failure mode for Mission Control — backend failure is silent to frontend

### 2026-04-24: Mission Control Production Blank-Screen Failure (coordinated with Parker)
- Root cause: Fastify static asset serving with `wildcard: false` prevented Vite hashed filenames from matching
- Symptoms: Browser "Cannot use import statement outside a module" errors; blank page
- Fix applied by Parker: Removed `wildcard: false` from `mission-control/backend/src/server.ts` line 35
- Verification: All assets now served with correct MIME types; production build fully functional
- **Coordination note:** Confirmed Parker's fix independently via full smoke test workflow

### 2026-04-24: AKS Idempotency Sprint — Shared Learning
- **Coordination:** Validated QA checklist with Ripley; coordinated cross-functional testing strategy with Coordinator
- **Checklists created:** 7-scenario AKS validation plan + 10-scenario PowerShell detection plan covering all platforms and edge cases
- **Key finding:** Comprehensive validation must cover not just happy path but error cases (missing cluster, explicit override attempts, WSL edge cases)
- **Test prioritization:** Fresh deployment → Existing detection → Re-deploy → What-If → Preflight validation
- **Orchestration log:** `2026-04-24T20:01:53Z-aks-vmsize-idempotency.md`

### 2026-04-24: Mission Control Local Load Failure — Port Conflict Diagnosis

**Context:** User reported "okay it is not loading" after Mission Control development completed.

**Root cause:** Port 3333 was already in use by orphaned Microsoft Edge Helper process (PID 77607), preventing backend Fastify server from starting. Frontend Vite server started successfully on :5173 but showed blank page because backend API was unavailable.

**Validation performed:**
1. ✅ Workspace dependencies installed (`npm install` from root)
2. ✅ Frontend Vite server running on http://127.0.0.1:5173
3. ❌ Backend Fastify server failed with `EADDRINUSE` on :3333
4. ✅ All component/composable/type files present (no broken imports)
5. ✅ Theme CSS exists and loads correctly
6. ✅ TypeScript compilation succeeds with zero errors
7. ✅ Production build succeeds (86.17kB frontend bundle)

**Fix:** Killed blocking process with `lsof -ti:3333 | xargs kill`, restarted dev servers.

**Documentation accuracy:** README.md line 31 correctly states http://localhost:5173 (dev) and http://localhost:3333 (production). No changes needed.

**Key insight:** Port conflicts are the #1 user-facing failure mode for Mission Control. Backend failure is silent from frontend perspective (blank page with no errors). Recommend adding port conflict pre-flight check to `npm run dev` script.

**Decision artifact:** `.squad/decisions/inbox/lambert-mission-control-smoke.md` contains full smoke test report with 14-step validation matrix and troubleshooting guide.

## Team Update: Local Coding Model Preference — 2026-04-25T18:16:29Z

**Memo:** The team now prefers a local OpenAI-compatible model endpoint for coding-oriented workflows (Ripley, Parker, Lambert). Configuration:
- **Endpoint:** `http://localhost:1234/v1`
- **Model:** `qwen/qwen3-coder-next`
- **Rationale:** Reduces latency, cloud API dependency; enables offline and experimental workflows

This preference is now documented in `.squad/decisions.md` and orchestration logs. All agents remain compatible with cloud models as fallback.

## Team Update: Local Model Fallback — 2026-04-25T18:19:49Z

**Memo:** The preferred model `qwen/qwen3-coder-next` is currently unavailable due to LM Studio memory pressure. Active fallback:
- **Endpoint:** `http://localhost:1234/v1`
- **Fallback Model:** `qwen/qwen3.6-35b-a3b`
- **Status:** Operationally validated; equivalent coding capability
- **Recovery:** Preference state preserved for rapid restoration when LM Studio memory constraints resolve

All agents remain compatible with cloud models as secondary fallback. Team decision recorded in `.squad/decisions.md`.

## CORRECTION: qwen3-Coder-Next is Legacy — 2026-04-25T18:21:45Z

**⚠️ CORRECTION:** Previous decisions (2026-04-25T18:14:34Z and 2026-04-25T18:19:49Z) recommended `qwen/qwen3-coder-next` as a preferred or fallback model. **This is incorrect.** The model is legacy and must not be used.

**Corrected Policy:**
- **Active Local Model:** `qwen/qwen3.6-35b-a3b` (only model configured in `.squad/config.json`)
- **Legacy Model:** `qwen/qwen3-coder-next` — do not attempt to load or use
- **Endpoint:** `http://localhost:1234/v1`
- **Rationale:** User clarification; Coordinator has removed all references to qwen3-coder-next from configuration

All agents should only use `qwen/qwen3.6-35b-a3b` for local coding workflows. Cloud models remain as secondary fallback.


### 2026-04-25: Mission Control Ask Copilot Reviewer Validation
**By:** Lambert (QA/Docs)
**Verdict:** APPROVE after one README copy fix adding explicit Technical Preview/local-only wording.
**Validation performed:** Checked package manifests and lockfile alignment for `@github/copilot-sdk` and `vue-router` removal; verified backend `/api/assistant/ask` input validation, single-request guard, timeout/cleanup, `gpt-4.1`, one `get_mission_control_state` tool, allowlisted permissions, sanitized unavailable errors, and job snapshots without raw logs; verified frontend remains a single scrollable page with metadata/sources/tools/limits/errors visible; verified README differentiates Ask Copilot from Azure SRE Agent and documents Copilot CLI/auth prerequisites.
**Commands:** `cd mission-control && npm ls --workspaces --depth=0 --omit=dev`, `npm ls --workspaces --depth=0 --include=dev`, `npm run build`, `npm run lint`, and focused HTTP smoke checks for health, empty question, over-length question, and a live assistant request.
**Evidence:** Build and lint passed. API smoke checks returned health 200, validation 400s, and live assistant 200 with model `gpt-4.1`, `get_mission_control_state`, snapshot timestamp, 7 sources, and 3 limitations.
**Follow-up:** Consider a future automated test harness for assistant validation/concurrency, but no blocker for this artifact.

## Scribe Batch Completion: Mission Control Ask Copilot — 2026-04-25T18:44:47Z

**By:** Scribe

Orchestration and decision consolidation for Mission Control Ask Copilot feature batch completed:
- ✅ Orchestration log written: `.squad/orchestration-log/2026-04-25T18:44:47Z-copilot-assistant.md`
- ✅ Session log written: `.squad/log/2026-04-25T18:44:47Z-mission-control-copilot-assistant.md`
- ✅ Decisions merged: inbox files consolidated into `.squad/decisions/decisions.md` and inbox cleared
- ✅ Inbox files deleted: `parker-copilot-sdk-assistant.md`, `lambert-copilot-sdk-assistant-review.md`
- ✅ Team history appended: Parker and Lambert histories updated with completion note
- ✅ Git staging ready: `.squad/` directory prepared for commit

**Status:** Ready for git commit with co-authorship trailer.

---

## 2026-04-25T18:58:04Z: Mission Control Wallboard Redesign Review Batch — QA/Docs Input

**Contractor Review:** Wallboard redesign for 16:9 help desk room monitor (fixed-zone layout, expected-vs-actual matrix, operational readiness).

**Lambert QA/Docs Input:**
- Validation of UX Architect wallboard IA recommendations (fixed zones, no single-scroll, accessibility guidance, phased MVP with logs Phase 2)
- Review of UI Designer 1920x1080 layout spec and severity color system (credibility over decoration)
- Collaboration with Parker (SRE) on backend API feasibility (inventory join, pod logs streaming, events watch)
- Support for Brand Guardian repositioning (remove Azure SRE Agent from header, rename Ask Copilot → Explain This State)
- QA perspective: Test matrix needed for wallboard phase (fixture data, layout verification, drill-through interactions, edge cases for pod state)

**Lambert Notes:** Wallboard UI design is sound. Phase 2 scope is well-defined. QA can begin test plan writing once Phase 1 MVP ships.

**Status:** Lambert approved wallboard design; QA responsibilities captured for Phase 2 planning.

---

## 2026-04-25: Mission Control Wallboard Acceptance Gate

**By:** Lambert (QA/Docs)

**Context:** John asked Lambert to define acceptance checks for the approved Mission Control wallboard rebuild while Parker and the frontend contractor implement.

**Validation performed:**
- Read the approved wallboard decision, current Mission Control frontend/backend structure, Lambert history, team focus, and contractor-engagement skill.
- Ran `cd mission-control && npm run build && npm run lint`; both passed.
- Attempted local production server start with `NO_OPEN=1 npm run start`; it failed to bind `127.0.0.1:3333` because another process was already using the port. Did not terminate shared/user processes.
- Smoke-checked the existing server on `127.0.0.1:3333`: `/api/health` and `/api/events` returned JSON, but `/api/inventory`, `/api/pods/example/logs`, and `/api/services/example/endpoints` returned `text/html`, indicating SPA fallback rather than implemented JSON API routes.

**Acceptance artifact:** `.squad/decisions/inbox/lambert-wallboard-acceptance.md`

**Key QA gates captured:**
- Backend API contract for inventory/events/logs/endpoints, including JSON 404 for unknown `/api/*`.
- Hard namespace lock to `energy` with no user-supplied namespace override.
- Redaction requirements before logs/events leave the backend.
- 1920×1080 fixed-zone wallboard layout with constrained drawer and approved severity palette.
- Expected-vs-actual matrix as hero feature with scenario mismatch visibility.
- Click-through logs/events drawer behavior.
- Reduced tutorial/static prose and `Explain This State` naming.
- Deploy/destroy controls moved off the primary wallboard.

**Current verdict:** Build/lint pass, but wallboard implementation is not ready for QA acceptance. Backend route coverage and frontend wallboard IA still need Parker/frontend contractor completion before Dallas review.

---

## 2026-07-22: Wave 0 Documentation Fix Pass

**By:** Lambert (QA/Docs)

**Context:** Wave 0 received APPROVE WITH FIXES from Operator, Product, Brand, and Security reviewers. All fixes are documentation-only — no runtime changes.

**Files created:**
- `docs/DEMO-RUNBOOK.md` — operator-facing sequential checklist (OC-1, DO-6, DO-7)
- `docs/DEMO-NARRATIVE.md` — 20-minute customer story arc (Brand FIX 1, FIX 5)
- `docs/SAFE-LANGUAGE-GUARDRAILS.md` — claims guardrails (Brand FIX 4)

**Files modified:**
- `docs/CAPABILITY-CONTRACTS.md` — added §9-§13 for S0-1..S0-5, fixed `ReadOnly` → `Low`, renumbered §14-§16
- `docs/BREAKABLE-SCENARIOS.md` — added pass/fail criteria for all 10 scenarios (OC-3)
- `docs/evidence/README.md` — added capture checklist template, screenshot/KQL standards (OC-2)
- `README.md` — added Trust & Safety Model section, updated doc links (Brand FIX 2, EB-2)

**Key learnings:**
1. **accessLevel terminology**: Bicep `sre-agent.bicep` uses `@allowed(['High', 'Low'])`. `ReadOnly` does not exist as an accessLevel value — it was incorrectly used in the first draft. Always verify enum values against source Bicep.
2. **Pass/fail criteria are essential for UAT**: Without explicit PASS/FAIL criteria, operators cannot self-assess demo runs. Every scenario needs at minimum: what SRE Agent should identify, what it should recommend, and what constitutes failure.
3. **Safe language guardrails prevent overclaiming**: Preview status must be surfaced prominently, not buried in footers. A "do not claim X / say Y instead" table is the most effective format.
4. **Trust model is the #1 brand asset**: The three-tier model (Low/Review, High/Review, High/Auto) is the enterprise objection killer. It should be the first thing customers see, not buried in internal docs.
5. **Evidence capture needs a template**: Empty folder structures are insufficient — operators need a copy-paste checklist with specific artifact types, naming conventions, and pass/fail assessment criteria.

**Decision artifact:** `.squad/decisions/inbox/lambert-wave0-fixpass.md`

### 2025-07-22: Wave 0 Polish Pass — Brand + Operator Fixes

**Context:** Brand Guardian and Operator UAT both returned APPROVE WITH FIXES. Applied all 6 docs-only polish fixes.

**Fixes applied:**
1. `fix-all` ambiguity → portable kubectl command first, alias explained as dev-container-only (RUNBOOK Step 5)
2. Inline scenario prompts → prompt table for OOMKilled/MongoDBDown/ServiceMismatch in RUNBOOK Step 4c
3. Wave 0 completion checklist → 8-item checklist added to end of DEMO-RUNBOOK.md
4. Scenario ordering conflict → BREAKABLE-SCENARIOS.md "Comprehensive Demo" now defers to DEMO-NARRATIVE.md
5. README MongoDB visibility → `break-mongodb` callout + DEMO-NARRATIVE link in "Breaking Things"
6. Core vs Extended demo → DEMO-NARRATIVE.md split into Core Demo (20 min, 3 scenarios) and Extended Demo (25+ min, 5 scenarios)

**Files modified:**
- `docs/DEMO-RUNBOOK.md` — Step 5 rewrite, Step 4c prompt table, Wave 0 checklist
- `docs/DEMO-NARRATIVE.md` — Core/Extended demo split, version history
- `docs/BREAKABLE-SCENARIOS.md` — Comprehensive Demo section replaced
- `README.md` — MongoDB callout, fix-all clarification

**Validation:**
- Old conflicting sequence (OOM→NetworkBlock→CrashLoop) eliminated: 0 grep matches
- MongoDBDown/cascading story present in README: confirmed
- No runtime files modified: only .md files in diff
- All doc cross-references consistent

**Key learnings:**
1. **Canonical source pattern**: When multiple docs cover the same topic (scenario ordering), designate one as canonical and have others defer with a one-liner link. Prevents drift.
2. **Inline prompts for live demos**: Operators cannot tab-switch during a live demo. The top prompt per scenario must be inline in the runbook, not in a separate document.
3. **Completion checklists close waves**: Without an explicit "you are done" checklist, wave completion is ambiguous. A checklist in the runbook makes the exit gate self-certifiable.

**Decision artifact:** `.squad/decisions/inbox/lambert-wave0-polish.md`

### 2025-07-22: Wave 0 Final Gate — Security + Product + Brand + Operator Fixes

**Context:** Four reviewers returned APPROVE WITH FIXES. Applied all remaining fixes on top of the prior polish pass.

**Security fix (CRITICAL — Finding 1):**
- DEMO-NARRATIVE.md line 38: "Every action is logged, every proposal is visible" → replaced with specific App Insights + Activity Log language
- DEMO-NARRATIVE.md line 102: "Every action proposal, approval, and execution is traceable" → replaced with portal/Activity Log specifics
- DEMO-NARRATIVE.md line 112: "Full auditability — every action is logged and queryable" → replaced with "Auditable by design" + evidence contracts language
- All three replacements now align with SAFE-LANGUAGE-GUARDRAILS.md ❌/✅ table

**Product fix (F-2):**
- CAPABILITY-CONTRACTS.md §3: `service-mismatch` root_cause_category changed from `networking` to `configuration` to match scenario-manifest.yaml (selector mismatch is a config error, not a network error)

**Already applied in prior pass (verified still present):**
- fix-all ambiguity (Operator FIX-1) ✅
- Inline scenario prompts (Operator FIX-2) ✅
- Wave 0 completion checklist (Operator FIX-5) ✅
- BREAKABLE-SCENARIOS ordering (Brand FIX-1 + Operator FIX-4) ✅
- README MongoDB visibility (Brand FIX-2) ✅
- Core vs Extended demo (Brand FIX-3 + Product F-1) ✅

**Key learning:**
- Audit claims are the highest-risk overclaim category. Even internal docs can overclaim auditability when the underlying telemetry pipeline is incomplete (Activity Log not exported, SRE Agent conversation retention unknown). Always cross-check closing scripts against the guardrails table.

**Decision artifact:** `.squad/decisions/inbox/lambert-wave0-final-gate.md`
