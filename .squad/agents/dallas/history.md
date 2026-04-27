# Dallas — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** Bicep IaC, Kubernetes manifests, PowerShell scripts, Dev Containers
- **Description:** Deploys a simulated energy grid platform onto AKS with 10 breakable scenarios for demonstrating Azure SRE Agent AI-powered diagnosis. No app source code — services run from public container images.
- **Key constraint:** SRE Agent only supports eastus2, swedencentral, australiaeast
- **Cost:** ~$22-38/day depending on features enabled

## Learnings

### 2026-04-24: Mission Control Architecture Analysis

**Context:** Analyzed entire codebase to design a single-page control interface for the SRE Agent Energy Grid demo lab.

**Key Discoveries:**

1. **Existing Design Language:** The project already has two Vue.js dashboards (`grid-dashboard.html`, `ops-console.html`) with consistent dark theme styling (`:root` CSS variables: `--bg: #0f172a`, `--accent: #22d3ee`, card-based layouts). Mission Control should inherit this visual language.

2. **PowerShell as Deployment Interface:** All core operations (`deploy.ps1`, `destroy.ps1`, `validate-deployment.ps1`) are PowerShell scripts that wrap Azure CLI and kubectl commands. They output structured JSON (`deployment-outputs.json`) and use rich terminal formatting. Mission Control must execute these scripts via `child_process` and parse outputs.

3. **Scenario Architecture:** The 10 breakable scenarios (`k8s/scenarios/*.yaml`) are standalone Kubernetes manifests with metadata labels (`scenario: oom-killed`, `sre-demo: breakable`). Healthy baseline is in `k8s/base/application.yaml` (1133 lines). Scenario status can be detected by querying pods for `scenario` label presence.

4. **SRE Agent Integration:** SRE Agent is deployed via Bicep (`Microsoft.App/agents@2025-05-01-preview`) with managed identity and RBAC. Portal URL is constructed from agent resource ID. No direct API access discovered — portal is the primary interface. Integration point is URL construction + external browser launch.

5. **Dev Container Environment:** Current dev setup uses VS Code dev containers with Azure CLI, kubectl, PowerShell, k9s, kubectx pre-installed. Users authenticate via `az login --use-device-code`. Mission Control must validate these tools exist on startup.

6. **Cross-Platform Challenges:**
   - PowerShell binary: `pwsh` on Mac/Linux, `pwsh.exe` on Windows
   - kubectl context management: User might have multiple contexts (need validation)
   - Azure auth state: Cannot assume user is logged in (need preflight check)

7. **Real-Time Monitoring Requirements:** Existing dashboards poll backend services (asset-service, meter-service) every 5-60 seconds. Mission Control should poll `kubectl get pods/svc/deployments -n energy -o json` at similar intervals. Logs should stream via `kubectl logs -f`.

**Architectural Decision:** **Electron + Vue 3 + Vite**
- **Why Electron:** Cross-platform shell execution (`child_process.spawn()`), no server setup, native app UX
- **Why Vue 3:** Consistency with existing dashboards, lightweight, Composition API for reactive state
- **Why Vite:** Fast hot reload, zero-config TypeScript, modern dev experience
- **Rejected Tauri:** Rust adds unnecessary complexity; team already familiar with Node.js

**Integration Strategy:**
- **Deployment Tab:** Wraps `deploy.ps1` and `destroy.ps1` with IPC handlers, streams logs to UI
- **Monitor Tab:** Polls kubectl every 5s for pods/services/deployments, renders tables with status badges
- **Scenarios Tab:** Reads `k8s/scenarios/` directory, provides Break/Fix buttons per scenario, detects status via labels
- **SRE Agent Tab:** Constructs portal URL from deployment outputs, opens in external browser, displays quick prompt templates

**Risks Identified:**
1. **High:** PowerShell path resolution across platforms → Mitigate with `getPwshPath()` utility
2. **Medium:** Azure auth state (user not logged in) → Mitigate with `az account show` preflight check
3. **Medium:** kubectl context mismatch → Mitigate with context validation before each command
4. **Low:** Long-running command streaming → Standard `child_process` pattern, low risk

**Next Steps:**
- Scaffold `mission-control/` directory with Electron + Vite boilerplate
- Implement Phase 1: Deployment tab with deploy/destroy buttons + log streaming
- Cross-platform validation on Mac and Windows before expanding features

**Files Analyzed:**
- `scripts/deploy.ps1` (31KB, 700+ lines) — Main deployment orchestration
- `scripts/destroy.ps1` — Teardown with Key Vault purge logic
- `scripts/validate-deployment.ps1` — Health check validation
- `k8s/base/application.yaml` (1133 lines) — Healthy baseline
- `k8s/scenarios/*.yaml` (10 files) — Breakable failure scenarios
- `k8s/base/grid-dashboard.html` — Vue.js consumer dashboard (design reference)
- `k8s/base/ops-console.html` — Vue.js operations console (design reference)
- `infra/bicep/main.bicep` — Infrastructure orchestration (AKS, ACR, Key Vault, SRE Agent)
- `infra/bicep/modules/sre-agent.bicep` — SRE Agent deployment with managed identity
- `.devcontainer/devcontainer.json` — Dev container configuration (PowerShell, Azure CLI, kubectl)
- `.devcontainer/post-create.sh` — Shell aliases and helper functions

**Decision Document:** Created `.squad/decisions/inbox/dallas-mission-control-arch.md` with full technical specification.

---

## 2026-04-24: Mission Control Planning Session

