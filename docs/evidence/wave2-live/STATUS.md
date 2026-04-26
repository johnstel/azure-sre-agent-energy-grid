# Wave 2 Live Status Tracker

**Last Updated**: 2026-04-26T13:00:00Z
**Current Phase**: 🟡 `PASS_WITH_PENDING_HUMAN_PORTAL`
**Gate Verdict**: Automated evidence complete; SRE Agent portal evidence pending.

This file supersedes the earlier cluster-availability preparation tracker. The detailed gate summary is `docs/evidence/wave2-live/WAVE2-GATE-SUMMARY-LAMBERT.md`.

---

## Real-Time Status

| Component | Owner | Status | Next Action |
|-----------|-------|--------|-------------|
| **Infrastructure readiness** | Ripley | ✅ Complete | Re-check before any live customer demo |
| **MongoDBDown execution** | Parker | ⚠️ Partial pass | Use honest `NO_ALERT_FIRED` narrative or rerun with alert soak if alert proof is required |
| **ServiceMismatch execution** | Parker | ✅ Pass | Use as primary silent-failure scenario |
| **Evidence validation** | Lambert | ✅ Complete | Gate verdict issued: `PASS_WITH_PENDING_HUMAN_PORTAL` |
| **SRE Agent portal evidence** | John | ⏳ Critical pending | Capture real portal diagnosis for MongoDBDown and ServiceMismatch |

---

## Wave 2 Gate Verdict

**Status**: 🟡 `PASS_WITH_PENDING_HUMAN_PORTAL`

Wave 2 automated evidence collection is complete:

- ✅ MongoDBDown kubectl/root-cause evidence captured: MongoDB deployment scaled to `replicas: 0`.
- ⚠️ MongoDBDown alert evidence is `NO_ALERT_FIRED` because the automated run was too short for alert evaluation windows.
- ✅ ServiceMismatch clean deterministic rerun passed: Service selector `meter-service-v2` did not match pod label `meter-service`, endpoints went empty, pods stayed Running/Ready.
- ✅ ServiceMismatch `NO_ALERT_FIRED` is expected and demonstrates a pod-health alert blind spot.
- ✅ Redaction complete for captured kubectl evidence.
- ✅ Safe-language review completed.

---

## Pending Human Portal Validation

The following are required before customer-facing claims that Azure SRE Agent diagnosed these scenarios:

1. **MongoDBDown**
   - Ask the prepared portal prompt.
   - Capture whether SRE Agent traces symptoms to MongoDB scaled to `replicas: 0`.
   - Save exact screenshot/transcript and timestamp.

2. **ServiceMismatch**
   - Ask the prepared portal prompt.
   - Capture whether SRE Agent identifies empty endpoints and selector/label mismatch.
   - Save exact screenshot/transcript and timestamp.

3. **Redaction**
   - Remove subscription IDs, tenant IDs, full resource IDs, principal IDs, user identifiers, IPs, node names, and any sensitive values.

---

## Optional Evidence Upgrades

| Upgrade | When needed | Safe statement until captured |
|---------|-------------|-------------------------------|
| MongoDBDown alert soak | If the customer requires alert firing proof | “The rapid automated run did not fire alerts; alert proof requires a longer soak and alert-management evidence.” |
| Live KQL output | If the customer requires log-query proof beyond kubectl evidence | “KQL evidence is optional/pending and must not be claimed until captured.” |
| SRE Agent portal screenshots | Required for full customer-facing SRE Agent diagnosis claims | “Portal validation is pending.” |

---

## Customer-Safe Statement

> “Wave 2 proved two incident patterns with live kubectl evidence: MongoDBDown as a cascading dependency failure and ServiceMismatch as a silent selector/endpoints failure. The package remains `PASS_WITH_PENDING_HUMAN_PORTAL` until real Azure SRE Agent portal diagnosis evidence is captured.”
