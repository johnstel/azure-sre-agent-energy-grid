# SRE Agent API Rollout Tracker

This lab deploys Azure SRE Agent with the latest documented GA ARM API, `Microsoft.App/agents@2026-01-01`, and `upgradeChannel: 'Stable'`. It does not fall back to the legacy preview API.

## Current status

As of the latest check on May 7, 2026, live provider metadata for `Microsoft.App/agents` in the demo subscription lists only:

```text
2025-05-01-preview
```

That blocks SRE Agent deployment in this subscription. The Bicep module remains pinned to `2026-01-01`; `scripts/deploy.ps1` skips SRE Agent instead of deploying `2025-05-01-preview`.

## Rollout gates

1. Provider metadata lists `Microsoft.App/agents@2026-01-01`.
2. Deployment validation succeeds with the checked-in `2026-01-01` module.
3. Deployment what-if succeeds and shows no replacement or delete for any existing SRE Agent resource.
4. Dallas/Lambert owners confirm go/no-go before customer demo use.

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

## Validation procedure after provider exposure

1. Run `.\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2`.
2. Run the normal deployment validation path used for the demo environment.
3. Capture live portal evidence before making customer-facing claims about SRE Agent diagnosis behavior.

Until provider metadata exposes `2026-01-01`, keep customer-facing language explicit: Azure SRE Agent is GA, the lab is pinned to the GA ARM API, and the deploy script skips SRE Agent in subscriptions that expose only preview provider metadata.
