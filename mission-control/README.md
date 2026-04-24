# ⚡ Mission Control — Energy Grid Operations

A local single-page application for managing the Azure SRE Agent Energy Grid demo lab.

## Features

- **Preflight Checks** — Verify CLI tools (pwsh, az, kubectl), Azure login, and K8s context
- **Deploy** — Launch full Azure infrastructure via `deploy.ps1` with streaming logs
- **Destroy** — Tear down infrastructure with safety confirmation gate (type "DELETE")
- **Monitor** — Live pod status grid with auto-refresh and K8s event stream
- **Scenarios** — Enable/disable 10 breakable SRE scenarios with one click
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
│       ├── components/    # 8 Vue components (Header, Preflight, Deploy, etc.)
│       ├── composables/   # useApi, usePolling, useWebSocket
│       ├── styles/        # Energy grid theme (CSS custom properties)
│       └── types/         # TypeScript API contracts
├── backend/           # Fastify 5 + WebSocket + TypeScript
│   └── src/
│       ├── routes/        # REST API (health, deploy, destroy, pods, scenarios)
│       ├── services/      # CommandExecutor, JobManager, KubeClient, ToolDetector
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
| GET | `/api/services` | List services |
| GET | `/api/events` | List K8s events |
| GET | `/api/scenarios` | List all 10 scenarios |
| POST | `/api/scenarios/:name/enable` | Apply a breakable scenario |
| POST | `/api/scenarios/:name/disable` | Revert a scenario |
| POST | `/api/scenarios/fix-all` | Restore healthy baseline |
| GET | `/api/jobs/:id` | Get job status |
| POST | `/api/jobs/:id/cancel` | Cancel running job |
| WS | `/ws` | Job log streaming |

## Requirements

- **Node.js** 20+
- **PowerShell** (`pwsh`) — for deploy/destroy scripts
- **Azure CLI** (`az`) — for Azure operations
- **kubectl** — for K8s monitoring and scenarios

## Security

- Backend binds to `127.0.0.1` only (localhost)
- No `shell: true` — all commands use structured `spawn()` args
- Destroy requires explicit `"DELETE"` confirmation
- One destructive job at a time (deploy OR destroy, not both)
