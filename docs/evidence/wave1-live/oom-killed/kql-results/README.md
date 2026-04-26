# KQL Query Results

This directory contains CSV exports from Log Analytics queries executed during the OOMKilled scenario.

## Files

- `scenario-oom-killed.csv` — OOMKilled events for meter-service (from scenario-oom-killed.kql)
- `pod-lifecycle.csv` — Pod state transitions and restart timeline (from pod-lifecycle.kql)
- `alert-history.csv` — Alert firing history (from alert-history.kql)

## Queries

Source KQL queries are located in `docs/evidence/kql/stable/`:
- `scenario-oom-killed.kql`
- `pod-lifecycle.kql`
- `alert-history.kql`

## Redaction

CSV files have been redacted per policy:
- Subscription IDs → `<REDACTED_SUBSCRIPTION_ID>`
- Resource IDs → `<REDACTED_AKS_RESOURCE_ID>`
- Correlation IDs → `<REDACTED_CORRELATION_ID>`

Timestamps, pod names, namespace, and event reasons are NOT redacted (safe to commit).
