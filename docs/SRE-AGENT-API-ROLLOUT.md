# SRE Agent API Rollout Tracker

This lab deploys Azure SRE Agent with `Microsoft.App/agents@2025-05-01-preview` until the active subscription exposes and validates the `2026-01-01` API version.

## Current status

As of the latest issue #51 check, live provider metadata for `Microsoft.App/agents` in the demo subscription lists only:

```text
2025-05-01-preview
```

That blocks the Bicep upgrade. Do not edit `infra/bicep/modules/sre-agent.bicep` to `2026-01-01` until all rollout gates below pass.

## Rollout gates

1. Provider metadata lists `Microsoft.App/agents@2026-01-01`.
2. Deployment validation succeeds with a temporary `2026-01-01` candidate module.
3. Deployment what-if succeeds and shows no replacement or delete for the existing SRE Agent resource.
4. Dallas/Lambert owners confirm go/no-go before merge and deployment.

Run the gate script from the repo root:

```powershell
.\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2
```

For a metadata-only check:

```powershell
.\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2 -MetadataOnly
```

Exit codes are:

| Code | Meaning |
|------|---------|
| `0` | Requested gates passed |
| `1` | Script, validation, or what-if failed |
| `2` | Provider metadata does not expose the target API version yet |

## Upgrade procedure after gates pass

1. Update `infra/bicep/modules/sre-agent.bicep` from `Microsoft.App/agents@2025-05-01-preview` to `Microsoft.App/agents@2026-01-01`.
2. Remove the `#disable-next-line BCP081` suppression only if the local Bicep compiler recognizes the GA type.
3. Run `.\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2`.
4. Run the normal deployment validation path used for the demo environment.
5. Update customer-facing status language in `README.md`, `docs/SRE-AGENT-SETUP.md`, and `docs/SAFE-LANGUAGE-GUARDRAILS.md`.

Until this procedure completes, keep customer-facing language explicit: Azure SRE Agent is GA, but this lab remains pinned to the preview ARM API version because this subscription has not exposed the GA resource API.
