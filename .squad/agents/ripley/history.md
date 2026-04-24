# Ripley — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** Bicep IaC, PowerShell, Dev Containers
- **Bicep modules:** aks, container-registry, key-vault, log-analytics, app-insights, network, observability, sre-agent, action-group, alerts
- **Deploy command:** `pwsh ./scripts/deploy.ps1 -Location eastus2`
- **Regions:** eastus2, swedencentral, australiaeast only

## Learnings

### 2025-04-24: AKS VM Size Idempotency Protection
- **What:** Fixed PropertyChangeNotAllowed deployment failures when re-deploying to existing AKS clusters with different VM sizes than current Bicep parameters.
- **Problem:** Azure ARM prevents changing `agentPoolProfile.vmSize` on existing node pools. When Mission Control or scripts re-deployed with `main.bicepparam` defaults (Standard_D2s_v5) to a cluster with Standard_D2s_v4, deployment failed with `[PropertyChangeNotAllowed] Changing property 'agentPoolProfile.vmSize' is not allowed.`
- **Solution:** Added pre-deployment AKS cluster detection in `scripts/deploy.ps1` that:
  1. Safely queries for existing cluster `aks-${WorkloadName}` in `rg-${WorkloadName}-${Location}` using `az aks show`
  2. Handles non-existent cluster gracefully without throwing under `$ErrorActionPreference = 'Stop'` by capturing output and checking exit code before JSON parsing
  3. Extracts current VM sizes from system and user node pools via `agentPoolProfiles` array
  4. Builds parameter strings with space-separated key=value pairs for Azure CLI (not PowerShell arrays)
  5. Passes current sizes as deployment parameters to override Bicep defaults
  6. Displays clear warning that VM sizes are immutable and require cluster destroy/recreate to change
  7. Falls through to parameters file defaults if no existing cluster is found (first deployment)
- **Implementation changes:**
  - Added robust detection block after variable setup (line ~508-547)
  - Captures `az aks show` output to variable, checks `$LASTEXITCODE` before attempting `ConvertFrom-Json`
  - Stores detected sizes in `$systemNodeVmSizeParam` and `$userNodeVmSizeParam` variables
  - Builds parameter strings: `"$parametersFile location=$Location workloadName=$WorkloadName ..."` with conditional VM size appends
  - Uses space-separated parameter format compatible with Azure CLI's `--parameters` flag
  - Updated both what-if and deployment parameter building
  - No changes to Bicep templates or Mission Control — fully transparent to callers
- **Example output:**
  ```
  🔍 Checking for existing AKS cluster...
    ℹ️  Found existing AKS cluster: aks-srelab
    • System pool VM size: Standard_D2s_v4 (immutable)
    • User pool VM size:   Standard_D2s_v4 (immutable)
    ⚠️  AKS node pool VM sizes are immutable. Using existing sizes to prevent deployment failure.
       To change VM sizes, destroy the cluster or use a different WorkloadName.
  ```
- **Safety:** 
  - Preserves `-WhatIf` behavior
  - No shell string injection (uses PowerShell variable expansion in strings)
  - Mission Control build validated
  - Robust error handling prevents script failure when cluster doesn't exist
- **Gotchas:**
  - Only detects VM sizes if both resource group AND AKS cluster exist; partial deployments still use defaults
  - Parameter format uses space-separated `key=value` strings, not PowerShell arrays (required for Azure CLI `--parameters`)
  - Must capture `az aks show` output before attempting JSON parse to avoid throwing on non-zero exit
  - First deployment still uses `main.bicepparam` defaults; subsequent deployments lock to whatever was first deployed

### 2025-07-18: Mission Control Verbose Deployment Logging
- **What:** Enhanced Mission Control deployment console with verbose, operator-friendly output.
- **Key changes:**
  - Extended `JobManager.start()` signature to accept `options?: ExecuteOptions & { preludeLogs?: string[] }`
  - Prelude logs are emitted to WebSocket stream (`job:stdout` events) and stored in `job.logs[]` before process starts
  - Added lifecycle status logs: job created, process started, process completed (with exit code), job succeeded/failed/cancelled
  - Deploy route builds structured prelude with timestamp, configuration (location, workloadName, skipRbac, skipSreAgent), script path, PowerShell command, and SRE Agent region reminder
- **Implementation pattern:**
  - `deploy.ts` builds `preludeLogs` array with formatted metadata
  - `JobManager.start()` emits each prelude line via `this.emit('job:stdout', ...)` before spawning executor
  - Status transitions emit synthetic log lines: "[Mission Control] Process started at ..." and "[Mission Control] Process completed with exit code N at ..."
- **Gotchas:**
  - All synthetic logs must be emitted as `job:stdout` events (not just pushed to `job.logs`) to stream over WebSocket
  - Each log line needs `\n` appended when emitting to match real stdout behavior
  - Type signature `ExecuteOptions & { preludeLogs?: string[] }` allows intersection without breaking existing callers
