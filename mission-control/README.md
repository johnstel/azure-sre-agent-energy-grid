# ⚡ Mission Control — Energy Grid Operations

A local single-page application for managing the Azure SRE Agent Energy Grid demo lab.

## Features

- **Preflight Checks** — Verify CLI tools (pwsh, az, kubectl), Azure login, and K8s context
- **Deploy** — Launch full Azure infrastructure via `deploy.ps1` with streaming logs
- **Destroy** — Tear down infrastructure with safety confirmation gate (type "DELETE")
- **Monitor** — Live pod status grid with auto-refresh and K8s event stream
- **Ask Copilot** — Local, read-only Copilot SDK explainer for point-in-time Mission Control state snapshots
- **Scenarios** — Enable/disable 10 breakable SRE scenarios with one click
- **Scenario Narration** — Read-only, hideable presenter guidance sourced from structured metadata; it does not show expected Azure SRE Agent responses
- **Portal Validation** — Track and confirm Azure SRE Agent portal evidence for OOMKilled, MongoDBDown, and ServiceMismatch scenarios
- **WebSocket Streaming** — Real-time deploy/destroy output in a terminal viewer

## Quick Start

```bash
# From repo root
cd mission-control

# Install dependencies
npm install

# Development (two servers: Vite :5173 + Fastify :3333)
npm run dev

# Production (single server: Fastify :3333 serves built SPA)
npm run build
npm start
```

Open http://localhost:5173 (dev) or http://localhost:3333 (production).

## Architecture

```
mission-control/
├── frontend/          # Vue 3 + Vite + TailwindCSS v4
│   └── src/
│       ├── components/    # Vue components (Header, Preflight, Deploy, Destroy, PodGrid, etc.)
│       ├── composables/   # useApi, usePolling, useWebSocket
│       ├── styles/        # Energy grid theme (CSS custom properties)
│       └── types/         # TypeScript API contracts
├── backend/           # Fastify 5 + WebSocket + TypeScript
│   └── src/
│       ├── routes/        # REST API (health, deploy, destroy, pods, scenarios, assistant, portal-validations)
│       ├── services/      # AssistantService, CommandExecutor, JobManager, KubeClient, MissionStateService, PortalValidationService, PreflightService, ScenarioService, ToolDetector
│       └── utils/         # Cross-platform paths, pino logger
└── package.json       # npm workspaces root
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/preflight` | Tool/auth/context checks |
| POST | `/api/deploy` | Start deployment job |
| POST | `/api/destroy` | Start destruction job (requires DELETE confirmation) |
| GET | `/api/pods` | List pods in energy namespace |
| GET | `/api/pods/:name/logs` | Get pod logs (query: `?lines=N`) |
| GET | `/api/services` | List services |
| GET | `/api/services/:name/endpoints` | Get endpoints for a service |
| GET | `/api/deployments` | List deployments |
| GET | `/api/events` | List K8s events |
| GET | `/api/inventory` | Full namespace inventory (pods, services, deployments, events) |
| POST | `/api/assistant/ask` | Ask Copilot about current Mission Control state |
| GET | `/api/scenarios` | List all 10 scenarios with optional read-only narration metadata |
| POST | `/api/scenarios/:name/enable` | Apply a breakable scenario |
| POST | `/api/scenarios/:name/disable` | Revert a scenario |
| POST | `/api/scenarios/fix-all` | Restore healthy baseline |
| GET | `/api/jobs/:id` | Get job status |
| POST | `/api/jobs/:id/cancel` | Cancel running job |
| GET | `/api/portal-validations` | Get all portal validations and gate status |
| GET | `/api/portal-validations/:scenarioName/prompt` | Get prepared prompt for scenario |
| PATCH | `/api/portal-validations/:scenarioName` | Update validation details |
| POST | `/api/portal-validations/:scenarioName/confirm` | Mark scenario as confirmed |
| POST | `/api/portal-validations/:scenarioName/reset` | Reset scenario to pending |
| POST | `/api/portal-validations/reset-all` | Reset all validations |
| WS | `/ws` | Job log streaming |

## Scenario Narration Workflow

The **Scenario Narration** panel provides presenter guidance beside the scenario controls. It is read-only and hideable: it can copy an approved prompt, but it does not inject faults, repair resources, capture evidence, call Azure SRE Agent APIs, or display expected agent responses. Narration content is sourced from `docs/scenario-narration.json`; that catalog must not contain expected response fields such as `expectedAgentResponse`, `expectedDiagnosis`, `rootCauseAnswer`, `sampleTranscript`, `agentWillSay`, or `successCriteriaForAgentText`.

