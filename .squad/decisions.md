# Squad Decisions

## Active Decisions

### 2026-04-24: Contractor bench policy
**By:** John Stelmaszek
**What:** Use specialist contractor agents (SRE, Security Engineer, DevOps Automator, Backend Architect, etc.) from the bench for reviews and expertise as needed. Bring them in and out of the project on demand.
**Why:** Leverages the full agent bench for quality without permanent team bloat.
**Status:** ✅ Active — successfully used for Mission Control planning session

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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- Contractor agents brought in for specialized expertise; documented in orchestration logs
