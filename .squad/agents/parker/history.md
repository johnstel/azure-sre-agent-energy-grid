# Parker — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** Kubernetes manifests, YAML
- **Scenarios:** oom-killed, crash-loop, image-pull-backoff, high-cpu, pending-pods, probe-failure, network-block, missing-config, mongodb-down, service-mismatch
- **Namespace:** energy
- **Fix command:** `kubectl apply -f k8s/base/application.yaml`

## Core Context

### 2025-07-24: Ops-Console Architecture Validation (Archived Summary)
- Ops-console uses inline ConfigMap pattern (HTML + nginx conf) mounted into `nginx:alpine`, 1 replica on port :8081 (grid-dashboard is 2 replicas on :8080)
- ConfigMaps and Service selectors aligned correctly; probes, resource limits, DNS configuration all production-ready
- Orphaned standalone files (`k8s/base/nginx-ops.conf`, `k8s/base/ops-console.html`) drift from embedded ConfigMaps — embedded versions are authoritative
- Missing `sre-demo: breakable` label per project convention (candidate for future fix)
- Grid-dashboard shares identical architectural pattern; strong consistency across frontends

## Learnings

### 2026-04-25: Mission Control Copilot SDK Assistant
- Mission Control now has a local-only `POST /api/assistant/ask` endpoint backed by `@github/copilot-sdk` in the backend workspace.
- The assistant uses a read-only `get_mission_control_state` tool that reuses Mission Control's preflight, KubeClient, scenario registry, and JobManager state while omitting job logs from AI context to avoid leaking sensitive deployment output.
- The SDK is a Technical Preview runtime dependency: builds can pass without live Copilot auth, but runtime questions require working local Copilot CLI/auth and return a user-readable 503 if unavailable.
- Contractor alignment: v1 is a point-in-time local Mission Control explainer/triage assistant only, not an autonomous SRE agent or Azure SRE Agent replacement; SDK access is backend-only with one read-only tool, strict allowlist, timeout, per-request cleanup, and a single-request concurrency guard.

### 2026-04-25: K8s Service & Azure LB Diagnostic Gap Analysis — SRE Review
**Scope:** Full review of SRE-AGENT-SETUP.md, PROMPTS-GUIDE.md, SRE-AGENT-PROMPTS.md, and BREAKABLE-SCENARIOS.md for completeness in service debugging workflows.

**Real-world incident context:** External LoadBalancer VIPs failed while K8s internals were healthy. Diagnostics showed:
- `kubectl port-forward svc/grid-dashboard 18080:80` → 200 ✅
- In-cluster curl to `grid-dashboard.energy.svc.cluster.local` → 200 ✅
- All EndpointSlices Ready ✅
- NodePorts working on all node IPs (internal) ✅
- Problem: Azure Public LB/subnet NSG (external tier)

**Critical gap:** Docs do NOT guide operators how to systematically validate K8s service health independently from Azure LB. No escalation checklist separating "Kubernetes problem" vs. "Azure networking problem."

**Findings:**

1. **Missing K8s Diagnostic Baseline Commands** — None of the prompt guides mention:
   - `kubectl get endpoints -n energy` (is the Service actually collecting pod IPs?)
   - `kubectl get endpointslices -n energy` (granular endpoint health)
   - `kubectl get svc -n energy -o wide` (what IP/port combos does K8s see?)
   - `kubectl describe svc <svc-name> -n energy` (selector validation, port mappings)
   - `kubectl get ingress -n energy` (ingress-based routing, if used)
   - `kubectl logs -l app=<service> -n energy` (container-level service readiness)

2. **Missing Expected Output Documentation** — Operators don't know what "healthy" looks like:
   - `endpoints` should list pod IPs for each Service selector match
   - `endpointslices` should show Ready=True for all serving pods
   - `svc` IP should be a stable ClusterIP; targetPort should match container port
   - Probes (liveness/readiness) pass → pod appears in Endpoints

