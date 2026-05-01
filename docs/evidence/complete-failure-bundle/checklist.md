# Complete Failure Bundle — Pre/During/Post Capture Checklist

**Status**: ⏳ PENDING_HUMAN_CAPTURE
**Owner**: John (capture) + Lambert (validation) + Dallas (external-use approval)

---

## Pre-Capture

- [ ] Lab deployed in supported SRE Agent Preview region (eastus2 / swedencentral / australiaeast)
- [ ] All pods in `energy` namespace are `Running/Ready`
- [ ] `kubectl get endpoints -n energy` shows active endpoints for all services
- [ ] John has access to https://aka.ms/sreagent/portal
- [ ] SRE Agent resource confirmed deployed: `az resource list -g <rg> --resource-type Microsoft.App/agents`
- [ ] Operator terminal open with kubectl access
- [ ] `run-notes.md` open and ready to record timestamps

---

## During Capture

Follow `sre-agent/HUMAN-ACTION-CHECKLIST.md` step by step.

- [ ] T0: Healthy baseline captured (kubectl output)
- [ ] T1: Bundle applied (`kubectl apply -f k8s/scenarios/complete-failure-bundle/scenario.yaml`)
- [ ] T2: Degraded state captured (kubectl output, 60-90s after injection)
- [ ] T3: SRE Agent portal interaction completed (real portal, screenshots taken)
- [ ] T3: `sre-agent/diagnosis-response.md` filled with full, unparaphrased response
- [ ] T4: Operator recovery applied (NetworkPolicy deleted, `kubectl apply -f k8s/base/application.yaml`)
- [ ] T5: Recovery validation captured (kubectl output)

---

## Post-Capture

- [ ] All kubectl T0-T5 files saved to `kubectl-output/`
- [ ] All SRE Agent screenshots saved to `sre-agent/screenshots/`
- [ ] `run-notes.md` completed with timestamps and blockers
- [ ] `metrics/mttr-summary.yaml` filled
- [ ] Redaction pass complete (0 subscription IDs, tenant IDs, IPs, node names, secrets)
- [ ] Lambert notified for evidence validation
- [ ] Lambert signs off on safe-language compliance
- [ ] Vasquez reviews demo framing (advisory)
- [ ] Dallas approves for external/customer use before #37 / #48 closure
