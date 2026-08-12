# Deep Context Bootstrap — Code Access & Knowledge Setup

## Overview

This guide provides the idempotent bootstrap procedure for configuring Azure SRE Agent
with read-only GitHub Code Access and curated knowledge for the Energy Grid Demo Lab.

**Reference**: [GitHub connector in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/github-connector)
**Reference**: [Memory and knowledge in Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/memory)

---

## Prerequisites

- [ ] SRE Agent deployed via `scripts/deploy.ps1` (or manually via portal)
- [ ] Access to SRE Agent portal: https://aka.ms/sreagent/portal
- [ ] GitHub account with read access to `johnstel/azure-sre-agent-energy-grid`
- [ ] Validation script available: `scripts/validate-deep-context.ps1`

---

## Step 1: Configure Read-Only Code Access (Interactive)

> **Why interactive?** Code Access uses OAuth or PAT authentication which requires
> browser-based consent. This cannot be fully automated without storing credentials.
> The validation script confirms the connection is healthy after setup.

### Option A: OAuth (Recommended)

1. Open SRE Agent portal → Select your agent
2. Navigate to **Builder** > **Code Access**
3. Click **Connect repository**
4. Select authentication: **OAuth**
5. Complete GitHub OAuth consent in browser popup
6. Select repository: `johnstel/azure-sre-agent-energy-grid`
7. Branch: `main`
8. Verify connection shows **Connected** status

**Scope granted**: Read-only repository content (no write, no admin).
**Auto-refresh**: OAuth tokens refresh automatically (~6 month chain lifetime).

### Option B: Fine-Grained PAT (Service account)

1. Create a Fine-Grained PAT at https://github.com/settings/tokens?type=beta
2. **Repository access**: Only `johnstel/azure-sre-agent-energy-grid`
3. **Permissions**: Contents: Read-only (no write permissions)
4. **Expiration**: 90 days maximum
5. In SRE Agent portal → Builder > Code Access → **Add PAT**
6. Paste the token and select the repository

**Do NOT grant**: `repo` full scope, admin access, or write permissions.

### Validation

```powershell
.\scripts\validate-deep-context.ps1 -CheckConnector
```

Expected output: `✅ Code Access: Connected to johnstel/azure-sre-agent-energy-grid (read-only)`

---

## Step 2: Upload Curated Knowledge Base

Upload only documents listed in `docs/deep-context/KNOWLEDGE-MANIFEST.yaml` with
`upload_target: knowledge_base`.

### Manual Upload (Portal)

1. Open SRE Agent portal → Builder > **Knowledge base**
2. Click **Upload documents**
3. Upload each file listed below:

| Source ID | File |
|-----------|------|
| arch-overview | `docs/DEMO-NARRATIVE.md` |
| rb-001-oom | `docs/evidence/runbooks/RB-001-oom-killed.md` |
| rb-009-mongodb | `docs/evidence/runbooks/RB-009-mongodb-down.md` |
| rb-010-svc-mismatch | `docs/evidence/runbooks/RB-010-service-mismatch.md` |
| kql-oom | `docs/evidence/kql/stable/scenario-oom-killed.kql` |
| kql-mongodb | `docs/evidence/kql/stable/scenario-mongodb-down.kql` |
| kql-svc-mismatch | `docs/evidence/kql/stable/scenario-service-mismatch.kql` |
| kql-pod-lifecycle | `docs/evidence/kql/stable/pod-lifecycle.kql` |
| k8s-troubleshooting | `docs/KUBERNETES-SERVICE-TROUBLESHOOTING.md` |
| safe-language | `docs/ANALYST-SAFE-LANGUAGE.md` |
| costs | `docs/COSTS.md` |

4. Verify each file shows **Indexed** status.

### Scripted Upload Validation

```powershell
.\scripts\validate-deep-context.ps1 -CheckKnowledge
```

This checks that all `upload_target: knowledge_base` sources exist and are accessible.

---

## Step 3: Verify Agent Context (Smoke Test)

After setup, verify the agent can use the connected context:

```text
What services does the Energy Grid platform include and what are their dependencies?
```

**Expected**: Response cites `docs/DEMO-NARRATIVE.md` or `k8s/base/application.yaml`
with a clickable citation link.

```text
If meter-service pods are running but the service has no endpoints, what should I check?
```

**Expected**: Response cites `RB-010-service-mismatch.md` and mentions selector/label mismatch.

---

## Step 4: Seed User Memories (Optional)

Use `#remember` commands to save persistent facts:

```text
#remember Energy Grid uses namespace 'energy' for all workloads
#remember MongoDB is an in-cluster deployment, not Azure Cosmos DB
#remember dispatch-service depends on MongoDB via ORDER_DB_URI=mongodb://mongodb:27017
#remember meter-service uses label app=meter-service (not meter-service-v2)
#remember The fix for all breakable scenarios is: kubectl apply -f k8s/base/application.yaml
```

Verify with:
```text
#retrieve what namespace does Energy Grid use?
```

---

## Step 5: Session Insight Generation (Live Gate)

> **⚠️ LIVE GATE**: This step requires a running Energy Grid deployment.
> If the environment is unavailable, document as `LIVE_GATE_PENDING`.

1. Apply a breakable scenario: `kubectl apply -f k8s/scenarios/oom-killed.yaml`
2. Ask the agent: "Why are pods crashing in the energy namespace?"
3. Wait for resolution (apply fix or let agent investigate).
4. Wait 30+ minutes for session insight generation.
5. Verify insight at Monitor > Session insights.
6. Re-apply the same scenario.
7. Ask the same question.
8. Verify the agent references the prior incident in its response.

---

## Idempotency

Running this bootstrap multiple times is safe:
- OAuth re-auth refreshes the token chain (no duplicate connections).
- Re-uploading knowledge replaces existing documents (same filename = update).
- `#remember` with the same text is idempotent.
- Validation script always reports current state.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Code Access shows "Failed" | OAuth token expired (>6 months) | Re-authenticate via portal |
| Knowledge not cited | Document not indexed yet | Wait 5 min, re-test |
| Agent gives generic K8s advice | Code Access not connected | Run `-CheckConnector` |
| `#retrieve` returns nothing | Memory not saved | Re-run `#remember` commands |
| Session insight not generated | Thread still active | Wait 30 min after last message |
