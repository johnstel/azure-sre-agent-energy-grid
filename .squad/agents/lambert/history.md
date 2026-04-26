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

## Learnings

### 2026-04-26: Mission Control Click Feedback QA Review

**Scope:** Accessibility + UX/readability review of click feedback implementation (MissionWallboard.vue, theme.css).

**Review Result:** ✅ PASS

**Key findings:**
- Persistent Controls open state improves discoverability — user sees button state without needing rapid feedback
- aria-busy attribute correctly signals loading state to screen readers
- Refreshing label provides text-based feedback for non-decorative button state (good for wallboard environments with screen reader users)
- CSS button states follow theme conventions; no contrast or focus issues
- No accessibility blockers; ready for production

**Quality gate:** All WCAG 2.2 Level AA checks pass (Pass 7 final verdict). No Critical/Serious findings.

### 2026-04-26: Issue #4 maxPods maintenance runbook QA

- Durable operator docs for maxPods drift should explicitly encode Dallas's defer-with-issue gate: no live remediation outside the maintenance window, capacity-positive migration, and temporary scale-out only if pod-density pressure returns first.
- Do not promote temporary `plan/` artifacts into durable docs unless approved; the runbook should stand alone and reference the issue plus source files instead.

### 2026-04-26: Issue #3 AKS maxPods QA Review
- Treat AKS `maxPods` as node-pool immutable like VM size: QA approval requires proof that `deploy.ps1` preserves existing pool values for both `-WhatIf` and deployment before raising new-cluster defaults.
- Pending Defender, Retina, AMA, or similar `kube-system` pods are degraded security/observability coverage; live remediation pass requires no Pending pods plus full Defender/Retina readiness and healthy `energy` workloads.
- New-cluster `maxPods=50` is capacity-positive without increasing node count, but existing pools at `maxPods=30` remain live-vs-IaC drift until a reviewed maintenance-window recreation/resize.

### 2026-04-26: RabbitMQ Live Repair QA Gate
- For RabbitMQ repair reviews, require all three checks before approval: source diff matches issue #1 resource/probe contract, `rabbitmq-plugins list -e -m` shows `rabbitmq_amqp1_0`, and full service health accounts for intentional `grid-worker` 0/0 plus no Service expectation for worker/simulator deployments.

### 2026-04-26: RabbitMQ AMQP 1.0 QA Review
- For narrow runtime fixes, Lambert should verify both the permanent manifest value and the diff boundary: parse `k8s/base/application.yaml` to confirm `RABBITMQ_PLUGINS=rabbitmq_management,rabbitmq_amqp1_0`, then inspect zero-context diff to ensure no probe/resource tuning or broad refactor is mixed in.

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

### 2026-04-26: Wave 1 Live UAT Evidence Package — BLOCKED on Container Insights KQL (Final Retry)

**Context:** Wave 1 focused on live UAT validation post-deployment. Created comprehensive evidence capture structure, validated all documentation consistency, validated Parker's completed OOMKilled kubectl evidence, applied Ripley's KQL alert-history fix, and discovered Container Insights ingestion blocker.

**Work completed:**
1. Created `docs/evidence/wave1-live/README.md` — comprehensive UAT checklist covering deployment, AKS health, Container Insights, 90-day retention, Activity Log export, four alerts, KQL execution, SRE Agent portal, and end-to-end OOMKilled scenario
2. Created `docs/evidence/scenarios/oom-killed/run-notes.md` — complete run template with T0-T5 timestamps, Azure SRE Agent evidence slots, pass/fail criteria
3. Re-ran documentation consistency checks (grep for stale six-alert references, fake endpoints, old KQL IDs, sre.scenario misuse) — **0 issues found**
4. Re-ran scenario metadata validation — **8/8 checks PASS, 0 errors, 0 warnings**
5. **Validated Parker's OOMKilled kubectl evidence** — 16/16 files present, MTTR 21 seconds (well below 900s threshold), scenario PASS
6. **Applied Ripley's KQL alert-history fix** — corrected table (AzureDiagnostics → AzureActivity), corrected claim (alert firing → rule configuration changes), added Wave 2 limitation documentation
7. **Discovered Container Insights KQL blocker** — KubeEvents/KubePodInventory tables empty 24h (ingestion broken)

