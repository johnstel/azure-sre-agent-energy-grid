# Screenshot Evidence Pack

> **Status:** No reference screenshots are committed yet. Do not fabricate portal output, terminal output, or SRE Agent responses. Capture real screenshots from a live lab run only, then redact them before committing.

This folder stores visual evidence for the core demo scenarios:

- `oom-killed`
- `mongodb-down`
- `service-mismatch`

## Required Core Set

Each scenario should have the same four-step visual story:

| Step | Required file name | What it must show |
|------|--------------------|-------------------|
| Healthy baseline | `{scenario}_before.png` | Healthy pod or service state before the break |
| Failure visible | `{scenario}_failure.png` | Broken state in kubectl, Azure Portal, Grafana, or Mission Control |
| SRE Agent diagnosis | `{scenario}_sre-agent-diagnosis.png` | Real SRE Agent portal diagnosis only |
| Recovery | `{scenario}_after-fix.png` | Restored healthy state after operator-applied remediation |

Example:

```text
oom-killed_before.png
oom-killed_failure.png
oom-killed_sre-agent-diagnosis.png
oom-killed_after-fix.png
```

## Capture Session Checklist

Use this checklist for issue #45 capture sessions. Capture only real output from a live lab or a timestamped prior run; do not create visual placeholders.

### Before capture

- [ ] Confirm the lab is deployed in a supported SRE Agent Preview region.
- [ ] Confirm John/demo operator can open the Azure SRE Agent portal from <https://aka.ms/sreagent/portal>.
- [ ] Confirm the target scenario is restored to healthy state before starting.
- [ ] Open `docs/DEMO-RUNBOOK.md` Step 4 and the scenario prompt list.
- [ ] Prepare a redaction pass before committing any image.

### Per scenario

Repeat for `oom-killed`, `mongodb-down`, and `service-mismatch`:

1. Capture healthy baseline as `{scenario}_before.png`.
2. Inject the scenario and capture visible failure as `{scenario}_failure.png`.
3. Submit the approved prompt in the real Azure SRE Agent portal.
4. Capture the visible portal diagnosis as `{scenario}_sre-agent-diagnosis.png`, only if the portal returns a real response.
5. If the Preview portal exposes an action proposal or approval UI, capture exactly what is visible as `{scenario}_proposal.png`; otherwise do not create this file and use the wording **agent recommends, operator executes**.
6. Apply the recovery from an authorized operator shell and capture `{scenario}_after-fix.png`.
7. Record run notes, including the portal availability status and whether Dallas has approved the images for external use.

### Blocker note template

If live portal capture is unavailable, add this text to the scenario run notes instead of adding a placeholder image:

```text
PENDING PORTAL EVIDENCE — do not present as captured.
Blocker: <portal unavailable | no live lab | auth/RBAC issue | SRE Agent resource missing | other>.
Scenario: <oom-killed | mongodb-down | service-mismatch>.
Required next action: John/demo operator must capture real, redacted Azure SRE Agent portal diagnosis and recovery screenshots, then request Lambert/Vasquez review and Dallas external-use approval.
```

## Redaction Rules

Before committing screenshots:

- Mask subscription IDs, tenant IDs, object IDs, email addresses, IPs that identify a private environment, access tokens, connection strings, and customer data.
- Preserve enough context to prove the scenario, timestamp, resource type, namespace, and diagnosis path.
- Prefer cropped screenshots over heavy blurring when possible.
- If annotation is needed, use arrows or boxes that do not obscure the evidence.

## Placeholder Policy

Do not create placeholder screenshots for customer use.

If a document needs to reserve a slot for a future SRE Agent portal capture, use text only and mark it:

```text
PENDING PORTAL EVIDENCE — do not present as captured
```

Any real SRE Agent portal screenshot must come from a live environment or timestamped prior run. If portal access is unavailable, record that as a blocker and request a capture session.

## Mission Control Boundary

Mission Control Ask Copilot is a local/read-only analyst surface. Screenshots from Mission Control may illustrate local triage context, but they must not be labeled as Azure SRE Agent portal evidence.
