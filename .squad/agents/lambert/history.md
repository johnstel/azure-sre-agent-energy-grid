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
