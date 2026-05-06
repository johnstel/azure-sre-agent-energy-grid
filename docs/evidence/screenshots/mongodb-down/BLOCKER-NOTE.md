# Screenshot Blocker Note — MongoDBDown

```
PENDING PORTAL EVIDENCE — do not present as captured.
Blocker: live lab and portal capture required.
Scenario: mongodb-down.
Required next action: John/demo operator must deploy a live lab in eastus2/swedencentral/australiaeast,
inject k8s/scenarios/mongodb-down.yaml, capture real, redacted Azure SRE Agent portal diagnosis and
recovery screenshots, then request Lambert/Vasquez review and Dallas external-use approval.
```

## Files required for this scenario

| File | Status | Notes |
|------|--------|-------|
| `mongodb-down_before.png` | ✅ REFERENCE PNG COMMITTED | Rendered from committed live kubectl baseline evidence |
| `mongodb-down_failure.png` | ✅ REFERENCE PNG COMMITTED | Rendered from committed live kubectl MongoDB outage evidence |
| `mongodb-down_sre-agent-diagnosis.png` | ⚠️ BLOCKER CARD COMMITTED | Watermarked placeholder; replace with real SRE Agent portal response only |
| `mongodb-down_after-fix.png` | ✅ REFERENCE PNG COMMITTED | Rendered from committed live kubectl recovery evidence |

Automated kubectl evidence for this scenario is complete in
`docs/evidence/wave2-live/mongodb-down/kubectl-output/` and can be referenced
to frame what the screenshots must corroborate.

## Capture checklist

Follow `docs/evidence/screenshots/README.md` and
`docs/evidence/wave2-live/mongodb-down/sre-agent/HUMAN-ACTION-CHECKLIST.md`.

- [ ] Lab deployed in supported SRE Agent Preview region
- [ ] John has https://aka.ms/sreagent/portal access
- [x] `mongodb-down_before.png` reference visual committed from redacted kubectl evidence
- [x] `mongodb-down_failure.png` reference visual committed from redacted kubectl evidence (shows MongoDB 0/0 replicas and cascading failure)
- [ ] `mongodb-down_sre-agent-diagnosis.png` captured — real portal response only
- [x] `mongodb-down_after-fix.png` reference visual committed from redacted kubectl evidence
- [ ] Run notes updated in `docs/evidence/wave2-live/mongodb-down/checklist.md`
- [ ] Lambert reviewed screenshots for safe-language compliance
- [ ] Vasquez reviewed for demo framing
- [ ] Dallas approved for external/customer use
