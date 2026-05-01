# Complete Failure Bundle — Capture Blocker

```
PENDING PORTAL EVIDENCE — do not present as captured.
Blocker: live lab, complete-failure-bundle execution, and portal capture required.
Scenario: complete-failure-bundle.
Required next action: John/demo operator must deploy a live lab in eastus2/swedencentral/australiaeast,
inject k8s/scenarios/complete-failure-bundle/scenario.yaml, run the full SRE Agent guided recovery
session (see sre-agent/HUMAN-ACTION-CHECKLIST.md), capture and redact all evidence, then request
Lambert validation and Dallas approval before external/customer presentation.
```

## Evidence gap summary

| Evidence type | Gap | Who unblocks |
|---------------|-----|-------------|
| kubectl T0-T5 timeline | Not yet captured | John (live run) |
| SRE Agent portal interaction | Not yet captured | John (live lab + portal access) |
| Operator recovery sequence | Not yet documented | John (captured during run) |
| Post-recovery validation | Not yet captured | John (live run) |
| Redaction pass | Cannot start | John must capture first |
| Lambert validation | Cannot start | Capture must complete first |
| Dallas external-use approval | Cannot start | Full evidence package required |

## Blocker reason

This issue (#48) requires a complete guided recovery session with a live AKS cluster and real
Azure SRE Agent portal access. No scripted simulation, fabricated transcript, or placeholder
screenshot is acceptable as evidence. The capture session is estimated at 30-45 minutes.

See `sre-agent/HUMAN-ACTION-CHECKLIST.md` for the step-by-step operator guide.
