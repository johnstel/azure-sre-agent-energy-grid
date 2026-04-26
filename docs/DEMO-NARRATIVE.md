# Demo Narrative: Energy Grid SRE Agent

> **Duration**: 20 minutes · **Audience**: SRE managers, security reviewers, executive buyers
> **Status**: Azure SRE Agent is in **Public Preview**
> **Pre-read**: [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) · [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md)

---

## The Story in One Sentence

> "Azure SRE Agent turns a 15-minute, 5-tool manual investigation into a single conversational prompt — with every proposed action visible and approval-gated before execution."

---

## Act 1: Setup & Context (5 minutes)

### The Hook

"Imagine you're the on-call SRE for a regional energy utility. You manage the grid platform — smart meters, dispatch, billing. It's 2 AM and your pager fires. Something is wrong, but you don't know what yet."

### What You're Looking At

Show the healthy energy grid:
- `kubectl get pods -n energy` — all green
- Grid dashboard (if available) — consumer portal working
- Architecture diagram (see README § Trust & Safety Model)

### The Trust Model (Key Moment)

**This is the #1 objection killer.** Present the three-tier model:

| Tier | SRE Agent Config | What It Can Do | Who Approves |
|------|-----------------|----------------|--------------|
| **Diagnosis Only** | `mode: 'Review'`, `accessLevel: 'Low'` | Read logs, query metrics, analyze state | N/A — read-only |
| **Propose & Approve** | `mode: 'Review'`, `accessLevel: 'High'` | Diagnose + propose remediation actions | ✅ Human approves every action |
| **Autonomous** | `mode: 'Auto'`, `accessLevel: 'High'` | Diagnose + execute without approval | ❌ Not demonstrated in this lab |

> **Key message**: "SRE Agent proposes actions; humans approve them. Proposals are visible in the portal, actions are logged in App Insights and the Activity Log, and nothing executes without your sign-off. You choose the trust level."

**This demo runs in Propose & Approve mode** — the agent recommends, the operator decides.

---

## Act 2: Break & Diagnose (10 minutes)

### Scenario 1 — The Opener: OOMKilled (3 min)

**Narrative**: "A smart meter data spike during peak demand overwhelms the meter ingestion service."

1. **Break**: `kubectl apply -f k8s/scenarios/oom-killed.yaml`
2. **Show the failure**: `kubectl get pods -n energy -w` — watch pods restart
3. **Ask SRE Agent**: "Why is the meter-service pod restarting repeatedly?"
4. **Highlight**: SRE Agent identifies OOMKilled as root cause, recommends memory limit increase
5. **Fix**: `kubectl apply -f k8s/base/application.yaml`

**Why this scenario first**: Simple, fast, universally understood. Every SRE has seen OOMKilled.

### Scenario 2 — The Climax: MongoDB Down / Cascading Failure (5 min)

**Narrative**: "The meter readings database goes offline. But the symptoms appear in three different services."

