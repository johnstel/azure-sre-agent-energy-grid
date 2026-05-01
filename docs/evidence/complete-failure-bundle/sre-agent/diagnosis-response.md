# SRE Agent Diagnosis Response — Complete Failure Bundle

**Status**: ⏳ PENDING_HUMAN_CAPTURE — fill this during the live run.
**Issue**: #48 (supporting #37)
**Operator**: *(John or designated demo operator)*

> **Instructions**: Paste the full, unparaphrased SRE Agent portal response for each prompt below.
> Do **not** paraphrase, summarise, or infer. Record exactly what the portal shows.
> If the portal is unavailable or does not return a usable response, skip to the Blockers section
> and record explicit blocker notes per the template in `docs/evidence/screenshots/README.md`.

---

## Prompt 1 — Initial Triage

**Timestamp (UTC)**: *(fill in)*
**Exact prompt used**:
```
The energy grid platform is experiencing a broad outage.
Multiple services are failing in the energy namespace.
Can you investigate and tell me what's wrong?
```

**SRE Agent response (verbatim)**:
```
[PASTE FULL RESPONSE HERE — do not paraphrase]
```

**Root-cause coverage assessment**:
- [ ] Agent identified MongoDB scaled to `replicas: 0`
- [ ] Agent identified `NetworkPolicy/deny-meter-service`
- [ ] Agent identified service selector mismatch (`app: meter-service-v2`)
- [ ] Agent identified downstream symptoms (dispatch-service, grid-dashboard degradation)
- [ ] Agent did **not** confuse symptoms with root causes

**Result**: ☐ PASS &nbsp; ☐ PARTIAL &nbsp; ☐ FAIL &nbsp; ☐ N/A (portal unavailable)

**Justification**:
> *(one sentence)*

---

## Prompt 2 — Dependency Separation

**Timestamp (UTC)**: *(fill in)*
**Exact prompt used**:
```
Separate root cause from downstream symptoms across services in the energy namespace
```

**SRE Agent response (verbatim)**:
```
[PASTE FULL RESPONSE HERE — do not paraphrase]
```

**Assessment**:
- [ ] Agent separated upstream root causes from downstream symptoms
- [ ] Agent listed a dependency chain (MongoDB → dispatch-service → dashboard)

**Result**: ☐ PASS &nbsp; ☐ PARTIAL &nbsp; ☐ FAIL &nbsp; ☐ N/A

---

## Prompt 3 — Recovery Planning

**Timestamp (UTC)**: *(fill in)*
**Exact prompt used**:
```
Recommend a prioritized recovery plan with dependencies first
```

**SRE Agent response (verbatim)**:
```
[PASTE FULL RESPONSE HERE — do not paraphrase]
```

**Assessment**:
- [ ] Agent recommended restoring data layer (MongoDB) first
- [ ] Agent recommended fixing routing/network isolation before restarting dependent services
- [ ] Agent used safe language: **agent recommends; operator executes** (no claim of autonomous action)

**Result**: ☐ PASS &nbsp; ☐ PARTIAL &nbsp; ☐ FAIL &nbsp; ☐ N/A

---

## Prompt 4 — Post-Recovery Verification

**Timestamp (UTC)**: *(fill in)*
**Exact prompt used**:
```
Verify that meter-service endpoints, MongoDB availability, and network access are all healthy
```

**SRE Agent response (verbatim)**:
```
[PASTE FULL RESPONSE HERE — do not paraphrase]
```

**Assessment**:
- [ ] Agent confirmed meter-service endpoints are populated
- [ ] Agent confirmed MongoDB `READY 1/1`
- [ ] Agent confirmed `deny-meter-service` NetworkPolicy is absent

**Result**: ☐ PASS &nbsp; ☐ PARTIAL &nbsp; ☐ FAIL &nbsp; ☐ N/A

---

## Proposal / Approval UI

> If the SRE Agent portal exposed a recommendation or approval UI at any point, record it here.
> If no approval UI was visible, leave this section blank — do **not** fabricate it.

**Approval UI visible?** ☐ Yes &nbsp; ☐ No

If yes, describe exactly what was shown:
```
[DESCRIBE EXACTLY]
```

Screenshot reference: `sre-agent/screenshots/proposal.png` *(if captured)*

---

## Blockers

> If the portal was unavailable or did not return a usable response, document here.
> Use the safe-language template from `docs/evidence/screenshots/README.md`.

```
PENDING PORTAL EVIDENCE — do not present as captured.
Blocker: <portal unavailable | no live lab | auth/RBAC issue | SRE Agent resource missing | other>.
Scenario: complete-failure-bundle.
Required next action: John/demo operator must resolve the blocker and rerun the capture session.
```

---

## Overall Diagnosis Quality

| Criterion | Result |
|-----------|--------|
| Root causes correctly identified | ☐ PASS / ☐ PARTIAL / ☐ FAIL / ☐ N/A |
| Symptoms separated from root causes | ☐ PASS / ☐ PARTIAL / ☐ FAIL / ☐ N/A |
| Recovery sequence prioritised correctly | ☐ PASS / ☐ PARTIAL / ☐ FAIL / ☐ N/A |
| Post-recovery verification provided | ☐ PASS / ☐ PARTIAL / ☐ FAIL / ☐ N/A |
| Safe language maintained throughout | ☐ PASS / ☐ FAIL |

**Overall result**: ☐ PASS &nbsp; ☐ PARTIAL &nbsp; ☐ FAIL &nbsp; ☐ BLOCKED

**Operator signature**: ___________________
**Date**: ___________________