- **Reusability:** Pattern is reusable for `destroy.ts` and other long-running operations that benefit from verbose context logging.
- **TypeScript validation:** `npx tsc --noEmit` in mission-control/backend confirms type safety.

### 2025-07-18: Mission Control Scaffold Complete
- **What:** Created `mission-control/` npm workspaces monorepo with frontend (Vue 3 + Vite + TailwindCSS v4 + TypeScript) and backend (Fastify 5 + TypeScript).
- **Key paths:**
  - Root: `mission-control/package.json` (workspaces: frontend, backend)
  - Frontend entry: `mission-control/frontend/src/main.ts` → `App.vue` → `router.ts`
  - Backend entry: `mission-control/backend/src/server.ts` (Fastify on 127.0.0.1:3333)
  - API routes: `mission-control/backend/src/routes/{health,deploy,destroy,pods,scenarios}.ts`
  - Services: `mission-control/backend/src/services/{CommandExecutor,JobManager,KubeClient,ToolDetector}.ts`
  - Types: `mission-control/backend/src/types/index.ts` + `mission-control/frontend/src/types/api.ts`
  - Composables: `mission-control/frontend/src/composables/{useWebSocket,usePolling,useApi}.ts`
  - 8 stub Vue components in `mission-control/frontend/src/components/`
- **Gotchas:**
  - Vite `@` alias needs explicit resolve config in `vite.config.ts` (not just tsconfig paths)
  - Vue SFC `<template>` tags must be properly closed — build fails silently without end tag
  - TailwindCSS v4 uses `@tailwindcss/vite` plugin + `@import 'tailwindcss'` in CSS (no config file)
- **Build commands:** `npm run build -w frontend` (vue-tsc + vite), `npx tsc --noEmit` in backend
- **Dev command:** `npm run dev` from root starts both frontend (5173) and backend (3333) concurrently

### 2025-07-18: Robust PowerShell Detection for Mission Control
- **What:** Fixed Mission Control preflight/deploy/destroy PowerShell detection to work reliably across Mac/Windows without relying on PATH environment.
- **Problem:** `execFile('pwsh')` relies on PATH resolution, which can fail if PowerShell is installed but not in the Node.js process environment or differs from user shell PATH.
- **Solution:** Added `resolvePwsh()` async function in `paths.ts` that proactively checks common installation paths using `fs.access()` with `constants.X_OK` (filesystem check, not shell execution).
- **Search paths (priority order):**
  - **Windows:** `C:\Program Files\PowerShell\7\pwsh.exe`, Program Files variants, `%ProgramFiles%\PowerShell\7\pwsh.exe`, fallback `pwsh.exe`
  - **macOS/Linux:** `/opt/homebrew/bin/pwsh` (Apple Silicon), `/usr/local/bin/pwsh` (Intel Homebrew), `/usr/bin/pwsh`, `~/.dotnet/tools/pwsh`, fallback `pwsh`
- **Implementation changes:**
  - `paths.ts`: Added `resolvePwsh()` async function with `fs.access()` checks; kept `getPwshCommand()` for backward compat
  - `ToolDetector.ts`: Updated TOOLS array to support `command: string | (() => Promise<string>)`, calls `resolvePwsh()` for pwsh probe
  - `deploy.ts`: Changed to `const pwshCmd = await resolvePwsh()` (was sync `getPwshCommand()`)
  - `destroy.ts`: Changed to `const pwshCmd = await resolvePwsh()` (was sync `getPwshCommand()`)
- **Safety:** All command execution remains safe with structured `execFile`/`spawn` args — no `shell: true`, no string interpolation.
- **Testing:** Backend typecheck (`npx tsc --noEmit`) and full build (`npm run build`) both passed.
- **Gotchas:**
  - Must await `resolvePwsh()` in route handlers (it's async due to `fs.access()`)
  - Preflight and deploy/destroy now use identical PowerShell resolution logic — no more mismatch
  - If all paths fail, falls back to bare `pwsh`/`pwsh.exe` and lets execFile try PATH as last resort

### 2026-04-24: AKS Idempotency Sprint — Shared Learning
- **Coordination:** Worked with Lambert (QA) on validation checklist and Coordinator on parameter handling refinements
- **Key insight:** Azure CLI `--parameters` flag requires space-separated `key=value` format, not PowerShell arrays — critical for reliable parameter passing
- **Testing pattern:** Always capture command output before attempting JSON parsing when error codes may indicate failure
- **Future:** Expanded Bicep VM-size allowlist to v4 SKUs; fixed network.bicep subnet outputs to concrete IDs; validated with `-WhatIf` on existing cluster
- **Orchestration log:** `2026-04-24T20:01:53Z-aks-vmsize-idempotency.md`