Prompt stages in the catalog use this taxonomy:

- `open-ended` — symptom description only; lets Azure SRE Agent reason freely
- `direct` — names the failing component and asks for diagnosis
- `specific` — asks about a particular signal such as endpoints, memory, events, probes, or resource usage
- `remediation` — asks how to fix the issue after diagnosis is shown

Catalog copy rules:

- Hooks use second-person presenter voice, describe only the failure condition, and stay under 140 characters.
- Observe bullets start with a verb, name a Mission Control tile or `kubectl` output, and are limited to four per scenario.
- Suggested prompts are copied exactly from `docs/SRE-AGENT-PROMPTS.md` when available; otherwise they use `docs/PROMPTS-GUIDE.md`.
- Restore labels use **Operator Restore** or **Manual Restore** wording. The panel never says the agent fixes a scenario.

Use Portal Validation, not Scenario Narration, for real Azure SRE Agent diagnosis evidence.

## Portal Validation Workflow

The **Portal Evidence Confirmation** section in Mission Control provides a local workflow for tracking human validation of Azure SRE Agent portal evidence. This supports safe language compliance: you cannot claim "Azure SRE Agent diagnosed" a scenario until portal evidence is captured, redacted, and locally confirmed; Dallas approval is still required before external use.

Portal Validation remains limited to OOMKilled, MongoDBDown, and ServiceMismatch. Its prompt and description text is served from the shared scenario narration metadata, so updates to `docs/scenario-narration.json` are checked by backend tests before the portal validation copy can drift.

### Three Scenarios Tracked

1. **OOMKilled** — Wave 1 scenario requiring portal diagnosis evidence
2. **MongoDBDown** — Wave 2 scenario requiring portal diagnosis evidence
3. **ServiceMismatch** — Wave 2 scenario requiring portal diagnosis evidence

### For Each Scenario

- **Portal Prompt** — The exact prompt to use in the Azure SRE Agent portal
- **Required Checklist** — Four items that must be checked before confirmation:
  - Portal screenshot captured with timestamp
  - Exact transcript copied (no paraphrasing)
  - Subscription ID, tenant ID, resource IDs redacted
  - Evidence path recorded in notes
- **Evidence Path** — Local path to saved evidence (e.g., `docs/evidence/wave1-live/oom-killed/sre-agent/...`)
- **Notes** — Optional notes about the evidence capture
- **Status** — `Pending` or `Confirmed`

### Gate Status

- **PASS_WITH_PENDING_HUMAN_PORTAL** — Default state. Indicates automated evidence is complete but human portal validation is pending.
- **PASS** — All three scenarios have complete local checklist fields, evidence paths, and are marked confirmed. This is not customer-ready approval; Dallas approval is still required before external use.

### Safe Language Compliance

The validation section includes a reminder:

> **Safe language reminder:** Do not claim "Azure SRE Agent diagnosed" until real portal evidence is captured, redacted, and validated below. Do not treat Mission Control confirmation as Dallas approval for customer use.

This aligns with `docs/SAFE-LANGUAGE-GUARDRAILS.md` and `docs/evidence/wave5-live/CHECKLISTS-AND-VERDICT.md`.

## Ask Copilot vs. Azure SRE Agent

Ask Copilot is a **Technical Preview, local-only Mission Control explainer and triage assistant**. It answers from one explicit point-in-time state snapshot collected by the backend: preflight checks, Kubernetes `energy` namespace pods/services/deployments/events, scenario catalog/status, and job status without raw logs. It may explain state and suggest safe user-triggered next actions, but it does **not** deploy, destroy, repair, run shell commands, read arbitrary files, inspect secrets, or replace Azure SRE Agent.

Azure SRE Agent remains the cloud diagnostic/remediation experience for Azure resources. Use Mission Control's assistant for local demo-state explanation; use Azure SRE Agent for cloud-side investigation.

## Requirements

- **Node.js** 20+
- **PowerShell** (`pwsh`) — for deploy/destroy scripts
- **Azure CLI** (`az`) — for Azure operations
- **kubectl** — for K8s monitoring and scenarios
- **GitHub Copilot CLI auth** — for the Ask Copilot assistant (`copilot --version`, then authenticate locally)

## Security

- Backend binds to `127.0.0.1` only (localhost)
- No `shell: true` — all commands use structured `spawn()` args
- Ask Copilot is backend-only, read-only, and restricted to a single Mission Control state snapshot tool
- Destroy requires explicit `"DELETE"` confirmation
- One destructive job at a time (deploy OR destroy, not both)
