# Evidence Library

This directory contains durable, reusable diagnostic material for the demo lab. Transient deployment logs, one-time status reports, synthetic screenshots, and incomplete evidence captures are intentionally not retained.

## Retained artifacts

| Path | Purpose |
|------|---------|
| `kql/stable/` | Validated, reusable Log Analytics queries |
| `runbooks/` | Scenario diagnosis and recovery runbooks |
| `scenarios/scenario-manifest.yaml` | Machine-readable scenario metadata |
| `diagrams/` | Source diagrams for trust and RBAC concepts |
| `ALERT-KQL-MAPPING.md` | Mapping between alert rules and reusable queries |

## Evidence policy

- Capture live run output outside the repository until it has been redacted and reviewed.
- Do not commit tenant IDs, subscription IDs, object IDs, credentials, private IP addresses, or customer data.
- Do not create simulated Azure portal or SRE Agent screenshots.
- Treat a missing live capture as missing evidence, not as a reason to add a placeholder card.
- Promote only generally reusable queries, runbooks, diagrams, or contracts into this directory.

KQL files must include their scenario, purpose, time window, and required parameters in header comments. Runbooks use the `RB-{NNN}-{slug}.md` naming convention defined in [Capability Contracts](../CAPABILITY-CONTRACTS.md).