3. **No Escalation Decision Tree** — Operators can't decide when to stop debugging K8s:
   - If `kubectl port-forward` works but public IP doesn't → problem is upstream of K8s
   - If `in-cluster curl` to FQDN works but `kubectl port-forward` doesn't → K8s routing issue
   - If `kubectl describe pod` shows Ready=True but Service has 0 endpoints → selector mismatch
   - If Service shows endpoints but they're marked NotReady → probe or pod startup issue

4. **Networking Layer Separation Missing** — PROMPTS-GUIDE.md mentions network policies but not:
   - Service selector/label alignment (easy to miss in multi-pod scenarios)
   - Port name vs. targetPort mismatch in Service spec
   - Containerport vs. Service port alignment
   - DNS resolution from pod perspective (`nslookup`, `getent`)

5. **LoadBalancer-Specific Blind Spots** — No docs mention:
   - How to validate Azure LB backend pool registration (external to K8s)
   - How to distinguish "K8s can't see the pod" from "Azure LB can't reach the pod"
   - Why a Service can be "ready" in K8s but unhealthy from Azure perspective
   - Azure NSG rules on subnets hosting AKS nodes (affects external LB routing)

**Recommendations for Lambert's doc update:**

1. **Create `docs/KUBERNETES-SERVICE-TROUBLESHOOTING.md`** with:
   - Step-by-step diagnostic tree (healthy baseline → symptoms → kubectl commands)
   - Expected output tables for each command on healthy services
   - Common errors (0 endpoints, NotReady, CrashLoop) and their causes
   - Port mapping validation (containerPort → Service.targetPort → Service.port)
   - DNS resolution checks (in-cluster FQDN, service discovery)

2. **Expand `docs/PROMPTS-GUIDE.md`** to add section:
   - "When SRE Agent Says Service Looks Healthy But Users Can't Access It"
   - Prompt sequence: (1) "Show me the endpoints for grid-dashboard" (2) "Why do the pods have NotReady status?" (3) "Can you test in-cluster connectivity?"
   - Escalation cue: "port-forward works, public IP doesn't → escalate to Azure LB team"

3. **Add `docs/AZURE-LB-KUBERNETES-BRIDGE.md`** (collaborative with Ripley):
   - How AKS LoadBalancer Service maps to Azure public LB
   - Role of backend pools, health probes, NSG rules
   - Troubleshooting matrix: K8s healthy + user can't access = Azure layer issue
   - Test procedures: `kubectl port-forward` vs. public IP vs. internal nodePort

4. **Update application.yaml comments** to include:
   - Port mapping rationale for each service
   - Liveness/readiness probe details and why they matter
   - Selector labels and why they must match pod labels exactly

5. **Add new scenario documentation** in BREAKABLE-SCENARIOS.md:
   - Consider a service-mismatch scenario variant: Service selector doesn't match pod labels (different from current `service-mismatch.yaml`)
   - Example: meter-service deployment has label `app: meter-service-v2` but Service selector is `app: meter-service`

**Key insight:** The demo is excellent at pod-level diagnostics (CrashLoop, OOMKilled, probes) but has a blind spot at the service networking layer where K8s and Azure meet. Operators need a mental model of "K8s sees it healthy" → "but external access fails" → "check Azure LB, NSG, backend pool registration."

**Impact:** Reduces MTTR for future external-facing service issues from "test everything" to "run these 5 kubectl commands, then escalate to infrastructure."

### 2026-04-25: Empty Energy Namespace Diagnosis
- **Finding:** AKS can be healthy with Ready nodes while the demo appears empty if the `energy` namespace/baseline manifests are absent; `kubectl get ns energy` is the authoritative check.
- **Observed drift:** A separate `propane` namespace may contain similarly structured AKS Store workloads, but it is not the Energy Grid baseline and does not satisfy the SRE demo contract.
- **Safe restore:** Reapply `k8s/base/application.yaml` to recreate `energy` resources; Mission Control scenario disable/fix-all paths also reapply this baseline and do not delete the namespace.


