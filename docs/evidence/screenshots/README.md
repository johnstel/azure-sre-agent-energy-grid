# Screenshot Evidence Pack

> **Status:** Core reference PNGs are committed for OOMKilled, MongoDBDown, and ServiceMismatch. Terminal-style reference visuals are rendered from committed live kubectl evidence; SRE Agent diagnosis slots are visibly watermarked blocker cards until real portal captures replace them.

This folder stores visual evidence for the core demo scenarios:

- `oom-killed`
- `mongodb-down`
- `service-mismatch`

## Required Core Set

Each scenario should have the same four-step visual story:

| Step | Required file name | What it must show |
|------|--------------------|-------------------|
| Healthy baseline | `{scenario}_before.png` | Healthy pod or service state before the break, rendered from committed live kubectl evidence or captured live |
| Failure visible | `{scenario}_failure.png` | Broken state in kubectl, Azure Portal, Grafana, Mission Control, or a redacted rendering of committed live kubectl evidence |
| SRE Agent diagnosis | `{scenario}_sre-agent-diagnosis.png` | Real SRE Agent portal diagnosis, or a blocker card visibly watermarked `PENDING PORTAL EVIDENCE — do not present as captured` |
| Recovery | `{scenario}_after-fix.png` | Restored healthy state after operator-applied remediation, rendered from committed live kubectl evidence or captured live |

Example:

```text
oom-killed_before.png
oom-killed_failure.png
oom-killed_sre-agent-diagnosis.png
oom-killed_after-fix.png
```

## Committed Reference Set

The current PNG set covers the three core demos requested for issue #38:

| Scenario | Reference visuals committed | Source evidence |
|----------|-----------------------------|-----------------|
| OOMKilled | `before`, `failure`, `sre-agent-diagnosis`, `after-fix` | `docs/evidence/wave1-live/oom-killed/kubectl-output/` |
| MongoDBDown | `before`, `failure`, `sre-agent-diagnosis`, `after-fix` | `docs/evidence/wave2-live/mongodb-down/kubectl-output/` |
| ServiceMismatch | `before`, `failure`, `sre-agent-diagnosis`, `after-fix` | `docs/evidence/wave2-live/service-mismatch/kubectl-output/` |

The `before`, `failure`, and `after-fix` PNGs are redacted renderings of committed live kubectl evidence. The `sre-agent-diagnosis` PNGs are blocker cards only; replace them with real portal captures before presenting an SRE Agent diagnosis.

## Capture Session Checklist

Use this checklist for issue #45 capture sessions. Capture only real output from a live lab or a timestamped prior run. If a portal diagnosis is unavailable, keep the watermarked blocker card and do not present it as a real portal screenshot.

### Before capture

- [ ] Confirm the lab is deployed in a supported SRE Agent region.
- [ ] Confirm John/demo operator can open the Azure SRE Agent portal from <https://aka.ms/sreagent/portal>.
- [ ] Confirm the target scenario is restored to healthy state before starting.
- [ ] Open `docs/DEMO-RUNBOOK.md` Step 4 and the scenario prompt list.
- [ ] Prepare a redaction pass before committing any image.

### Per scenario

Repeat for `oom-killed`, `mongodb-down`, and `service-mismatch`:

1. Capture healthy baseline as `{scenario}_before.png`.
2. Inject the scenario and capture visible failure as `{scenario}_failure.png`.
3. Submit the approved prompt in the real Azure SRE Agent portal.
4. Capture the visible portal diagnosis as `{scenario}_sre-agent-diagnosis.png`, only if the portal returns a real response. Replace the blocker card when the real capture exists.
5. If the Preview portal exposes an action proposal or approval UI, capture exactly what is visible as `{scenario}_proposal.png`; otherwise do not create this file and use the wording **agent recommends, operator executes**.
6. Apply the recovery from an authorized operator shell and capture `{scenario}_after-fix.png`.
7. Record run notes, including the portal availability status and whether Dallas has approved the images for external use.

### Blocker note template

If live portal capture is unavailable, add this text to the scenario run notes and ensure any committed diagnosis-slot PNG is a watermarked blocker card, not a simulated portal response:

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

## Placeholder and Blocker Card Policy

Do not create placeholder screenshots for customer use, and do not simulate Azure SRE Agent portal output.

If a document or visual evidence pack needs to reserve a slot for a future SRE Agent portal capture, use text or a non-portal blocker card marked:

```text
PENDING PORTAL EVIDENCE — do not present as captured
```

Any real SRE Agent portal screenshot must come from a live environment or timestamped prior run. If portal access is unavailable, record that as a blocker and request a capture session. A blocker card is allowed only when it is visibly watermarked and clearly states that it is not captured portal evidence.

## Mission Control Boundary

Mission Control Ask Copilot is a local/read-only analyst surface. Screenshots from Mission Control may illustrate local triage context, but they must not be labeled as Azure SRE Agent portal evidence.
