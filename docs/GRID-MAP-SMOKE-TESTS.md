# Cloud Demo Grid Map — Scenario Smoke Tests

> **Azure SRE Agent is generally available (GA).** This demo pins
> `Microsoft.App/agents@2026-01-01` with `upgradeChannel: 'Stable'`. If a
> subscription exposes only older preview provider metadata, deployment skips
> SRE Agent rather than falling back.

> **Safety Disclaimer** — This checklist covers the Interactive Grid Map in the deployed cloud demo
> (`ops-console`). The grid map visualizes Kubernetes service/application health for the Azure SRE
> Agent demo. It is **not connected to real grid telemetry, SCADA systems, or utility
> infrastructure.** All test steps operate against demo application health endpoints only.

**Issue**: [#22 test(grid-map): cloud demo smoke tests for breakable scenarios](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/22)
**Depends on**: #15 (data contract — merged as `CLOUD-GRID-MAP-DATA-CONTRACT.md`), #21 (grid map renderer — merged)
**Host**: `ops-console` in AKS `energy` namespace
**Data contract version**: `cloud-demo-v1`
**Related docs**: [`CLOUD-GRID-MAP-DATA-CONTRACT.md`](CLOUD-GRID-MAP-DATA-CONTRACT.md), [`INTERACTIVE-GRID-MAP-SPEC.md`](INTERACTIVE-GRID-MAP-SPEC.md), [`SAFE-LANGUAGE-GUARDRAILS.md`](SAFE-LANGUAGE-GUARDRAILS.md)

---

## Table of Contents

1. [V1 Data Contract Summary](#1-v1-data-contract-summary)
2. [Prerequisites](#2-prerequisites)
3. [Scenario Visibility Matrix](#3-scenario-visibility-matrix)
4. [Per-Scenario Smoke Tests (All 10)](#4-per-scenario-smoke-tests-all-10)
5. [Multi-Scenario Smoke Test](#5-multi-scenario-smoke-test)
6. [Missing-Data and Stale-Data Edge Cases](#6-missing-data-and-stale-data-edge-cases)
7. [Safe-Language Audit](#7-safe-language-audit)
8. [Accessibility Audit](#8-accessibility-audit)
9. [V1 Unsupported Dynamic States](#9-v1-unsupported-dynamic-states)
10. [Automated Contract Validation](#10-automated-contract-validation)

---

## 1. V1 Data Contract Summary

The V1 cloud-demo data contract exposes **three live health endpoints** and **seven static/unknown
nodes**. All health polling is done by `ops-console` nginx proxies — no browser JavaScript reads
Kubernetes directly.

The bottom event strip is present in V1 but shows a safe unavailable empty state because the V1
contract does not expose Kubernetes event data. It must not show synthetic events or imply SCADA,
utility telemetry, or real grid event visibility.

### Live health endpoints (can reflect scenario state changes)

| Node | Endpoint | Healthy when | Failure signal |
|---|---|---|---|
| `meter-service` | `GET /api/meter/health` | HTTP 2xx | Timeout → `critical`; HTTP 5xx → `critical`; HTTP 4xx → `warning` |
| `asset-service` | `GET /api/assets/health` | HTTP 2xx | Timeout → `critical`; HTTP 5xx → `critical`; HTTP 4xx → `warning` |
| `dispatch-service` | `GET /api/dispatch/health` | HTTP 2xx | Timeout → `critical`; HTTP 5xx → `critical`; HTTP 4xx → `warning` |

### Static / unknown nodes (no live V1 health signal)

| Node | V1 State | Reason |
|---|---|---|
| `mongodb` | `unknown` (rendered as static/in-cluster) | No browser-safe direct health endpoint |
| `rabbitmq` | `unknown` (rendered as static/in-cluster) | No browser-safe direct health endpoint |
| `grid-dashboard` | `unknown` (rendered as static/in-cluster) | Separate LoadBalancer service |
| `ops-console` | `unknown` (rendered as static/in-cluster) | Page itself proves host is serving |
| `load-simulator` | `unknown` (rendered as static/in-cluster) | No browser-safe health endpoint |
| `grid-worker` | `disabled` | `replicas: 0` — AMQP protocol mismatch |
| `forecast-service` | `unknown` / optional-absent label | Not deployed in current demo |

### Edge severity rule

An edge's displayed severity = `max(source.severity, target.severity)` using the ordering
`healthy < warning < critical`. The `unknown` state is non-propagating: if both endpoints are
`unknown` and neither is `warning` or `critical`, the edge renders as unknown/gray/dashed. Edge
severity is a visual impact cue only and must not be described as root cause.

---

## 2. Prerequisites

### For manual checklist execution (live cluster required)

- [ ] AKS `energy` namespace is healthy and all baseline pods are Running
- [ ] `ops-console` service is reachable in a browser (`kubectl port-forward` or LoadBalancer IP)
- [ ] Grid Map view is visible (click **Grid Map** tab in ops-console)
- [ ] Baseline: all three live nodes (`meter-service`, `asset-service`, `dispatch-service`) show
  `healthy` (green) in the grid map before each scenario
- [ ] `kubectl` is available and context is set to the demo cluster
- [ ] After each scenario, restore baseline:
  ```bash
  kubectl apply -f k8s/base/application.yaml -n energy
  ```

### For automated contract validation only (no cluster required)

```bash
.\scripts\validate-grid-map-contract.ps1
```

See [Section 10](#10-automated-contract-validation).

---

## 3. Scenario Visibility Matrix

This table documents V1 visibility for all 10 `k8s/scenarios/*.yaml` files against the cloud-demo
data contract. This is the primary traceability record for acceptance criterion AC3.

| # | Scenario | File | Primary Node | V1 Visibility | Primary Severity on Grid Map | Cascade Nodes | Edge Impact |
|---|---|---|---|---|---|---|---|
| 1 | OOMKilled | `oom-killed.yaml` | `meter-service` | **Full** — live health endpoint | `critical` | — (no cascade in V1; mongodb/rabbitmq are static) | `meter-service → rabbitmq` and `meter-service → mongodb` edges go critical |
| 2 | CrashLoop | `crash-loop.yaml` | `asset-service` | **Full** — live health endpoint | `critical` | — | `dispatch-service → asset-service` and `ops-console → asset-service` edges go critical; `asset-service → mongodb` edge goes critical |
| 3 | ImagePullBackOff | `image-pull-backoff.yaml` | `dispatch-service` | **Full** — live health endpoint | `critical` | — | All edges to/from `dispatch-service` go critical |
| 4 | HighCPU | `high-cpu.yaml` | `frequency-calc-overload` (new deploy) | **None — unsupported in V1** | N/A | — | None. See [Section 9](#9-v1-unsupported-dynamic-states) |
| 5 | PendingPods | `pending-pods.yaml` | `substation-monitor` (new deploy) | **None — unsupported in V1** | N/A | — | None. See [Section 9](#9-v1-unsupported-dynamic-states) |
| 6 | ProbeFailure | `probe-failure.yaml` | `grid-health-monitor` (new deploy) | **None — unsupported in V1** | N/A | — | None. See [Section 9](#9-v1-unsupported-dynamic-states) |
| 7 | NetworkBlock | `network-block.yaml` | `meter-service` | **Full** — NetworkPolicy blocks proxy path | `critical` | `rabbitmq` (if unreachable from meter-service path) | `meter-service → rabbitmq` edge goes critical |
| 8 | MissingConfig | `missing-config.yaml` | `grid-zone-config` (new deploy) | **None — unsupported in V1** | N/A | — | None. See [Section 9](#9-v1-unsupported-dynamic-states) |
| 9 | MongoDBDown | `mongodb-down.yaml` | `mongodb` (static node) | **Partial** — mongodb is static/in-cluster; downstream services may degrade if app health checks DB | `unknown` on mongodb (no live endpoint); downstream `meter-service`/`dispatch-service`/`asset-service` may show `critical` if app health reflects DB loss (app-dependent) | `meter-service`, `dispatch-service`, `asset-service` (indirect, app-dependent) | All `→ mongodb` edges stay unknown/gray (static); downstream service edges may go critical if health endpoints degrade |
| 10 | ServiceMismatch | `service-mismatch.yaml` | `meter-service` | **Full** — Service selector mismatch makes health endpoint unreachable | `critical` (health endpoint timeout via misconfigured Service) | — | `grid-dashboard → meter-service` edge goes critical; `meter-service → rabbitmq` and `meter-service → mongodb` edges go critical |

**Summary**: 6 of 10 scenarios have full or partial V1 visibility. 4 scenarios (HighCPU,
PendingPods, ProbeFailure, MissingConfig) are **not visible** on the V1 grid map because they
create new Deployments outside the topology graph. See [Section 9](#9-v1-unsupported-dynamic-states)
for documented follow-up needs.

---

## 4. Per-Scenario Smoke Tests (All 10)

> **Pass criteria for all live-endpoint scenarios**: Within one poll cycle (≤30 seconds), the
> primary node changes to the expected severity and all documented edges reflect the new severity.

---

### SMOKE-01 — OOMKilled (`oom-killed.yaml`)

**V1 visibility**: Full | **Primary node**: `meter-service` | **Expected severity**: `critical`

**Setup**:
```bash
kubectl apply -f k8s/scenarios/oom-killed.yaml -n energy
```

**Checklist**:
- [ ] Within 30 s: `meter-service` node turns **red / critical** on the grid map
- [ ] Edge `meter-service → rabbitmq` turns red/critical
- [ ] Edge `meter-service → mongodb` turns red/critical
- [ ] `asset-service` and `dispatch-service` remain at their pre-scenario severity
- [ ] `mongodb` and `rabbitmq` remain at `unknown`/gray (static nodes — no change)
- [ ] Clicking `meter-service` node opens the detail drawer
- [ ] Detail drawer title reads "Meter Service" or equivalent (no real-grid language)
- [ ] Detail drawer shows severity label "critical" (not "grid failure" or "power outage")
- [ ] Safe-language disclaimer remains visible above the map during scenario

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```
- [ ] `meter-service` returns to **green / healthy** within 30 s of teardown
- [ ] All edges return to their baseline/prior state (`meter-service → rabbitmq` and `meter-service → mongodb` return to unknown/gray; live-to-live edges return to healthy)

---

### SMOKE-02 — CrashLoop (`crash-loop.yaml`)

**V1 visibility**: Full | **Primary node**: `asset-service` | **Expected severity**: `critical`

**Setup**:
```bash
kubectl apply -f k8s/scenarios/crash-loop.yaml -n energy
```

**Checklist**:
- [ ] Within 30 s: `asset-service` node turns **red / critical**
- [ ] Edge `dispatch-service → asset-service` turns red/critical
- [ ] Edge `ops-console → asset-service` turns red/critical
- [ ] Edge `asset-service → mongodb` turns red/critical
- [ ] `dispatch-service` retains its own pre-scenario severity (scenario does not directly affect dispatch health endpoint)
- [ ] `meter-service` remains healthy
- [ ] Detail drawer for `asset-service` shows correct node label and severity, no real-infrastructure claims

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```
- [ ] `asset-service` returns to healthy; all cascaded edges return to prior state

---

### SMOKE-03 — ImagePullBackOff (`image-pull-backoff.yaml`)

**V1 visibility**: Full | **Primary node**: `dispatch-service` | **Expected severity**: `critical`

**Setup**:
```bash
kubectl apply -f k8s/scenarios/image-pull-backoff.yaml -n energy
```

**Checklist**:
- [ ] Within 30 s: `dispatch-service` node turns **red / critical**
- [ ] Edge `ops-console → dispatch-service` turns critical
- [ ] Edge `rabbitmq → dispatch-service` turns critical
- [ ] Edge `dispatch-service → mongodb` turns critical
- [ ] Edge `dispatch-service → asset-service` turns critical
- [ ] `meter-service` and `asset-service` retain their own severities
- [ ] Detail drawer for `dispatch-service` shows no image pull or registry error message in the visible UI copy (internal Kubernetes state is not exposed via V1 contract)

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```

---

### SMOKE-04 — HighCPU (`high-cpu.yaml`) — V1 Unsupported

**V1 visibility**: **None** | **Root cause**: `frequency-calc-overload` (new Deployment — not in topology)

> ⚠️ This scenario is **not visible** on the V1 grid map. The `frequency-calc-overload` deployment
> is outside the topology graph. No existing topology node has a health endpoint that reflects this
> CPU load. The grid map must remain stable with no false positives.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/high-cpu.yaml -n energy
```

**Checklist**:
- [ ] Grid map shows **no state change** — all nodes retain their pre-scenario severity
- [ ] No erroneous red/warning nodes appear on the map
- [ ] No console errors or UI crashes
- [ ] Map continues polling normally (health banner does not appear)
- [ ] Known limitation documented: grid map cannot show CPU-only stress affecting out-of-topology workloads

**Teardown**:
```bash
kubectl delete deployment frequency-calc-overload -n energy
```

---

### SMOKE-05 — PendingPods (`pending-pods.yaml`) — V1 Unsupported

**V1 visibility**: **None** | **Root cause**: `substation-monitor` (new Deployment — not in topology)

> ⚠️ This scenario is **not visible** on the V1 grid map. The `substation-monitor` deployment
> requests excessive resources (`32Gi` memory) and stays Pending, but it is outside the topology
> graph.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/pending-pods.yaml -n energy
```

**Checklist**:
- [ ] Grid map shows **no state change** — all nodes retain their pre-scenario severity
- [ ] No erroneous red/warning nodes appear
- [ ] Polling continues without errors
- [ ] Known limitation documented: pending pods for out-of-topology workloads are not visible in V1

**Teardown**:
```bash
kubectl delete deployment substation-monitor -n energy
```

---

### SMOKE-06 — ProbeFailure (`probe-failure.yaml`) — V1 Unsupported

**V1 visibility**: **None** | **Root cause**: `grid-health-monitor` (new Deployment — not in topology)

> ⚠️ This scenario is **not visible** on the V1 grid map. The `grid-health-monitor` deployment
> is outside the topology graph.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/probe-failure.yaml -n energy
```

**Checklist**:
- [ ] Grid map shows **no state change** — all nodes retain their pre-scenario severity
- [ ] No erroneous red/warning nodes appear
- [ ] Polling continues without errors
- [ ] Known limitation documented: probe failures for out-of-topology workloads are not visible in V1

**Teardown**:
```bash
kubectl delete deployment grid-health-monitor -n energy
```

---

### SMOKE-07 — NetworkBlock (`network-block.yaml`)

**V1 visibility**: Full | **Primary node**: `meter-service` | **Expected severity**: `critical`

**Setup**:
```bash
kubectl apply -f k8s/scenarios/network-block.yaml -n energy
```

**Checklist**:
- [ ] Within 30 s: `meter-service` node turns **red / critical** (NetworkPolicy blocks the nginx proxy path to `/api/meter/health`)
- [ ] Edge `meter-service → rabbitmq` turns **critical** (red)
  > **Note**: A dashed or blocked visual treatment on this edge is optional renderer behavior only; it does not satisfy this check on its own. The required pass condition is `critical` severity (red).
- [ ] Edge `meter-service → mongodb` turns critical
- [ ] `asset-service` and `dispatch-service` retain their own severities
- [ ] Health banner may show "Data may be stale" if the proxy is entirely blocked; verify it does not claim network outage
- [ ] Grid map does not expose the NetworkPolicy object or Kubernetes resource details in the UI

**Teardown**:
```bash
kubectl delete networkpolicy deny-meter-service -n energy
```
- [ ] `meter-service` returns to healthy within 30 s

---

### SMOKE-08 — MissingConfig (`missing-config.yaml`) — V1 Unsupported

**V1 visibility**: **None** | **Root cause**: `grid-zone-config` (new Deployment — not in topology)

> ⚠️ This scenario is **not visible** on the V1 grid map. The `grid-zone-config` deployment
> references a missing ConfigMap and stays in a crash/pending state, but it is outside the topology
> graph. `dispatch-service` pods continue running normally.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/missing-config.yaml -n energy
```

**Checklist**:
- [ ] Grid map shows **no state change** — all nodes retain their pre-scenario severity
- [ ] No erroneous red/warning nodes appear
- [ ] Polling continues without errors
- [ ] Known limitation documented: missing ConfigMap for out-of-topology workloads is not visible in V1

**Teardown**:
```bash
kubectl delete deployment grid-zone-config -n energy
```

---

### SMOKE-09 — MongoDBDown (`mongodb-down.yaml`)

**V1 visibility**: Partial | **Primary node**: `mongodb` (static) | **Expected severity on mongodb**: `unknown`/gray (unchanged — no live endpoint)

> ℹ️ The `mongodb` node has **no live V1 health endpoint** and renders as `unknown`/static
> regardless of pod state. The downstream services (`meter-service`, `dispatch-service`,
> `asset-service`) have live health endpoints and *may* show `critical` if the application health
> check reflects DB connectivity loss. This is app-implementation-dependent and may vary.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/mongodb-down.yaml -n energy
```

**Checklist**:
- [ ] `mongodb` node remains at `unknown`/gray — **no severity change expected** (static node, no live endpoint)
- [ ] `mongodb` node does **not** turn red/critical — that would be a false signal in V1
- [ ] After DB propagation delay (may exceed 30 s): observe whether `meter-service`, `dispatch-service`, and/or `asset-service` health endpoints degrade
  - [ ] If any service health endpoint returns non-2xx → node correctly shows `warning` or `critical`
  - [ ] If services continue returning 2xx despite DB loss → grid map stays healthy (expected: V1 does not have direct DB visibility)
- [ ] All edges `→ mongodb` remain unknown/gray/dashed (no live endpoint → no severity propagation from mongodb)
- [ ] Grid map does not claim "database outage" or "cascading failure" in any visible UI copy
- [ ] Safe-language disclaimer remains visible

**Partial-visibility note for test report**: Record whether downstream services degraded during this test run. If they did not, note that V1 cannot confirm MongoDB failure from the grid map alone.

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```
- [ ] MongoDB pod returns to Running; downstream services (if degraded) return to healthy

---

### SMOKE-10 — ServiceMismatch (`service-mismatch.yaml`)

**V1 visibility**: Full | **Primary node**: `meter-service` | **Expected severity**: `critical`

> ℹ️ This is a subtle networking scenario: `meter-service` pods remain Running/Ready but the
> Service selector is changed to `meter-service-v2`, so the health proxy through the Service returns
> a timeout or connection refused.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/service-mismatch.yaml -n energy
```

**Checklist**:
- [ ] Within 30 s: `meter-service` node turns **red / critical** (Service selector mismatch means health proxy cannot reach the pod)
- [ ] Edge `grid-dashboard → meter-service` turns critical
- [ ] Edge `meter-service → rabbitmq` turns critical
- [ ] Edge `meter-service → mongodb` turns critical
- [ ] `asset-service` and `dispatch-service` retain their own severities
- [ ] Detail drawer for `meter-service` shows severity as `critical` (not "selector mismatch" — Kubernetes internals are not exposed in V1)
- [ ] Grid map does not show Service selector details or endpoint status in the UI

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```
- [ ] `meter-service` returns to healthy within 30 s

---

## 5. Multi-Scenario Smoke Test

> Tests two breakable scenarios active simultaneously. Requires a live cluster.
> Uses **OOMKilled** + **CrashLoop** because they affect different nodes with live health endpoints
> and have no overlapping primary nodes or conflicting teardown paths.

### MULTI-01 — OOMKilled + CrashLoop simultaneously

**Active scenarios**: `oom-killed.yaml` + `crash-loop.yaml`
**Expected**: `meter-service` = critical, `asset-service` = critical, `dispatch-service` = healthy

**Setup**:
```bash
kubectl apply -f k8s/scenarios/oom-killed.yaml -n energy
kubectl apply -f k8s/scenarios/crash-loop.yaml -n energy
```

**Checklist**:
- [ ] Within 30 s: `meter-service` shows **critical**
- [ ] Within 30 s: `asset-service` shows **critical**
- [ ] `dispatch-service` shows **healthy** (neither scenario affects its health endpoint)
- [ ] Edge `meter-service → rabbitmq` critical
- [ ] Edge `meter-service → mongodb` critical
- [ ] Edge `dispatch-service → asset-service` critical
- [ ] Edge `ops-console → asset-service` critical
- [ ] Edge `asset-service → mongodb` critical
- [ ] Both critical nodes are visually distinct — no overlay or z-fighting between severity indicators
- [ ] Severity filter ("Critical") shows badge count of **2** (or correct count)
- [ ] Clicking `meter-service` opens detail drawer with meter-service content
- [ ] Clicking `asset-service` opens detail drawer with asset-service content
- [ ] Clicking one node does not surface the other node's content
- [ ] Health banner (if present) does not describe a "grid outage" — only references application health endpoint status
- [ ] Safe-language disclaimer remains visible

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```
- [ ] Both nodes return to healthy; all edges return to prior state

### MULTI-02 — OOMKilled + ImagePullBackOff simultaneously (alternative)

> Optional second multi-scenario test to cover two different affected services.
> `meter-service` and `dispatch-service` both go critical.

**Setup**:
```bash
kubectl apply -f k8s/scenarios/oom-killed.yaml -n energy
kubectl apply -f k8s/scenarios/image-pull-backoff.yaml -n energy
```

**Checklist**:
- [ ] Both `meter-service` and `dispatch-service` show **critical**
- [ ] `asset-service` shows **healthy**
- [ ] All edges from both critical nodes reflect critical severity
- [ ] No visual conflicts between the two active critical states
- [ ] Severity filter badge correctly counts both

**Teardown**:
```bash
kubectl apply -f k8s/base/application.yaml -n energy
```

---

## 6. Missing-Data and Stale-Data Edge Cases

> These tests validate grid map behavior when the data source is unavailable or delayed.
> Some steps require simulating a proxy failure or using browser DevTools to block requests.

### EDGE-01 — All health endpoints unavailable (ops-console proxy failure)

**Simulate**: Block or return 503 from all three proxy paths simultaneously.
Options:
- Temporarily apply a NetworkPolicy blocking outbound from ops-console
- Use browser DevTools → Network → "Block request URL" for `/api/meter/health`, `/api/assets/health`, `/api/dispatch/health`

**Checklist**:
- [ ] Within one poll cycle (≤30 s): all three live nodes (`meter-service`, `asset-service`, `dispatch-service`) change to `critical` or `unknown` (not remain healthy)
- [ ] Health banner appears: text includes "data" or "stale" or "unavailable" — does **not** claim a real power outage
- [ ] Static nodes (`mongodb`, `rabbitmq`, etc.) remain at `unknown`/gray — they do not change
- [ ] After removing the block: nodes return to correct severity within one poll cycle
- [ ] Banner disappears or updates when polling recovers

### EDGE-02 — Single endpoint unavailable (partial failure)

**Simulate**: Block `/api/meter/health` only (DevTools or temporary NetworkPolicy).

**Checklist**:
- [ ] `meter-service` shows `critical` or `unknown`
- [ ] `asset-service` and `dispatch-service` show healthy (unaffected)
- [ ] Edges from `meter-service` reflect the degraded state
- [ ] `asset-service` and `dispatch-service` edges are unaffected

### EDGE-03 — Stale data (poll fails silently for >30 s)

**Simulate**: Disconnect network or block all `/api/*/health` requests after initial load, then wait 30+ seconds without refreshing.

**Checklist**:
- [ ] Stale overlay or "Data may be stale — last updated {timestamp}" banner appears
- [ ] The timestamp shown is the last successful poll time (not current time)
- [ ] Existing node severity states are preserved (not reset to unknown)
- [ ] Polling continues to retry in the background
- [ ] When connectivity is restored: banner disappears; nodes update to current state
- [ ] Banner copy does not claim a real outage — references application health endpoint status only

### EDGE-04 — Single endpoint returns HTTP 4xx (warning state)

**Simulate**: Configure `meter-service` to return HTTP 403 or 404 from its health path.

**Checklist**:
- [ ] `meter-service` shows `warning` (not `critical`)
- [ ] Edges from `meter-service` reflect warning severity
- [ ] Other nodes unaffected

### EDGE-05 — Single endpoint returns HTTP 5xx (critical state)

**Simulate**: Configure `meter-service` to return HTTP 500 from its health path.

**Checklist**:
- [ ] `meter-service` shows `critical`
- [ ] Edges reflect critical severity

---

## 7. Safe-Language Audit

> Verifies that no prohibited claims appear in the rendered grid map UI copy.
> Run this audit on a live or locally-served ops-console HTML page.
> Reference: [`SAFE-LANGUAGE-GUARDRAILS.md`](SAFE-LANGUAGE-GUARDRAILS.md), [`CLOUD-GRID-MAP-DATA-CONTRACT.md`](CLOUD-GRID-MAP-DATA-CONTRACT.md)

### SAFE-01 — Required disclaimer is visible without scrolling

- [ ] The disclaimer "Demo topology only. This map visualizes Kubernetes service/application health for the Azure SRE Agent demo and is not connected to real grid telemetry, SCADA, GIS, or utility infrastructure." is visible on the Grid Map view without scrolling at 1920×1080 viewport
- [ ] Disclaimer is present with `role="note"` in the HTML source
- [ ] Disclaimer text is not hidden, collapsed, or display:none in the default state

### SAFE-02 — No prohibited labels or claims in rendered UI text

Inspect all visible text in the Grid Map view (nodes, edges, tooltips, banners, detail drawer) and confirm **none** of the following prohibited phrases appear:

- [ ] "power outage" or "grid outage" or "outage detected"
- [ ] "SCADA" in any user-visible label (the disclaimer may reference it, but it must not appear as a claim)
- [ ] "real grid telemetry" in any user-visible label
- [ ] "transmission line" or "generation capacity" or real-unit claims (e.g., "450 MW", "80%")
- [ ] "SRE Agent diagnosed" or "SRE Agent detected" or "autonomously fixed"
- [ ] "MTTR reduced" or "MTTR by X%"
- [ ] "production-ready" or "GA" in the grid map UI
- [ ] Any implication that the map reflects real utility infrastructure

### SAFE-03 — Severity labels use approved patterns

When a node is in a critical or warning state (trigger SMOKE-01 or SMOKE-02):

- [ ] Node tooltip / aria-label uses approved pattern: "Status: {severity} — based on application health endpoint" (or equivalent)
- [ ] Detail drawer does not claim "grid health: critical — power outage detected"
- [ ] Detail drawer does not claim "autonomous remediation in progress"
- [ ] Edge tooltip uses approved pattern: "Data flow: {source} → {target}"

### SAFE-04 — Static contract validation (no live cluster required)

Run the automated script:
```bash
.\scripts\validate-grid-map-contract.ps1
```

- [ ] Script exits with code 0 (all contract checks pass)
- [ ] All three live health paths are present in `grid-map-topology.json`
- [ ] Required disclaimer string is present in `grid-map-topology.json`
- [ ] Required disclaimer string is present in `ops-console.html`
- [ ] All 10 scenario YAML filenames are covered in the smoke test documentation (this file)

---

## 8. Accessibility Audit

> Reference: [`INTERACTIVE-GRID-MAP-SPEC.md` §7](INTERACTIVE-GRID-MAP-SPEC.md), WCAG 2.1 AA.
> Steps require a browser on the live or locally-served ops-console page.

### ACCESS-01 — Keyboard navigation

- [ ] Press **Tab** from outside the Grid Map view to enter it — focus lands on the Grid Map tab button or the first focusable control
- [ ] **Tab** cycles through filter buttons (`All`, `Critical`, `Warning`) in order
- [ ] **Tab** enters the SVG canvas; **Tab** again cycles through all rendered nodes
- [ ] Every node receives a visible focus indicator (white or distinct ring) when focused
- [ ] **Enter** on a focused node opens the detail drawer for that node
- [ ] **Escape** closes the detail drawer
- [ ] After closing the detail drawer, focus returns to the previously focused node
- [ ] **Tab** after the last node wraps to the next focusable element outside the map (or wraps back to first node — document actual behavior)
- [ ] Grid map remains fully operable without a mouse

### ACCESS-02 — Screen reader labels

> Test with a screen reader (NVDA, VoiceOver, or JAWS) or by inspecting `aria-label` attributes.

- [ ] Each node element has an `aria-label` in the format: `"{label}, {metaphor}, {severity}"` (e.g., "Meter Service, Smart Meter Ingestion, healthy")
- [ ] Each edge element has an `aria-label` in the format: `"{edge label}, {severity}"` (e.g., "Meter events, healthy")
- [ ] The SVG canvas has `role="application"` and `aria-roledescription="interactive topology map"`
- [ ] The SVG canvas has `aria-label="Interactive cloud demo topology map"`
- [ ] The health banner has `role="status"` and `aria-live="polite"`
- [ ] The map disclaimer has `role="note"`
- [ ] The selection status region (for screen readers) has `role="status"` and `aria-live="polite"`
- [ ] The event strip empty-state message has `role="status"` and `aria-live="polite"`
- [ ] Filter buttons have `aria-pressed` set correctly (true when active, false otherwise)
- [ ] When a node is selected, its `aria-label` includes ", selected"
- [ ] The detail drawer close button has `aria-label="Close detail panel"` or equivalent
- [ ] Node severity changes during a scenario (SMOKE-01 or SMOKE-02) are announced by the `aria-live` region or the node's updated `aria-label`

### ACCESS-03 — Reduced-motion behavior

- [ ] Enable `prefers-reduced-motion: reduce` in browser/OS settings (or via DevTools → Rendering → Emulate CSS media feature)
- [ ] All pulse/ripple animations on critical nodes are **disabled** — severity indicators are static (no flashing or animated borders)
- [ ] Edge cascade animations are disabled
- [ ] Skeleton loading animations are disabled
- [ ] Severity is still visually indicated through color and icon/badge (not animation alone)
- [ ] The detail drawer slide-in animation is disabled (appears instantly)
- [ ] No information is lost when motion is reduced — all severity states remain visible

### ACCESS-04 — Color is not the sole indicator

- [ ] Critical nodes use both **red color** and a distinct icon/badge (e.g., ⚠ or ✕ symbol)
- [ ] Warning nodes use both **amber/yellow color** and a distinct icon/badge
- [ ] Healthy nodes use **green color** and a distinct icon/badge
- [ ] Unknown/static nodes use **gray color** and a distinct indicator (dashed border or neutral badge)
- [ ] Edge severity uses both color **and** dash pattern: solid = healthy; dashed/gray = unknown/static; animated/dashed = warning/critical
- [ ] Test passes if a user simulating monochromatic vision can still distinguish severity states by shape, icon, and pattern alone

---

## 9. V1 Unsupported Dynamic States

The following 4 scenarios create new Deployments that are **outside** the `grid-map-topology.json`
topology graph. The V1 data contract has no mechanism to surface their state in the grid map.
These are documented here as known V1 limitations — do not pretend full Kubernetes event visibility
exists.

| Scenario | Unsupported State | Why Not Visible in V1 |
|---|---|---|
| HighCPU (`high-cpu.yaml`) | CPU stress on `frequency-calc-overload` deployment | New Deployment not in topology; no live health endpoint for it; existing `dispatch-service` health endpoint is unaffected |
| PendingPods (`pending-pods.yaml`) | Pending pods on `substation-monitor` deployment | New Deployment not in topology; `meter-service` health endpoint is unaffected |
| ProbeFailure (`probe-failure.yaml`) | Liveness probe failure on `grid-health-monitor` deployment | New Deployment not in topology; no mapped node reflects this failure |
| MissingConfig (`missing-config.yaml`) | Missing ConfigMap on `grid-zone-config` deployment | New Deployment not in topology; `dispatch-service` continues running normally |

Additionally, the following node states are not fully observable in V1 by design:
- **MongoDB failure** (`mongodb-down.yaml`): The `mongodb` node renders as `unknown`/static in V1. Downstream service degradation is indirect and app-dependent.
- **Pod logs, Kubernetes events, restart counts**: Not available in V1 (no browser-safe endpoint).
- **Event strip dynamic rows**: The strip remains in a safe unavailable empty state until a governed V2 event endpoint exists.
- **Grid-worker disabled state**: Rendered as `disabled` but no dynamic health signal exists.
- **Forecast-service absent state**: Rendered as `unknown`/optional-absent but no health endpoint exists.

### Follow-up issues required for full Kubernetes visibility

The following V2+ follow-up issues should be created to address these gaps:

1. **V2 read-only in-cluster status endpoint** — Expose a governed, read-only status API from ops-console (or a new microservice) that aggregates pod state, events, and restart counts for all topology nodes. This would enable HighCPU, PendingPods, ProbeFailure, and MissingConfig scenarios to appear on the grid map.

2. **Topology extension for auxiliary workloads** — Optionally extend `grid-map-topology.json` to include auxiliary nodes (`frequency-calc-overload`, `substation-monitor`, `grid-health-monitor`, `grid-zone-config`) so they can appear as transient/scenario-only nodes.

3. **MongoDB and RabbitMQ health proxy** — Add a server-side health proxy that checks MongoDB and RabbitMQ TCP reachability and exposes a browser-safe `/api/mongodb/health` and `/api/rabbitmq/health` endpoint from ops-console. This would make MongoDBDown fully observable.

---

## 10. Automated Contract Validation

A lightweight PowerShell script validates static file contracts without requiring a live cluster:

```bash
.\scripts\validate-grid-map-contract.ps1
```

### What it validates (no cluster required)

| Check | Expected |
|---|---|
| `k8s/base/grid-map-topology.json` exists and is valid JSON | Pass |
| All three live health paths present in topology JSON | `/api/meter/health`, `/api/assets/health`, `/api/dispatch/health` |
| Required disclaimer string in `grid-map-topology.json` | Present |
| Required disclaimer string in `k8s/base/ops-console.html` | Present |
| All 10 `k8s/scenarios/*.yaml` files exist | Present |
| Each scenario YAML filename covered in `docs/GRID-MAP-SMOKE-TESTS.md` | Present |
| `docs/CLOUD-GRID-MAP-DATA-CONTRACT.md` exists | Present |
| `docs/INTERACTIVE-GRID-MAP-SPEC.md` exists | Present |

### What it does NOT validate (requires live cluster — optional/manual)

- Actual HTTP response from health endpoints
- Pod running state
- Scenario activation and recovery timing
- Screen reader announcements
- Animation behavior

See the per-scenario checklists in Sections 4–8 for live-cluster tests.

---

## Document History

| Date | Version | Change |
|---|---|---|
| 2026-04-27 | 1.0 | Initial smoke test checklist — closes #22 |
