# Interactive Grid Map — Design Specification

> **Version**: 0.2 · **Status**: Draft — Retargeted to Cloud Demo Surface
> **Branch**: `grid-map-design-spec`
> **Authors**: Technical Writer (spec), with inputs from Outside UI Designer, Outside SRE/Energy Operations Expert, and Workflow Architect
> **Date**: July 2025

---

## ⚠️ Safety Disclaimer

> **This grid map is a demo topology visualization inside the deployed cloud demo, over Kubernetes service and application health signals.** It does not connect to real SCADA systems, GIS coordinates, utility telemetry, or production energy grids. All "substation," "transmission line," and "generator" labels are fictional energy-domain metaphors for the Kubernetes services deployed in the `energy` namespace.
>
> **Azure SRE Agent is generally available (GA).** This demo currently uses `Microsoft.App/agents@2025-05-01-preview` because this subscription provider metadata exposes only that API version. Move to `2026-01-01` after provider exposure and successful `what-if` validation.
>
> The grid map must comply with the safe-language rules in [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md) and [Analyst Safe Language](ANALYST-SAFE-LANGUAGE.md). No element of this screen may claim real utility grid monitoring, autonomous remediation, or production-grade observability.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals, Non-Goals, and User Stories](#2-goals-non-goals-and-user-stories)
3. [Visual Design Specification](#3-visual-design-specification)
4. [Interaction Specification](#4-interaction-specification)
5. [Data Contract Outline](#5-data-contract-outline)
6. [Scenario Mapping](#6-scenario-mapping)
7. [Accessibility and Wallboard Constraints](#7-accessibility-and-wallboard-constraints)
8. [Safe-Language Copy and Prohibited Claims](#8-safe-language-copy-and-prohibited-claims)
9. [QA Acceptance Criteria and Test Scenarios](#9-qa-acceptance-criteria-and-test-scenarios)
10. [Recommended GitHub Implementation Issues](#10-recommended-github-implementation-issues)

---

## 1. Executive Summary

The deployed cloud demo currently exposes `grid-dashboard` and `ops-console` as nginx-hosted application screens in the AKS `energy` namespace. This spec adds an **Interactive Grid Map** screen to that cloud demo surface, visualizing the Kubernetes `energy` namespace service topology as a spatial diagram — nodes representing services and data stores connected by edges representing data flow. When a breakable scenario is active, the affected node(s) and edge(s) visually change color and shape, making failure propagation immediately obvious.

**What this enables:**
- At-a-glance failure localization: operators see *where* in the service graph a problem sits, not just *which row* is red.
- Dependency-chain reasoning: cascading failures (e.g., MongoDB down → meter-service → dispatch-service) are visually traceable along edges.
- Demo storytelling: the map is a compelling visual anchor for the 20-minute demo narrative.

**What this does not do:**
- It does not replace local Mission Control. Mission Control remains the local operator/scenario control surface; the grid map belongs in the deployed cloud demo experience.
- It does not connect to real grid telemetry, SCADA, or GIS systems.
- It does not interact with Azure SRE Agent APIs directly (the Direct SRE Agent API remains blocked).

### Process Gate

This spec was produced using a design-first process:

| Phase | Owner | Status |
|-------|-------|--------|
| 1. Outside design research | UI Designer, SRE Expert, Workflow Architect | ✅ Complete — handoffs received |
| 2. Spec/interaction writing | Technical Writer | ✅ This document |
| 3. Expert re-review | UI Designer, SRE Expert, Workflow Architect | ✅ Complete for UX/story model |
| 4. Cloud target correction | Engineering | ✅ Retargeted from Mission Control to deployed cloud demo |
| 5. Implementation begins | Engineering | ⛔ Blocked until cloud placement/data contract is finalized |

---

## 2. Goals, Non-Goals, and User Stories

### 2.1 Goals

| ID | Goal | Measurable Outcome |
|----|------|--------------------|
| G1 | Visualize the `energy` namespace service topology as a spatial graph | All 10 services/data-stores rendered as nodes with correct edges |
| G2 | Reflect cloud-demo service/application health using an explicit cloud data contract | Node/edge severity matches the selected in-cluster health source within one poll cycle |
| G3 | Enable click-to-inspect on any node or edge | Detail panel shows pod status, events, and endpoint data for the selected asset |
| G4 | Support all 10 existing breakable scenarios visually | Each scenario maps to at least one node state change; cascading scenarios show edge propagation |
| G5 | Maintain safe-language compliance | Zero prohibited claims in any UI copy, tooltip, or label |
| G6 | Meet WCAG 2.1 AA accessibility | Color is never the sole indicator; keyboard navigation works end-to-end |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Real SCADA/GIS integration | This is a demo topology, not a utility monitoring tool |
| NG2 | Direct SRE Agent API calls from the map | API remains blocked; handoff is portal/local analyst only |
| NG3 | Local Mission Control implementation | This grid map is part of the deployed cloud demo, not the local Mission Control app |
| NG4 | Custom topology editor | Topology is static, derived from `application.yaml` |
| NG5 | Historical playback / time-travel | Future wave; this spec covers live state only |
| NG6 | Real-time streaming (WebSocket-first) | Polling-first; WebSocket upgrade is a future issue |

### 2.3 User Stories

| ID | As a... | I want to... | So that... | Acceptance |
|----|---------|-------------|-----------|------------|
| US1 | Demo operator | Open the grid map from the deployed cloud demo | I can show the audience a spatial view of the energy grid topology | Map renders with all nodes/edges in ≤2 seconds |
| US2 | Demo operator | See which nodes are unhealthy at a glance | I can identify failure location without reading a table | Affected nodes show the correct severity color and icon |
| US3 | Demo operator | Click a node to see its detail panel | I can inspect pod status, events, and logs for a specific service | Detail panel opens with accurate data within 1 second |
| US4 | Demo operator | See cascading failures across edges | I can explain dependency chains to the audience | Edges between affected services change to the appropriate severity color |
| US5 | Demo operator | Filter the map by severity level | I can focus on only the failing components during a demo | Non-matching nodes are visually dimmed, not hidden |
| US6 | Demo operator | Ask Local Analyst about a selected node | I can get an AI-assisted explanation of the current state | Analyst panel opens with the selected node pre-filled as context |
| US7 | Demo operator | Hand off to Azure SRE Agent portal | I can transition from local map to cloud-side diagnosis | Portal link opens in a new tab with the correct resource context |
| US8 | Demo operator | View the map on a wallboard display | I can leave the map on a large screen during a presentation | Map is legible at 1920×1080 without interaction |

---

## 3. Visual Design Specification

### 3.1 Layout

The grid map occupies a new screen/view within the deployed cloud demo UI. The preferred host is `ops-console` because it is already framed as the grid operations console; `grid-dashboard` remains the consumer portal unless Issue A explicitly selects a different host. It is accessed via a view toggle in the existing cloud demo header, not from local Mission Control.

```
┌──────────────────────────────────────────────────────────────┐
│  Header  [Operations] [Grid Map]  ···  [Portal Handoff]      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────┐  ┌───────────────────┐  │
│  │                                 │  │   Detail Panel     │  │
│  │       Topology Canvas           │  │   (collapsed by    │  │
│  │       (SVG / Canvas)            │  │    default)        │  │
│  │                                 │  │                    │  │
│  │   [gen]──→[rmq]──→[disp]──→[mg]│  │   Selected: ---    │  │
│  │     ↑       ↓        ↕         │  │   Status: ---      │  │
│  │   [sim]   [mtr]    [ast]       │  │   Events: ---      │  │
│  │             ↓                   │  │                    │  │
│  │           [gd] [ops]           │  │   [Ask Analyst]    │  │
│  │                                 │  │   [Open Portal →]  │  │
│  └─────────────────────────────────┘  └───────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Legend  │  Filter: [All] [Critical] [Warning]  │ Zoom   ││
│  │  ● Healthy  ● Warning  ● Critical  ○ Unknown   │ [+][-] ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │  Event Strip: most recent 5 events (scrollable)          ││
│  │  12:03:14 ⚠ meter-service: OOMKilled (restart #3)       ││
│  │  12:03:10 ● dispatch-service: Ready                      ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**Layout Rules:**
- Canvas occupies ~70% width; detail panel is a collapsible right drawer (~30%).
- Legend bar and event strip are fixed at the bottom.
- Minimum canvas area: 800×500px. Below this, show a "Screen too small for grid map" message.

### 3.2 Topology: Nodes and Edges

#### Node Definitions

Each node represents a Kubernetes Deployment (or StatefulSet) in the `energy` namespace. The topology is **static** — it derives from the known `application.yaml` architecture, not from runtime discovery.

| Node ID | Display Label | Energy Metaphor | K8s Resource | Icon |
|---------|--------------|-----------------|--------------|------|
| `rabbitmq` | RabbitMQ | Event Bus | Deployment: `rabbitmq` | 📡 Message queue |
| `mongodb` | MongoDB | Grid State DB | Deployment: `mongodb` | 🗄️ Database |
| `meter-service` | Meter Service | Smart Meter Ingestion | Deployment: `meter-service` | ⚡ Meter |
| `asset-service` | Asset Service | Asset Catalog | Deployment: `asset-service` | 🏭 Generator |
| `dispatch-service` | Dispatch Service | Energy Dispatch | Deployment: `dispatch-service` | 🔀 Dispatcher |
| `load-simulator` | Load Simulator | Consumer Usage Generator | Deployment: `load-simulator` | 📊 Load |
| `grid-worker` | Grid Worker | Dispatch Processor | Deployment: `grid-worker` | ⚙️ Worker |
| `grid-dashboard` | Grid Dashboard | Consumer Portal | Deployment: `grid-dashboard` | 🖥️ Dashboard |
| `ops-console` | Ops Console | Operations Console | Deployment: `ops-console` | 🎛️ Console |
| `forecast-service` | Forecast Service | Demand Forecasting | Deployment: `forecast-service` (if present) | 📈 Forecast |

#### Edge Definitions

Edges represent data-flow dependencies derived from the application architecture. Each edge has a source, target, and label describing the flow.

| Source → Target | Label | Type |
|----------------|-------|------|
| `meter-service` → `rabbitmq` | Meter events | Async (message) |
| `rabbitmq` → `dispatch-service` | Dispatch commands | Async (message) |
| `dispatch-service` → `mongodb` | Grid state writes | Sync (DB) |
| `meter-service` → `mongodb` | Meter readings | Sync (DB) |
| `asset-service` → `mongodb` | Asset catalog | Sync (DB) |
| `dispatch-service` → `asset-service` | Asset lookups | Sync (HTTP) |
| `dispatch-service` → `forecast-service` | Demand forecast | Sync (HTTP) |
| `load-simulator` → `grid-worker` | Load generation | Sync (HTTP) |
| `grid-dashboard` → `meter-service` | Usage data | Sync (HTTP) |
| `ops-console` → `dispatch-service` | Operations data | Sync (HTTP) |

#### Node Shape

- **Service nodes**: Rounded rectangle, 120×80px, with icon (top-left) and label (center).
- **Data store nodes**: Cylinder shape (standard DB icon metaphor), 100×80px.
- **All nodes**: 2px border, filled background, subtle drop shadow in healthy state.

### 3.3 Severity Palette and State System

The map uses a cloud-demo-compatible severity union equivalent to `healthy | warning | critical | unknown`. If shared types are introduced, Issue A must define the package/path and ensure it is available to the selected cloud demo host without depending on local Mission Control runtime APIs.

| Severity | Token | Node Fill | Node Border | Edge Color | Glow | Badge |
|----------|-------|-----------|-------------|------------|------|-------|
| `healthy` | `--color-healthy` | `#166534` (dark green) | `#22c55e` (green-500) | `#22c55e` | None | ✓ checkmark |
| `warning` | `--color-warning` | `#713f12` (dark amber) | `#f59e0b` (amber-500) | `#f59e0b` | Soft pulse | ⚠ warning |
| `critical` | `--color-critical` | `#7f1d1d` (dark red) | `#ef4444` (red-500) | `#ef4444` | Alert pulse (1Hz) | ✕ error |
| `unknown` | `--color-unknown` | `#374151` (gray-700) | `#6b7280` (gray-500) | `#6b7280` dashed | None | ? question |

**Dark-theme first**: The canvas background is `#0f172a` (slate-900), matching the existing deployed cloud demo dark theme.

#### Edge State Rules

| Condition | Edge Rendering |
|-----------|---------------|
| Both endpoints `healthy` | Solid line, `--color-healthy`, 2px |
| Either endpoint `warning` | Solid line, `--color-warning`, 2px |
| Either endpoint `critical` | Solid line, `--color-critical`, 3px, animated dash |
| Either endpoint `unknown` | Dashed line, `--color-unknown`, 2px |
| Data flow direction | Arrowhead on target end |

#### Cascade Highlighting

When a node is `critical`, all downstream edges (reachable via directed edges) are highlighted with a subtle "ripple" animation propagating from the failed node outward. This makes cascading failures (e.g., `mongodb-down` affecting `meter-service` and `dispatch-service`) immediately visible.

### 3.4 Legend

The legend bar is always visible at the bottom of the canvas. It must include:

- Color swatches with text labels for each severity (not color-only).
- Node shape key: rectangle = service, cylinder = data store.
- Edge style key: solid = connected, dashed = unknown/stale, animated = failure propagation.
- A "Demo topology" badge: `ℹ️ Demo topology — not connected to real grid telemetry`.

### 3.5 Detail Panel

The detail panel is a right-side drawer that opens when a node or edge is selected.

#### Node Detail Panel Content

| Section | Data Source | Content |
|---------|------------|---------|
| **Header** | Topology config + Issue A cloud data contract | Node label, energy metaphor, severity badge |
| **Pod Status** | Optional only if Issue A selects a governed read-only cloud status endpoint | Pod count, restart count, age |
| **Container Summary** | Optional only if Issue A cloud contract supports it | Per-container state, ready status, reason |
| **Recent Events** | Optional only if Issue A cloud contract supports event data | Last events for this deployment |
| **Endpoints** | Optional only if Issue A cloud contract supports endpoint data | Endpoint ready/not-ready count |
| **Pod Logs** (expandable) | Optional only if Issue A cloud contract explicitly supports read-only logs | Last log excerpt |
| **Actions** | — | "Ask Analyst about this" button, "Open in Azure Portal →" link |
| **Source Citation** | Issue A cloud data contract | "Data from cloud demo snapshot at {timestamp}" |

#### Edge Detail Panel Content

| Section | Content |
|---------|---------|
| **Header** | Source → Target labels, flow type |
| **Source Status** | Severity badge, pod summary |
| **Target Status** | Severity badge, pod summary |
| **Connection Assessment** | If both healthy: "Connection appears operational." If either unhealthy: "Connection may be impacted — {source\|target} is {severity}." |

### 3.6 Event Strip

A horizontal strip at the bottom shows the 5 most recent events only if the Issue A cloud data contract exposes event data. If V1 does not expose events, the strip shows a safe unavailable state instead of implying Kubernetes event visibility. Each populated event row shows:

```
{timestamp} {severity-icon} {involvedObject.name}: {reason} — {message (truncated to 120 chars)}
```

Clicking an event selects the corresponding node on the canvas.

---

## 4. Interaction Specification

### 4.1 Open Map

| Step | Actor | Action | System Response |
|------|-------|--------|----------------|
| 1 | Operator | Clicks "Grid Map" toggle in header | Canvas view replaces wallboard view |
| 2 | System | — | Fetches the Issue A-selected cloud data contract, or renders static topology-only V1 if Issue A selects static fallback |
| 3 | System | — | Applies severity colors from cloud-demo data, or `unknown`/static fallback where live state is unavailable |
| 4 | System | — | Starts polling on the cloud-demo interval defined by Issue A |

**View Toggle Behavior**: The toggle or navigation control is added to the selected cloud demo host from Issue A. URL hash or query param (`?view=map`) may be used for deep-linking. No local Mission Control route is added for this feature.

### 4.2 Select Node

| Step | Actor | Action | System Response |
|------|-------|--------|----------------|
| 1 | Operator | Clicks a node | Node gets a selection ring (white, 3px). Detail panel slides open. |
| 2 | System | — | Detail panel populates from the Issue A cloud data contract. |
| 3 | System | — | If optional details are supported by the cloud contract, fetches them lazily with loading skeleton. |
| 4 | Operator | Clicks canvas background | Selection clears. Detail panel closes. |

**Keyboard**: `Tab` cycles through nodes in topology order. `Enter` selects. `Escape` deselects.

### 4.3 Select Edge

| Step | Actor | Action | System Response |
|------|-------|--------|----------------|
| 1 | Operator | Clicks an edge | Edge gets a selection highlight (white, thicker). Detail panel shows edge info. |
| 2 | System | — | Edge detail panel shows source and target summaries. |

Edge click target: 8px hit area around the edge path for usability.

### 4.4 Filter by Severity

| Step | Actor | Action | System Response |
|------|-------|--------|----------------|
| 1 | Operator | Clicks a severity filter button (e.g., "Critical") | Non-matching nodes dim to 20% opacity. Edges to/from dimmed nodes also dim. |
| 2 | Operator | Clicks "All" | All nodes return to full opacity. |

**Rule**: Filtering dims nodes but never hides them. The topology shape must always be visible for spatial orientation.

### 4.5 Zoom and Pan

| Input | Action |
|-------|--------|
| Scroll wheel | Zoom in/out (0.5× to 3× range) |
| Click + drag on canvas | Pan |
| Pinch gesture (touch) | Zoom |
| `+` / `−` buttons | Zoom in/out in 0.25× steps |
| `Fit` button | Reset to fit-all zoom level |
| Double-click canvas background | Reset to fit-all |

**Wallboard mode**: When viewport is ≥1920px wide and no interaction has occurred for 30 seconds, auto-fit to fill screen. Disable zoom/pan controls in this mode. Any interaction re-enables them.

### 4.6 Optional Analyst Handoff

| Step | Actor | Action | System Response |
|------|-------|--------|----------------|
| 1 | Operator | Clicks "Ask Analyst about this" or "Copy Analyst Prompt" in detail panel | Cloud grid map provides a safe prompt or handoff link if configured. |
| 2 | System | — | Pre-fills or copies context: `"Explain the current state of {node-label} based on the cloud demo snapshot."` |
| 3 | Operator | Uses the prompt in Local Analyst or another configured handoff target | Analyst response is outside the cloud map runtime and scoped to selected-node context. |

**Important**: The cloud grid map must render and function without local Mission Control running. `AssistantClientContext` and `selected.type = 'grid-map-node'` are optional integration details only if the receiving Analyst integration exists.

### 4.7 Portal Handoff

| Step | Actor | Action | System Response |
|------|-------|--------|----------------|
| 1 | Operator | Clicks "Open in Azure Portal →" in detail panel | New browser tab opens to Azure Portal AKS resource. |
| 2 | System | — | URL: `https://portal.azure.com/#@{tenant}/resource/{aks-resource-id}/workloads` |

**Note**: Deep-linking to a specific pod or deployment in the Azure Portal depends on the portal URL schema, which is not guaranteed to be stable. The link targets the AKS workloads blade. A tooltip says: "Opens Azure Portal — navigate to the specific workload from there."

### 4.8 No-Data Flow

| Condition | Map Behavior |
|-----------|-------------|
| **No cluster connected** (preflight fails) | Canvas shows topology skeleton in `unknown` state. Banner: "No cluster connected — topology shows demo layout only." |
| **Partial data** (some API calls fail) | Nodes with data render normally. Nodes without data show `unknown` severity. Banner: "Some data unavailable — showing partial state." |
| **Stale data** (poll fails for >30s) | All nodes get a subtle "stale" overlay (diagonal hatch pattern). Banner: "Data may be stale — last updated {timestamp}." Polling continues to retry. |
| **API error** | Red toast notification: "Failed to refresh grid map data." Existing data persists. |

### 4.9 Multiple Simultaneous Failures

When multiple breakable scenarios are active:

1. Each affected node shows its own severity independently.
2. The event strip shows events from all active scenarios, sorted by timestamp.
3. The cascade highlight algorithm runs from each `critical` node independently — overlapping cascades produce brighter edge highlighting.
4. The filter bar shows count badges: e.g., "Critical (3)" to indicate how many nodes match.

---

## 5. Data Contract Outline

### 5.1 Topology Configuration (Static)

The topology is defined in a static JSON configuration file, **not** discovered at runtime. This file ships with the frontend and maps `application.yaml` architecture to visual positions.

```typescript
// Proposed: path determined by Issue A after selecting ops-console,
// grid-dashboard, or a new deployed grid-map service.

export interface TopologyNode {
  id: string;                    // K8s deployment name
  label: string;                 // Display label
  metaphor: string;              // Energy-domain metaphor
  icon: string;                  // Icon identifier
  kind: 'service' | 'datastore'; // Determines shape
  position: { x: number; y: number }; // Default layout position (relative)
}

export interface TopologyEdge {
  source: string;                // Source node ID
  target: string;                // Target node ID
  label: string;                 // Flow description
  type: 'async' | 'sync';       // Message vs HTTP/DB
}

export interface GridTopology {
  version: string;               // Schema version
  disclaimer: string;            // Safe-language disclaimer text
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}
```

**Source of truth**: The topology config is maintained by hand to match `k8s/base/application.yaml`. If services are added or removed from the deployment, the topology config must be updated in the same PR.

### 5.2 Frontend View Model

The map component merges static topology with live inventory data:

```typescript
// Proposed view model (not a file — computed at render time)

export interface GridMapNodeState {
  id: string;                           // From topology config
  label: string;                        // From topology config
  metaphor: string;                     // From topology config
  severity: GridMapSeverity;            // From Issue A cloud data contract
  reason?: string;                      // Optional cloud data contract field
  desiredReplicas?: number;             // Optional governed status field
  readyReplicas?: number;               // Optional governed status field
  restarts?: number;                    // Optional governed status field
  recentEventCount?: number;            // Optional governed event field
  updatedAt: string;                    // Snapshot timestamp
  selected: boolean;                    // UI state
}

export interface GridMapEdgeState {
  source: string;
  target: string;
  severity: GridMapSeverity;            // Derived: max(source.severity, target.severity)
  selected: boolean;                    // UI state
}

export interface GridMapState {
  nodes: GridMapNodeState[];
  edges: GridMapEdgeState[];
  filter: GridMapSeverity | 'all';
  lastUpdatedAt: string;
  stale: boolean;                       // True if last poll failed
  connected: boolean;                   // False if cloud data source unavailable
}
```

### 5.3 Backend/Source Data Expectations

The grid map must not consume local Mission Control APIs. Issue A must select and document the cloud-demo data contract before any renderer, detail panel, event strip, or scenario smoke-test implementation begins.

| Data Source | Purpose | Current Cloud Demo State |
|-----|---------|-----------|
| `grid-dashboard` / `ops-console` proxied service health endpoints | Basic node health for `asset-service`, `meter-service`, and `dispatch-service` | ✅ Existing nginx proxies in `k8s/base/application.yaml` |
| Static topology config | Node/edge layout and demo-safe energy metaphors | ✅ Frontend-only config can be added |
| Kubernetes pod/event/log state | Rich severity, pod counts, events, logs, and endpoint detail | ⚠️ Not directly available from the cloud demo UI today |
| Local Mission Control APIs (`/api/inventory`, `/api/events`, `/api/pods/:name/logs`, `/api/services/:name/endpoints`) | Local operator diagnostics | ❌ Do not use as the cloud-demo implementation target |
| Local Analyst (`POST /api/assistant/ask`) | Local analyst handoff | ⚠️ Optional handoff only; not an in-cloud dependency |

**Cloud data-contract decision required:** The first implementation issue must choose and document how the cloud demo obtains map state. Acceptable V1 options are:

1. Use only existing in-cluster HTTP health/proxy endpoints for app-level service health, with data-store nodes marked as in-cluster/static unless observable through an existing app endpoint.
2. Add a small read-only in-cluster status endpoint or sidecar specifically for demo topology health, with no secret, exec, shell, or remediation access.
3. Split V1 into a static/topology-only cloud demo map plus explicit follow-up work for richer Kubernetes-derived state.

Do not wire the cloud map to local Mission Control APIs as an implementation shortcut. The Issue A decision is captured in [Cloud Grid Map data contract](CLOUD-GRID-MAP-DATA-CONTRACT.md), with reusable topology in `k8s/base/grid-map-topology.json`.

### 5.4 Source and Citation Fields

Every data element rendered on the map must be traceable to its source:

| Data | Source | Citation Text |
|------|--------|---------------|
| Node severity | Selected cloud-demo data contract from Issue A | "Source: Cloud demo service health snapshot at {updatedAt}" |
| Pod count | Optional only if a governed in-cluster status endpoint is added | "Source: Read-only demo status endpoint at {updatedAt}" |
| Events | Optional only if exposed through a governed in-cluster status endpoint | "Source: Read-only demo event snapshot at {timestamp}" |
| Logs | Optional only if exposed through a governed read-only status endpoint | "Source: Read-only demo log excerpt (last {n} lines)" |
| Topology layout | Static config file | "Topology: Static demo layout from application.yaml architecture" |

### 5.5 Static vs. Live Data

| Data | Type | Update Frequency |
|------|------|-----------------|
| Topology (nodes, edges, positions) | Static | Only changes when `application.yaml` changes |
| Node severity | Live or static fallback | Polling interval defined by cloud data contract |
| Pod counts, restarts | Optional | Only if available through governed cloud-demo status endpoint |
| Events | Optional | Only if available through governed cloud-demo status endpoint |
| Logs | Optional, on-demand | Only if available through governed cloud-demo status endpoint |

---

## 6. Scenario Mapping

Each of the 10 existing breakable scenarios maps to specific node and edge state changes on the grid map.

### 6.1 Scenario-to-Node Mapping

| Scenario | File | Primary Node | Primary Severity | Secondary Nodes (Cascade) | Edge Impact |
|----------|------|-------------|-----------------|--------------------------|-------------|
| **OOMKilled** | `oom-killed.yaml` | `meter-service` | `critical` | — | `meter-service → rabbitmq`, `meter-service → mongodb` edges go critical |
| **CrashLoop** | `crash-loop.yaml` | `asset-service` | `critical` | — | `dispatch-service → asset-service` edge goes critical |
| **ImagePullBackOff** | `image-pull-backoff.yaml` | `dispatch-service` | `critical` | — | All edges to/from `dispatch-service` go critical |
| **HighCPU** | `high-cpu.yaml` | `dispatch-service` | `warning` | — | Edges from `dispatch-service` may show warning |
| **PendingPods** | `pending-pods.yaml` | `meter-service` | `warning` | — | `meter-service` edges show warning |
| **ProbeFailure** | `probe-failure.yaml` | `dispatch-service` | `warning` | — | `dispatch-service` edges show warning |
| **NetworkBlock** | `network-block.yaml` | `meter-service` | `critical` | `rabbitmq` (if unreachable) | `meter-service → rabbitmq` edge goes critical (dashed to show blocked) |
| **MissingConfig** | `missing-config.yaml` | `dispatch-service` | `critical` | — | `dispatch-service` edges go critical |
| **MongoDBDown** | `mongodb-down.yaml` | `mongodb` | `critical` | `meter-service` (degraded), `dispatch-service` (degraded), `asset-service` (degraded) | All `→ mongodb` edges go critical; cascade ripple on downstream edges |
| **ServiceMismatch** | `service-mismatch.yaml` | `meter-service` | `warning` or `critical` | — | `grid-dashboard → meter-service` edge shows mismatch indicator |

### 6.2 Cascade Visualization Rules

1. **Direct impact**: The primary node changes severity based on the Issue A-selected cloud data contract.
2. **Edge propagation**: An edge's severity = `max(source.severity, target.severity)` using the ordering: `healthy < warning < critical`.
3. **Unknown overrides nothing**: `unknown` severity does not propagate — it only affects the node itself.
4. **Cascade animation**: When a node transitions to `critical`, edges from that node animate a "pulse" outward for 3 seconds to draw attention to the propagation path.

### 6.3 Multi-Scenario Stacking

When multiple scenarios are active simultaneously (e.g., `mongodb-down` + `oom-killed`):

- Each node shows its own computed severity (worst wins).
- The event strip interleaves events from all scenarios.
- The filter bar badges reflect combined counts.
- The detail panel for any node shows all contributing events, not just the first scenario's events.

---

## 7. Accessibility and Wallboard Constraints

### 7.1 WCAG 2.1 AA Compliance

| Requirement | Implementation |
|-------------|---------------|
| **Color is not the sole indicator** | Every severity level has a unique icon/badge in addition to color. Edges use dash patterns (solid, dashed, animated) in addition to color. |
| **Contrast ratio ≥ 4.5:1** | All text meets contrast against the dark canvas background. Severity fill colors are tested against their text labels. |
| **Keyboard navigation** | `Tab` cycles through nodes. `Enter` selects. `Escape` deselects. `Arrow keys` pan. `+`/`-` zoom. |
| **Screen reader support** | Nodes have `aria-label`: "{label} — {severity} — {status summary}". Edges have `aria-label`: "{source} to {target} — {severity}". |
| **Focus indicators** | Selected and focused nodes show a visible focus ring (white, 3px, distinct from selection ring). |
| **Reduced motion** | If `prefers-reduced-motion` is set, disable pulse/ripple animations. Show static severity indicators instead. |

### 7.2 Wallboard Mode

The grid map must be usable as a passive display on a large screen (wallboard mode):

| Constraint | Specification |
|------------|--------------|
| **Auto-fit** | Canvas auto-fits to viewport on load and on window resize. |
| **No interaction required** | All severity information is visible without clicking. |
| **Readable at distance** | Node labels are ≥16px at 1920×1080. Severity badges are ≥24px. |
| **Auto-refresh** | Polling continues. State changes animate smoothly (no full re-render). |
| **Idle behavior** | After 30 seconds of no interaction, auto-fit resets and detail panel closes. |
| **Safe-language banner** | The disclaimer banner "Demo topology — not connected to real grid telemetry" is always visible in wallboard mode. |

### 7.3 Responsive Behavior

| Viewport | Behavior |
|----------|----------|
| ≥1920px | Full layout with detail panel side-by-side |
| 1280–1919px | Detail panel overlays canvas (slide-over) |
| 800–1279px | Detail panel is a bottom sheet |
| <800px | Show message: "Grid map requires a larger screen. Use the wallboard view for mobile." |

---

## 8. Safe-Language Copy and Prohibited Claims

### 8.1 Required UI Copy

Every instance of the grid map must display this disclaimer, visible without scrolling:

> **Demo Topology** — This map shows the Kubernetes service graph for the energy grid demo. It is not connected to real grid telemetry, SCADA systems, or utility infrastructure.

### 8.2 Approved Label Patterns

| Context | Approved | Prohibited |
|---------|----------|-----------|
| Node tooltip | "Deployment: {name} — {ready}/{desired} pods ready" | "Generator output: 450MW" or any real-unit claim |
| Edge tooltip | "Data flow: {source} → {target} ({type})" | "Transmission line capacity: 80%" |
| Severity badge | "Status: {severity} — based on Kubernetes pod state" | "Grid health: critical — power outage detected" |
| Event strip | "{timestamp} {reason}: {message}" (raw K8s event text) | Any energy-domain reinterpretation of K8s events |
| Detail panel header | "{label} — {energy-metaphor} (demo)" | "{label} — Real-time grid monitoring" |
| Analyst pre-fill | "Explain the current state of {name} based on the cloud demo snapshot." | "Diagnose the power outage at {name}." |
| Portal handoff | "Open in Azure Portal for cloud-side diagnosis" | "SRE Agent will automatically fix this" |

### 8.3 Prohibited Claims Checklist

The following must **never** appear in any grid map UI element:

- [ ] Any real electrical unit (MW, kWh, voltage, amperage, frequency)
- [ ] Any claim of real-time grid monitoring or SCADA integration
- [ ] Any claim that SRE Agent automatically detects or remediates issues
- [ ] Any claim of production-grade observability
- [ ] Any SLO/SLA percentage or MTTR metric
- [ ] "Autonomous," "self-healing," or "auto-remediation" language
- [ ] GIS coordinates, real utility names, or real infrastructure references

### 8.4 Energy Metaphor Rules

Energy-domain labels (e.g., "Smart Meter Ingestion," "Energy Dispatch") are acceptable as **metaphors** for the Kubernetes services, provided:

1. The `(demo)` suffix or the persistent disclaimer banner makes the metaphorical nature clear.
2. Tooltips always show the real Kubernetes resource name alongside the metaphor.
3. No numerical energy data (MW, kWh, etc.) is fabricated or displayed.

---

## 9. QA Acceptance Criteria and Test Scenarios

### 9.1 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| AC1 | All 10 topology nodes render on canvas load | Visual + automated: count rendered node elements = 10 |
| AC2 | All defined edges render with correct source/target | Visual + automated: count edges, verify source/target attributes |
| AC3 | Node severity matches the Issue A-selected cloud data contract, or renders `unknown`/static fallback if V1 has no live severity | Automated: compare rendered severity with selected data contract or fallback |
| AC4 | Edge severity = `max(source, target)` severity | Automated: for each edge, verify severity derivation |
| AC5 | Clicking a node opens detail panel with correct data | Manual: click each node, verify panel content |
| AC6 | Clicking canvas background closes detail panel | Manual: click background after selecting a node |
| AC7 | Severity filter dims non-matching nodes (not hides) | Visual: apply filter, verify all nodes are still visible |
| AC8 | Keyboard navigation cycles through all nodes | Manual: Tab through all nodes, Enter to select |
| AC9 | Screen reader announces node labels and severity | Assistive tech: verify `aria-label` attributes |
| AC10 | Stale data shows hatch overlay and banner | Automated: simulate poll failure, verify overlay appears |
| AC11 | Safe-language disclaimer is visible without scrolling | Visual: verify on load at 1920×1080 |
| AC12 | Optional Analyst handoff copies or pre-fills context correctly when configured | Manual: select node, use handoff, verify cloud-demo snapshot prompt |
| AC13 | Portal handoff opens correct URL in new tab | Manual: click portal link, verify URL |
| AC14 | Wallboard mode: readable at 1920×1080 without interaction | Visual: display on large screen, verify legibility |
| AC15 | `prefers-reduced-motion` disables animations | Manual: enable reduced motion, verify no pulse/ripple |

### 9.2 Scenario Test Matrix

For each breakable scenario, the following must be verified on the grid map:

| Test | Steps | Expected |
|------|-------|----------|
| **Scenario activation** | Apply scenario YAML, wait for poll | Primary node changes to expected severity |
| **Cascade edges** | Apply scenario with cascade (e.g., `mongodb-down`) | Downstream edges change severity |
| **Cascade animation** | Apply `critical` scenario | Pulse animation propagates along edges for 3s |
| **Detail panel accuracy** | Select primary node during active scenario | Panel shows correct pod status, events, restart count |
| **Event strip update** | Apply scenario | New events appear in event strip within one poll |
| **Fix scenario** | Apply `fix-all` / reapply base YAML | Nodes return to `healthy`, edges return to green |
| **Multi-scenario** | Apply two scenarios simultaneously | Both nodes show correct severity, no visual conflicts |

### 9.3 Edge Case Tests

| Test | Steps | Expected |
|------|-------|----------|
| **No cloud data source** | Start selected cloud demo host when the Issue A cloud data source is unavailable | Topology skeleton in `unknown`, banner explains the cloud status source is unavailable |
| **Partial API failure** | Mock one API returning 503 | Affected nodes show `unknown`, others render normally |
| **Rapid toggle** | Switch wallboard ↔ map 10 times quickly | No console errors, no memory leaks, no orphaned event listeners |
| **Concurrent poll + interaction** | Select a node while poll is in-flight | Selection persists after poll re-render |
| **Window resize** | Resize from 1920px to 800px and back | Layout adapts correctly, no overflow |
| **Long event messages** | Event with >120 char message | Truncated with ellipsis, full text in tooltip |

---

## 10. Recommended GitHub Implementation Issues

> ⛔ **These issues must not be created until Phase 3 (expert re-review) is complete and experts agree the spec is functional.**

### Issue Dependency Graph

```
[Issue A: Topology Config] ──→ [Issue B: Canvas Renderer]
                               [Issue B] ──→ [Issue C: State Binding]
                               [Issue C] ──→ [Issue D: Detail Panel]
                               [Issue C] ──→ [Issue E: Interaction Layer]
                                              [Issue D] ──→ [Issue F: Analyst Integration]
                                              [Issue E] ──→ [Issue G: Wallboard Mode]
[Issue A] ──────────────────────────────────→ [Issue H: Scenario Smoke Tests]
[Issue A] ──────────────────────────────────→ [Issue I: Cloud Demo View Toggle]
                                               [Issue G] ──→ [Issue H]
```

### Issue A: Grid Map — Cloud Demo Placement, Data Contract, and Static Topology Configuration

**Title**: `feat(grid-map): define cloud demo placement and topology data contract`
**Labels**: `grid-map`, `frontend`, `config`
**Dependencies**: None
**Acceptance Criteria**:
- [ ] Grid map host is explicitly selected: preferred `ops-console`, alternative `grid-dashboard`, or a new deployed `grid-map` service
- [ ] Implementation is scoped to the deployed cloud demo UI, not local Mission Control
- [ ] Cloud data contract is documented before renderer work starts: existing service health endpoints, new read-only in-cluster status endpoint, or static V1 fallback
- [ ] No dependency on local Mission Control APIs is introduced
- [ ] `grid-topology.ts` defines all 10 nodes with IDs, labels, metaphors, icons, and positions
- [ ] All edges defined with source, target, label, and type
- [ ] Schema version field included
- [ ] Safe-language disclaimer string included in config
- [ ] Config matches `k8s/base/application.yaml` architecture exactly
- [ ] TypeScript types exported for `TopologyNode`, `TopologyEdge`, `GridTopology`

---

### Issue B: Grid Map — Canvas Renderer (SVG)

**Title**: `feat(grid-map): SVG canvas renderer for topology graph`
**Labels**: `grid-map`, `frontend`, `ui`
**Dependencies**: Issue A
**Acceptance Criteria**:
- [ ] SVG canvas renders all nodes and edges from topology config
- [ ] Nodes use correct shapes (rounded rect for services, cylinder for data stores)
- [ ] Edges render with arrowheads indicating data flow direction
- [ ] Dark theme background (`#0f172a`) applied
- [ ] Canvas is embedded in the selected cloud demo host from Issue A
- [ ] Zoom (0.5× to 3×) and pan work via mouse and keyboard
- [ ] `Fit` button resets view
- [ ] Minimum 800×500px enforced; below that, show fallback message

---

### Issue C: Grid Map — Live State Binding

**Title**: `feat(grid-map): bind node and edge severity to cloud demo health contract`
**Labels**: `grid-map`, `frontend`, `data`
**Dependencies**: Issue B
**Acceptance Criteria**:
- [ ] Nodes receive severity from the cloud data contract selected in Issue A
- [ ] Node fill/border/glow matches severity palette spec
- [ ] Edge severity derived as `max(source, target)` using `healthy < warning < critical`
- [ ] `unknown` severity handled (gray, dashed edges)
- [ ] Polling interval is appropriate for the deployed cloud demo and avoids excessive in-cluster traffic
- [ ] Stale-data overlay (hatch pattern + banner) appears after 30s since the last successful poll
- [ ] Missing/unavailable health data shows skeleton topology in `unknown`

---

### Issue D: Grid Map — Detail Panel

**Title**: `feat(grid-map): node and edge detail panel drawer`
**Labels**: `grid-map`, `frontend`, `ui`
**Dependencies**: Issue C
**Acceptance Criteria**:
- [ ] Right-side drawer opens on node click, closes on background click or Escape
- [ ] Node panel shows: header, pod status, container summary, recent events, endpoints, expandable logs
- [ ] Edge panel shows: source/target summaries, connection assessment text
- [ ] Data sourced only from the Issue A cloud data contract
- [ ] Optional log/event/endpoint details appear only if the cloud data contract supports them
- [ ] Lazy loading with skeleton placeholders for optional expensive details
- [ ] Source citation line: "Data from cloud demo snapshot at {timestamp}"
- [ ] "Ask Analyst about this" and "Open in Azure Portal →" action buttons present

---

### Issue E: Grid Map — Interaction Layer (Filter, Select, Keyboard)

**Title**: `feat(grid-map): selection, filtering, and keyboard navigation`
**Labels**: `grid-map`, `frontend`, `accessibility`
**Dependencies**: Issue C
**Acceptance Criteria**:
- [ ] Node selection ring (white, 3px) on click
- [ ] Edge selection highlight on click (8px hit area)
- [ ] Severity filter buttons: All, Critical, Warning — non-matching nodes dim to 20% opacity
- [ ] Filter badge shows count per severity
- [ ] `Tab` cycles through nodes, `Enter` selects, `Escape` deselects
- [ ] `aria-label` on all nodes and edges per accessibility spec
- [ ] `prefers-reduced-motion` disables animations
- [ ] Focus ring distinct from selection ring

---

### Issue F: Grid Map — Local Analyst / SRE Portal Handoff

**Title**: `feat(grid-map): safe handoff from cloud grid map to Analyst and SRE portal`
**Labels**: `grid-map`, `frontend`, `analyst`
**Dependencies**: Issue D
- [ ] Cloud grid map provides a safe handoff link or copied prompt for Local Analyst without making local Mission Control a runtime dependency
- [ ] If using `clientContext.selected`, populate it with `type: 'grid-map-node'` and `name: '{deployment}'`
- [ ] Pre-filled question: "Explain the current state of {label} based on the cloud demo snapshot."
- [ ] Analyst response or copied prompt is scoped to selected node
- [ ] Safe-language compliance: no autonomous diagnosis claims in pre-fill text

---

### Issue G: Grid Map — Wallboard Mode and Responsive Layout

**Title**: `feat(grid-map): wallboard auto-fit and responsive breakpoints`
**Labels**: `grid-map`, `frontend`, `ui`, `wallboard`
**Dependencies**: Issue E
**Acceptance Criteria**:
- [ ] Auto-fit on load and resize
- [ ] After 30s idle, auto-fit and close detail panel
- [ ] Node labels ≥16px at 1920×1080
- [ ] Responsive breakpoints: side panel (≥1920), overlay (1280–1919), bottom sheet (800–1279), fallback (<800)
- [ ] Safe-language disclaimer banner always visible in wallboard mode
- [ ] Smooth state-change animations (no full re-render flicker)

---

### Issue H: Grid Map — Scenario Smoke Tests

**Title**: `test(grid-map): smoke tests for all 10 breakable scenarios`
**Labels**: `grid-map`, `testing`, `qa`
**Dependencies**: Issue A, Issue G
**Acceptance Criteria**:
- [ ] For each of the 10 scenarios: document expected primary node severity, cascade nodes, and edge impact
- [ ] Manual test checklist or automated test for each scenario
- [ ] Multi-scenario test (2 scenarios active simultaneously)
- [ ] No-cluster and stale-data edge cases tested
- [ ] Safe-language audit: verify no prohibited claims in any rendered text
- [ ] Accessibility audit: keyboard nav, screen reader, reduced motion verified

---

### Issue I: Grid Map — View Toggle in Cloud Demo Host

**Title**: `feat(grid-map): cloud demo grid-map view toggle`
**Labels**: `grid-map`, `frontend`, `ui`
**Dependencies**: Issue A
- [ ] Toggle or navigation control is added to the selected cloud demo host from Issue A
- [ ] Active view is visually indicated (bold/underline)
- [ ] Switching views preserves polling state (no data refetch on toggle)
- [ ] URL hash or query param updated for deep-linking (`?view=map`)
- [ ] Default cloud demo view remains unchanged unless Issue A selects a dedicated grid-map service
- [ ] No local Mission Control route is added for this feature

---

### Issue J: Grid Map — Event Strip Component

**Title**: `feat(grid-map): event strip with clickable event-to-node linking`
**Labels**: `grid-map`, `frontend`, `ui`
**Dependencies**: Issue C
**Acceptance Criteria**:
- [ ] Horizontal strip at bottom of grid map view
- [ ] Shows 5 most recent events only if the Issue A cloud data contract exposes event data; otherwise shows a safe "event feed unavailable in V1" empty state
- [ ] Each event row: timestamp, severity icon, involved object name, reason, truncated message
- [ ] Clicking an event selects the corresponding node on canvas
- [ ] Auto-refreshes on each poll cycle
- [ ] Long messages truncated to 120 chars with tooltip for full text

---

## Appendix A: Document References

| Document | Relevance |
|----------|-----------|
| [Safe Language Guardrails](SAFE-LANGUAGE-GUARDRAILS.md) | All UI copy must comply |
| [Analyst Safe Language](ANALYST-SAFE-LANGUAGE.md) | Analyst pre-fill and response language |
| [Local Analyst Governance](LOCAL-ANALYST-GOVERNANCE.md) | Analyst integration boundaries |
| [Capability Contracts](CAPABILITY-CONTRACTS.md) | Telemetry dimensions, evidence layout |
| [Breakable Scenarios](BREAKABLE-SCENARIOS.md) | All 10 scenario definitions |
| [Demo Narrative](DEMO-NARRATIVE.md) | Grid map role in demo story arc |
| [Demo Runbook](DEMO-RUNBOOK.md) | Operator checklist for using grid map |

## Appendix B: Expert Handoff Acknowledgments

This spec synthesizes inputs from three outside expert reviews conducted in July 2025:

1. **UI Designer** — Layout architecture, component hierarchy, visual state system, severity palette, responsive breakpoints, accessibility requirements, and Figma-ready component specifications.
2. **SRE/Energy Operations Expert** — Scenario-to-node mapping, cascade failure visualization rules, stale-data handling, severity derivation logic, safe-language compliance review, and operational readiness criteria.
3. **Workflow Architect** — Complete interaction workflow trees with happy paths and failure modes, step-by-step flow specifications for every user action, timeout/retry behavior, escalation handoffs, and observable state transitions.

---

*End of specification. This document is pending expert re-review before implementation issues are created.*
