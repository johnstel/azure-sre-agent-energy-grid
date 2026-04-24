# Parker — History

## Project Context
- **Project:** Azure SRE Agent Energy Grid Demo Lab
- **User:** John Stelmaszek
- **Stack:** Kubernetes manifests, YAML
- **Scenarios:** oom-killed, crash-loop, image-pull-backoff, high-cpu, pending-pods, probe-failure, network-block, missing-config, mongodb-down, service-mismatch
- **Namespace:** energy
- **Fix command:** `kubectl apply -f k8s/base/application.yaml`

## Learnings

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

### 2025-07-24: Ops-Console Full Review
- **Resources found:** 2 ConfigMaps (`ops-console-html`, `ops-console-nginx`), 1 Deployment, 1 Service — all in `energy` namespace
- **Selectors aligned:** Deployment labels `app: ops-console` → Service selector `app: ops-console` ✅
- **Ports aligned:** nginx listens `:8081` → containerPort `8081` → Service targetPort `8081` → external port `80` ✅
- **Volume mounts correct:** `ops-console-html` → `/usr/share/nginx/html`, `ops-console-nginx` → `/etc/nginx/conf.d` ✅
- **Probes correct:** liveness & readiness both hit `/health:8081`, staggered delays (5s/3s) ✅
- **Resource limits set:** requests 64Mi/50m, limits 128Mi/100m ✅
- **Service type:** LoadBalancer (external-facing, correct for demo)
- **Embedded ConfigMap nginx uses FQDN + resolver** (`asset-service.energy.svc.cluster.local:3002` with `resolver kube-dns.kube-system.svc.cluster.local valid=5s`) — production-quality DNS resolution
- **Upstream port alignment confirmed:** asset-service:3002, meter-service:3000, dispatch-service:3001 all match their K8s Service definitions

#### Issues Found
1. **Orphaned standalone files:** `k8s/base/nginx-ops.conf` and `k8s/base/ops-console.html` are NOT used by K8s — the ConfigMaps are inline in `application.yaml`. These files have **drifted** from the embedded versions:
   - `nginx-ops.conf` listens on `:8081` (wrong port vs embedded `:8081` — actually matches), uses short DNS names (`asset-service:3002`) without resolver, and includes `proxy_set_header Host` (embedded version omits this)
   - `ops-console.html` content matches the embedded ConfigMap (no drift detected)
   - The embedded nginx ConfigMap is the authoritative version with FQDN + resolver pattern
2. **Missing `sre-demo: breakable` label:** Per project convention, all K8s resources should have `sre-demo: breakable` label — ops-console resources lack this
3. **No `proxy_set_header` in embedded config:** The embedded nginx ConfigMap omits `proxy_set_header Host $host` on API proxy blocks (the standalone file has it). Not a blocker but best practice for proxy correctness
4. **grid-dashboard pattern parity:** grid-dashboard has identical architecture (nginx + 2 ConfigMaps + LoadBalancer) — both frontends share same structural pattern, good consistency

#### Architecture Notes
- Both frontend services (grid-dashboard on :8080, ops-console on :8081) use the same pattern: inline ConfigMap HTML + inline ConfigMap nginx conf, mounted into `nginx:alpine`
- The standalone `.conf` and `.html` files in `k8s/base/` appear to be reference/development copies — the embedded ConfigMaps are what K8s actually deploys
- Ops-console has 1 replica (vs grid-dashboard's 2) — intentional for demo, lower priority console
