# Complete Failure Bundle

This bundle demonstrates a broad energy grid application outage while preserving the demo-safe pattern: **SRE Agent recommends, operator executes**.

## Inject

```bash
kubectl apply -f k8s/scenarios/complete-failure-bundle/scenario.yaml
```

## Expected degraded signals

| Area | Command | Expected signal |
|------|---------|-----------------|
| Data layer | `kubectl get deployment mongodb -n energy` | MongoDB desired/ready replicas are `0/0` |
| Service routing | `kubectl get endpoints meter-service -n energy` | Endpoint list is empty |
| Network policy | `kubectl get networkpolicy deny-meter-service -n energy` | Deny policy exists |
| Blast radius | `kubectl get pods,svc,endpoints -n energy` | Pods, Services, and endpoints disagree |

## SRE Agent prompt chain

1. "Why is the entire energy grid platform down?"
2. "Separate root cause from downstream symptoms across services in the energy namespace"
3. "Recommend a prioritized recovery plan with dependencies first"
4. "After each recovery step, re-check health and tell me the next safest action"

## Operator recovery sequence

```bash
# Restore dependency and Service specs first.
kubectl apply -f k8s/base/application.yaml
kubectl get deployment mongodb -n energy
kubectl get endpoints meter-service -n energy

# Remove the extra NetworkPolicy that baseline apply does not prune.
kubectl delete networkpolicy deny-meter-service -n energy
kubectl get pods -n energy
kubectl get networkpolicy -n energy
```

Expected recovery evidence: MongoDB is `READY 1/1`, `meter-service` endpoints are populated, `deny-meter-service` is absent, and application pods are `Running` / `Ready`.

Record live portal output and screenshots in `docs/evidence/scenarios/complete-failure-bundle/run-notes.md`. If portal evidence is unavailable, mark the run as blocked instead of paraphrasing or fabricating SRE Agent output.
