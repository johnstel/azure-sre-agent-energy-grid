# External Demo Hardening Guide

**Source:** Bishop Security Audit — Tier A findings H-1 and H-4, triaged via Issue [#52](https://github.com/johnstel/azure-sre-agent-energy-grid/issues/52).

This guide covers the two Tier A findings and what a demo operator must verify or complete before running an external (customer-facing) demo.

---

## Summary

| Finding | Component | Status | Owner |
|---------|-----------|--------|-------|
| H-1: AKS API server has no `authorizedIPRanges` | `infra/bicep/modules/aks.bicep` | ⚠️ Ripley — awaiting CIDR input from operator | Ripley (Infra) |
| H-3: SRE Agent Contributor at resource-group scope | `infra/bicep/main.bicep`, `scripts/configure-rbac.ps1` | ✅ `Low` is now the default (diagnosis-only). `High` must be set explicitly in `main.bicepparam` and `-SreAgentAccessLevel High` for internal remediation demos. | Ripley (Infra) |
| H-4: RabbitMQ credentials in plaintext K8s manifests | `k8s/base/application.yaml` | ✅ All service env vars use `secretKeyRef`; demo-static values in Secret `stringData` are accepted per issue #52 | Parker (SRE Dev) |

---

## H-1: AKS API Server — `authorizedIPRanges`

### Risk

The AKS API server is reachable from any IP. For an internal dev lab this is acceptable; for an external/customer-facing demo, the exposure surface is higher. No authorized IP CIDRs have been provided yet.

### What Ripley will implement (Bicep scope)

> Parker does not modify Bicep. This section routes the action item to Ripley.

The `authorizedIPRanges` field in `infra/bicep/modules/aks.bicep` needs to be parameterized so an operator can supply CIDR blocks before an external demo. Ripley will:

1. Add an `aksAuthorizedIpRanges` parameter to the Bicep module (default: `[]` = unrestricted, for lab use).
2. Wire the parameter to `apiServerAccessProfile.authorizedIPRanges` on the AKS resource.
3. Document the parameter in `infra/bicep/main.bicepparam`.

### Operator pre-demo checklist (H-1)

Before any external/customer-facing demo:

- [ ] **Get your office/VPN CIDR from your network team** (e.g., `203.0.113.0/24`).
- [ ] **Add your Azure Cloud Shell or bastion IP** if you'll use the portal during the demo.
- [ ] **Re-deploy with CIDR locked** once Ripley's Bicep change lands:
  ```powershell
  .\scripts\deploy.ps1 -Location eastus2 -AksAuthorizedIpRanges "203.0.113.0/24,104.45.0.0/16" -Yes
  ```
- [ ] **Verify** that `kubectl` still reaches the API server from your demo machine after locking.
- [ ] **Confirm SRE Agent portal access still works** — the agent connects outbound from Azure, not through the API server IP allowlist. But verify that `*.azuresre.ai` firewall rule is in place if you're behind a corporate proxy.

> ⚠️ **Until Ripley's change lands and CIDRs are provided, this lab is NOT suitable for external demos.** Document this explicitly in your demo pre-flight notes.

---

## H-3: SRE Agent Contributor at Resource-Group Scope

### Risk

The SRE Agent managed identity previously held Contributor at resource-group scope by default. This grants broad write access (create, delete, modify any resource) and is unacceptable for external or customer-facing demos.

### Resolution (issue #57)

`Low` is now the default access level across Bicep and scripts. Roles granted:

| Scope | Role |
|-------|------|
| Resource Group | Reader |
| Resource Group | Log Analytics Reader |
| Key Vault | Key Vault Secrets User |
| Container Registry | AcrPull |

The `High` level (adds Contributor + AKS admin roles) must be explicitly requested:
- In Bicep: `sreAgentAccessLevel = 'High'` in `infra/bicep/main.bicepparam` (set for internal lab runs only)
- In scripts: `-SreAgentAccessLevel High` passed to `deploy.ps1` or `configure-rbac.ps1`

### Operator pre-demo checklist (H-3)

- [ ] Confirm the deployment used `Low` access level (default when using `deploy.ps1` without `-SreAgentAccessLevel High`)
- [ ] Or verify that `main.bicepparam` was **not** used as-is for this external deploy (it sets `High` for internal lab)
- [ ] Confirm the SRE Agent managed identity does **not** hold Contributor on the resource group:
  ```bash
  az role assignment list --assignee <sre-agent-principal-id> --output table
  ```

---

## H-4: RabbitMQ Credentials

### Finding

Bishop flagged that `guest/guest` RabbitMQ credentials were hardcoded as plaintext in Kubernetes manifest environment variables.

### Current state (resolved for K8s scope)

The credentials are stored in a Kubernetes `Secret` object named `rabbitmq-credentials` (namespace: `energy`). All service deployments reference credentials via `secretKeyRef` — no plaintext values appear in any `env.value` field.

Additionally, the original `guest/guest` default credentials have been rotated to demo-specific values.

**Secret definition** (`k8s/base/application.yaml`):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: rabbitmq-credentials
  namespace: energy
type: Opaque
stringData:              # Demo-static values — see note below
  rabbitmq-username: "energy-grid-mq"
  rabbitmq-password: "energy-grid-mq-demo"
  rabbitmq-amqp-uri: "amqp://energy-grid-mq:energy-grid-mq-demo@rabbitmq:5672/"
```

**All service references use `secretKeyRef`** (verified: `meter-service`, `dispatch-service`, `rabbitmq` deployment env blocks).

### Demo-static values note

Per issue #52, demo-static values are accepted for the dev lab. Key Vault rotation is **not** required for this issue. The original `guest/guest` defaults have been replaced with demo-specific credentials (`energy-grid-mq`/`energy-grid-mq-demo`).

The values are visible in the Git repository. This is a known, accepted trade-off for a demo lab. For production or truly sensitive demos:

1. Rotate credentials before the demo (change `stringData` values and re-apply).
2. Consider managing the Secret out-of-band (manually apply a Secret that is not in Git).
3. Key Vault-backed Secrets via CSI driver can be added in a future enhancement.

### Operator pre-demo checklist (H-4)

- [ ] Acknowledge that demo-static RabbitMQ credentials (`energy-grid-mq`/`energy-grid-mq-demo`) are in the Git repository (accepted per issue #52 for demo-lab use).
- [ ] For higher-sensitivity external demos: rotate credentials manually — update the `stringData` values in a local copy, apply with `kubectl apply`, and do NOT commit the changed values.
- [ ] Confirm RabbitMQ management UI is not publicly exposed (it is ClusterIP only — no LoadBalancer Service for port 15672).

---

## Pre-External-Demo Checklist (Combined)

Copy this checklist into your demo pre-flight notes before any customer-facing run:

```
## External Demo Pre-Flight — Security Hardening

### H-1: AKS API Server
- [ ] Ripley's authorizedIPRanges Bicep change is deployed
- [ ] Demo machine CIDR is in authorizedIPRanges
- [ ] AKS API server is reachable from demo machine: kubectl get nodes
- [ ] Azure SRE Agent portal access is confirmed: https://aka.ms/sreagent/portal
- [ ] *.azuresre.ai firewall rule is in place if behind corporate proxy

### H-3: SRE Agent Access Level
- [ ] Deployment used Low access level (default; no -SreAgentAccessLevel High passed)
- [ ] OR: main.bicepparam sreAgentAccessLevel was overridden to Low for this deploy
- [ ] SRE Agent managed identity does NOT hold Contributor on the resource group:
      az role assignment list --assignee <sre-agent-principal-id> --output table

### H-4: RabbitMQ Credentials
- [ ] Accepted: guest/guest demo-static values are acknowledged
- [ ] If rotating: Secret updated locally, NOT committed
- [ ] RabbitMQ management UI (port 15672) is NOT publicly exposed

### General
- [ ] No subscription IDs, tenant IDs, or email addresses visible in shared screens
- [ ] Demo recording/sharing policy reviewed with Dallas before capture
```

---

## References

- Issue #52: [Security] External demo hardening: AKS IP allowlist + RabbitMQ credentials
- `infra/bicep/modules/aks.bicep` — AKS module (Ripley's domain)
- `k8s/base/application.yaml` — `rabbitmq-credentials` Secret and all service env refs
- `docs/DEMO-RUNBOOK.md` — Full demo flow runbook
- `docs/SAFE-LANGUAGE-GUARDRAILS.md` — Safe language policy
