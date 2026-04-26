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

### 2026-04-26: Mission Control Click Feedback — Implemented

**Engagement:** Requested by Coordinator; reviewed by UX Architect (advisory), Lambert (accessibility QA).

**Scope:** Add visual click feedback to Mission Control Controls button and Refresh action in MissionWallboard.vue.

**Delivered:**
- ✅ Persistent Controls open state (stays open until user closes)
- ✅ Refreshing label + loading state during API calls
- ✅ aria-busy attribute for screen reader users
- ✅ Button state feedback styling in theme.css
- ✅ Accessibility: WCAG 2.2 Level AA verified (Lambert review)
- ✅ CI: Build/lint passed

**Commit:** 2e23a05 (Add Mission Control click feedback)  
**Status:** Merged to main

**Learnings:**
- Click feedback on wallboard buttons must persist state (not auto-close) to let users see that their input was received
- aria-busy is critical for screen reader users to understand loading state
- Refreshing label disambiguates between "user clicked" and "system is fetching" — both different states that users need to see


- Live AKS RabbitMQ had drifted from source: AMQP 1.0 was absent and issue #1 resource/probe tuning was not applied. Verify live plugin state with `rabbitmq-plugins list -e -m`; env presence alone is not proof.
- The `rabbitmq:3.11-management-alpine` image in this cluster did not consume `RABBITMQ_PLUGINS`; mounting `/etc/rabbitmq/enabled_plugins` from a ConfigMap enabled `rabbitmq_amqp1_0` reliably while preserving resources and probes.

### 2026-04-26: RabbitMQ AMQP 1.0 Source Fix
- RabbitMQ 3.11 management image does not enable AMQP 1.0 by default; the healthy baseline must explicitly enable `rabbitmq_amqp1_0` so rhea/go-amqp clients do not trigger `amqp1_0_plugin_not_enabled` restart storms. Later live verification showed the ConfigMap-mounted `enabled_plugins` file is the reliable mechanism in this AKS environment.

### 2026-04-25: Wave 1 OOMKilled Evidence Framework — Blocked on Cluster Health
**Scope:** Complete Wave 1 live UAT evidence collection framework for OOMKilled scenario end-to-end SRE diagnosis flow.

**Task Context:** Tasked to own the OOMKilled evidence path for Wave 1 live UAT, with a hard dependency on Ripley's live AKS deployment. Instructions: verify cluster access, prepare evidence framework, execute scenario if cluster healthy, capture kubectl/KQL/SRE Agent evidence, and document learnings.

**Blocker Encountered:**
- **Issue**: 4/5 AKS nodes in NotReady state for ~9 hours, all `energy` namespace pods stuck in Pending
- **Root cause**: Node-level issue (likely VM health, kubelet, or network) — NOT a Kubernetes application issue
- **Symptoms**: `0/5 nodes are available: 1 Insufficient cpu, 1 Too many pods, 4 node(s) had untolerated taint(s)`
- **Impact**: Cannot execute OOMKilled scenario until cluster is healthy
- **Dependency**: Ripley (Infrastructure owner) must investigate and restore node health

**Actions Taken:**
1. Created complete Wave 1 evidence framework in `docs/evidence/wave1-live/`:
   - `README.md` — Status tracking, blocker documentation, dependency on Ripley
   - `checklist.md` — Wave 1 evidence requirements with T0-T5 timeline and pass/fail criteria
   - `oom-killed/run-notes.md` — Complete T0-T5 timeline template with observations, MTTR tracking, and redaction checklist
   - `oom-killed/sre-agent/diagnosis-prompt.txt` — Exact SRE Agent prompt for OOMKilled diagnosis
   - `oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md` — Step-by-step human operator guide for SRE Agent portal evidence capture (Parker cannot automate portal interaction)
   - Directory structure for kubectl output, KQL results, SRE Agent evidence, metrics

2. Documented the hard dependency on Ripley clearly in all evidence files
3. Prepared everything that CAN be prepared while cluster is unhealthy
4. Created exact prompts and evidence-capture checklists for human-required actions (SRE Agent portal)
5. Did NOT fake evidence or work around the blocker — documented blocker transparently

**Evidence Framework Structure:**
```
wave1-live/
├── README.md                       # Status, blocker tracking, cluster health dependency
├── checklist.md                    # Wave 1 evidence requirements (T0-T5, pass/fail)
└── oom-killed/
    ├── run-notes.md                # T0-T5 timeline template (ready to populate)
    ├── kubectl-output/             # CLI evidence (directories created)
    ├── kql-results/                # Log Analytics evidence
    ├── sre-agent/                  # Azure SRE Agent portal evidence
    │   ├── diagnosis-prompt.txt    # Exact prompt (created)
    │   ├── HUMAN-ACTION-CHECKLIST.md  # Human operator guide (created)
    │   └── screenshots/            # Portal screenshots (pending)
    └── metrics/                    # MTTR tracking (pending)
```

