# RB-009: MongoDBDown — Meter Database Outage

| Field | Value |
|-------|-------|
| **Runbook ID** | `RB-009-mongodb-down` |
| **Scenario** | `mongodb-down` |
| **Severity** | `critical` |
| **Services** | `mongodb`, `meter-service`, `dispatch-service` |
| **Components** | `database`, `api`, `worker` |
| **Root cause category** | `dependency` |
| **Namespace** | `energy` |
| **K8s manifest** | `k8s/scenarios/mongodb-down.yaml` |
| **Fix command** | `kubectl apply -f k8s/base/application.yaml` |
| **Last verified** | 2026-04-26 |

## Symptoms

- MongoDB deployment is intentionally scaled to `replicas: 0`.
- MongoDB service may exist but has no ready backend pods.
- `dispatch-service` degrades or crashes because `ORDER_DB_URI` points to `mongodb://mongodb:27017`.
- Meter readings can queue but downstream processing is blocked.
- Baseline alerts may show symptoms (`pod-restarts`, `crashloop-oom`, `http-5xx`) rather than the single dependency root cause.

## Diagnosis Steps

1. Confirm MongoDB desired replicas:
   ```bash
   kubectl get deploy mongodb -n energy -o yaml
   ```
2. Confirm service/endpoints and dependent service state:
   ```bash
   kubectl get svc,endpoints,pods -n energy
   kubectl describe pods -n energy -l app=dispatch-service
   ```
3. Trace dependency configuration:
   ```bash
   kubectl get deploy dispatch-service -n energy -o yaml
   ```
   Expected dependency: `ORDER_DB_URI=mongodb://mongodb:27017`.
4. Run stable KQL if workspace access is available:
   - `docs/evidence/kql/stable/scenario-mongodb-down.kql`
   - `docs/evidence/kql/stable/pod-lifecycle.kql`
5. Check alert firing through `scripts/get-alert-firing-history.ps1`. Wave 2 documented `NO_ALERT_FIRED` for a rapid automated run; do not reinterpret that as Activity Log firing evidence.

## Remediation

1. In Review mode, ask Azure SRE Agent to trace the dependency chain from dispatch-service to MongoDB.
2. Human operator verifies the recommendation identifies MongoDB scaled to zero and avoids treating every dependent symptom as a separate root cause.
3. Restore the healthy baseline:
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
4. Verify MongoDB has one ready pod, endpoints are populated, and dependent services stabilize.

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Open-ended | "Smart meter data is not being processed. What is the likely root cause in the energy namespace?" |
| Direct | "Trace dispatch-service dependencies and check MongoDB health." |
| Remediation | "Recommend the recovery action for MongoDB scaled to zero and dependent service failures." |

## Evidence

- Scenario manifest: `docs/evidence/scenarios/scenario-manifest.yaml`
- Scenario KQL: `docs/evidence/kql/stable/scenario-mongodb-down.kql`
- Wave 2 evidence: `docs/evidence/wave2-live/mongodb-down/EVIDENCE-STATUS-FINAL.md`
- Wave 4 dependency narrative: `docs/evidence/wave4-live/DEPENDENCY-REASONING.md`

## Execution Boundary

The current evidence supports the dependency reasoning and recovery plan. SRE Agent portal diagnosis remains `PENDING_HUMAN_PORTAL` before customer-facing claims that the agent identified this root cause.