**Evidence validation results:**
- ✅ kubectl evidence: T0-T5 timeline flawlessly executed, all evidence accurate and contract-compliant
- ✅ MTTR metrics: 21 seconds (0.4% of 900s threshold) — PASS with significant margin
- ✅ Documentation quality: PARKER-FINAL-REPORT.md comprehensive, no overclaims detected
- ✅ Activity Log export: Correctly configured (Ripley verified 86+ events in AzureActivity)
- ✅ Redaction ready: Commands prepared in PARKER-FINAL-REPORT.md, awaiting execution
- 🔴 **Container Insights KQL: BLOCKED** — KubeEvents/KubePodInventory empty 24h (ingestion broken, Wave 1 cannot close)
- ⏳ SRE Agent portal evidence: PENDING (human action required, separate from blocker)

**Ripley KQL Fix (Applied):**
- **Issue**: `alert-history.kql` used wrong table (AzureDiagnostics) and made incorrect claim (alert firing events)
- **Root cause**: Activity Log "Alert" category captures rule configuration changes, NOT firing events
- **Fix applied**: Updated query to use AzureActivity, query rule configuration changes only, added Wave 2 limitation note
- **Files updated**: `alert-history.kql`, `kql/README.md` (added §Alert Firing Event Limitations), `ALERT-KQL-MAPPING.md` (2 references)
- **Validation**: Scenario metadata validation rerun — 8/8 checks PASS, 0 errors, 0 warnings

