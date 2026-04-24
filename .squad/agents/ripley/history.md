# Ripley — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** Bicep IaC, PowerShell, Dev Containers
- **Bicep modules:** aks, container-registry, key-vault, log-analytics, app-insights, network, observability, sre-agent, action-group, alerts
- **Deploy command:** `pwsh ./scripts/deploy.ps1 -Location eastus2`
- **Regions:** eastus2, swedencentral, australiaeast only

## Learnings

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
