# Squad Decisions

## Active Decisions

### 2026-04-25T18:58:04Z: Mission Control Wallboard Redesign (Desktop/Wallboard-First, Fixed-Zone 16:9 Layout)

**By:** John Stelmaszek (user directive), reviewed by UX Architect, UI Designer, Parker (SRE), Executive, Brand Guardian, Product/Business  
**What:** Redesign Mission Control from single-scroll responsive design to wallboard-first fixed-zone layout optimized for 16:9 monitors in help desk environments. Wallboard is the primary display mode; responsive narrow-screen fallback remains for development/troubleshooting but is not primary.

**Key Directives:**

1. **Wallboard-First IA** — Fixed-zone layout (NOT single-scroll responsive)
   - Header: Command bar, quick status summary
   - Main grid: Expected-vs-actual resource inventory (service name | desired pods | running pods | expected state | actual state)
   - Right panel: Active incidents (top 5 by severity), pod/process board
   - Bottom drawer: Selected logs/events (collapsible, 0-300px)
   - No animations, no auto-expand of full logs (vertical waste)

2. **1920x1080 Fixed Spec** (UI Designer)
   - Command bar (80px fixed)
   - Main viewport (900px)
   - Collapsible logs drawer (0-300px)
   - Left panel 60% (inventory grid), right panel 40% (incidents + pod board)
   - Severity colors: Red (#ef4444) critical, Amber (#f59e0b) warning, Green (#10b981) healthy, Gray (#6b7280) unknown
   - Typography: 18pt+ for operational text (accessibility requirement)

3. **Expected-vs-Actual as Hero Feature** (Product/Business)
   - Central inventory matrix: Deployment spec (expected replicas, resources, labels) vs actual pod state (running count, container state, memory/CPU)
   - Mismatch = red cell + severity badge ("1 unavailable", "CrashLoopBackOff", "OOMKilled")
   - Click-through: Select pod → populate Logs Panel
   - Join logic required in backend: Deployment spec + actual pod state + events

4. **Backend API Extensions** (Parker SRE)
   - `/api/inventory` (GET) → unified expected-vs-actual view (Deployments + pods + endpoints)
   - `/api/pods/:name/logs` (GET, WebSocket) → read-only streaming pod logs (last 500 lines, optional tail mode)
   - `/api/events` (GET, WebSocket) → Kubernetes events stream (sorted by createdAt desc, namespace: energy hard-lock)
   - `/api/services/:name/endpoints` (GET) → Service endpoint resolver (pod IPs, readiness probes, port mappings)
   - All APIs namespace-locked to `energy`; redaction rules for sensitive data in logs/events

5. **Operational Readiness Criteria** (Executive Review)
   - Health Heartbeat: Always-visible "all systems nominal" indicator (top-right)
   - Active Incidents: Current pod failures, state mismatches, restarts ranked by severity
   - Pod Stability: Restart loop detection, >2 restarts in 30min alert
   - Data-Flow Integrity: Can operator validate meter→storage→dispatch pipeline without drilling into logs?
   - Recent SRE Agent Findings: Display latest AI diagnosis results (if available)

6. **Brand & Positioning** (Brand Guardian)
   - Remove "Azure SRE Agent" from app header title → "Mission Control" only
   - Rename "Ask Copilot" panel → "Explain This State" (clarify local explainer vs autonomous agent)
   - Remove narrative prose, section numbers, marketing copy → Terse action labels, defer help to tooltips/docs
   - No splash screens, onboarding narrative, or training framing

7. **Help Desk Workflow Integration** (Product/Business)
   - Wallboard always-on during 8-hour shifts (5-second refresh, real-time failure alerts)
   - Active scenario badges: Show if breakable scenario is applied (e.g., "scenario: oom-killed" badge on service row)
   - Job status visible: Deploy/destroy job queue with status, elapsed time, job logs on drill-through
   - Deploy/destroy forms MOVED OFF wallboard to separate control panel (prevent fat-finger mistakes)
   - Out of MVP: Mobile responsiveness (wallboard-only for now)

**Why:** User request for help desk ops center workflow. Current single-scroll responsive design optimized for narrow mobile screens is not suitable for 8-foot viewing distance and 8-hour shift monitoring. Fixed zones reduce cognitive load, maximize information density, and support always-on display. Expected-vs-actual matrix is the highest-value diagnostic tool for help desk troubleshooting. Operational readiness framing ensures credibility over decoration.

**Supersedes:** Prior directive for "single-scroll responsive Mission Control" is superseded for desktop/wallboard mode. Narrow-screen responsive fallback preserved for dev environments.

**Status:** ✅ Approved — Wallboard design approved by all contractors. Ready for developer implementation in Phase 2. Phase 1 (MVP, Week 1) ships current browser-based SPA; Phase 2 incorporates wallboard redesign.

**Timeline:** Phase 1 (MVP, Week 1) → Phase 2 (Wallboard + API extensions, Week 2-3) → Phase 3 (Polish, Week 4+)

**Artifacts:**
- `.squad/orchestration-log/2026-04-25T18-58-04Z-mission-control-wallboard-redesign.md` (full review batch with all contractor input)
- `.squad/log/2026-04-25T18-58-04Z-mission-control-wallboard-redesign.md` (session summary)

---

### 2026-04-24: Mission Control Blank-Screen Production Failure — Fastify Static Wildcard Fix
**By:** Parker (Platform Architect)  
**What:** Fastify static asset serving with `wildcard: false` prevented Vite-generated hashed asset filenames from being matched, causing fallthrough to SPA HTML route and browser module loading failures. Removed the `wildcard: false` configuration to enable glob matching on dynamic asset paths.
**Why:** Production builds generate content-hashed asset names (e.g., `index-abc123.js`). Fastify's restrictive `wildcard: false` setting broke asset delivery by forcing hash-suffixed URLs to return HTML instead of JavaScript/CSS with correct MIME types.
**Fix:** Removed line 35 from `mission-control/backend/src/server.ts`: `wildcard: false`.
**Verification:** ✅ Development mode (`npm run dev`), production mode (`npm run start`), all assets correctly served with proper Content-Type headers, no errors in browser console.
**Status:** ✅ Resolved — Mission Control now fully operational in both dev and production modes

### 2026-04-24: Mission Control Smoke Test — Port Conflict & Workspace Validation
**By:** Lambert (QA/Docs)  
**What:** Full smoke test of Mission Control development and production workflows including workspace dependency validation, build process verification, asset inventory check, and production server testing.
**Findings:**
- ✅ All 196 workspace packages installed correctly
- ✅ Frontend builds successfully with zero TypeScript errors (86.17 kB gzipped)
- ✅ Development servers (Vite :5173, Fastify :3333) start and respond correctly
- ✅ Production build serves SPA with correct MIME types for all assets
- ✅ README.md URLs are accurate (no documentation changes needed)
- ⚠️ Port conflict risk: orphaned Edge Helper blocked :3333, causing blank page with silent failure. Recommend pre-flight port check in dev script.
**Recommendations:** 
1. Add port conflict detection to `npm run dev`
2. Add pre-flight dependency check script
3. Document port troubleshooting (optional enhancement)
**Status:** ✅ Verified — Mission Control fully functional, no blocked issues

### 2026-04-24: Contractor Bench Policy
**By:** John Stelmaszek  
**What:** Use specialist contractor agents (SRE, Security Engineer, DevOps Automator, Backend Architect, etc.) from the bench for reviews and expertise as needed. Bring them in and out of the project on demand.
**Why:** Leverages the full agent bench for quality without permanent team bloat.
**Status:** ✅ Active — successfully used for Mission Control planning session and team diagnostics

### 2026-04-24: Mission Control Architecture — Fastify + Vue 3 + Vite (Browser-Based)
**By:** Software Architect Contractor (approved by Dallas Lead + PM Contractor)
**What:** Build Mission Control as a browser-based Node.js Fastify backend + Vue 3 + Vite frontend (NOT Electron). Single port in production, two ports in development.
**Why:** 
- Electron adds 150MB+ overhead for a dev tool; browser-based is lighter and simpler
- Fastify: 2x faster than Express, native streaming for logs, built-in JSON schema validation
- Vue 3 Composition API: Consistency with existing grid-dashboard + ops-console dashboards
- Vite: 10x faster HMR than webpack, zero-config TypeScript, tree-shaking by default
- No server deployment needed; runs locally with existing Azure CLI + kubectl tooling
**Status:** ✅ Approved — ready for development start
**Integration Points:** PowerShell script execution (deploy/destroy), kubectl API (monitoring), SRE Agent portal URL construction
**Cross-Platform Strategy:** PowerShell path detection (`pwsh` vs `pwsh.exe`), kubectl context validation, Azure auth preflight checks

### 2026-04-24: Mission Control MVP Scope
**By:** PM Contractor (validated by Architect)
**What:** Phase 1 (MVP) ships with: (1) deployment automation (deploy/destroy with log streaming), (2) real-time cluster status dashboard (pods/services/deployments), (3) one-click scenario management (apply/revert), (4) SRE Agent portal access + quick prompts, (5) preflight validation (auth, tools, context).
**Why:** Addresses two primary personas (Demo Presenter, Lab Admin). Success metrics: 99%+ reliability, <2s scenario latency, 30% faster demo time vs. manual scripts.
**Timeline:** MVP (Week 1) → Enhancement (Week 2-3) → Polish (Week 4+). Total 4-5 weeks to production with 1 engineer.
**Status:** ✅ Approved — feasible per architect technical review
**Out of Scope (MVP):** Manifest editing, event streaming, historical dashboards, cost tracking, team collaboration
**Success Criteria:** Deploy → Inject scenario → Launch portal in <2 minutes, 100% success rate

### 2026-04-24: Mission Control API Surface & WebSocket Streaming
**By:** Software Architect Contractor
**What:** 20+ REST endpoints covering deployment, cluster monitoring, scenarios, and validation. WebSocket channels for real-time log streaming and Kubernetes event watching.
**Key Endpoints:**
- `POST /api/deploy` + `WebSocket /ws/deploy/:requestId` (async with streamed logs)
- `GET /api/cluster/pods|services|deployments` (initial load), `WebSocket /ws/cluster/watch` (event stream)
- `POST /api/scenarios/:id/apply|revert` (with WebSocket streaming)
- `GET /api/preflight` (azure auth, kubernetes, powershell, docker validation)
**Why:** Allows decoupling deployment processes from UI; WebSocket prevents log loss; real-time monitoring is non-blocking
**Status:** ✅ Approved — complete specification in architect orchestration log
**Testing:** Backend unit + integration tests; frontend component + integration tests

### 2026-04-24: Mission Control Directory Structure (Monorepo)
**By:** Software Architect Contractor
**What:** Monorepo with `/backend` (Fastify + TypeScript) and `/frontend` (Vue 3 + Vite + TypeScript). Shared types in `/backend/src/types/`. Single Docker image for production.
**Why:** Unified development experience, shared type definitions, single deployment artifact
**Status:** ✅ Approved — directory structure specified in architect orchestration log
**Dev Mode:** `npm run dev:backend` (port 3001) + `npm run dev:frontend` (port 5173 with proxy)
**Prod Mode:** Docker image runs Fastify on port 3000, serves SPA on `/`, API on `/api/*`

### 2025-07-18: Ops-Console Validation & Action Items
**By:** Lambert (QA/Docs)
**What:** Full audit of the ops-console UI, nginx proxy, K8s manifests, validation script, and documentation.
**Findings:**
- ✅ **Ops-console correctly wired and production-ready** — No bugs in API routing chain
- ❌ **Dead file:** `k8s/base/nginx-ops.conf` (not referenced by any ConfigMap; real config in `application.yaml` line 953). Recommend deletion or mark as reference-only.
- ❌ **Missing URL:** `validate-deployment.ps1` prints grid-dashboard URL but not ops-console URL. Operators need this. Route to Lambert for fix.
- ❌ **Zero docs:** ops-console mentioned once in README but no dedicated docs — no usage guide, health panel description, or API proxy architecture. Route to Lambert for docs addition.
**Verdict:** No action needed for API routing, error handling, polling intervals, probes, or resource limits — all verified correct.
**Status:** ✅ Verified — actions routed to Lambert for implementation

## Blocked/Work-in-Progress

| Item | Owner | Status | Next |
|------|-------|--------|------|
| Dead file cleanup (`nginx-ops.conf`) | Lambert | Planned | Delete or document as reference |
| Add ops-console URL to validate-deployment.ps1 | Lambert | Planned | Update script output |
| Add ops-console documentation to docs/ | Lambert | Planned | Create usage guide + architecture doc |

## Blocking Issues (For Phase 1 Resolution)

| Issue | Raised By | Severity | Mitigation |
|-------|-----------|----------|-----------|
| Job state model for deployment tracking | Rubber Duck | High | Track: `requestId` → `{ status, createdAt, completedAt, logs: [], exitCode }` |
| Preflight validation strategy | Rubber Duck | Medium | Warn non-critical (missing docker), block critical (no azure auth) |
| Scenario determinism (apply/revert idempotency) | Rubber Duck | High | Ensure all scenarios ±1 manifest via kubectl; test 5+ apply/revert cycles per scenario |

### 2025-04-24: AKS VM Size Idempotency Protection
**By:** Ripley (Infra Dev)
**What:** Implement pre-deployment cluster detection in `scripts/deploy.ps1` to preserve existing AKS VM sizes and prevent PropertyChangeNotAllowed failures on re-deployment.
**Why:** Azure ARM prevents changing `agentPoolProfile.vmSize` on existing node pools. When re-deploying with different Bicep parameters, deployment fails unless current VM sizes are passed as overrides.
**How:**
- Query existing cluster via `az aks show` before deployment
- Extract current VM sizes from agentPoolProfiles
- Pass detected sizes as parameter overrides to Azure CLI
- Display warning about VM size immutability
- Fall through to defaults if no existing cluster
**Implementation:** `scripts/deploy.ps1` lines ~508-620
**Safety:** Preserves `-WhatIf` behavior, robust error handling, no shell injection
**Status:** ✅ Implemented — tested with existing cluster re-deployment
**Related:** `infra/bicep/main.bicep`, `infra/bicep/modules/aks.bicep`

### 2025-04-24: PowerShell Detection Mismatch (Mission Control Backend)
**By:** Ripley (Infra Dev) → Verified by Lambert (QA/Docs)
**What:** Unify PowerShell detection across ToolDetector (probe time) and paths.ts (import time) in Mission Control backend to ensure consistent `pwsh` vs `pwsh.exe` resolution.
**Why:** Preflight checks and deploy routes were using different platform detection methods, causing "pwsh not found" errors even when PowerShell was installed. Node.js PATH differs from user shell PATH.
**How:**
- Implement `resolvePwsh()` utility in paths.ts that checks common installation paths
- Use filesystem access checks (`fs.access()`) instead of PATH resolution
- Cover Windows (`C:\Program Files\PowerShell\7\pwsh.exe`), Mac (`/opt/homebrew/bin/pwsh`, `/usr/local/bin/pwsh`), Linux
- Fall back to bare command name if all path checks fail
- Update ToolDetector, deploy.ts, and destroy.ts to use unified `resolvePwsh()`
**Benefit:** Zero dependencies, no shell execution, works across platforms, degrades gracefully
**Status:** ✅ Implemented — backend builds without errors, preflight and deploy use identical resolution
**Related:** `mission-control/backend/src/utils/paths.ts`, `mission-control/backend/src/services/ToolDetector.ts`

### 2025-04-24: AKS VM Size Mismatch Validation Checklist (QA)
**By:** Lambert (QA/Docs)
**What:** Comprehensive validation strategy for AKS VM size idempotency fix covering detection, parameter override, what-if safety, and operator visibility.
**Test Scenarios:**
1. Existing-cluster detection (D2s_v4 detected and preserved)
2. Fresh deployment (uses Bicep defaults v5)
3. Existing cluster re-deploy (auto-preserves v4)
4. Explicit override attempt (fails gracefully with warning)
5. What-If safety (zero AKS changes)
6. Azure preflight validation
7. Mission Control console display accuracy
**Success Criteria:** All scenarios pass with zero PropertyChangeNotAllowed errors
**Status:** ✅ Checklist documented — ready for verification by QA/Ripley

### 2025-04-24: PowerShell Detection Validation Plan (QA)
**By:** Lambert (QA/Docs)
**What:** Test matrix for PowerShell detection fix covering backend build, API endpoints, platform-specific commands, edge cases, and integration flow.
**Test Coverage:**
- Backend TypeScript compilation & lint
- Full npm build process
- `/api/preflight` endpoint on Windows/Mac/Linux
- Deploy/destroy routes with correct pwsh binary
- Platform edge cases (WSL, mismatched flags, .NET runtime)
- Preflight → Deploy integration flow
- Frontend PreflightPanel display
- Regression tests (existing functionality)
**Test Execution:** Windows 10+, macOS/Linux, CI/CD validation
**Success Criteria:** Build succeeds, preflight consistent with deploy, no regression
**Status:** ✅ Plan documented — ready for verification by Lambert

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Contractor agents brought in for specialized expertise; documented in orchestration logs

### 2026-04-25: LoadBalancer NSG Troubleshooting Documentation
**By:** Lambert (QA/Docs), with Parker (SRE) and Ripley (Infra) review
**What:** Added supportability documentation for the public LoadBalancer timeout/empty-reply incident, covering both Kubernetes service diagnostics and Azure LoadBalancer/VNet subnet NSG diagnostics.
**Why:** The grid-dashboard and ops-console public VIPs failed even though pods, services, endpoints, nodePorts, and in-cluster curl were healthy. The root cause was the VNet AKS subnet NSG missing inbound TCP 80, so the docs now teach operators to distinguish K8s issues from Azure LB/NSG issues quickly.
**Artifacts:** `docs/KUBERNETES-SERVICE-TROUBLESHOOTING.md`, `docs/TROUBLESHOOTING.md`, README docs links, `docs/SRE-AGENT-SETUP.md`, and `docs/BREAKABLE-SCENARIOS.md`.
**Status:** Implemented and reviewed; permanent infrastructure rule remains in `infra/bicep/modules/network.bicep` as `Allow-Internet-HTTP-To-AKS-LB`.

### 2026-04-25T18:14:34Z: User directive — Local Coding Model Configuration (SUPERSEDED)
**By:** John Stelmaszek (via Copilot)
**What:** Configure coding-oriented Squad agents to prefer the local OpenAI-compatible model at `http://localhost:1234/v1`, using `qwen/qwen3-coder-next` for Ripley, Parker, and Lambert.
**Why:** User request to enable local model evaluation for coding workflows, reduce latency and cloud API dependency, support experimental coding patterns and offline workflows.
**Artifacts:** `.squad/orchestration-log/2026-04-25T18:16:29Z-scribe-local-coding-model.md`, `.squad/log/2026-04-25T18:16:29Z-local-coding-model-config.md`.
**Status:** Superseded by 2026-04-25T18:20:56Z correction — qwen/qwen3-coder-next is legacy and should not be used.

### 2026-04-25T18:18:37Z: User directive — Local Model Fallback (SUPERSEDED)
**By:** John Stelmaszek (via Copilot)
**What:** `qwen/qwen3-coder-next` is not currently available due to local memory pressure; use the loaded local model `qwen/qwen3.6-35b-a3b` as the current fallback for coding-oriented Squad agents.
**Why:** User request — Coordinator validated model availability downgrade after LM Studio memory pressure caused model eviction. Fallback captures team decision for rapid recovery once memory constraints resolve.
**Artifacts:** `.squad/orchestration-log/2026-04-25T18:19:49Z-scribe-local-model-fallback.md`, `.squad/log/2026-04-25T18:19:49Z-local-model-fallback.md`.
**Status:** Superseded by 2026-04-25T18:20:56Z correction — qwen/qwen3-coder-next is legacy.

### 2026-04-25T18:20:56Z: User directive — qwen3-Coder-Next Declared Legacy
**By:** John Stelmaszek (via Copilot)
**What:** Do not try `qwen/qwen3-coder-next` for local coding agents; it is legacy. Use `qwen/qwen3.6-35b-a3b` as the local coding model preference instead.
**Why:** User directive — Coordinator has updated `.squad/config.json` to remove `qwen/qwen3-coder-next` entirely and configure only `qwen/qwen3.6-35b-a3b` as the active local model. Legacy preference paths must not be attempted.
**Artifacts:** `.squad/orchestration-log/2026-04-25T18:21:45Z-scribe-qwen3-coder-next-legacy.md`, `.squad/log/2026-04-25T18:21:45Z-qwen3-coder-next-legacy.md`.
**Status:** Active; team history corrected; legacy model removed from configuration.

### 2026-04-25T18:44:47Z: Mission Control Ask Copilot — Backend Architecture
**By:** Parker (SRE Dev), Copilot SDK Contractor (architecture review)  
**Verdict:** APPROVED by Lambert (QA/Docs)

**What:** Add GitHub Copilot SDK assistant in Mission Control backend only. Single read-only `get_mission_control_state` tool, `gpt-4.1` model, point-in-time state snapshot. Strict tool allowlist, 60s timeout, concurrency guard, input validation, timestamp/sources/tools metadata exposure. Frontend Ask Copilot panel with request input, response display, error handling. README updated with Technical Preview disclaimer, local-only framing, Copilot CLI/auth prerequisites.

**Why:** Product framing defines Ask Copilot as local explainer/triage assistant (not autonomous SRE agent, not Azure SRE Agent replacement). Backend-only reduces auth complexity and establishes clear trust boundary. Read-only state snapshot eliminates mutating operations. Defers streaming, MCP, mutating/shell/file tools, persistent sessions, autonomous remediation.

**Evidence:** Package manifests aligned. Backend safety: input validation, single-request guard, timeout/cleanup, strict tool allowlist, no logs. Frontend framing: single scrollable page with metadata/sources/tools/limits/errors visible. README differentiates Ask Copilot from Azure SRE Agent. Build ✅, lint ✅, API smoke checks ✅ (health 200, validation 400s, live assistant 200 with model/tool/metadata).

**Follow-up:** Future automated test harness for assistant API validation/concurrency (non-blocking).

**Artifacts:** `.squad/orchestration-log/2026-04-25T18:44:47Z-copilot-assistant.md`, `.squad/log/2026-04-25T18:44:47Z-mission-control-copilot-assistant.md`.
