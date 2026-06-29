# Safe Language Guardrails

> **Audience**: Anyone presenting, writing about, or demoing the Energy Grid SRE Agent lab
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2026-01-01`, Stable channel)
> **Rule**: Every customer-facing artifact must reference this document before publication

This document prevents accidental overclaiming. Review it before every demo.

---

## Core Principle

> The demo proves what we can show with evidence. If we haven't demonstrated it with screenshots, KQL output, or live execution, we don't claim it.

---

## Guardrail Table

| Topic | ❌ Do Not Claim | ✅ Say Instead | Why |
|-------|----------------|---------------|-----|
| **MTTR** | "Reduces MTTR by X%" | "Reduces the manual investigation from ~5 kubectl commands to a single conversational prompt" | No MTTR instrumentation exists yet. Quantitative claims require measurement infrastructure (Wave 5). |
| **Autonomous Detection** | "SRE Agent autonomously detects incidents" | "SRE Agent diagnoses issues you point it to. It can be wired to Azure Monitor alerts for automated trigger." | Alerts are not wired to SRE Agent in this demo. Detection requires the operator to initiate a conversation. |
| **Alert-to-Agent Triggers** | "Alerts automatically trigger SRE Agent" | "Alert-to-agent automation is supported via Subagent builder and is a natural next step beyond this demo." | No alert→agent trigger is configured in the current deployment. This is a P0 gap documented in the delta backlog. |
| **Auto-Remediation** | "SRE Agent automatically fixes issues" | "SRE Agent recommends remediation in Review mode. Unless a real Azure SRE Agent approval UI/API is captured in this environment, say: agent recommends, operator executes. Auto mode exists but is not demonstrated." | The demo runs `mode: 'Review'`. Auto mode is out of scope and requires a separate security review. |
| **Audit Trail** | "Full audit trail of every agent action" | "SRE Agent operational telemetry is configured to App Insights; ARM-level actions appear in the Activity Log (exported to Log Analytics via Bicep). Exact conversation/action fields are SCHEMA_TBD until verified in the deployed API version. We capture evidence per demo run." | Full audit trail requires live verification of Activity Log ingestion and SRE Agent conversation retention (service-managed and schema-sensitive). |
| **Application-Level Observability** | "Deep application telemetry integration" | "Infrastructure-level signals (Container Insights, pod events, node metrics) are rich. Application-level App Insights telemetry integration is a natural next step." | Demo applications do not emit App Insights custom telemetry. Only infrastructure signals are available. |
| **SLOs** | "Guarantees X% availability" or "SLO-backed" | "The SLO framework is defined in our contracts (§7) and will be instrumented in a future wave. Currently, we track pod availability qualitatively." | SLO definitions exist as contracts but have no measurement infrastructure. |
| **Least Privilege** | "Production-grade RBAC" or "least-privilege permissions" | "The demo uses broad permissions for convenience. See our demo-vs-production RBAC matrix for what production deployments should look like." | Demo grants AKS Cluster Admin, subscription-scoped Reader, and other overbroad roles. These are documented as `⚠️ DEMO ONLY` in CAPABILITY-CONTRACTS.md §10. |
| **Audit Evidence** | "Compliance-ready evidence package" | "We define evidence capture contracts (file paths, naming, MTTR timestamps) and populate them during demo runs. Full compliance packaging is a future wave." | Evidence folders exist but are empty placeholders until populated with real demo run artifacts. |
| **Data Retention** | "Complete audit history" | "Log Analytics retains 90 days; App Insights retains 90 days. Activity Log export to Log Analytics is configured in Bicep but verify ingestion during live UAT before claiming full KQL queryability. See our retention table in CAPABILITY-CONTRACTS.md §11." | Retention is configured but live verification is needed before claiming complete audit evidence. |
| **Status and API pin** | "API behavior is fully frozen in this tenant" | "Azure SRE Agent is GA. This lab pins `Microsoft.App/agents@2026-01-01` and `upgradeChannel: 'Stable'`. If a subscription exposes only older preview provider metadata, the deploy script skips SRE Agent instead of falling back." | Must appear in every customer-facing artifact, not just footers. |
| **CI/CD Correlation** | "Commit-to-incident tracing" | "SRE Agent supports MCP integration with GitHub/Azure DevOps for commit-to-incident correlation — this is a natural extension." | No CI/CD pipeline exists in this demo. |

---

## Where to Apply These Guardrails

- [ ] README.md — any claims about capabilities
- [ ] Demo presentations (slides, live narration)
- [ ] Customer handout materials
- [ ] docs/DEMO-NARRATIVE.md — Q&A prep answers
- [ ] docs/BREAKABLE-SCENARIOS.md — scenario descriptions
- [ ] Any future blog posts, videos, or social media about this demo

---

## Status Disclosure Requirements

The following statement (or equivalent) must appear **prominently** in every customer-facing artifact:

> **Azure SRE Agent is generally available (GA).** This demo lab pins `Microsoft.App/agents@2026-01-01` and `upgradeChannel: 'Stable'`. If a subscription exposes only older preview provider metadata, the deploy script skips SRE Agent rather than silently deploying the legacy preview API.

"Prominently" means: in the first section of the document, not in a footer or appendix.

---

## Escalation

If a customer asks a question not covered here:
1. Check [docs/DEMO-NARRATIVE.md](DEMO-NARRATIVE.md) Q&A section
2. If still unsure, say: "That's a great question — let me get you a precise answer rather than speculate."
3. Do NOT improvise claims about production capabilities, pricing, or GA timelines.

---

## Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-04-26 | 0.1 | Wave 0 — Initial safe language guardrails | Lambert (QA/Docs) |
