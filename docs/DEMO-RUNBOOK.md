# Demo Runbook

> **Audience**: Demo operators · **Time**: ~45 minutes (deploy) + 20 minutes (demo) · **Wave**: 0+

This is the single sequential checklist for running the Energy Grid SRE Agent demo end-to-end. It references other docs by section — do not duplicate content here.

---

## Pre-Demo Checklist (Day Before)

- [ ] Azure subscription has Owner/Contributor access
- [ ] Region is one of: `eastus2`, `swedencentral`, `australiaeast`
- [ ] Azure CLI installed and logged in (`az login --use-device-code` in dev container)
- [ ] Dev container is running (or PowerShell Core + kubectl available locally)
- [ ] Firewall allows `*.azuresre.ai`
- [ ] Confirm SRE Agent Preview is available: visit [aka.ms/sreagent/portal](https://aka.ms/sreagent/portal)
- [ ] Review [docs/COSTS.md](COSTS.md) — budget ~$32-38/day with SRE Agent
- [ ] Identify which scenarios you will demo (recommended: OOMKilled → MongoDBDown → ServiceMismatch)
- [ ] Review [docs/SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) for claims to avoid

---

## Step 1: Deploy Infrastructure (~15-25 min)

```powershell
.\scripts\deploy.ps1 -Location eastus2 -Yes
```

**Verify:**
- [ ] Deployment completes without errors
- [ ] Note the resource group name from output (e.g., `rg-srelab-eastus2`)

```powershell
.\scripts\validate-deployment.ps1 -ResourceGroupName <rg-name>
```

- [ ] All resources report healthy
- [ ] AKS cluster is accessible: `kubectl get nodes`

---

## Step 2: Verify Healthy Baseline (~2 min)

```bash
kubectl get pods -n energy
```

- [ ] All pods show `Running` / `1/1 Ready`
- [ ] No restarts > 0

```bash
# Quick smoke test
kubectl exec -n energy deploy/grid-dashboard -- curl -s localhost:8080/health
```

- [ ] Grid dashboard responds

**Evidence capture:** Take a screenshot of healthy pod state → save to `docs/evidence/screenshots/baseline-healthy.png`

---

## Step 3: Find Your SRE Agent Portal URL

**Option A — Deployment output:**
The URL is printed at the end of `deploy.ps1` output. Look for the SRE Agent resource URL.

**Option B — Azure Portal:**
1. Go to [aka.ms/sreagent/portal](https://aka.ms/sreagent/portal)
2. Select your subscription → find the agent resource in your resource group
3. Open the SRE Agent conversation pane

**Option C — Azure CLI:**
```bash
az resource list --resource-group <rg-name> --resource-type Microsoft.App/agents -o table
```

- [ ] SRE Agent portal is accessible and responsive

---

## Step 4: Run Scenario — Break, Diagnose, Fix

For each scenario you plan to demo, follow this loop:

### 4a. Inject the failure

```bash
kubectl apply -f k8s/scenarios/<scenario>.yaml
```

**Estimated times:** OOMKilled ~30s to manifest, MongoDBDown ~60s for cascade, ServiceMismatch ~immediate

### 4b. Observe the failure

```bash
kubectl get pods -n energy -w    # Watch pods
kubectl get events -n energy --sort-by='.lastTimestamp' | head -20
```

- [ ] Failure is visible in kubectl output

### 4c. Ask SRE Agent to diagnose

Open the SRE Agent portal. Start with an open-ended prompt, then escalate to scenario-specific prompts:

**Open-ended (any scenario):**
- "Something seems wrong in the energy namespace. Can you investigate?"

**Recommended scenario-specific prompts:**

| Scenario | Top Prompt |
|----------|-----------|
| **OOMKilled** | "Why is the meter-service pod restarting repeatedly?" |
| **MongoDBDown** | "Smart meter data isn't being processed — what's wrong?" |
| **ServiceMismatch** | "Grid dashboard loads but meter readings fail — what's broken?" |

For the full prompt catalog, see [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) or per-scenario prompts in [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md).

**Evidence capture:**
- [ ] Screenshot the SRE Agent diagnosis → `docs/evidence/screenshots/<scenario>_diagnosis.png`
- [ ] Copy any KQL queries shown → `docs/evidence/kql/<scenario>_diagnosis.kql`

### 4d. Remediate

If SRE Agent proposes a fix in Review mode:
- [ ] Screenshot the action proposal → `docs/evidence/screenshots/<scenario>_proposal.png`
- [ ] Approve or manually apply the fix

Or restore manually:
```bash
kubectl apply -f k8s/base/application.yaml
```

### 4e. Verify recovery

```bash
kubectl get pods -n energy
```

- [ ] All pods back to Running/Ready
- [ ] Screenshot recovery state → `docs/evidence/screenshots/<scenario>_recovered.png`

### 4f. Record timestamps

In `docs/evidence/scenarios/<scenario>/run-notes.md`, record:
| Timestamp | Event |
|-----------|-------|
| T0 | Scenario injected |
| T1 | First symptom visible |
| T2 | SRE Agent conversation started |
| T3 | Diagnosis received |
| T4 | Remediation applied |
| T5 | Service healthy |

See [docs/CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) §7 for the MTTR model.

---

## Step 5: Restore Healthy State

```bash
# Portable command — works anywhere with kubectl access:
kubectl apply -f k8s/base/application.yaml

# Or use the dev-container shortcut (defined in .devcontainer/post-create.sh):
fix-all
```

> **Note**: `fix-all` is a shell alias available only inside the dev container. Outside the dev container, use `kubectl apply -f k8s/base/application.yaml` directly.

- [ ] All pods Running/Ready
- [ ] No error events in last 5 minutes

---

## Step 6: Teardown (Post-Demo)

```powershell
.\scripts\destroy.ps1 -ResourceGroupName <rg-name>
```

- [ ] Resource group deleted
- [ ] Verify in Azure Portal: no orphaned resources

---

## Evidence Storage

All evidence artifacts go under `docs/evidence/`. See [docs/evidence/README.md](evidence/README.md) for naming conventions.

| Artifact Type | Path Pattern | Example |
|---------------|-------------|---------|
| Screenshots | `docs/evidence/screenshots/{scenario}_{step}.png` | `oom-killed_diagnosis.png` |
| KQL queries | `docs/evidence/kql/{query-purpose}.kql` | `pod-restart-trend.kql` |
| Run notes | `docs/evidence/scenarios/{id}/run-notes.md` | `scenarios/oom-killed/run-notes.md` |
| Diagrams | `docs/evidence/diagrams/{topic}.mmd` | `trust-tiers.mmd` |

---

## Fallback Plan: SRE Agent Unavailable

Azure SRE Agent is in **Public Preview**. If the portal is unresponsive during a live demo:

1. **Acknowledge it**: "SRE Agent is in Preview — let me show you the diagnosis path manually while we wait."
2. **Use kubectl diagnosis**: Walk through the `What to observe` commands in [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md) for the active scenario.
3. **Show the prompt library**: Open [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) and explain the prompt progression — "These are the prompts we'd use, and here's what SRE Agent typically returns."
4. **Show prior evidence**: If you have screenshots from a previous run in `docs/evidence/screenshots/`, use those.
5. **Pivot to architecture**: Use the trust model diagram in README to discuss Review vs. Auto mode and RBAC controls.
6. **Resume when available**: Keep the portal tab open — Preview services often recover within minutes.

**Do NOT**: claim the service is GA, promise specific uptime, or skip the scenario entirely.

---

## Known Issues

| Issue | Workaround |
|-------|------------|
| Port 3333 conflict with Mission Control | Change port in Mission Control config or stop conflicting process |
| `managedResources: []` in SRE Agent | Preview limitation — add managed resources manually via Azure Portal after deployment |
| Public AKS API server required | SRE Agent Preview requires public endpoint; do not enable private cluster |
| Deployment output scrolls past SRE Agent URL | Use Option B or C in Step 3 above |
| RabbitMQ severity stickiness after recovery | Wallboard may show warning after fix-all; redeploy RabbitMQ if needed |
| `menu` command only works in dev container | Outside dev container, refer to Commands Reference in README |

---

## Reference Docs

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Quick start, architecture, commands |
| [docs/BREAKABLE-SCENARIOS.md](BREAKABLE-SCENARIOS.md) | All 10 scenarios with observe/fix commands |
| [docs/PROMPTS-GUIDE.md](PROMPTS-GUIDE.md) | SRE Agent prompt progressions |
| [docs/SRE-AGENT-SETUP.md](SRE-AGENT-SETUP.md) | SRE Agent deployment and configuration |
| [docs/CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) | Shared contracts (telemetry, evidence, RBAC) |
| [docs/SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) | What to say / not say during demos |
| [docs/COSTS.md](COSTS.md) | Cost estimates and optimization |

---

## Wave 0 Completion Checklist

Use this checklist to verify Wave 0 is fully closed before moving to Wave 1.

- [ ] **Core docs committed**: README.md, DEMO-RUNBOOK.md, DEMO-NARRATIVE.md, BREAKABLE-SCENARIOS.md, CAPABILITY-CONTRACTS.md, SAFE-LANGUAGE-GUARDRAILS.md
- [ ] **Evidence layout exists**: `docs/evidence/` directory structure with screenshots/, kql/, scenarios/, diagrams/ folders
- [ ] **Scenario manifest present**: `docs/evidence/scenarios/scenario-manifest.yaml` covers reference scenarios (OOMKilled, MongoDBDown, ServiceMismatch); remaining 7 scenarios stubbed for Wave 1
- [ ] **Safe language reviewed**: SAFE-LANGUAGE-GUARDRAILS.md has ❌/✅ table; no overclaims in README or DEMO-NARRATIVE
- [ ] **Scenario ordering aligned**: DEMO-NARRATIVE.md is the canonical source for the 20-minute demo sequence; BREAKABLE-SCENARIOS.md defers to it
- [ ] **No runtime changes**: Wave 0 is docs-only — no modifications to Bicep, K8s manifests, scripts, or application code
- [ ] **Cross-references resolve**: All doc-to-doc links are valid relative paths
- [ ] **Brand and Operator reviews**: Both reviews returned APPROVE (or APPROVE WITH FIXES, all fixes applied)
