# Lambert — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** PowerShell validation, Markdown docs
- **Validation:** `pwsh ./scripts/validate-deployment.ps1 -ResourceGroupName rg-srelab-eastus2`
- **No automated tests** — validation is post-deploy smoke checks

## Learnings

### 2025-07-18: Ops-Console Validation Audit

**Files reviewed:**
- `k8s/base/ops-console.html` — standalone HTML file (may be stale)
- `k8s/base/nginx-ops.conf` — standalone nginx config
- `k8s/base/application.yaml` lines 950–1055 — ops-console ConfigMaps, Deployment, Service
- `scripts/validate-deployment.ps1` — deployment health checks

**Findings:**

1. **STALE STANDALONE nginx-ops.conf** — `k8s/base/nginx-ops.conf` uses short service names (`http://asset-service:3002/`) while the actual ConfigMap `ops-console-nginx` embedded in `application.yaml:956` uses FQDNs with resolver (`http://asset-service.energy.svc.cluster.local:3002`). The standalone file is NOT referenced by any ConfigMap and appears to be a dead artifact. The real config is embedded in application.yaml.

2. **API ENDPOINT ROUTING — ALL CORRECT** — The ops-console HTML fetches: `/api/assets/`, `/api/assets/health`, `/api/meter/health`, `/api/dispatch/health`. The nginx ConfigMap correctly proxies:
   - `/api/assets/` → asset-service:3002 (containerPort 3002 ✓)
   - `/api/meter/` → meter-service:3000 (containerPort 3000 ✓)
   - `/api/dispatch/` → dispatch-service:3001 (containerPort 3001 ✓)
   All service names, ports, and paths align with application.yaml definitions.

3. **NO WEBSOCKETS** — The ops-console uses polling only (setInterval), no WebSocket connections. This is fine for a demo.

4. **GOOD ERROR HANDLING** — Asset fetch failure shows "⚠ Asset Service unavailable". Health checks use `AbortSignal.timeout(3000)` with catch-all error display ("Unreachable"). Graceful degradation for MongoDB/RabbitMQ shown as "In-Cluster" (no direct health endpoint).

5. **SIMULATED DATA DESIGN** — Metrics (queue depth, dispatches, efficiency, alerts) and dispatch orders are randomly generated client-side. Only the Asset Inventory and Platform Health sections make real API calls. This is intentional for the demo — services return stub data.

6. **VALIDATE-DEPLOYMENT.PS1 GAP** — The script checks all services generically (line 233) but only prints a specific URL for `grid-dashboard` (line 262). It does NOT print the ops-console LoadBalancer URL. Since ops-console is also a LoadBalancer service, operators have no easy way to find its external IP from the validation output.

7. **DOCUMENTATION GAP** — No `docs/` file mentions ops-console. The README table lists it but provides no usage guidance. The BREAKABLE-SCENARIOS.md and SRE-AGENT-SETUP.md have zero ops-console coverage.

**No bugs found in the HTML↔nginx↔K8s service wiring.** The ops-console will work correctly when deployed.

### 2025-04-24: Mission Control PowerShell Detection Mismatch

**Files reviewed:**
- `mission-control/backend/src/services/ToolDetector.ts` — platform() called at probe time
- `mission-control/backend/src/utils/paths.ts` — platform() called at import time
- `mission-control/backend/src/routes/deploy.ts` — uses getPwshCommand() from paths.ts
- `mission-control/backend/src/routes/destroy.ts` — uses getPwshCommand() from paths.ts
- `mission-control/frontend/src/components/PreflightPanel.vue` — displays preflight checks

**Issue identified:**
PowerShell command resolution uses two different patterns:
1. **ToolDetector.ts (line 18):** Detects platform at probe time (`platform() === 'win32' ? 'pwsh.exe' : 'pwsh'`)
2. **paths.ts (line 9):** Detects platform at import time (same logic, called at startup)
3. **deploy.ts & destroy.ts (line 24, 26):** Both use `getPwshCommand()` from paths.ts

**Root cause:** ToolDetector re-implements platform detection instead of delegating to paths.ts. Risk: if platform() returns different values at different times (rare but possible in edge cases like WSL), preflight check and job execution could use different commands.

**Validation plan created:** `.squad/decisions/inbox/lambert-pwsh-validation.md` — comprehensive test matrix covering:
- TypeScript compilation & lint
- Full build process
- `/api/preflight` endpoint (Windows, Mac, missing pwsh)
- Command resolution (pwsh vs pwsh.exe)
- Deploy/destroy consistency
- Platform edge cases (WSL, mismatched flags, .NET versions)
- Preflight → Deploy flow integration
- Frontend display validation
- Regression tests

**Key insight:** Import-time platform detection in paths.ts is reliable and correct. Recommend unifying both modules to call getPwshCommand() from a single source of truth.

### 2025-04-24: AKS VM Size Mismatch Validation Checklist

**Files reviewed:**
- `scripts/deploy.ps1` (lines 500–550) — parameter passing to Bicep
- `infra/bicep/main.bicepparam` (lines 25–26) — hardcoded VM sizes (Standard_D2s_v5)
- `infra/bicep/modules/aks.bicep` (lines 24–28, 89–99) — VM size parameters passed to AKS resource

**Issue identified:**
Azure `PropertyChangeNotAllowed` error when existing AKS cluster uses Standard_D2s_v4 but Bicep params request Standard_D2s_v5. VM SKU is immutable after cluster creation; Bicep always passes the new VM size, causing update failures on existing clusters.

**Root cause:** No existing-cluster detection or parameter override in deploy.ps1. Fresh deployments work (new cluster gets v5), but re-running against existing clusters fails.

**Validation checklist created:** `.squad/decisions/inbox/lambert-aks-vmsize-validation.md` — comprehensive test matrix covering:
- Existing-cluster detection logic (AKS query before deployment)
- Parameter override behavior (preserve detected VM size)
- WhatIf safety (zero AKS cluster changes on re-run)
- Mission Control console clarity (display detected vs default VM sizes)
- Azure what-if/preflight commands (catch immutable errors early)

**Key insights:**
1. **Detection timing:** Check AKS state **before** building Bicep parameters, not after
2. **Fallback strategy:** If cluster detection fails or no cluster exists, use params file default with warning
3. **User feedback:** Distinguish "DETECTED existing v4" vs "USING DEFAULT v5" in all logs
4. **WhatIf integration:** Both WhatIf path and actual deploy must detect and apply VM size overrides
5. **Azure API behavior:** PropertyChangeNotAllowed is caught at `az deployment sub create` time; preflight should catch it earlier

### 2026-04-24: AKS Idempotency Sprint — Shared Learning
- **Coordination:** Validated QA checklist with Ripley; coordinated cross-functional testing strategy with Coordinator
- **Checklists created:** 7-scenario AKS validation plan + 10-scenario PowerShell detection plan covering all platforms and edge cases
- **Key finding:** Comprehensive validation must cover not just happy path but error cases (missing cluster, explicit override attempts, WSL edge cases)
- **Test prioritization:** Fresh deployment → Existing detection → Re-deploy → What-If → Preflight validation
- **Orchestration log:** `2026-04-24T20:01:53Z-aks-vmsize-idempotency.md`
