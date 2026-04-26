# Wave 2 Alert Firing Evidence — Quick Reference

> **TL;DR**: Use Azure Resource Graph CLI to prove alerts fire. No Bicep changes needed for Wave 2.0.

---

## The Gap (Wave 1)

✅ **Activity Log export**: Correctly configured
✅ **alert-history.kql**: Queries alert **rule config changes** (create/update/delete)
❌ **Alert firing events**: NOT in Activity Log — Activity Log "Alert" category ≠ firing events

**Wave 1 verdict**: Accepted as known limitation, documented in KQL README.

---

## The Fix (Wave 2.0)

### Azure Resource Graph Query

**Command**:
```bash
az graph query -q "alertsmanagementresources | where type == 'microsoft.alertsmanagement/alerts' | where properties.essentials.startDateTime >= ago(24h)"
```

**Helper Script**:
```bash
# Query and save to file
./scripts/get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/alert-firing-history.json

# Filter to resource group
./scripts/get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 1
```

**Evidence File**: `docs/evidence/wave2-live/alert-firing-history.json`

---

## Gate Criteria (Wave 2)

- [ ] Alert name matches deployed rule (e.g., `alert-gridmon-dev-crashloop-oom`)
- [ ] Alert fired within 2 minutes of scenario deployment
- [ ] Evidence persists after `kubectl delete -f k8s/scenarios/oom-killed.yaml`
- [ ] At least 1 firing event for OOMKilled scenario
- [ ] JSON output saved

---

## Wave 2.1+ (Optional)

**Only implement if**:
- Azure Resource Graph insufficient for customer demos
- KQL correlation with KubeEvents/AppInsights needed for SRE Agent
- Alert retention beyond 30 days required
- Wave 3+ runbook automation needs KQL queries

**Implementation**: Add diagnostic settings to alert rules → `AlertEvidence` table
**Effort**: 4-6 hours (Bicep changes + validation)
**Plan**: See `docs/evidence/wave2-alert-firing-evidence-plan.md`

---

## Files Created

| File | Purpose | Size |
|------|---------|------|
| `docs/evidence/wave2-alert-firing-evidence-plan.md` | Full architecture decision + implementation plan | 13 KB |
| `scripts/get-alert-firing-history.ps1` | Azure Resource Graph helper script | 3.9 KB |
| `.squad/decisions/inbox/ripley-wave2-alert-firing.md` | Decision record for Dallas review | 7 KB |
| `docs/evidence/wave2-alert-firing-quick-ref.md` | This file | — |

**Docs Updated**:
- `docs/evidence/kql/README.md` — Added §Wave 2 Alert Firing Evidence section
- `docs/evidence/ALERT-KQL-MAPPING.md` — Updated Wave 2+ next steps

---

## Key Advantages

✅ **Zero Bicep changes** — No deployment risk
✅ **Immediate availability** — No diagnostic settings lag
✅ **Evidence persists** — Survives scenario cleanup
✅ **Customer-presentable** — CLI command for demo runbooks
✅ **Extensible** — Can add diagnostic settings later if needed

---

## Decision ID

**ID**: `WAVE2-ALERT-FIRING-001`
**Owner**: Ripley (Infra Dev)
**Status**: Proposed, awaiting Dallas architecture review
**Risk**: **LOW** (read-only query, no infrastructure changes)

---

**Next**: Dallas review → Parker UAT integration → Lambert gate validation
