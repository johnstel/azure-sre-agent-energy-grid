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
| `mongodb-down_before.png` | ⏳ PENDING | Healthy pod state before scenario injection |
| `mongodb-down_failure.png` | ⏳ PENDING | MongoDB scaled to 0 replicas, cascading dispatch failure visible |
| `mongodb-down_sre-agent-diagnosis.png` | ⏳ PENDING | Real SRE Agent portal response only |
| `mongodb-down_after-fix.png` | ⏳ PENDING | Pods restored to Running/Ready, MongoDB endpoint active |

Automated kubectl evidence for this scenario is complete in
`docs/evidence/wave2-live/mongodb-down/kubectl-output/` and can be referenced
to frame what the screenshots must corroborate.

## Capture checklist

Follow `docs/evidence/screenshots/README.md` and
`docs/evidence/wave2-live/mongodb-down/sre-agent/HUMAN-ACTION-CHECKLIST.md`.

- [ ] Lab deployed in supported SRE Agent Preview region
- [ ] John has https://aka.ms/sreagent/portal access
- [ ] `mongodb-down_before.png` captured and redacted
- [ ] `mongodb-down_failure.png` captured and redacted (shows MongoDB 0/0 replicas and cascading failure)
- [ ] `mongodb-down_sre-agent-diagnosis.png` captured — real portal response only
- [ ] `mongodb-down_after-fix.png` captured and redacted
- [ ] Run notes updated in `docs/evidence/wave2-live/mongodb-down/checklist.md`
- [ ] Lambert reviewed screenshots for safe-language compliance
- [ ] Vasquez reviewed for demo framing
- [ ] Dallas approved for external/customer use