1. **Break**: `kubectl apply -f k8s/scenarios/mongodb-down.yaml`
2. **Show the cascade**: MongoDB is at 0 replicas → dispatch-service fails health checks → meter events queue up in RabbitMQ but never get processed
3. **The manual investigation** (describe, don't do):
   - "Traditionally, you'd run `kubectl get pods`, see dispatch-service failing, check its logs, find connection errors, trace to MongoDB, check MongoDB status — 5+ commands, 10+ minutes of context-switching."
4. **Ask SRE Agent**: "Meter readings are being accepted but never dispatched. What's wrong?"
5. **The wow moment**: SRE Agent traces the dependency chain — dispatch-service → MongoDB → root cause identified in a single conversation
6. **Fix**: `kubectl apply -f k8s/base/application.yaml`

**Why this is the climax**: Cascading failures are the hardest SRE problem. If the agent can trace dependency chains, it earns trust.

### Scenario 3 — The Subtle One: Service Mismatch (2 min)

**Narrative**: "After a 'v2 upgrade', meter readings fail silently. But all pods are green."

1. **Break**: `kubectl apply -f k8s/scenarios/service-mismatch.yaml`
2. **Show the trap**: `kubectl get pods -n energy` — everything looks healthy!
3. **But**: `kubectl get endpoints meter-service -n energy` — zero endpoints
4. **Ask SRE Agent**: "The grid dashboard loads but meter readings fail. Everything looks healthy."
5. **Highlight**: SRE Agent catches the selector mismatch — the Service points to `meter-service-v2` but pods are labeled `meter-service`
6. **Fix**: `kubectl apply -f k8s/base/application.yaml`

**Why this scenario last**: It shows the agent catches things humans miss. Pods are green, logs are clean, but the agent checks endpoints and selectors.

---

## Act 3: Trust & Prove (5 minutes)

### The Trust Anchor: Review Mode Approval Gate

If during any scenario SRE Agent proposes an action:
1. Show the action proposal in the portal
2. Point out: "The agent has identified the fix. But it's waiting for MY approval."
3. Approve it (or reject it to show the safe-fail)
4. Show the result

> **Key message**: "This is not a black box. You see what it wants to do before it does it."

### The Audit Story

- "Every conversation with SRE Agent is logged in App Insights"
- "Action proposals are visible in the portal; ARM-level executions appear in the Activity Log"
- Show the RBAC matrix: "The agent's permissions are explicitly scoped — Reader + Contributor on this resource group, nothing more"
- Reference: [CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) §10 for the full RBAC matrix

### The Close

"What we've shown:
1. **AI-assisted diagnosis** that traces cascading failures in seconds, not minutes
2. **Human-in-the-loop controls** — nothing executes without your approval
3. **Transparent permissions** — you control what the agent can see and do
4. **Auditable by design** — conversations are logged in App Insights, ARM actions appear in the Activity Log, and we capture evidence per demo run

This is not about replacing SREs. It's about giving SREs a tireless pair that reads every log, checks every dependency, and presents the diagnosis — so you can make the decision."

---

## Recommended Scenario Ordering

### Core Demo (20 min) — Matches Act 2

| Order | Scenario | Duration | Purpose |
|-------|----------|----------|---------|
| 1 (Opener) | OOMKilled | 3 min | Simple, fast, universally understood |
| 2 (Climax) | MongoDBDown | 5 min | Cascading failure — the wow moment |
| 3 (Trust Anchor) | ServiceMismatch | 2 min | Catches what humans miss; show approval gate |

For a 10-minute demo, use only scenarios 1 and 2. For a 5-minute demo, use scenario 2 only.

### Extended Demo (25+ min) — All five scenarios

| Order | Scenario | Duration | Purpose |
|-------|----------|----------|---------|
| 1 (Opener) | OOMKilled | 3 min | Simple, fast, universally understood |
| 2 (Builder) | CrashLoopBackOff | 2 min | Adds log analysis capability |
| 3 (Escalator) | NetworkBlock | 2 min | Cross-cutting: network policy analysis |
| 4 (Climax) | MongoDBDown | 5 min | Cascading failure — the wow moment |
| 5 (Trust Anchor) | ServiceMismatch | 2 min | Catches what humans miss; show approval gate |

> **Note**: The Core Demo sequence is the recommended default. Use the Extended Demo only when you have 25+ minutes and want to showcase additional SRE Agent capabilities (log analysis, network policy diagnosis).

---

## Q&A Prep: Top 10 Customer Questions

| # | Question | Prepared Answer |
|---|----------|-----------------|
| 1 | "Can it break things?" | "In Review mode, nothing executes without your approval. The agent proposes; you decide." |
| 2 | "What permissions does it need?" | "Minimum: Reader + Log Analytics Reader (`accessLevel: 'Low'`). For remediation: add Contributor (`accessLevel: 'High'`). See our RBAC matrix in CAPABILITY-CONTRACTS.md §10." |
| 3 | "Is this production-ready?" | "SRE Agent is in Public Preview. The demo lab uses broad permissions for convenience — see our demo-vs-production RBAC guidance for what production looks like." |
| 4 | "What about auto-remediation?" | "Auto mode exists but we deliberately run in Review mode. Auto requires a separate security review — rollback procedures, blast radius containment, and kill-switch documentation." |
| 5 | "Where's the audit trail?" | "Conversations are logged in App Insights. ARM-level actions appear in the Activity Log. We capture KQL evidence for every demo run." |
| 6 | "What if the agent is wrong?" | "In Review mode, you see the proposal before it executes. If it's wrong, reject it — nothing happens. The agent learns from the conversation context." |
| 7 | "Does it replace my SRE team?" | "No. It replaces the first 15 minutes of manual triage. Your SREs still make the decisions — they just get the diagnosis faster." |
| 8 | "How does it know about my infrastructure?" | "It reads your Azure resource graph, Container Insights logs, and App Insights telemetry. It has the same view as an SRE with Reader access." |
| 9 | "What about data privacy?" | "SRE Agent operates within your Azure tenant. Conversation data handling follows Azure's standard data processing terms. See Microsoft's Preview terms for specifics." |
| 10 | "What does it cost?" | "The demo lab costs ~$32-38/day including SRE Agent. Production pricing follows Azure's standard consumption model — see our COSTS.md for the full breakdown." |

---

## What NOT to Say

See [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) for the complete list. Key items:

- ❌ "Reduces MTTR by X%" → ✅ "Reduces manual investigation from ~5 kubectl commands to a single prompt"
- ❌ "Autonomous incident detection" → ✅ "Diagnoses issues you point it to; can be wired to alerts"
- ❌ "Full audit trail" → ✅ "Actions are logged in App Insights; here's what it looks like"
- ❌ "Production-grade RBAC" → ✅ "Demo uses broad permissions; see our production RBAC guidance"

---

## Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2025-07-22 | 0.3 | Security fix — soften 3 audit overclaims per SAFE-LANGUAGE-GUARDRAILS alignment | Lambert (QA/Docs) |
| 2026-04-26 | 0.2 | Wave 0 polish — Core/Extended demo split, scenario table alignment | Lambert (QA/Docs) |
| 2026-04-26 | 0.1 | Wave 0 — Initial demo narrative | Lambert (QA/Docs) |