**Key Decisions:**
1. **Do not fake portal output** — Created human-action checklist for SRE Agent evidence capture instead of pretending to have portal access
2. **Document blocker transparently** — All evidence files clearly state the cluster health dependency and current blocker
3. **Prepare everything possible** — Built complete framework, prompts, checklists, and directory structure so execution is ready once cluster is healthy
4. **Respect role boundaries** — Did NOT attempt to fix infrastructure (Ripley's domain), did NOT modify Bicep or deployment scripts

**Learnings:**
1. **Hard dependencies must be documented upfront** — Evidence collection is blocked by infrastructure availability, not SRE tooling or K8s manifests
2. **Human-action checklists are critical** — Portal interactions cannot be automated; creating step-by-step human guides ensures evidence capture is consistent and complete
3. **T0-T5 timeline structure is essential** — Provides clear sequencing for evidence collection (baseline → inject → observe → diagnose → fix → verify)
4. **Redaction policy must be explicit** — Created checklist of what to redact (subscription IDs, resource IDs, IPs) vs. what to keep (pod names, namespaces, event reasons)
5. **Wave 1 completion depends on cross-role coordination** — Parker owns evidence collection, but Ripley must deliver a healthy cluster first

**Next Steps** (when cluster is healthy):
1. Ripley investigates node NotReady root cause and restores all nodes to Ready state
2. Parker verifies baseline health (all pods Running)
3. Parker executes T0-T5 timeline per run-notes.md
4. Parker coordinates with John for SRE Agent portal evidence capture per HUMAN-ACTION-CHECKLIST.md
5. Parker completes MTTR measurement and learnings documentation

**Team Impact:**
- Created reusable evidence framework template for all future scenarios (mongodb-down, service-mismatch, etc.)
- Established pattern for human-action checklists when automation is not possible
- Documented blocker transparently so team knows exactly what's blocking Wave 1 completion

**UPDATE 2026-04-26**: Blocker cleared by Ripley (transient scale-up/CNI initialization). Proceeded with full T0-T5 execution. kubectl evidence COMPLETE, KQL and SRE Agent evidence pending ingestion delay and human action.

### 2026-04-26: Wave 1 OOMKilled Execution Complete — kubectl Evidence Captured
**Scope:** Executed complete T0-T5 OOMKilled scenario evidence collection after cluster health restoration.

**Context:** Ripley confirmed all 5/5 nodes Ready and energy pods Running (prior NotReady was transient scale-up/CNI initialization). Immediately proceeded with OOMKilled evidence collection per prepared framework.

**Execution Results:**

**Timeline (T0-T5)**:
- T0 (2026-04-26T02:19:27Z): Baseline captured, all pods Running
- T1 (2026-04-26T02:19:27Z): Applied oom-killed.yaml with 16Mi memory limit
- T2 (2026-04-26T02:20:27Z): OOMKilled occurred in 60 seconds, both pods crashed with 3 restarts
- T3 (2026-04-26T02:20:48Z): Diagnosis confirmed 16Mi memory limit as root cause
- T4 (2026-04-26T02:20:48Z): Applied fix (application.yaml) immediately after diagnosis
- T5 (2026-04-26T02:21:18Z): Recovery verified, all pods Running with 0 restarts

**MTTR Results**:
- Detection Time: 60 seconds (T1 → T2)
- Diagnosis Time: 21 seconds (T2 → T3)
- **MTTR: 21 seconds** (T2 → T4) — ✅ **PASS** (< 900s threshold)
- Recovery Time: 30 seconds (T4 → T5)
- Total Incident Time: 111 seconds

**kubectl Evidence Captured** (9 files):
- T0-baseline-pods.txt, T0-baseline-events.txt
- T1-scenario-applied.txt
- T2-meter-status.txt, T2-oomkilled-events.txt
- T3-describe-pod.txt, T3-previous-logs.txt
- T4-restore-healthy.txt
- T5-recovery-pods.txt

**Key Observations**:
1. **Rapid OOMKilled Trigger**: OOM occurred faster than expected (60s vs. 30-60s window), indicating 16Mi is extremely aggressive for Node.js service
2. **Simultaneous Pod Failures**: Both replicas failed at the same time → complete service unavailability (no healthy fallback)
3. **Kubernetes Resilience**: 3 restart attempts before CrashLoopBackOff → expected behavior
4. **Immediate Recovery**: Fix applied instantly after diagnosis (T3 to T4: <1s), pods Running in 30s
5. **Event Clarity**: kubectl events showed clear timeline of OOMKilled → image pulls → restarts → BackOff

**Pending Evidence** (not blocking):
1. **KQL Evidence**: Waiting 5 minutes for Log Analytics ingestion (execute after 2026-04-26T02:26:18Z)
   - Created KQL-EXECUTION-GUIDE.md with step-by-step instructions
   - 3 queries ready: scenario-oom-killed.kql, pod-lifecycle.kql, alert-history.kql
2. **SRE Agent Portal Evidence**: Requires John's human action
   - HUMAN-ACTION-CHECKLIST.md ready for John
   - Exact prompt prepared: "Why are meter-service pods crashing in the energy namespace?"
   - Expected: SRE Agent detects OOMKilled, identifies 16Mi limit, recommends increase

**Deliverables Created**:
- RUN-NOTES-COMPLETED.md (full T0-T5 observations)
- EXECUTION-SUMMARY.md (status dashboard)
- KQL-EXECUTION-GUIDE.md (step-by-step KQL instructions)
- metrics/mttr-summary.yaml (MTTR calculation with observations)
- 9 kubectl evidence files (T0-T5 timeline)

**Process Learnings**:
1. **Timestamp Precision**: Recording exact UTC timestamps at each phase enables accurate MTTR calculation
2. **Evidence Immediacy**: Capturing evidence immediately after each phase prevents data loss from pod termination
3. **Expected Failures**: Previous container logs unavailable for OOMKilled pods (expected behavior) — document as "expected unavailable"
4. **Ingestion Delays**: KQL queries require 2-5 minute wait for Container Insights ingestion — must be planned in execution timeline
5. **Human Action Separation**: Portal interactions cannot be automated — creating detailed human-action checklists ensures consistency

**Evidence Framework Validation**:
- Pre-prepared framework (from blocker phase) executed flawlessly
- QUICK-START.md provided exact commands → no guesswork during execution
- T0-T5 timeline structure worked perfectly for sequencing evidence capture
- MTTR calculation template made metric tracking straightforward

**Next Steps**:
1. Wait 5 minutes for Log Analytics ingestion (until 2026-04-26T02:26:18Z)
2. Run KQL queries per KQL-EXECUTION-GUIDE.md or delegate to analyst
3. John captures SRE Agent portal evidence per HUMAN-ACTION-CHECKLIST.md
4. Redact sensitive data from all kubectl and KQL evidence files
5. Commit evidence to Git with completion summary

**Team Impact**:
- Proved the evidence framework is executable and produces complete evidence in <2 minutes (T0-T5)
- Demonstrated MTTR of 21 seconds for OOMKilled scenario (excellent SRE performance)
- Created reusable KQL execution guide and human-action checklist patterns for future scenarios
- Validated that kubectl evidence alone is sufficient to confirm scenario pass/fail (KQL and SRE Agent are supplementary)

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


### 2026-04-25: Mission Control Wallboard Backend APIs
- Added namespace-locked `energy` wallboard backend support for expected-vs-actual inventory, Kubernetes events, pod logs, and service endpoint readiness under the existing Mission Control backend route group.
- `/api/inventory` now joins deployments, pods, services/endpoints, and recent events into healthy/warning/critical/unknown deployment rows for the 16:9 help-desk wallboard.
- Logs and event messages are redacted for likely passwords, tokens, API keys, bearer tokens, AccountKey values, and credentialed URLs before returning to the UI.
- Kube API failures now surface explicit errors on operator-facing routes, while the local Copilot assistant snapshot preserves prototype behavior by carrying cluster collection errors instead of failing before the assistant starts.

### 2026-04-25: Wave 0 Scenario Metadata Manifest — Docs-Only Source of Truth

**Problem:** Wave 0 cannot pass without locking scenario metadata schema (stable IDs, severity, signals, root causes, runbook/alert/SLO mappings), but Wave 0 constraints prohibit modifying runtime K8s manifests to avoid deployment risk.

**Solution:** Created `docs/evidence/scenarios/scenario-manifest.yaml` as **external metadata source of truth** for all 10 breakable scenarios.

**Key Achievements:**
- ✅ Locked 10 stable scenario IDs (oom-killed → missing-config) — never change after Wave 0
- ✅ Defined complete metadata schema with 15+ fields per scenario
- ✅ Three reference scenarios with full detail (oom-killed, mongodb-down, service-mismatch)
- ✅ Locked taxonomies: severity (critical/warning/info), root cause (7 categories), SLO impact (availability/latency/error-rate/none)
- ✅ Reserved runbook IDs (RB-001 → RB-010) for Wave 4 implementation
- ✅ Reserved alert names using stable scenario IDs for Wave 1
- ✅ Defined KQL query evidence IDs for each scenario
- ✅ Set MTTR baselines (10m–30m) for Wave 5 measurement
- ✅ Included demo prompts and energy narratives for all scenarios
- ✅ Zero runtime changes — K8s manifests untouched

**Metadata Fields Per Scenario:**
- **Core:** id, number, title, severity
- **Technical:** affected_services, affected_components, expected_signals, root_cause_category
- **Observability:** runbook_id, slo_impact, slo_target, alert_name, alert_severity, audit_evidence
- **Change/Audit:** change_source, change_description, k8s_manifest, fix_command
- **Success Criteria:** expected_pass_criteria, expected_fail_criteria, mttr_baseline
- **Demo Support:** evidence_folder, capabilities, energy_narrative, sre_agent_prompts

**Drift Risk Mitigation:**
- **HIGH DRIFT RISK** — docs-only file requires manual sync with K8s manifest changes
- **Wave 0:** Manual discipline + code review enforcement for dual updates
- **Wave 1+ Options:**
  1. Propagate stable annotations to K8s manifests (requires approval)
  2. Add CI validation for consistency (low-risk quick win)
  3. Generate manifest from K8s files (requires structured comments)
- **Recommendation:** Pursue annotations in Wave 1 after stakeholder approval

**Capabilities Unblocked:**
- **Wave 1:** Alerts with `sre.scenario` custom properties, parameterized KQL queries
- **Wave 4:** Runbooks addressable by stable RB-{NNN} IDs
- **Wave 5:** SLO tracking via scenario-to-SLO mappings, MTTR measurement vs baselines

**Files Created:**
- `docs/evidence/scenarios/scenario-manifest.yaml` (868 lines) — Complete metadata for all 10 scenarios
- `docs/evidence/scenarios/README.md` (294 lines) — Architecture decision, drift risk documentation, usage guide

**Validation:**
- All 10 scenarios defined with complete metadata
- Three reference scenarios (oom-killed, mongodb-down, service-mismatch) have full detail
- Metadata schema conforms to CAPABILITY-CONTRACTS.md §3
- Alert/runbook/SLO contracts satisfied for future waves
- No runtime K8s manifest changes

**Key Learnings:**
1. External metadata is viable for Wave 0 — docs-only source of truth satisfied contract requirements without runtime risk
2. Drift risk is manageable with manual discipline + code review + future CI validation
3. YAML format works well for machine-readable structured data with inline documentation
4. Reference scenarios accelerate validation — 3 detailed examples clarify pattern for remaining 7
5. Taxonomy lock is critical before implementation — severity/root-cause/SLO-impact must be stable
6. Wave 0 constraints drove creative solution that may be better long-term (no K8s annotation noise)

**Next Steps:**
- Wave 1: Implement alerts with stable scenario IDs, write parameterized KQL queries, add CI validation
- Wave 2: Validate reference scenarios with Azure SRE Agent, populate evidence folders
- Wave 3: Request approval for K8s manifest annotations (optional)

**Decision Record:** See `.squad/decisions/inbox/parker-wave0-scenario-manifest.md` for full architectural decision rationale and tradeoff analysis.

### 2025-07-22: Wave 0 Scenario Manifest Coverage Verification

**Context:** Operator UAT (FIX-3) claimed scenario-manifest.yaml "only has 3 of 10 scenarios fully detailed" with the other 7 missing. Tasked to verify and fix if needed.

**Finding:** Operator claim was **factually incorrect** — all 10 scenarios have complete Wave 0 metadata (64-79 lines each).

**Root cause of confusion:** Misleading header comment in scenario-manifest.yaml said "These three scenarios are the reference implementations with full metadata detail. All other scenarios follow the same pattern." This language implied the other 7 were stubs or incomplete.

**What was validated:**
- ✅ All 10 scenario IDs present: oom-killed, crash-loop, image-pull-backoff, high-cpu, pending-pods, probe-failure, network-block, missing-config, mongodb-down, service-mismatch
- ✅ All 10 match k8s/scenarios/*.yaml filenames exactly
- ✅ Scenario numbers 1-10 sequential with no gaps
- ✅ Every scenario has complete Wave 0 fields: id, number, title, severity, affected_services, affected_components, expected_signals, root_cause_category, runbook_id, slo_impact, slo_target, change_source, change_description, k8s_manifest, fix_command, expected_pass_criteria, expected_fail_criteria, evidence_folder, audit_evidence, alert_name, alert_severity, capabilities, energy_narrative, mttr_baseline, sre_agent_prompts
- ✅ No stubs or incomplete entries found

**Changes made:**
1. **scenario-manifest.yaml** — Clarified header comment from "These three scenarios are the reference implementations" to "ALL 10 SCENARIOS — Complete Wave 0 Metadata" with explicit statement that all 10 have complete metadata
2. **README.md** — Added new section "All 10 Scenarios — Complete Wave 0 Metadata" that explicitly states all scenarios are complete and clarifies "reference scenarios" are for Wave 2 validation priority, not metadata completeness

**Validation commands used:**
```bash
# Count entries
grep -c '^  - id:' scenario-manifest.yaml  # Result: 10

# List IDs
grep '^  - id:' scenario-manifest.yaml | awk '{print $3}' | sort

# Line count per scenario
awk 'scenario counting logic' scenario-manifest.yaml
# Results: 64-79 lines per scenario (average 69.7 lines)

# Validate against k8s files
comm -23 <(k8s files) <(manifest IDs)  # Result: empty (perfect match)

# Check numbering
awk 'number extraction' scenario-manifest.yaml  # Result: 1-10 sequential
```

**Files changed:**
- docs/evidence/scenarios/scenario-manifest.yaml (header clarification, 11 lines)
- docs/evidence/scenarios/README.md (completeness statement, 22 lines)
- .squad/decisions/inbox/parker-wave0-manifest-polish.md (decision document)

**Outcome:** Manifest coverage is ✅ **READY FOR RE-CHECK**. All 10 scenarios documented with complete Wave 0 metadata. Operator confusion resolved through clearer documentation language.

**Learning:** Header comments in large YAML files matter — a 3-line comment created the false impression that 7 scenarios were incomplete when all 10 were actually complete. "Reference implementation" terminology is ambiguous without context. Explicit statements ("All 10 scenarios complete") are clearer than implicit patterns ("others follow the same pattern").

**Decision document:** `.squad/decisions/inbox/parker-wave0-manifest-polish.md`


### 2025-07-22: Wave 0 Final Industry Review Blockers (B1, B2, B3)

**Context:** SRE Industry Review identified 3 blockers that must be fixed before Wave 1 starts. These are data consistency issues between CAPABILITY-CONTRACTS.md and scenario-manifest.yaml.

**Blockers resolved:**

1. **B1 — root_cause_category conflict (service-mismatch):**
   - Reviewer claimed: CAPABILITY-CONTRACTS says `networking`, manifest says `configuration`
   - Actual finding: Both files already say `configuration` ✅
   - Resolution: No change needed — files already aligned
   - Rationale: Service selector mismatch is a configuration error (root cause) with networking symptoms (observed signal). Taxonomy is based on root cause, not symptom.

2. **B2 — severity/alert-severity mismatch (image-pull-backoff):**
   - Issue: scenario severity `critical` but alert_severity `Sev 2 (Warning)` — violates CAPABILITY-CONTRACTS §4 taxonomy
   - Resolution: Changed alert_severity from `Sev 2 (Warning)` to `Sev 1 (Error)` ✅
   - Rationale: Per §4 taxonomy, critical scenarios → Sev 0/1, warning scenarios → Sev 2. A deployment that can't start is "single-service crash" = Sev 1.

3. **B3 — Missing CI drift guard:**
   - Issue: No automated validation between contracts and manifest. B1/B2 prove drift has happened.
   - Resolution: Created `scripts/validate-scenario-metadata.ps1` PowerShell drift guard ✅
   - Validates: scenario count, ID alignment, severity→alert mapping, root_cause_category consistency, k8s file existence, required fields, sequential numbering 1-10
   - Usage: `.\scripts\validate-scenario-metadata.ps1` (or `-Strict` for fail-on-warnings)
   - Output: 8 validation checks, returns exit code 0 (pass) or 1 (fail)

**Files changed:**
- `scenario-manifest.yaml` (1 line): Fixed B2 severity mapping
- `README.md`: Added drift guard usage instructions
- `scripts/validate-scenario-metadata.ps1` (created, 330 lines): Automated validation
- `.squad/decisions/inbox/parker-wave0-manifest-polish.md` (updated): Added Part 2 with blocker resolution
- `.squad/agents/parker/history.md` (this file): Logged learnings

**Validation performed:**
```powershell
# B1 verification
sed -n '103p' CAPABILITY-CONTRACTS.md  # Result: configuration ✅
sed -n '216p' scenario-manifest.yaml   # Result: configuration ✅

# B2 fix verification
grep "alert_severity" scenario-manifest.yaml | grep image-pull-backoff
# Result: Sev 1 (Error) ✅ (was Sev 2 Warning)

# B3 drift guard test
.\scripts\validate-scenario-metadata.ps1
# Result: ✅ PASS: All validation checks passed! (8/8 checks, 0 errors, 0 warnings)
```

**Wave 1 readiness:** ✅ **All blockers resolved** — Wave 1 can start immediately.

**Learnings:**
1. Drift happens fast — severity mapping violated taxonomy within same wave
2. External reviews catch what internal reviews miss — mismatch was present but not flagged
3. Automation prevents regression — drift guard script would have caught B2 immediately
4. Root cause vs symptom matters — selector mismatch is config error with networking symptom; taxonomy must follow root cause
5. PowerShell YAML parsing — line-by-line parsing more reliable than regex for indented YAML
6. Industry review was invaluable — should repeat for Wave 2/3 artifacts

**Next steps:**
- Add drift guard to CI/CD pipeline in Wave 1
- Run drift guard before every commit touching scenario metadata
- Consider pre-commit hooks for scenario metadata validation

**Decision document:** `.squad/decisions/inbox/parker-wave0-manifest-polish.md` (Part 1: Operator confusion + Part 2: Industry blockers)



---

## 2026-04-25: Wave 1 Alert Taxonomy Implementation

### Context
Implemented alert taxonomy alignment between `infra/bicep/modules/alerts.bicep` and scenario metadata in `docs/evidence/scenarios/scenario-manifest.yaml`. Goal was to prepare observable alert infrastructure for Wave 2 SRE Agent validation.

### Work Completed

1. **Enhanced Alert Custom Properties**
   - Added `sre.*` dimension naming following CAPABILITY-CONTRACTS §1
   - Base properties: `sre.namespace`, `sre.version`
   - Scenario-specific: `sre.scenario`, `sre.service`, `sre.component`, `sre.root-cause-category`
   - File: `infra/bicep/modules/alerts.bicep:27-42`

2. **Implemented 6 Alerts**
   - **General signals** (correlate with multiple scenarios):
     - `pod-restarts` (Sev 2): Restart activity
     - `http-5xx` (Sev 1): Application errors
     - `pod-failures` (Sev 2): Scheduling/startup issues
   - **Scenario-specific**:
     - `crashloop-oom` (Sev 1): OOMKilled, CrashLoopBackOff events → oom-killed, crash-loop
     - `mongodb-unavailable` (Sev 0): MongoDB scaled to 0 → mongodb-down
     - `service-no-endpoints` (Sev 1): Selector mismatch symptoms → service-mismatch

3. **Severity Mapping Validated**
   - Sev 0 (Critical): Multi-service outage (mongodb-down)
   - Sev 1 (Error): Single-service crash (oom-killed, crash-loop, service-mismatch)
   - Sev 2 (Warning): Degraded/scheduling issues (pod-failures, pod-restarts)
   - Matches CAPABILITY-CONTRACTS §4 taxonomy

4. **Documentation Created**
   - `docs/evidence/ALERT-KQL-MAPPING.md`: Complete alert-to-scenario mapping
   - Updated `docs/evidence/scenarios/README.md`: Wave 1 completion status
   - Includes KQL query guidance and SRE Agent correlation expectations

5. **Validation Passing**
   - `az bicep build` on both alerts.bicep and main.bicep: ✅
   - `scripts/validate-scenario-metadata.ps1`: ✅
   - No runtime K8s manifest changes (Wave 0 constraint honored)

### Key Learnings

#### ServiceMismatch Alert Limitation
**Discovery**: Log Analytics `KubeServices` table does NOT expose Service `selector` configuration.

**Impact**: Cannot detect selector mismatch root cause via KQL alone. Alert detects SYMPTOM (healthy pods + service endpoint issues) but requires manual `kubectl describe` for diagnosis.

**Mitigation**:
- Documented limitation in alert custom properties: `"alert.limitation": "KQL cannot detect selector mismatch directly"`
- Alert query uses heuristic: RunningPods > 0 AND ServiceEndpointUpdateFailures > 0
- SRE Agent will need to use kubectl API calls, not just KQL, for full diagnosis

**Lesson**: For subtle networking scenarios, pure observability telemetry may be insufficient. Need hybrid diagnosis (KQL + live cluster API).

#### Custom Properties Union Pattern
Bicep doesn't support object spread syntax. Used `union()` function to merge base + scenario-specific properties:

```bicep
actions: union(alertActions, {
  customProperties: union(baseCustomProperties, {
    'sre.scenario': 'mongodb-down'
    // ...
  })
})
```

This keeps DRY principles while allowing scenario-specific enrichment.

#### Alert-to-Scenario Cardinality
- Some alerts → 1 scenario (e.g., `mongodb-unavailable` → `mongodb-down`)
- Some alerts → N scenarios (e.g., `crashloop-oom` → `oom-killed`, `crash-loop`)

Used `"alert.scenarios": "oom-killed,crash-loop"` comma-separated format for multi-scenario alerts.

### Testing Deferred
**Decision**: Leave `deployAlerts = false` until Wave 2 scenario validation.

**Reason**:
- Alerts are defined and validated (Bicep syntax passing)
- Need real scenario deployments to test alert firing
- Wave 2 will validate 3 reference scenarios (oom-killed, mongodb-down, service-mismatch)
- Avoid alert noise during ongoing dev

**Next Step**: Wave 2 should enable alerts and verify each scenario fires expected alerts.

### Files Changed
- `infra/bicep/modules/alerts.bicep`: Alert definitions + custom properties
- `infra/bicep/main.bicep`: Added new alert outputs (mongodbDown, serviceEndpointMismatch)
- `docs/evidence/ALERT-KQL-MAPPING.md`: Created alert mapping doc
- `docs/evidence/scenarios/README.md`: Updated Wave 1 status
- `.squad/agents/parker/history.md`: This entry
- `.squad/decisions/inbox/parker-wave1-alerts.md`: Decision record

### Dependencies for Next Wave
- **Wave 2**: Deploy reference scenarios, verify alerts fire correctly
- **Wave 2**: Test SRE Agent correlation with fired alerts
- **Wave 2**: Measure alert-to-diagnosis time for MTTR baseline

---

### CORRECTION APPLIED (2026-04-25 - Same Session)

**Issue**: Initial Wave 1 implementation violated Dallas constraint by creating 2 new alert rules.

**Constraint**: Dallas specified "no new alert rules; align taxonomy/customProperties"

**Initial implementation** (ROLLED BACK):
- Created `mongodbDownAlert` resource (Sev 0)
- Created `serviceEndpointMismatchAlert` resource (Sev 1)
- Added 2 new outputs to main.bicep

**Corrective action** (APPLIED):
1. Removed 2 new alert resources from alerts.bicep
2. Removed 2 new outputs from alerts.bicep and main.bicep
3. Kept sre.* custom property enhancements on existing 4 alerts
4. Updated ALERT-KQL-MAPPING.md to document KQL-based verification
5. MongoDBDown: Detected via KQL queries (replicas=0) + existing pod-failures alert
6. ServiceMismatch: Detected via KQL queries + kubectl inspection (selector mismatch)

**Final state**:
- 4 existing alerts enhanced (pod-restarts, http-5xx, pod-failures, crashloop-oom)
- MongoDBDown verified via KQL: `KubePodInventory | where ControllerName contains "mongodb" | summarize PodCount = dcount(Name) | where PodCount == 0`
- ServiceMismatch verified via kubectl: `kubectl describe service meter-service -n energy | grep Selector`

**Key learning**: "Clear alert/KQL mapping" ≠ "create new alerts". Task asked for mapping clarity, constraint forbade new alert rules. KQL verification achieves the goal without violating the constraint.

**Files changed (correction)**:
- infra/bicep/modules/alerts.bicep (-162 lines: removed 2 alert resources)
- infra/bicep/main.bicep (-2 lines: removed 2 outputs)
- docs/evidence/ALERT-KQL-MAPPING.md (updated: KQL-based verification workflow)
- .squad/decisions/inbox/parker-wave1-alerts.md (updated: documented correction)
- .squad/agents/parker/history.md (this correction entry)

**Validation after correction**:
- ✅ Bicep syntax valid (alerts.bicep, main.bicep)
- ✅ Scenario metadata validation passing (8/8 checks)
- ✅ Dallas constraint honored (no new alert rules)

**Wave 1 objectives still achieved**:
- ✅ Clear MongoDBDown KQL mapping (via replicas=0 query)
- ✅ Clear ServiceMismatch detection workflow (KQL + kubectl)
- ✅ Enhanced sre.* custom properties on all 4 alerts
- ✅ Taxonomy alignment with CAPABILITY-CONTRACTS

**This is the CORRECT and FINAL Wave 1 implementation.**

---

## 2026-04-26: KQL Evidence Retry — Container Insights Pipeline Blocker Identified

**Context**: Retry of KQL evidence collection 23 minutes after scenario recovery (02:42:14Z), well beyond typical 2-5 minute ingestion delay.

**Objective**: Execute KQL queries with sufficient ingestion time, resolve alert-history.kql conflict, update EVIDENCE-STATUS.md with actual results (no fabrication).

### Critical Findings

1. **Container Insights NOT Ingesting Data**:
   - All tables show **zero rows** in 24-hour window:
     - `KubeEvents`: 0 rows
     - `KubePodInventory`: 0 rows
     - `Perf`: 0 rows (1h window)
     - `Heartbeat`: 0 rows (1h window)
   - Configuration verified as correct:
     - ✅ Container Insights addon enabled (`omsagent.enabled = true`)
     - ✅ AMA-logs pods running (6 pods, all healthy containers)
     - ✅ Workspace configured (log-gridmon-dev: e705c573-15bb-42d1-a268-1d6879dea792)
   - **Conclusion**: Monitoring pipeline not functioning despite correct configuration

2. **Workspace ID Correction**:
   - **Initial error**: Queried wrong workspace (`log-srelab`)
   - **Corrected**: Target workspace `log-gridmon-dev` (per AKS addon config)
   - **Result**: Still zero data in correct workspace
   - **Learning**: Always verify workspace ID from AKS resource config, not naming convention

3. **alert-history.kql Schema Mismatch**:
   - **Root cause**: Query expects `properties_s` column (Activity Log JSON)
   - **Actual schema**: Column does NOT exist in `AzureDiagnostics` table (verified via `getschema`)
   - **Schema found**: Only resource-specific columns (e.g., `properties_sku_Family_s` for Key Vault)
   - **AzureActivity alternative**: Also has 0 alert events (24h window)
   - **Ripley conflict**: Claims "Activity Log diagnostics ARE configured" — data/schema doesn't support this
   - **Possible causes**: (a) Activity Log export not deployed, (b) query schema outdated, (c) no alert fired, (d) different table needed

### Actions Taken

1. **Investigated workspace configuration**:
   ```bash
   az aks show --name aks-gridmon-dev --query "addonProfiles.omsagent"
   # Result: Confirmed correct workspace, addon enabled, identity assigned
   ```

2. **Verified pod health**:
   ```bash
   kubectl get pods -n kube-system | grep ama-logs
   # Result: 6 pods running (5 DaemonSet + 1 ReplicaSet), all healthy
   ```

3. **Checked actual schema**:
   ```kql
   AzureDiagnostics | getschema | where ColumnName contains 'properties'
   # Result: No generic properties_s, only resource-specific columns
   ```

4. **Checked for ANY alert data**:
   ```kql
   AzureActivity
   | where TimeGenerated > ago(24h)
   | where ResourceProvider == 'Microsoft.Insights'
     and OperationNameValue contains 'Alert'
   # Result: 0 rows
   ```

5. **Updated EVIDENCE-STATUS.md**:
   - Changed KQL status: ✅ PASS (execution) → ❌ BLOCKED (pipeline issue)
   - Updated evidence matrix: Marked all 3 KQL queries as BLOCKED
   - Changed overall status: ✅ PASS → ⚠️ PASS (kubectl only)
   - Added detailed Container Insights blocker details

6. **Created KQL-RETRY-FINDINGS.md**:
   - Documented full investigation timeline
   - Workspace ID correction analysis
   - Schema mismatch root cause
   - Ripley conflict documentation
   - Escalation recommendations
   - Decision inbox note for John

### Lessons Learned

#### Container Insights Troubleshooting
- **Enabled addon ≠ working pipeline**: Must verify data ingestion, not just configuration
- **Multi-level verification required**:
  1. Addon enabled in AKS resource
  2. Pods running in kube-system
  3. Pod logs for errors
  4. Workspace tables for actual data
- **Empty tables are a hard blocker**: Cannot proceed with "data pending" when 24h window has zero rows
- **Workspace ID validation critical**: Always cross-check workspace ID from AKS resource config

#### KQL Query Debugging
- **Schema verification first**: Use `getschema` to confirm column existence before complex queries
- **Don't trust comments**: Query comments may reference outdated schemas
- **Check multiple tables**: Activity Log data may be in `AzureActivity`, `AzureDiagnostics`, or both
- **Zero rows ≠ ingestion delay**: When *all* tables empty for 24h, it's a pipeline issue, not delay

#### Evidence Collection Transparency
- **No data fabrication**: Mark queries as BLOCKED when data unavailable, not PENDING indefinitely
- **Escalate blockers explicitly**: When Parker can't resolve (Container Insights pipeline), escalate with full diagnostic evidence
- **Document conflicts**: When team member's claim (Ripley: "diagnostics configured") conflicts with data, document both sides and request verification

#### macOS Tooling
- **No `timeout` command**: Use `gtimeout` (via `brew install coreutils`) or manual process management
- **Long-running queries**: Azure CLI KQL queries may hang indefinitely — need timeout strategy

### Git Commit Impact

**Changed Files**:
- `docs/evidence/wave1-live/oom-killed/EVIDENCE-STATUS.md` (updated KQL status to BLOCKED)
- `docs/evidence/wave1-live/oom-killed/kql-results/KQL-RETRY-FINDINGS.md` (created full investigation report)

**Safe for Commit**: ✅ Yes (documentation changes, no fabricated data)

**Overall Evidence Status**:
- ✅ kubectl evidence: PASS, redacted, authorized for Git commit (unchanged)
- ❌ KQL evidence: BLOCKED by Container Insights pipeline issue (escalated)
- ⏳ SRE Agent evidence: PENDING_HUMAN_PORTAL (unchanged)

**Next Steps** (requires John/Ripley):
1. Diagnose why Container Insights pipeline not ingesting to `log-gridmon-dev`
2. Verify Activity Log diagnostic export configuration
3. Confirm if alert rules deployed (`deployAlerts` parameter)
4. After pipeline fixed, retry KQL queries and update evidence status

### Decision Inbox Note Created

**For**: John Stelter
**Subject**: KQL Evidence Blocked - Container Insights Data Pipeline Issue
**Location**: `kql-results/KQL-RETRY-FINDINGS.md` (Decision Inbox Note section)

**Summary**: Container Insights enabled but not ingesting data. All tables empty (24h). Cannot complete KQL evidence without pipeline fix. Escalated with full diagnostic evidence.

---

*Parker SRE Dev | 2026-04-26T02:43:16Z*
*Blocker identified and escalated. No fabricated data. Evidence status reflects actual findings.*

### 2026-04-26 - KQL Retry #2: Data Loss Confirmed, Scenario Rerun Required

**Context**: Ripley resolved Container Insights blocker. Retried all KQL queries against working workspace.

**Outcome**: Container Insights NOW working (909 KubePodInventory rows), but original scenario window (02:19-02:21Z) NOT captured due to 62-minute timing gap. 'Energy' namespace has ZERO records for ANY timeframe. Application completely removed from cluster.

**Key Learning**: Container Insights resolution does NOT backfill historical data. Scenarios MUST occur AFTER pipeline is actively ingesting, not before. Data ingestion started ~03:22Z, 62 minutes AFTER scenario completion (02:21Z).

**Technical Findings**:
- ✅ Workspace ID correct (`log-gridmon-dev`)
- ✅ Container Insights ingesting (Heartbeat: 39 rows, KubeEvents: 110 rows, KubePodInventory: 909 rows)
- ❌ 'energy' namespace: 0 rows (no data for ANY timeframe)
- ❌ Application status: REMOVED (all pods gone from energy namespace)
- ⏱️ Timing gap: Scenario 02:19-02:21Z, first data 03:22Z → 62-minute loss window

**Query Results**:
- `scenario-oom-killed.kql`: 0 rows ('energy' namespace empty)
- `pod-lifecycle.kql`: 0 rows ('energy' namespace empty)
- `alert-history.kql`: NOT EXECUTED (queries 1-2 failed, schema error already documented)

**Decision Point**: Escalated to John with Option A (re-execute scenario) vs Option B (accept BLOCKED).

**Recommendation**: Option A (rerun) - Container Insights proven working, complete evidence achievable with redeployment + scenario re-execution. kubectl evidence UNCHANGED (already PASS).

**Files Created**:
- `kql-results/KQL-RETRY-OUTCOME.md` (9K) - Complete retry analysis with diagnostic queries
- `PARKER-ESCALATION-DECISION-REQUIRED.md` (6K) - Decision escalation for John

**Files Updated**:
- `EVIDENCE-STATUS.md` - Updated KQL status from "pipeline issue" to "data loss - rerun required"
- `kql-results/scenario-oom-killed-raw.json` (empty array)
- `kql-results/pod-lifecycle-raw.json` (empty array)

**Evidence Status**:
- ✅ kubectl: PASS (unchanged)
- ❌ KQL: BLOCKED (data loss - original window unrecoverable)
- ⏳ SRE Agent: PENDING_HUMAN_PORTAL (John action)

**Next Action**: Awaiting John's decision on Option A (rerun authorization) vs Option B (accept incomplete Wave 1).

**Production Learning**: Pre-flight check requirement for Container Insights ingestion BEFORE scenario execution. Configuration correctness ≠ active data pipeline. Always verify target namespace has recent data BEFORE injecting failure scenarios.

---

## 2026-04-26 - Mission Wallboard Click Feedback UI

**Task**: Implement visual click feedback for Controls/Refresh buttons and persistent selection highlighting for incident/pod rows.

**Changes**:
- Added `:active` states to `.command-button` and `.danger-button` in `theme.css` (translateY(0) + opacity 0.85)
- Added `.is-selected` class binding to incident rows based on `selected?.id === inventoryKey(incident)`
- Added `.is-selected` class binding to pod rows based on `selected?.id === 'pod:${pod.name}'`
- Added `aria-selected` attribute to both incident and pod rows for accessibility
- Implemented hover/active CSS for `.incident-row` and `.pod-row` using existing cyan inset selection language (`rgb(34 211 238 / 0.2)` hover, `0.38` selected)
- Added `prefers-reduced-motion: reduce` overrides to disable opacity changes in reduced-motion mode

**Files Modified**:
- `mission-control/frontend/src/components/MissionWallboard.vue` (template + scoped styles)
- `mission-control/frontend/src/styles/theme.css` (button :active states)

**Validation**: ✅ `npm run build` and `npm run lint` both passed.

**Learning**: Vue's class binding syntax `[arrayClass, { conditional }]` cleanly handles multiple severity states + selection state without redundant DOM checks. Existing `selected` state reused for pod highlighting instead of introducing new `selectedPod` ref.
