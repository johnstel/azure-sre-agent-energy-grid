# MTTR Model and Measured Evidence Summary

**Scope**: Azure SRE Agent Service capabilities only
**Status**: Measurement model complete; human/SRE Agent MTTR evidence pending
**Safe-language requirement**: Do not claim SRE Agent MTTR reduction until portal evidence exists.

---

## MTTR model used for the demo

For this demo repo, MTTR is modeled as the elapsed time from scenario injection to verified recovery:

```text
MTTR = detection time + diagnosis time + remediation time + recovery verification time
```

Where the evidence is automated and script-driven, the result is treated as **scenario execution duration**, not a human or SRE Agent diagnosis benchmark. Human/SRE Agent MTTR requires portal interaction evidence and timestamps.

---

## Supported measured result

| Scenario | Evidence status | Supported measured value | Threshold/reference | Interpretation |
|----------|-----------------|--------------------------|---------------------|----------------|
| OOMKilled | ✅ Measured in Wave 1 rerun | **147 seconds** | 900 seconds / 15 minutes | PASS against the scenario MTTR threshold |

**Evidence source**: `../wave1-live/WAVE1-FINAL-VERDICT.md`

Wave 1 states that the OOMKilled rerun timeline was:

- T0 baseline: 2026-04-26T03:41:03Z
- T1 injection: 2026-04-26T03:41:04Z
- T2 detection: 2026-04-26T03:42:27Z
- T3 diagnosis: 2026-04-26T03:42:29Z
- T4 fix: 2026-04-26T03:42:45Z
- T5 recovery: 2026-04-26T03:43:31Z
- Reported MTTR: **147 seconds**

Customer-safe statement:

> "For the OOMKilled scenario, the repo has supported kubectl/KQL evidence for a 147-second scenario recovery duration against a 15-minute threshold. SRE Agent portal diagnosis remains pending."

---

## Pending MTTR fields

| Scenario | Automated evidence | Human MTTR | SRE Agent-assisted MTTR | Status |
|----------|--------------------|------------|--------------------------|--------|
| OOMKilled | ✅ 147s supported from Wave 1 rerun | `PENDING_HUMAN_PORTAL` | `PENDING_HUMAN_PORTAL` | Portal evidence still required |
| MongoDBDown | ✅ Root cause proven by kubectl; rapid automated run | `PENDING_HUMAN_PORTAL` | `PENDING_HUMAN_PORTAL` | Do not use estimated values |
| ServiceMismatch | ✅ Root cause proven by kubectl; automated execution 159s | `PENDING_HUMAN_PORTAL` | `PENDING_HUMAN_PORTAL` | Do not use automated duration as human MTTR |

---

## Why Wave 2 MTTR is not claimed

### MongoDBDown

Wave 2 MongoDBDown has strong root-cause evidence: MongoDB was scaled to `replicas: 0`. However:

- the scenario was executed quickly in an automated capture path,
- alert firing did not occur in the rapid run,
- the evidence summary explicitly marks MTTR as not applicable for human response time,
- the SRE Agent portal interaction remains pending.

Customer-safe statement:

> "MongoDBDown is designed to test whether SRE Agent can trace a dependency failure from dispatch-service symptoms back to MongoDB scaled to zero. Human and SRE Agent MTTR are still pending portal validation."

### ServiceMismatch

Wave 2 ServiceMismatch has strong root-cause evidence: the Service selector targets `meter-service-v2` while pods are labeled `meter-service`. However:

- pods remain Running/Ready,
- alert silence is expected and documented,
- automated execution does not represent human diagnosis time,
- the SRE Agent portal interaction remains pending.

Customer-safe statement:

> "ServiceMismatch is designed to test whether SRE Agent can diagnose a silent configuration failure where pods are healthy but endpoints are empty. Human and SRE Agent MTTR are still pending portal validation."

---

## Claims to avoid

Do **not** claim:

- SRE Agent reduced MTTR by a specific percentage.
- SRE Agent diagnosed MongoDBDown, ServiceMismatch, or OOMKilled in the portal.
- Wave 2 has measured human or SRE Agent MTTR.
- The automated Wave 2 scenario duration is equivalent to human MTTR.
- Any customer production MTTR has been measured.
