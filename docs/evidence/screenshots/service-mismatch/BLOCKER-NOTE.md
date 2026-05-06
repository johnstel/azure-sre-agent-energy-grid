# Screenshot Blocker Note — ServiceMismatch

```
PENDING PORTAL EVIDENCE — do not present as captured.
Blocker: live lab and portal capture required.
Scenario: service-mismatch.
Required next action: John/demo operator must deploy a live lab in eastus2/swedencentral/australiaeast,
inject k8s/scenarios/service-mismatch.yaml, capture real, redacted Azure SRE Agent portal diagnosis and
recovery screenshots, then request Lambert/Vasquez review and Dallas external-use approval.
```

## Files required for this scenario

| File | Status | Notes |
|------|--------|-------|
| `service-mismatch_before.png` | ✅ REFERENCE PNG COMMITTED | Rendered from committed live kubectl baseline evidence |
| `service-mismatch_failure.png` | ✅ REFERENCE PNG COMMITTED | Rendered from committed live kubectl empty-endpoints evidence |
| `service-mismatch_sre-agent-diagnosis.png` | ⚠️ BLOCKER CARD COMMITTED | Watermarked placeholder; replace with real SRE Agent portal response only |
| `service-mismatch_after-fix.png` | ✅ REFERENCE PNG COMMITTED | Rendered from committed live kubectl recovery evidence |

Automated kubectl evidence for this scenario is complete in
`docs/evidence/wave2-live/service-mismatch/kubectl-output/` and can be referenced
to frame what the screenshots must corroborate.

**Note**: This is a silent failure — `failure.png` should show pods in `Running/Ready` state
while `kubectl get endpoints meter-service -n energy` shows `<none>`. This is the key visual
proof of the traditional-monitoring blind spot.

## Capture checklist

Follow `docs/evidence/screenshots/README.md` and
`docs/evidence/wave2-live/service-mismatch/sre-agent/HUMAN-ACTION-CHECKLIST.md`.

- [ ] Lab deployed in supported SRE Agent Preview region
- [ ] John has https://aka.ms/sreagent/portal access
- [x] `service-mismatch_before.png` reference visual committed from redacted kubectl evidence
- [x] `service-mismatch_failure.png` reference visual committed from redacted kubectl evidence (shows pods healthy, endpoints empty)
- [ ] `service-mismatch_sre-agent-diagnosis.png` captured — real portal response only
- [x] `service-mismatch_after-fix.png` reference visual committed from redacted kubectl evidence
- [ ] Run notes updated in `docs/evidence/wave2-live/service-mismatch/checklist.md`
- [ ] Lambert reviewed screenshots for safe-language compliance
- [ ] Vasquez reviewed for demo framing
- [ ] Dallas approved for external/customer use