### 2026-04-24: Mission Control Blank-Screen Production Failure — Fastify Static Wildcard Fix
- **Root cause:** Fastify's `@fastify/static` configured with `wildcard: false` prevented glob matching on Vite-generated hashed asset filenames (`/assets/index-*.js`, `/assets/index-*.css`)
- **Symptom:** Asset requests fell through to SPA HTML fallback route, returning incorrect MIME type (`text/html` instead of `application/javascript` or `text/css`)
- **Browser error:** "Cannot use import statement outside a module" (JavaScript MIME type mismatch)
- **Fix:** Removed `wildcard: false` from `mission-control/backend/src/server.ts` line 35 to enable glob matching
- **Verification:** All Vite assets now served with correct Content-Type headers; production build fully functional
- **Key insight:** Modern SPA asset serving requires wildcard/glob matching to handle content-hashed filenames from Vite builds

### 2026-04-24: Mission Control Smoke Test Coordination (with Lambert)
- Coordinated with Lambert on full workspace validation and build verification
- All assets, components, composables load correctly; no broken import chains
- README.md URLs verified accurate (development :5173, production :3333)
- Identified and resolved port :3333 conflict (orphaned Edge Helper) during testing
- Production workflow verified: `npm run build` → `npm run start` succeeds with all assets correctly served



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

## Mission Control Ask Copilot — Completed Implementation — 2026-04-25T18:44:47Z

**Phase:** Initial implementation + Product alignment + Approved

**Outcome:**
- **Backend:** `POST /api/assistant/ask` endpoint with GitHub Copilot SDK, read-only `get_mission_control_state` tool, `gpt-4.1`, point-in-time state snapshot, 60s timeout, concurrency guard, input validation, timestamp/sources/tools metadata
- **Frontend:** Ask Copilot panel in single-page Mission Control UI, request input, response display, error handling, metadata exposure (timestamp, sources, tools, limitations)
- **Documentation:** README updated with Technical Preview disclaimer, local-only framing, Copilot CLI/auth prerequisites, limitations
- **Validation:** build ✅, lint ✅, API smoke checks ✅ (health 200, input validation 400s, live assistant 200 with model/tool/metadata)

**Product Alignment:** Ask Copilot is local explainer/triage assistant; not autonomous SRE agent; not Azure SRE Agent replacement. Defers streaming, MCP, mutating/shell/file tools, persistent sessions, autonomous remediation.

**Review Decision:** APPROVED by Lambert (QA/Docs) after one README copy fix.

**Status:** Ready for commit to .squad/ (decisions merged, orchestration log written, session log written, inbox cleared).

---

## 2026-04-25T18:58:04Z: Mission Control Wallboard Redesign Review Batch — SRE Input

**Contractor Review:** Wallboard redesign for 16:9 help desk room monitor (fixed-zone layout, expected-vs-actual matrix, operational readiness).

**Parker SRE Feasibility Assessment:**
- **Gap Analysis:** Current APIs expose pods/services/deployments/scenarios/jobs, but NOT pod logs, aggregate inventory view, resource events, or service endpoints
- **Recommendations:** 
  1. Add `/api/inventory` → unified expected-vs-actual view (Deployments spec + actual pod state + endpoints + events)
  2. Add `/api/pods/:name/logs` (GET + WebSocket tail) → pod logs streaming (last 500 lines, server-side buffer)
  3. Add `/api/events` (GET + WebSocket watch) → Kubernetes events stream, namespace hard-lock to `energy`, redaction rules
  4. Add `/api/services/:name/endpoints` → Service endpoint resolver (pod IPs, readiness probes, port mappings)
  5. Namespace hard-lock: All wallboard APIs implicit `?namespace=energy` (no cross-namespace support)
  6. Redaction library: Mask connection strings, tokens, API keys in logs/events
  7. Scenario symptom mapping: Map `scenario` label presence to expected UI state/warning

**Parker Notes:** Wallboard IA is sound. Backend work is 1-2 days for `/api/inventory` join logic + pod logs streaming + events watch. No architectural blockers. Phase 2 feasible within timeline.

**Status:** Parker approved wallboard design; API recommendations captured in decisions.md for Phase 2 developer implementation.

