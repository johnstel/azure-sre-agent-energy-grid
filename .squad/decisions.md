# Squad Decisions

## Active Decisions

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
