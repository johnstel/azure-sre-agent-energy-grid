# Wave 1 Live UAT — Current Status

**Last Updated**: 2026-04-26
**Overall Status**: 🟢 `CLOSED_WITH_PENDING_HUMAN_PORTAL`

This file supersedes the earlier cluster-health blocker tracker. The authoritative detailed verdict is `docs/evidence/wave1-live/WAVE1-FINAL-VERDICT.md`.

---

## Scenario Status

| Scenario | Automated evidence | Portal evidence | Verdict |
|----------|--------------------|-----------------|---------|
| **OOMKilled** | ✅ Complete | ⏳ `PENDING_HUMAN_PORTAL` | 🟢 `CLOSED_WITH_PENDING_HUMAN_PORTAL` |

Wave 1 now has successful OOMKilled rerun evidence with Container Insights active:

- kubectl T0-T5 evidence complete.
- MTTR measured at **147 seconds** against the 900-second threshold.
- KQL evidence accepted as partial 2/3: OOMKilled and pod lifecycle signals passed.
- `alert-history` remains a known non-critical limitation because Activity Log shows alert rule activity, not alert firing history.
- Evidence redaction is complete.

---

## Remaining Human Action

Capture real Azure SRE Agent portal evidence before customer-facing claims that SRE Agent diagnosed the OOMKilled scenario:

1. Use `docs/evidence/wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md`.
2. Ask the prepared OOMKilled diagnosis prompt in the Azure SRE Agent portal.
3. Save the real screenshot/transcript with timestamp.
4. Redact subscription IDs, tenant IDs, resource IDs, principal IDs, user identifiers, IPs, node names, and any sensitive values.
5. Record whether the portal identified OOMKilled and the low memory limit; do not infer or rewrite the response.

---

## Customer-Safe Statement

> “Wave 1 proved the OOMKilled scenario through kubectl/KQL evidence and a 147-second scenario recovery duration. Azure SRE Agent portal diagnosis remains pending human validation.”
