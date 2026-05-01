# RB-011: Complete Failure Bundle — Cascading Outage + Service Isolation

| Field | Value |
|-------|-------|
| **Runbook ID** | `RB-011-complete-failure-bundle` |
| **Scenario** | `complete-failure-bundle` |
| **Severity** | `critical` |
| **Services** | `mongodb`, `meter-service`, `dispatch-service`, `rabbitmq` |
| **Components** | `database`, `api`, `network-policy`, `service-routing` |
| **Root cause category** | `dependency`, `networking`, `configuration` (composite) |
| **Namespace** | `energy` |
| **K8s manifest** | `k8s/scenarios/complete-failure-bundle/scenario.yaml` |
| **Fix command** | `kubectl delete networkpolicy deny-meter-service -n energy && kubectl apply -f k8s/base/application.yaml` |
| **Last verified** | 2026-05-01 |

## Composite Failure Injection Summary

This scenario bundle combines three simultaneous injections:

| Injection | Resource | Effect |
|-----------|----------|--------|
| MongoDB scaled to `replicas: 0` | `Deployment/mongodb` | Data layer outage; dispatch-service and meter-service lose persistence |
| NetworkPolicy denies all ingress + egress | `NetworkPolicy/deny-meter-service` | meter-service is fully network-isolated |
| Service selector mismatch (`app: meter-service-v2`) | `Service/meter-service` | meter-service endpoints are empty; traffic routing fails silently |

The combination creates broad platform unavailability: the consumer dashboard, ops console, meter ingestion, asset catalog, and dispatch flow all degrade or fail.

## Symptoms

- `mongodb` Deployment shows `0/0 READY` (intentional scale-to-zero).
- `meter-service` Service endpoints are empty (`kubectl get endpoints meter-service -n energy` returns `<none>`).
- `NetworkPolicy/deny-meter-service` exists in the `energy` namespace.
- `dispatch-service` pods may restart or show errors because `ORDER_DB_URI=mongodb://mongodb:27017` is unreachable.
- Grid dashboard and ops console lose backend connectivity.
- SRE Agent-visible signals: pod events, endpoint count zero, network policy existence, replica count.

## Diagnosis Steps

1. Confirm blast radius:
   ```bash
   kubectl get pods,svc,endpoints -n energy
   kubectl get events -n energy --sort-by=.lastTimestamp | tail -30
   ```
2. Confirm MongoDB outage (root cause #1):
   ```bash
   kubectl get deployment mongodb -n energy
   # Expected: READY 0/0
   ```
3. Confirm routing failure (root cause #2):
   ```bash
   kubectl get endpoints meter-service -n energy
   # Expected: <none>
   kubectl get service meter-service -n energy -o jsonpath='{.spec.selector}'
   # Expected: {"app":"meter-service-v2"} — selector mismatch
   ```
4. Confirm network isolation (root cause #3):
   ```bash
   kubectl get networkpolicy deny-meter-service -n energy
   # Expected: policy exists, podSelector app=meter-service, no ingress/egress allowed
   ```
5. Check dependent service failures:
   ```bash
   kubectl describe pods -n energy -l app=dispatch-service
   kubectl logs -n energy -l app=dispatch-service --tail=20
   ```
6. Run stable KQL queries if workspace access is available:
   - `docs/evidence/kql/stable/scenario-mongodb-down.kql`
   - `docs/evidence/kql/stable/pod-lifecycle.kql`

## Remediation

> **Execution boundary:** SRE Agent recommends. The operator executes and validates each step.
> Do not claim autonomous remediation unless real Azure portal evidence exists.

### Recommended recovery sequence (dependencies first)

1. Ask SRE Agent for prioritized recovery plan:
   ```
   "Why is the entire energy grid platform down? Separate root causes from downstream symptoms."
   "Recommend a prioritized recovery sequence — data layer first, then routing, then connectivity."
   ```
2. **Operator executes** — Remove network isolation:
   ```bash
   kubectl delete networkpolicy deny-meter-service -n energy
   ```
3. **Operator executes** — Restore healthy baseline (restores MongoDB replicas and fixes Service selector):
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
4. **Operator validates** after each step:
   ```bash
   kubectl get pods -n energy
   kubectl get endpoints meter-service -n energy
   # Expected: endpoints populated with meter-service pod IPs
   kubectl get deployment mongodb -n energy
   # Expected: READY 1/1
   ```
5. Ask SRE Agent to confirm recovery:
   ```
   "Verify that meter-service endpoints, MongoDB availability, and network access are all healthy."
   ```

## SRE Agent Prompts

| Stage | Prompt |
|-------|--------|
| Initial triage | "Why is the entire energy grid platform down?" |
| Dependency separation | "Separate root cause from downstream symptoms across services in the energy namespace" |
| Recovery planning | "Recommend a prioritized recovery plan with dependencies first" |
| Iterative validation | "After each recovery step, re-check health and tell me the next safest action" |
| Final verification | "Verify that meter-service endpoints, MongoDB availability, and network access are all healthy" |

## Pass / Fail Criteria

- ✅ **PASS**: Agent distinguishes upstream root causes (MongoDB, NetworkPolicy, selector mismatch) from downstream symptoms
- ✅ **PASS**: Agent recommends staged recovery (data layer → routing → connectivity)
- ✅ **PASS**: Operator can restore healthy baseline cleanly with documented steps
- ✅ **PASS**: `meter-service` endpoints are populated after recovery
- ✅ **PASS**: `deny-meter-service` NetworkPolicy is absent after recovery
- ✅ **PASS**: MongoDB `READY` is `1/1` after recovery
- ❌ **FAIL**: Agent treats every symptom as an independent root cause
- ❌ **FAIL**: Recovery leaves `meter-service` endpoints empty or network policy still blocking
- ❌ **FAIL**: Any claim that SRE Agent autonomously executed recovery steps without real portal evidence

## Evidence

- Scenario manifest: `docs/evidence/scenarios/scenario-manifest.yaml` (footnote entry)
- Evidence capture template: `docs/evidence/scenarios/complete-failure-bundle/run-notes.md`
- Related runbooks: `RB-009-mongodb-down.md`, `RB-007-network-block.md`, `RB-010-service-mismatch.md`

## Execution Boundary

SRE Agent portal evidence for the complete-failure-bundle guided recovery session is **`PENDING_HUMAN_PORTAL`**. See `docs/evidence/scenarios/complete-failure-bundle/run-notes.md` for the evidence capture template and blocker notes format. Lambert validates safe-language compliance; Dallas approves before external/customer presentation.