**Container Insights Blocker (Parker's Final Retry):**
- **Issue**: KubeEvents and KubePodInventory tables are empty for 24 hours in corrected Log Analytics workspace
- **Impact**: Cannot execute scenario KQL queries (scenario-oom-killed.kql, pod-lifecycle.kql, etc.)
- **Status**: 🔴 **BLOCKER** — Wave 1 cannot close until Ripley resolves Container Insights ingestion
- **Next**: Ripley investigates ingestion failure, restores data flow, verifies with `KubeEvents | where TimeGenerated > ago(1h)`

**Sensitive identifiers requiring redaction:**
- Pod/volume UUIDs (e.g., da237eda-f9ad-4e34-9f51-e432bd9f2bf4)
- Internal IPs (10.0.0.x/24 range)
- Node names (aks-workload-33466352-vmss00000d/e)
- Container IDs (full SHA256 hashes)

**Gate verdict:** **🔴 BLOCKED_ON_CONTAINER_INSIGHTS_KQL**
- kubectl evidence PASS
- MTTR PASS (21s < 900s threshold)
- Scenario execution PASS (OOMKilled reproduced, diagnosed, remediated, recovered)
- Activity Log export PASS (correctly configured, 86+ events verified)
- KQL documentation CORRECTED (alert-history.kql now accurate with Wave 2 limitation)
- Redaction READY (commands prepared, awaiting execution)
- **Container Insights KQL BLOCKED** (KubeEvents/KubePodInventory empty 24h — ingestion broken)
- SRE Agent portal PENDING (human action, separate from blocker)

**Key deliverables:**
- `docs/evidence/wave1-live/README.md` — complete UAT checklist with file structure and pass criteria
- `docs/evidence/scenarios/oom-killed/run-notes.md` — T0-T5 template with SRE Agent evidence fields
- `docs/evidence/wave1-live/LAMBERT-VALIDATION-REPORT.md` — comprehensive validation report with updated gate verdict
- `docs/evidence/wave1-live/WAVE1-FINAL-VERDICT.md` — final verdict summary (updated with blocker)
- `docs/evidence/kql/stable/alert-history.kql` — corrected query (AzureActivity, rule configuration changes)
- `docs/evidence/kql/README.md` — added §Alert Firing Event Limitations with Wave 2 recommendation

**Pattern validated:** T0-T5 timeline + EXECUTION-SUMMARY pattern is excellent and ready for reuse on remaining 9 scenarios.

**Next actions:** Ripley resolves Container Insights ingestion → Parker/Analyst runs KQL queries → Parker redacts sensitive data → John captures SRE Agent portal evidence → Parker commits all evidence.

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

### 2026-04-26: Wave 1 KQL Audit Pack & UAT Plan

**Context:** Wave 1 scope — Create parameterized KQL queries for pod lifecycle, alert history, Activity Log/RBAC actions, SRE Agent operational telemetry, and scenario verification for OOMKilled/MongoDBDown/ServiceMismatch. Add comprehensive UAT checklist to DEMO-RUNBOOK.md.

**Deliverables:**
1. **7 KQL query files** (538 lines total) — All parameterized per telemetry dimension contract (§1)
   - `pod-lifecycle.kql` — Track pod state transitions, restarts, OOMKilled events
   - `alert-history.kql` — Query Azure Monitor alert firing history (T1 timestamp, requires Activity Log export)
   - `activity-log-rbac.kql` — Audit ARM operations and RBAC role assignments (requires Activity Log export)
   - `sre-agent-telemetry.kql` — Query SRE Agent App Insights telemetry (SCHEMA_TBD)
   - `scenario-oom-killed.kql` — Verify OOMKilled scenario detection
   - `scenario-mongodb-down.kql` — Verify MongoDB outage and cascading failure detection
   - `scenario-service-mismatch.kql` — Verify service selector mismatch (silent failure)

2. **KQL README.md update** (236 bytes → 9,624 bytes) — Comprehensive usage guide covering:
   - Query catalog table (purpose, parameters, schema source)
   - Usage instructions (Azure Portal, Azure CLI, parameter modification)
   - Preview caveats & prerequisites (Wave 1 blockers table with Ripley assignments)
   - SCHEMA_TBD documentation template (procedure for observing SRE Agent telemetry fields post-deployment)
   - Data retention & evidence gaps (30-day LA vs 90-day AI mismatch, Activity Log export status)
   - Known limitations (5 limitations with workarounds)
   - Troubleshooting guide (debug steps for query execution issues)

3. **Wave 1 UAT Checklist** (200 lines added to DEMO-RUNBOOK.md) — Comprehensive gate criteria:
   - Prerequisites (infrastructure deployment, Container Insights enabled, Log Analytics workspace)
   - Wave 1 Infrastructure Checklist (Activity Log export, alerts deployed, 90-day retention, SRE Agent)
   - KQL Query Syntax Validation (pre-deployment parse checks for all 7 queries)
   - KQL Query Execution Validation (post-deployment healthy baseline verification)
   - SRE Agent Telemetry Schema Verification (SCHEMA_TBD field documentation procedure)
   - Evidence Capture Verification (folder structure, file paths)
   - Metadata Validation (`validate-scenario-metadata.ps1` execution)
   - Documentation Cross-Reference Validation (broken link detection)
   - Wave 1 UAT Gate Criteria (7-item pass/fail gate)
   - Wave 1 Blockers (4 critical blockers with owner assignments)
   - Wave 1 Non-Blockers (3 known gaps that don't block Wave 2)
   - UAT Sign-Off Template (formal gate sign-off section)

**Validation results:**
- `validate-scenario-metadata.ps1` — ✅ PASS (8 checks, 0 errors, 0 warnings)
- File count verification — 7 .kql files + 1 README.md = 8 files modified/created
- Documentation cross-references — All relative paths resolve (spot-checked evidence/README.md, DEMO-RUNBOOK.md, kql/README.md)

**Key learnings:**

1. **SCHEMA_TBD is a Contract, Not a Comment**
   - SRE Agent App Insights telemetry fields (custom dimensions, trace formats) are subject to change during Public Preview
   - Every reference to SRE Agent fields must be tagged `// SCHEMA_TBD` per CAPABILITY-CONTRACTS.md §8
   - Queries include a verification procedure: deploy → submit test prompt → wait 2-5 min → run exploratory query → document observed fields in README
   - Prevents rework when field names change between Preview and GA
   - Applied to: `sre-agent-telemetry.kql` — all custom dimension references are SCHEMA_TBD with inline verification instructions

2. **Prerequisites Before Queries (Wave 1 Blocker Pattern)**
   - Two queries depend on infrastructure not yet deployed: `alert-history.kql` and `activity-log-rbac.kql` require Activity Log diagnostic export to Log Analytics
   - Without this prerequisite: queries parse successfully but return 0 results (data ingestion gap, not query defect)
   - UAT checklist separates "syntax validation" (pre-deployment) from "execution validation" (post-deployment)
   - Explicit blocker ownership: Ripley must deploy `activity-log-diagnostics.bicep` module before Wave 2
   - Prevents false-negative UAT failures (query is correct, infrastructure is missing)

3. **Healthy Baseline Verification Before Scenario Injection**
   - All 3 scenario queries include "expected results when scenario is active" comments
   - UAT innovation: Run scenario queries **before** injecting any breaks to establish healthy baseline
   - Example: `scenario-oom-killed.kql` should return 0 OOMKilled events in healthy state
   - If baseline shows failures: either scenario already injected, infrastructure unhealthy, or query logic wrong
   - Isolates failure modes and prevents "scenario didn't trigger" vs "scenario already active" confusion during Wave 2 UAT

4. **Parameterization Prevents Hardcoding Drift**
   - All 7 queries use `let` statements for parameters (`sre_namespace`, `sre_scenario`, `TimeRange`)
   - Query body never references literal strings — operators modify parameters before running
   - Prevents breakage when scenario IDs change or when testing in alternate namespaces
   - Enforced by CAPABILITY-CONTRACTS.md §1: "Queries must accept `sre.scenario` and `sre.namespace` as parameters — never hardcode scenario names"

5. **UAT Checklist as a Contract Between Waves**
   - Wave 1 UAT Checklist defines gate criteria: all infrastructure prerequisites deployed, all queries execute in healthy baseline, SCHEMA_TBD fields documented
   - 4 critical blockers identified: Activity Log export, alerts not deployed, SRE Agent not deployed, Container Insights not enabled
   - Formal sign-off template prevents "assumed completion" ambiguity
   - Sequential gate enforcement: Wave 0 → Wave 1 UAT → Wave 2 Scenario UAT

6. **Evidence Gap Documentation Prevents Overclaiming**
   - CAPABILITY-CONTRACTS.md §11 documents 60-day evidence gap: Log Analytics 30 days vs App Insights 90 days
   - Queries that join LA + AI data can only show correlated evidence for 30 days (minimum retention wins)
   - Documented in kql/README.md "Data Retention & Evidence Gaps" table
   - Wave 1 UAT Checklist lists "Log Analytics retention = 90 days" as non-blocker (queries work at 30 days, but gap persists)
   - Prevents overclaiming "90-day audit evidence" during demos when queries fail after 30 days

**Live-deployment blockers identified (for Ripley to resolve):**
1. **Activity Log diagnostic export not configured** — `activity-log-diagnostics.bicep` module must be deployed (affects `alert-history.kql` and `activity-log-rbac.kql`)
2. **Alerts not deployed** — Set `deployAlerts = true` in Bicep parameters (affects `alert-history.kql` MTTR T1 timestamp capture)
3. **SRE Agent not deployed** — Set `deploySreAgent = true` in Bicep parameters (affects `sre-agent-telemetry.kql` and entire demo)
4. **Container Insights not enabled** — Verify `addonProfiles.omsagent.enabled = true` in AKS Bicep (affects all scenario queries and `pod-lifecycle.kql`)

**Files modified:**
- Created: 7 .kql files in `docs/evidence/kql/` (pod-lifecycle, alert-history, activity-log-rbac, sre-agent-telemetry, scenario-oom-killed, scenario-mongodb-down, scenario-service-mismatch)
- Modified: `docs/evidence/kql/README.md` (expanded to 9.4K with usage, Preview caveats, SCHEMA_TBD template)
- Modified: `docs/DEMO-RUNBOOK.md` (added 200-line Wave 1 UAT Checklist after Wave 0 completion checklist)
- No runtime changes: No Bicep, K8s manifests, or PowerShell scripts modified (docs + queries only)

**Decision artifact:** `.squad/decisions/inbox/lambert-wave1-kql-uat.md`

**Status:** ✅ Wave 1 KQL audit pack and UAT plan complete. Ready for Ripley to deploy prerequisites and Parker to execute UAT.

### 2026-04-26: Security Wave 1 Mandatory Fix MF-3 — Required Columns & Physical Separation

**Context:** Security review identified:
- **MF-3**: Missing TimeBucket, ResourceId, CorrelationId in KQL queries
- **SR-2**: Lack of physical separation between stable and SCHEMA_TBD queries

**Changes applied:**

1. **Directory restructuring (Security SR-2)**
   - Created `docs/evidence/kql/stable/` for stable Azure Monitor schemas (Container Insights, Activity Log, Alerts)
   - Created `docs/evidence/kql/schema-tbd/` for Preview schemas (SRE Agent App Insights)
   - Moved 6 stable queries to `stable/`
   - Moved 1 SCHEMA_TBD query to `schema-tbd/`
   - **Rationale:** Prevents accidental mixing of stable and Preview-dependent fields

2. **Required columns (Security MF-3)** — Added to all 7 queries:
   - `TimeBucket = bin(TimeGenerated, timeBin)` — Time-series trending, MTTR timeline correlation
   - `ResourceId = column_ifexists("_ResourceId", "")` — ARM resource correlation (AKS cluster, App Insights)
   - `CorrelationId = column_ifexists("CorrelationId", "")` — Cross-query correlation, distributed tracing
   - **Fallback pattern:** Use `column_ifexists()` for tables without native ResourceId/CorrelationId (Container Insights events)

3. **Required parameters (Security MF-3)** — Added to all 7 queries:
   - `let TimeRange = ...;` — Time window for query
   - `let timeBin = 5m;` — Time bucket granularity for trending
   - `let sre_namespace = "energy";` — Kubernetes namespace filter
   - `let sre_scenario = "";` — Scenario ID filter (optional)

**Validation results:**
```
✅ Scenario metadata validation:     PASS (8 checks, 0 errors)
✅ TimeBucket/timeBin in stable:     39 occurrences (all 6 queries)
✅ ResourceId in stable:             30 occurrences (all 6 queries)
✅ CorrelationId in stable:          29 occurrences (all 6 queries)
✅ SCHEMA_TBD in stable:             0 occurrences (no leakage)
✅ SCHEMA_TBD in schema-tbd:         11 occurrences (proper tagging)
✅ SCHEMA_TBD in README:             25 occurrences (documented)
```

**Files modified:**
- Modified: 7 KQL queries (6 stable + 1 schema-tbd) — added TimeBucket, ResourceId, CorrelationId, timeBin parameter
- Modified: `docs/evidence/kql/README.md` — added Directory Structure, Required Columns, Required Parameters sections
- Restructured: Created `stable/` and `schema-tbd/` directories

**Key learning:**
- **CorrelationId limitations**: Container Insights events (KubeEvents, KubePodInventory) do not have native CorrelationId fields. Use `column_ifexists("CorrelationId", "")` to satisfy Security MF-3 without query failures. Impact: Cross-query correlation is limited to Activity Log ↔ App Insights; K8s events cannot be joined via CorrelationId.
- **Physical separation enforces contract boundary**: Stable queries cannot accidentally reference SCHEMA_TBD fields if they live in separate directories. This prevents stable queries from breaking when SRE Agent Preview schema changes.

**Decision artifact:** `.squad/decisions/inbox/lambert-wave1-kql-uat.md` (updated with Security MF-3 section)

**Status:** ✅ Security MF-3 mandatory fix complete. Ready for Security Wave 1 review.

### 2026-04-26 — Security Blocker Fixes (Wave 1 KQL)
**Scope:** Fixed 4 critical blockers identified in Security review of Wave 1 KQL audit pack.

**Work:**
1. **README Duplication** — Removed duplicate sections (lines 298-476) from `docs/evidence/kql/README.md`
2. **KQL Syntax Errors** — Fixed CorrelationId in summarize (pod-lifecycle.kql) and LastSeen = TimeGenerated projections after summarize (scenario queries)
3. **Inaccurate Claims** — Softened MongoDBDown and ServiceMismatch queries to clarify "KQL symptom evidence" vs. "kubectl/K8s API root-cause validation"
4. **Validation Checks** — All pass: scenario metadata ✅, no duplicate headings ✅, no syntax errors ✅, required columns present ✅, no SCHEMA_TBD leakage ✅

**Files changed:**
- `docs/evidence/kql/README.md` (cleaned duplication)
- `docs/evidence/kql/stable/pod-lifecycle.kql` (extend + summarize pattern)
- `docs/evidence/kql/stable/scenario-mongodb-down.kql` (LastSeen fix + LIMITATIONS)
- `docs/evidence/kql/stable/scenario-service-mismatch.kql` (LastSeen fix + LIMITATIONS)

**Key learnings:**
- KQL `summarize` consumes original columns — cannot project TimeGenerated after summarizing it
- `column_ifexists()` must be extended BEFORE summarize, then aggregated with `any()`
- KubeServices table does NOT expose Service selectors — root-cause diagnosis requires kubectl/K8s API
- KubePodInventory shows pod count but NOT desired replicas — scaling intent requires kubectl

**Status:** ✅ Ready for Security Wave 1 review

---

## Wave 2 Live Evidence Package Preparation (2026-04-26)

**Context**: Wave 1 CLOSED with pending human portal evidence. User directive: "Let's get the whole killer demo done then" — Wave 2 launch authorized.

**Wave 2 Scope**: OOMKilled (revalidation), MongoDBDown (cascading failure), ServiceMismatch (silent networking)

**Lambert Work Completed**:
1. ✅ Created `docs/evidence/wave2-live/` directory structure (3 scenarios × 4 subdirectories each)
2. ✅ Created `docs/evidence/wave2-live/README.md` (8066 bytes) — Wave 2 overview, scope, deliverables, pass criteria, timeline
3. ✅ Created `docs/evidence/wave2-live/STATUS.md` (8657 bytes) — Real-time progress tracker with phase-by-phase checklist
4. ✅ Created `docs/evidence/wave2-live/mongodb-down/checklist.md` (8912 bytes) — 217 lines, 12 phases, cascading failure focus, T0-T5 structure
5. ✅ Created `docs/evidence/wave2-live/service-mismatch/checklist.md` (9927 bytes) — 230 lines, 12 phases, silent networking + selector mismatch focus
6. ✅ Created `docs/evidence/wave2-live/WAVE2-FINAL-VERDICT.md` (6534 bytes) — Gate verdict template with pass criteria for each scenario
7. ✅ Ran scenario metadata validation: 8/8 checks PASS, 0 errors, 0 warnings (confirms all 10 scenarios still locked)

**Wave 2 Known Limitations Pre-Documented** (from Wave 1 learnings):
- Alert firing events limitation (AzureActivity shows rule changes only, not firing events — Wave 3+)
- Container Insights lag (2-5 min ingestion delay — document as non-critical blocker)
- SRE Agent portal human-only (John must manually capture evidence after Parker completes)
- ServiceMismatch KQL minimal (silent failures = config issue, not pod crash — kubectl evidence is primary)

**Wave 2 Pass Criteria Defined**:
- 🟢 PASS: All 3 scenarios complete, MTTR < 900s, SRE Agent accurate, redaction complete
- 🟡 PASS_WITH_PENDING_HUMAN_PORTAL: All automated evidence complete, portal pending John
- 🟠 PARTIAL_WITH_LIMITATIONS: 2/3 scenarios complete OR KQL partial with documented blockers
- 🔴 BLOCKED: Infrastructure failure, scenario execution failure, or critical evidence gap

**Current Status**: Wave 2 evidence package **PREPARED** and ready for Parker/Ripley execution. Lambert has created all checklists, templates, and validation frameworks. Awaiting Parker's scenario execution to validate evidence and issue gate verdict.

**Next Actions**:
- Parker: Execute OOMKilled revalidation, MongoDBDown, ServiceMismatch (follow checklists)
- Lambert: Validate evidence structure, redaction, MTTR, KQL accuracy after Parker completes
- Lambert: Issue Wave 2 gate verdict (PASS/PASS_WITH_PENDING/PARTIAL/BLOCKED)
- John: Capture SRE Agent portal evidence for all 3 scenarios (human-only)

**Learnings**:
- Wave 1 checklist structure (T0-T5 timeline) is robust and reusable — copied conventions for Wave 2
- Cascading failures require dependency chain documentation (mongodb → meter-service)
- Silent networking failures need service selector vs. pod label alignment evidence
- Gate verdict templates prevent ambiguity — pre-define PASS/PARTIAL/BLOCKED criteria before execution

---

## Wave 2 Alert Firing Evidence Integration (2026-04-26)

**Context**: Ripley completed Wave 2 alert-firing evidence path using Azure Resource Graph CLI. Lambert integrated alert firing requirements into Wave 2 validation criteria.

**Ripley's Work** (completed):
- Primary approach: Azure Resource Graph CLI via `scripts/get-alert-firing-history.ps1`
- Documentation updated: `docs/evidence/kql/README.md` and `docs/evidence/ALERT-KQL-MAPPING.md`
- No Bicep changes required

**Lambert's Integration Work**:
1. ✅ Updated `docs/evidence/wave2-live/README.md` — Added alert firing evidence section to deliverables and pass criteria
2. ✅ Updated Wave 2 Known Limitations — Changed from "Wave 3+ diagnostic settings" to "Wave 2 ARG solution" (Ripley's script)
3. ✅ Updated `docs/evidence/wave2-live/WAVE2-FINAL-VERDICT.md` — Added alert firing (ARG) component to all 3 scenario tables
4. ✅ Updated `docs/evidence/wave1-live/checklist.md` — Added alert verification section with ARG command
5. ✅ Updated `docs/evidence/wave2-live/mongodb-down/checklist.md` — Added alert verification (possibly http-5xx OR NO_ALERT_FIRED)
6. ✅ Updated `docs/evidence/wave2-live/service-mismatch/checklist.md` — Added alert verification (NO_ALERT_FIRED expected for silent failure)
7. ✅ Created `alert-firing/` directories in all 3 Wave 2 scenario folders
8. ✅ Updated `docs/evidence/wave2-live/STATUS.md` — Added alert firing checkboxes to scenario progress

**Wave 2 Alert Firing Requirements**:
- **OOMKilled**: `{prefix}-crashloop-oom` alert expected to fire (Sev 1) — capture firing event via ARG OR document NO_ALERT_FIRED
- **MongoDBDown**: Possibly `{prefix}-http-5xx` if downstream 5xx errors, OR NO_ALERT_FIRED (no dedicated baseline alert) — document either way
- **ServiceMismatch**: NO_ALERT_FIRED expected (silent networking failure, no dedicated alert) — capture ARG command output as proof
- **Activity Log**: `alert-history.kql` remains rule-config evidence only (per Wave 1 limitation)

**Gate Criteria Updated**:
- Per-scenario pass now requires: Alert firing event captured via ARG **OR** explicit NO_ALERT_FIRED with command output
- Activity Log alert-history.kql is supplemental (rule changes only, not firing events)

**Learnings**:
- Azure Resource Graph AlertsManagementResources provider is the correct path for alert firing history (not Activity Log, not diagnostic settings)
- Silent failures (ServiceMismatch) should document NO_ALERT_FIRED as expected behavior, not a blocker
- Scenarios without dedicated baseline alerts (MongoDBDown) need flexible evidence criteria (firing event if present, OR NO_ALERT_FIRED)

**Status**: ✅ Wave 2 alert firing evidence integrated into all validation criteria, checklists, and gate verdicts

---

## Wave 2 Blocker — Cluster Availability (2026-04-26)

**Context**: Parker's Wave 2 execution package is prepared (checklists, guides, validation frameworks), but live evidence capture is BLOCKED by infrastructure issue.

**Blocker**: Stopped-cluster / cluster-name discrepancy. Ripley is resolving correct target cluster and starting it if needed.

**Lambert Action**: Updated Wave 2 status to BLOCKED_ON_CLUSTER_AVAILABLE to prevent premature closure.

**Files Updated**:
1. `docs/evidence/wave2-live/STATUS.md` — Updated header to show BLOCKED status, documented blocker in Current Blockers section
2. `docs/evidence/wave2-live/WAVE2-FINAL-VERDICT.md` — Changed gate verdict from "PENDING EXECUTION" to "BLOCKED_ON_CLUSTER_AVAILABLE"
3. `.squad/agents/lambert/history.md` — This entry

**Key Point**: Wave 2 gate remains **OPEN** and **BLOCKED** until live evidence is captured. Prepared guides/checklists do NOT constitute Wave 2 closure. Lambert will NOT issue gate verdict until:
1. Ripley resolves cluster availability
2. Parker executes all 3 scenarios (OOMKilled, MongoDBDown, ServiceMismatch)
3. Lambert validates live evidence (kubectl, KQL, alert firing, MTTR, redaction)

**Status**: ✅ Wave 2 blocker documented, gate held open pending live evidence

---

## Wave 2 Gate Verdict — PASS_WITH_PENDING_HUMAN_PORTAL (2026-04-26)

**Context**: Parker completed Wave 2 automated evidence collection (MongoDBDown, ServiceMismatch). Lambert reviewed evidence package and issued gate verdict.

**Evidence Reviewed**:
- MongoDBDown: 16 kubectl files (T0-T5, 134s), root cause validated (replicas: 0), NO_ALERT_FIRED (rapid execution < 90s)
- ServiceMismatch: 22 kubectl files (T0-T5, 159s), root cause validated (selector mismatch), NO_ALERT_FIRED (expected silent failure)
- Alert firing history via ARG: NO_ALERT_FIRED documented for both scenarios with technical explanations
- Redaction: 0 UUIDs, 0 unredacted IPs, 0 unredacted node names
- Scenario metadata validation: 8/8 checks PASS

**Gate Verdict**: 🟡 **PASS_WITH_PENDING_HUMAN_PORTAL**

**Justification**:
- ✅ Automated evidence complete (kubectl, alert firing, redaction)
- ✅ ServiceMismatch is FULL PASS — perfect silent failure demonstration
- ⚠️ MongoDBDown is PARTIAL PASS — smoking-gun root cause but NO_ALERT_FIRED due to rapid execution
- ⏳ SRE Agent portal evidence PENDING_HUMAN_PORTAL (John must capture)

**Safe Language Review**:
- ✅ All Parker reports maintain technical honesty (no overclaims)
- ✅ MTTR marked "N/A for automated execution" or "PENDING_HUMAN_PORTAL"
- ✅ Alert limitations disclosed (MongoDBDown rapid execution vs. eval windows)
- ⚠️ Language softening recommended for customer-facing materials: Add "portal validation pending" to SRE Agent diagnosis claims

**Remaining Before Final PASS**:
1. John captures SRE Agent portal evidence (MongoDBDown + ServiceMismatch) — 15-20 min
2. Lambert validates portal evidence quality
3. Language softening applied to customer-facing materials

**Files Updated**:
1. `docs/evidence/wave2-live/WAVE2-FINAL-VERDICT.md` — Gate verdict issued with detailed justification
2. `docs/evidence/wave2-live/STATUS.md` — Updated to PASS_WITH_PENDING_HUMAN_PORTAL
3. `.squad/agents/lambert/history.md` — This entry

**Key Findings**:
- ServiceMismatch is primary demo-ready scenario (selector mismatch → empty endpoints without pod crashes)
- MongoDBDown root cause is smoking gun (replicas: 0) but requires honest narrative about alert evaluation windows
- Parker's evidence packages maintain technical honesty throughout (no fabricated claims)
- SRE Agent portal testing is CRITICAL before customer demo to avoid overclaiming Preview capabilities

**Status**: ✅ Wave 2 gate verdict issued — PASS_WITH_PENDING_HUMAN_PORTAL