**Context:** Led squad planning session for Mission Control SPA. Brought in PM Contractor for business scoping and Software Architect Contractor for technical validation. Session outcome: **Fastify + Vue 3 + Vite browser-based architecture approved; MVP scope defined; ready for dev start.**

### Dallas Session Contributions

1. **Initial Architecture Analysis:** Analyzed entire codebase and recommended Electron + Vue 3 + Vite approach (comprehensive 772-line specification document)
2. **Design Language Identification:** Identified existing Vue.js dashboards' dark theme + cyan accents for reuse; mapped CSS variables to new Mission Control
3. **Integration Point Mapping:** Documented all PowerShell/kubectl/Azure auth touch points
4. **Cross-Platform Risk Assessment:** Identified PowerShell path resolution, kubectl context, Azure auth as key risks; proposed mitigations

### Critical Outcome: Architect Recommendation

**Software Architect Contractor REJECTED Electron, recommended browser-based instead:**
- Electron adds 150MB+ overhead for a dev tool
- Browser-based simpler to deploy, maintain, no packaging complexity
- **Dallas accepted architect guidance** — approved Fastify + Vue 3 + Vite

### Final Architecture (Post-Planning)

- **Backend:** Node.js Fastify (TypeScript, 20+ REST endpoints, WebSocket streaming)
- **Frontend:** Vue 3 Composition API + Vite (consistency with existing dashboards)
- **Deployment:** Single Docker image, single port in production
- **Dev Mode:** Two ports (backend :3001, frontend :5173 with proxy)

### MVP Scope (Approved)

**Week 1 Delivery:** Deploy/destroy automation + real-time pod/service status + scenario control + SRE Agent portal access + preflight validation

**Success Criteria:** Deploy → Inject scenario → Launch portal in <2 minutes, 99%+ reliability

### Next Immediate Action

Developer starts Week of 2026-04-28. Dallas to review code against architect specification every 2 days during Phase 1.

**Status:** ✅ Planning complete. Ready for development sprint. All decisions merged into `.squad/decisions.md`. Orchestration logs created in `.squad/orchestration-log/`.

---

## 2026-04-25T18:58:04Z: Mission Control Wallboard Redesign Review Batch

**Context:** Full contractor batch review for Mission Control redesign toward wallboard ops center (16:9 fixed-zone layout, expected-vs-actual hero matrix, operational readiness criteria).

**Key Outcome:** Single-scroll responsive design SUPERSEDED for wallboard mode. All five contractors converged on fixed-zone layout optimized for 8-foot help desk monitoring. Brand Guardian repositioning approved (remove Azure SRE Agent from header, rename Ask Copilot → Explain This State). Product/Business cleared active scenario badges + job status visibility + deploy/destroy form move to control panel.

**Dallas Notes:** Phase 2 will incorporate wallboard IA and new API surface (/api/inventory, pod logs, events, endpoints). Phase 1 (current MVP) ships browser SPA unchanged. Wallboard Phase 2 is a UI/IA redesign, not a data model refactor.

**Orchestration Log:** `.squad/orchestration-log/2026-04-25T18-58-04Z-mission-control-wallboard-redesign.md` (full review batch)

---

## 2026-04-26: Wave 1→5 Gated Execution Sequence

**Context:** With Wave 0 closed (7/7 team approvals), produced the canonical gated execution plan for completing the full demo across all 5 waves.

**Key Decisions:**

1. **Wave 1 has 10 exact closure criteria** — all must pass before Wave 2 starts. CI drift guard workflow is a gap (`.github/workflows/validate-scenarios.yml` doesn't exist yet). Live KQL validation against a deployed workspace is required.

2. **Wave 2 focuses on 3 reference scenarios only** — OOMKilled (simple), MongoDBDown (complex cascading), ServiceMismatch (subtle). These are the customer incident proof. Includes a 20-minute dry-run demo.

3. **Waves 3 and 4 can run in parallel** — Security/safe-fail (W3) and Runbooks/telemetry (W4) have no mutual dependencies. Both depend on Wave 2 completion. This is the key scheduling optimization.

4. **Wave 5 requires both W3 + W4** — MTTR measurement needs runbook evidence, SLO needs App Insights telemetry, compliance package needs security evidence.

5. **Anti-rework critical path:** Activity Log export (W1) → audit trail (W3) → change correlation (W5). If Activity Log is missing, W3 and W5 evidence is empty. This is the #1 dependency to protect.

6. **Specialist contractor engagement pattern:** SRE Contractor gates technical accuracy at W2/W4/W5. Security Engineer Contractor gates RBAC at W3 and compliance at W5. Brand Guardian gates narrative at demo dry-runs.

**Gaps Found:**
- CI workflow `validate-scenarios.yml` missing — Ripley must create
- W3-3 (RBAC denial UX) may be blocked by Preview limitations — planned fallback is "document limitation, don't fabricate"
- `slo-meter-ingest` SLO (W5-4) depends on W4-4 App Insights instrumentation — long dependency chain

**Decision Artifact:** `.squad/decisions/inbox/dallas-wave-execution-sequence-2026-04-26.md`

---

## Learnings

### 2026-04-26 — GitHub Custom Agent Prompt Limit
- GitHub Custom Agents have a **30,000 character** hard limit on the agent prompt (`.github/agents/*.agent.md`).
- Squad's `squad.agent.md` at v0.9.1 is ~80K chars — 2.66× the limit. This is a known upstream issue.
- **Strategy:** Keep per-turn behavioral rules inline (~20-24K), externalize lookup tables, init flows, and subsystem specs to `.squad/templates/`. Most templates already exist and are duplicated in the monolith.
- **Decision artifact:** `.squad/decisions/inbox/dallas-agent-prompt-size.md`

---
