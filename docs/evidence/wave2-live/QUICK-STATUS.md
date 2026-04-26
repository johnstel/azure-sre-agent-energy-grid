# Wave 2 Live Evidence - Quick Status

**Last Updated**: 2026-04-26T12:50:00Z
**Status**: ✅ KUBECTL EVIDENCE COMPLETE | ⏳ PENDING PORTAL

---

## TL;DR

| Scenario | Status | Verdict | Next Action |
|----------|--------|---------|-------------|
| **MongoDBDown** | ✅ Complete | ⚠️ PARTIAL PASS (NO_ALERT_FIRED) | SRE Agent portal |
| **ServiceMismatch** | ✅ Complete | ✅ PASS | SRE Agent portal |

**Demo Ready**: ⚠️ QUALIFIED GO (with limitations)
**Blocker**: None (all kubectl evidence captured and redacted)
**Pending**: SRE Agent portal capture (PENDING_HUMAN_PORTAL for John)

---

## MongoDBDown: ⚠️ PARTIAL PASS

✅ **Complete**:
- 16 kubectl evidence files (T0-T5, 134s total)
- Root cause validated: `replicas: 0` in T3-mongodb-deployment-yaml.txt
- Redaction complete (0 sensitive data)

⚠️ **Limitation**:
- Alert NO_ALERT_FIRED (automated execution too fast <90s for alert evaluation)
- Cannot claim alert firing timeline or traditional monitoring comparison

**Demo Claim**: "Cascading MongoDB failure -> meter-service crashloop. Current evidence proves the kubectl/root-cause path; this scenario is designed to test whether SRE Agent can diagnose the root cause faster than alert-based workflows. SRE Agent portal diagnosis remains pending human validation."

---

## ServiceMismatch: ✅ PASS

✅ **Complete**:
- 22 kubectl evidence files (T0-T5, 159s total)
- Root cause validated: selector `meter-service-v2` vs pod label `meter-service` → 0 endpoints
- NO_ALERT_FIRED is expected (silent failure - pods stay Running/Ready 2/2)
- Redaction complete (0 sensitive data)

**Demo Claim**: "Silent configuration failure. Selector mismatch causes 0 endpoints without any pod crashes. Traditional monitoring (crashloop/OOM/restart alerts) stays silent. This scenario is designed to test whether SRE Agent can detect configuration drift that monitoring misses. SRE Agent portal diagnosis remains pending human validation."

---

## Pending Work

1. **SRE Agent Portal Capture** (CRITICAL for demo value prop):
   - MongoDBDown: Ask "Why are pods crashing in the energy namespace?"
   - ServiceMismatch: Ask "Smart meter data isn't being processed - what's wrong?"
   - Screenshot diagnosis output with timestamp
   - Checklist: `docs/evidence/wave2-live/{scenario}/sre-agent/HUMAN-ACTION-CHECKLIST.md`

2. **KQL Evidence** (OPTIONAL):
   - Requires Azure Portal Log Analytics workspace access
   - Nice-to-have, not critical for demo
   - kubectl evidence is sufficient

---

## Evidence Files

```
docs/evidence/wave2-live/
├── mongodb-down/
│   ├── kubectl-output/ (16 files, redacted)
│   ├── alert-firing-history.json (NO_ALERT_FIRED)
│   ├── metrics/mttr-summary.yaml (N/A for automated)
│   └── EVIDENCE-STATUS-FINAL.md (⚠️ PARTIAL PASS)
│
├── service-mismatch/
│   ├── kubectl-output/ (22 files, redacted)
│   ├── alert-firing-history.json (NO_ALERT_FIRED - expected)
│   ├── metrics/mttr-summary.yaml (N/A for automated)
│   └── EVIDENCE-STATUS-FINAL.md (✅ PASS)
│
└── WAVE2-GATE-SUMMARY-LAMBERT.md (⚠️ QUALIFIED GO)
```

---

## GO/NO-GO for John

**GO if**:
- ✅ Accept ServiceMismatch as primary silent failure demo
- ✅ Accept MongoDBDown NO_ALERT_FIRED with honest rapid-execution narrative
- ✅ Plan to capture SRE Agent portal evidence before customer demo

**NO-GO if**:
- ❌ Need alert firing proof for MongoDBDown (requires 5-min soak re-execution)
- ❌ Need KQL evidence for complete investigation (requires workspace access)
- ❌ Cannot accept N/A for MTTR (requires SRE Agent portal testing)

---

**Parker Status**: Standing by for portal evidence integration
**Next Milestone**: John tests SRE Agent portal → Wave 2 FULL COMPLETE
