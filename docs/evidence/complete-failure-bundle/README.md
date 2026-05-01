# Complete Failure Bundle — Evidence Package

**Issue**: #48 / #37
**Scenario**: `k8s/scenarios/complete-failure-bundle/scenario.yaml`
**Status**: ⏳ PENDING_HUMAN_CAPTURE — live lab run required

> **Azure SRE Agent is GA.** This lab currently uses `Microsoft.App/agents@2025-05-01-preview`
> because the active subscription provider metadata exposes only that API version.

---

## Scenario Summary

The complete-failure-bundle applies three simultaneous faults to the energy namespace:

1. **MongoDB scaled to 0 replicas** — dependency failure, cascading dispatch crash
2. **NetworkPolicy blocks all meter-service ingress/egress** — network isolation
3. **Service selector mismatch** — meter-service selector `app: meter-service-v2` ≠ pod label

Recovery requires three steps in order:

```bash
kubectl delete networkpolicy deny-meter-service -n energy
kubectl apply -f k8s/base/application.yaml
```

---

## Evidence Status

| Component | Status | Notes |
|-----------|--------|-------|
| kubectl T0-T5 | ⏳ PENDING | Requires live run |
| SRE Agent portal interaction | ⏳ PENDING_HUMAN_PORTAL | John must capture — cannot be automated |
| Operator recovery steps | ⏳ PENDING | Document each step with timestamp |
| Post-recovery validation | ⏳ PENDING | All pods Running/Ready, endpoints active |
| Redaction | ⏳ PENDING | Must complete before external/customer use |
| Lambert validation | ⏳ PENDING | Safe-language review required |
| Dallas approval | ⏳ PENDING | Required before external/customer presentation |

---

## Directory Structure

```
complete-failure-bundle/
├── README.md                          # This file
├── BLOCKER-NOTE.md                    # Explicit capture blocker
├── checklist.md                       # Pre/during/post capture checklist
├── run-notes.md                       # Execution notes template (fill during run)
├── kubectl-output/                    # T0-T5 kubectl evidence
│   └── .gitkeep
├── sre-agent/
│   ├── HUMAN-ACTION-CHECKLIST.md      # Step-by-step portal capture guide
│   ├── diagnosis-prompt.txt           # Exact prompt(s) to use
│   └── screenshots/                   # Real portal screenshots only
│       └── .gitkeep
└── metrics/
    └── .gitkeep
```

---

## Safe Language Requirement

Do NOT claim:
- ❌ "SRE Agent diagnosed the complete bundle"
- ❌ "SRE Agent autonomously recovered the cluster"
- ❌ Specific MTTR numbers unless measured from real portal timestamps

DO say:
- ✅ "The operator asked SRE Agent to investigate — here is what the portal showed"
- ✅ "Based on SRE Agent's recommendations, the operator applied the following recovery steps"
- ✅ "Agent recommends; operator executes"

See `docs/SAFE-LANGUAGE-GUARDRAILS.md` for the full guardrail table.
