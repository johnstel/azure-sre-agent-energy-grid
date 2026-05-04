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
| `service-mismatch_before.png` | 🟡 PLACEHOLDER | Watermarked reference image — replace with real capture |
| `service-mismatch_failure.png` | 🟡 PLACEHOLDER | Watermarked reference image — replace with real capture |
| `service-mismatch_sre-agent-diagnosis.png` | ⏳ PENDING PORTAL EVIDENCE | Real SRE Agent portal response only; current file is watermarked placeholder |
| `service-mismatch_after-fix.png` | 🟡 PLACEHOLDER | Watermarked reference image — replace with real capture |

Placeholder PNGs (1280×720) committed in `docs/evidence/screenshots/` as reference style
examples. Each file carries a visible **PLACEHOLDER** or **PENDING PORTAL EVIDENCE** watermark
and must be replaced before external/customer presentation.

**Note**: This is a silent failure — `failure.png` should show pods in `Running/Ready` state
while `kubectl get endpoints meter-service -n energy` shows `<none>`. This is the key visual
proof of the traditional-monitoring blind spot.

Automated kubectl evidence for this scenario is complete in
`docs/evidence/wave2-live/service-mismatch/kubectl-output/` and can be referenced
to frame what the screenshots must corroborate.

## Capture checklist

Follow `docs/evidence/screenshots/README.md` and
`docs/evidence/wave2-live/service-mismatch/sre-agent/HUMAN-ACTION-CHECKLIST.md`.

- [ ] Lab deployed in supported SRE Agent Preview region
- [ ] John has https://aka.ms/sreagent/portal access
- [ ] `service-mismatch_before.png` captured and redacted
- [ ] `service-mismatch_failure.png` captured and redacted (shows pods healthy, endpoints empty)
- [ ] `service-mismatch_sre-agent-diagnosis.png` captured — real portal response only
- [ ] `service-mismatch_after-fix.png` captured and redacted
- [ ] Run notes updated in `docs/evidence/wave2-live/service-mismatch/checklist.md`
- [ ] Lambert reviewed screenshots for safe-language compliance
- [ ] Vasquez reviewed for demo framing
- [ ] Dallas approved for external/customer use
