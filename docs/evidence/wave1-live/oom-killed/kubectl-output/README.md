# kubectl Evidence Output

This directory contains raw kubectl command output captured during the OOMKilled scenario execution.

## Files

- `T0-baseline-pods.txt` — Healthy baseline pod state before scenario
- `T0-baseline-events.txt` — Baseline events before scenario
- `T1-scenario-applied.txt` — Pod state immediately after applying oom-killed.yaml
- `T2-meter-status.txt` — Meter-service pod status showing OOMKilled/CrashLoop
- `T2-oomkilled-events.txt` — Events showing OOMKilled reason
- `T3-describe-pod.txt` — Detailed pod description showing memory limits and Events
- `T3-previous-logs.txt` — Previous container logs (if available)
- `T4-restore-healthy.txt` — Pod state after applying fix (application.yaml)
- `T5-post-recovery-events.txt` — Events confirming recovery

## Redaction

All files have been redacted per policy:
- Subscription IDs → `<REDACTED_SUBSCRIPTION_ID>`
- Resource IDs → `<REDACTED_AKS_RESOURCE_ID>`
- IP addresses → `<REDACTED_IP>`
- Node names → `<REDACTED_NODE>`

Pod names, namespace, event reasons, and container names are NOT redacted (safe to commit).
