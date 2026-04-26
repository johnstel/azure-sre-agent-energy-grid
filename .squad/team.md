# Squad Team

> azure-sre-agent-energy-grid

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Dallas | Lead | .squad/agents/dallas/charter.md | 🏗️ Active |
| Ripley | Infra Dev | .squad/agents/ripley/charter.md | ⚙️ Active |
| Parker | SRE Dev | .squad/agents/parker/charter.md | 🔧 Active |
| Lambert | QA/Docs | .squad/agents/lambert/charter.md | 🧪 Active |
| Scribe | Scribe | .squad/agents/scribe/charter.md | 📋 Active |
| Ralph | Work Monitor | .squad/agents/ralph/charter.md | 🔄 Active |

## Project Context

- **Project:** azure-sre-agent-energy-grid
- **User:** John Stelmaszek
- **Created:** 2026-04-24
- **Stack:** Azure Bicep IaC, Kubernetes manifests, PowerShell scripts, Dev Containers
- **Description:** Azure SRE Agent demo lab — deploys a simulated energy grid platform onto AKS with intentionally breakable scenarios for demonstrating AI-powered SRE diagnosis. No app source code; services run from public container images defined in K8s manifests.
- **Contractor Policy:** Use `.squad/copilot-default-inventory.md` as the discovery catalog before selecting expert contractors or skills. Bring in contractors deliberately for creative/design, architecture, security/governance, business/demo, SRE/observability, public docs, or reviewer-gate work. Creative contractor work uses Opus 4.6, produces verbose developer handoffs, and includes diagrams when useful.
- **Vendoring Policy:** Keep the default Copilot inventory lightweight. Copy/vendor full agent prompts or skill bodies into `.squad/skills/` or project agent charters only when a specific capability is needed repeatedly or requires energy-grid customization, with provenance and review metadata.
