# Customer Leave-Behind: Azure SRE Agent Energy Grid Demo

> **Azure SRE Agent is generally available (GA).** This lab currently uses `Microsoft.App/agents@2025-05-01-preview` because the active subscription provider metadata only exposes that API version today. This document is an evidence-safe summary of the demo lab and **requires Dallas approval before external customer use**.

**Version date:** 2026-04-29

**Valid for API version:** `2025-05-01-preview` · **Check for updates:** Ask your Microsoft contact for the latest version of this document before sharing internally. We will move to `2026-01-01` after provider exposure and successful `what-if` validation.

## What Azure SRE Agent Is

Azure SRE Agent is a GA Azure service that helps operators investigate reliability issues through natural-language diagnosis. In this lab, it reviews signals from a breakable AKS-based energy grid platform and recommends next investigative or remediation steps. The demo keeps operational control with the human operator unless real approval evidence is captured.

## Three-Tier Trust Model

| Tier | What it means in this lab |
|------|---------------------------|
| **Diagnosis Only** | Read logs, metrics, and resource state. No remediation actions. |
| **Recommend & Execute** | Diagnose and recommend a fix. The operator executes remediation in this demo. |
| **Autonomous** | Agent executes without operator approval. **Not demonstrated here.** |

## What the Demo Shows

- AI-assisted diagnosis for realistic Kubernetes failure scenarios.
- Dependency reasoning using the MongoDB outage scenario, where symptoms appear across services.
- Review-mode framing: SRE Agent recommendations are treated as operator-reviewed actions.
- Evidence capture conventions for screenshots, KQL, and run notes.

## What the Demo Does Not Show

- Autonomous production remediation.
- Alert-triggered auto-actions.
- Production-hardened least-privilege RBAC.
- Application-level custom telemetry (demo apps use infrastructure signals only).
- Finalized telemetry schema guarantees across all API versions.
- A full compliance audit package.

## Cost Guidance

Use [docs/COSTS.md](COSTS.md) as the canonical cost reference. Do not copy estimates into customer materials without checking that file first.

## Next Steps

1. Confirm service access in a supported region: East US 2, Sweden Central, or Australia East.
2. Review the trust and RBAC model before any production-style pilot.
3. Open the service portal entry point: <https://aka.ms/sreagent/portal>.
4. Run a scoped pilot with evidence capture and customer-specific approval boundaries.
