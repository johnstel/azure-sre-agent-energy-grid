# Demo Narrative: Energy Grid SRE Agent

> **Duration**: 20 minutes · **Audience**: SRE managers, security reviewers, executive buyers
> **Status**: Azure SRE Agent is **GA** (lab API pin: `Microsoft.App/agents@2025-05-01-preview` in this subscription)
> **Pre-read**: [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) · [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md)

---

## The Story in One Sentence

> "Azure SRE Agent can reduce a multi-tool manual investigation into a conversational diagnosis path — with remediation kept operator-controlled in this demo."

---

## Persona Routing

> **Before you begin — who is in the room?** Pick the path that matches the buyer, operator, or reviewer. Every path must follow [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md): no MTTR percentage claims, no fabricated portal output, no autonomous-remediation claims, and no full-auditability overclaims.

### Executive Buyer Path (5-10 minutes)

**Goal:** Show why the demo matters without opening with `kubectl`.

1. **Open with the business question:** "Can AI help my SRE team diagnose faster without giving up control?"
2. **Frame the value:** AI-assisted diagnosis, human-controlled remediation, and clear trust boundaries.
3. **Show the trust model first:** Diagnosis Only → Recommend & Execute → Autonomous (not demonstrated).
4. **Use the MongoDBDown wow moment:** show the dashboard or captured evidence if available; then ask the SRE Agent prompt or replay real captured evidence. Do not invent portal output.
5. **Close with buyer next steps:** supported Preview regions, portal entry point, and cost pointer to [COSTS.md](COSTS.md).

**Emphasis:** decision confidence, operator control, and evidence-safe next steps.

### SRE Manager Path (20 minutes)

**Goal:** Run the full operational story using the existing three-act structure.

1. **Act 1:** Healthy baseline, architecture context, and trust model.
2. **Act 2:** OOMKilled opener, MongoDBDown dependency chain, ServiceMismatch subtle failure.
3. **Act 3:** Review-mode framing, evidence capture, and operator-applied recovery.
4. **Q&A:** Use the prepared answers below and cross-check claims against [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md).

**Emphasis:** signal gathering, dependency reasoning, runbook fit, and repeatable evidence.

### Security Reviewer Path (15 minutes)

**Goal:** Prove the boundaries before showing the scenario.

1. **Start with Preview disclosure and safe-language rules:** link directly to [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md).
2. **Front-load trust controls:** Review mode, operator execution, and Autonomous mode explicitly out of scope.
3. **Show RBAC and audit framing:** use [CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) §10 and explain that exact SRE Agent conversation/action fields are `SCHEMA_TBD` until verified in the deployed API version.
4. **Run or replay ServiceMismatch:** it demonstrates analysis without requiring destructive remediation. Use only live output or captured evidence.
5. **Close with production-hardening gaps:** least-privilege RBAC, customer approval gates, evidence capture, and alert-to-agent automation as future work.

**Emphasis:** blast-radius control, permission transparency, evidence boundaries, and what was not demonstrated.

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
| **Recommend & Execute** | `mode: 'Review'`, `accessLevel: 'High'` | Diagnose + recommend remediation actions | ✅ Operator executes unless a real approval UI/API is captured |
| **Autonomous** | `mode: 'Auto'`, `accessLevel: 'High'` | Diagnose + execute without approval | ❌ Not demonstrated in this lab |

> **Key message**: "SRE Agent recommends actions; the operator executes them in this demo unless a real approval UI/API is captured. Operational telemetry is configured to App Insights, ARM-level actions appear in the Activity Log, and autonomous remediation is not demonstrated. You choose the trust level."

**This demo runs in Recommend & Execute mode** — the agent recommends, the operator decides and executes.

---

## Act 2: Break & Diagnose (10 minutes)

### Scenario 1 — The Opener: OOMKilled (3 min)

**Narrative**: "A smart meter data spike during peak demand overwhelms the meter ingestion service."

1. **Break**: `kubectl apply -f k8s/scenarios/oom-killed.yaml`
2. **Show the failure**: `kubectl get pods -n energy -w` — watch pods restart
3. **Ask SRE Agent**: "Why is the meter-service pod restarting repeatedly?"
4. **Highlight conditionally**: If live portal output or approved prior evidence shows it, point to the real diagnosis and recommendation. Otherwise say: "The scenario's observable root cause is OOMKilled; we will not claim an SRE Agent diagnosis until portal evidence is captured."
5. **Fix**: `kubectl apply -f k8s/base/application.yaml`

**Why this scenario first**: Simple, fast, universally understood. Every SRE has seen OOMKilled.

### Scenario 2 — The Climax: MongoDB Down / Cascading Failure (5 min)

**Narrative**: "The meter readings database goes offline. But the symptoms appear in three different services."

1. **Break**: `kubectl apply -f k8s/scenarios/mongodb-down.yaml`
2. **Show the cascade**: MongoDB is at 0 replicas → the `mongodb` Service has no endpoints → dispatch-service cannot persist meter readings
3. **Run the manual path first**:
   - Follow `DEMO-RUNBOOK.md` Step 4c: start with `kubectl get pods -n energy`, trace deployment readiness, check `mongodb` endpoints, confirm `dispatch-service` depends on `mongodb://mongodb:27017`, and use logs/events as corroborating evidence.
   - Say: "This is the manual breadcrumb trail. Watch for the same dependency chain when we ask SRE Agent."
4. **Ask SRE Agent**: "Meter readings are being accepted but never dispatched. What's wrong?"
5. **Contrast live, don't fabricate**:
   - If the portal responds, compare what the agent recommends against the manual conclusion: MongoDB is scaled to zero, the `mongodb` Service has no endpoints, and dispatch cannot persist meter readings.
   - If the portal is unavailable, say: "SRE Agent is GA; we'll complete the manual diagnosis and show the prompt/evidence path without claiming a live agent result."
6. **Fix**: `kubectl apply -f k8s/base/application.yaml` — the agent recommends; the operator executes in this demo unless real approval UI evidence exists.

**Why this is the climax**: Cascading failures are hard SRE problems. This scenario tests whether live SRE Agent output can help trace the same dependency chain shown in the manual path.

### Scenario 3 — The Subtle One: Service Mismatch (2 min)

**Narrative**: "After a 'v2 upgrade', meter readings fail silently. But all pods are green."

1. **Break**: `kubectl apply -f k8s/scenarios/service-mismatch.yaml`
2. **Show the trap**: `kubectl get pods -n energy` — everything looks healthy!
3. **But**: `kubectl get endpoints meter-service -n energy` — zero endpoints
4. **Ask SRE Agent**: "The grid dashboard loads but meter readings fail. Everything looks healthy."
5. **Highlight conditionally**: If live portal output or approved prior evidence shows it, point to the real diagnosis. Otherwise say: "The observable root cause is a selector mismatch — the Service points to `meter-service-v2` but pods are labeled `meter-service`."
6. **Fix**: `kubectl apply -f k8s/base/application.yaml`

**Why this scenario last**: It tests a subtle failure pattern that humans can miss. Pods are green and logs may be quiet, so the evidence path checks endpoints and selectors before any SRE Agent claim is made.

---

## Act 3: Trust & Prove (5 minutes)

### The Trust Anchor: Review Mode Approval Gate

If during any scenario SRE Agent proposes an action:
1. Show the action proposal in the portal
2. If the portal exposes a real approval UI/API, capture it before use and describe only what is visible
3. Otherwise point out: "The agent has recommended a fix. In this demo, the operator decides what to execute."
4. Apply the recovery from an authorized operator shell and show the result

> **Key message**: "This is not a black box. You see what it wants to do before it does it."

### The Audit Story

- "SRE Agent operational telemetry is configured to App Insights — exact conversation/action fields are SCHEMA_TBD until verified in the deployed API version"
- "If action proposals are visible in the portal, capture exactly what is shown; ARM-level executions appear in the Activity Log"
- Show the RBAC matrix: "The agent's permissions are explicitly scoped — Reader + Contributor on this resource group, nothing more"
- Reference: [CAPABILITY-CONTRACTS.md](CAPABILITY-CONTRACTS.md) §10 for the full RBAC matrix

### The Close

"What we've shown:
1. **AI-assisted diagnosis** intended to reduce manual multi-tool triage
2. **Human-in-the-loop controls** — the operator executes remediation in this demo unless a real approval UI/API is captured
3. **Transparent permissions** — you control what the agent can see and do
4. **Evidence-oriented by design** — operational telemetry is configured to App Insights, ARM actions appear in the Activity Log, and we capture evidence per demo run (exact conversation/action schema is SCHEMA_TBD per Preview)

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
| 1 | "Can it break things?" | "In this Review-mode demo, treat agent output as recommendations. The operator decides what to execute; do not claim a specific approval/denial API unless portal evidence exists." |
| 2 | "What permissions does it need?" | "Minimum: Reader + Log Analytics Reader (`accessLevel: 'Low'`). For remediation: add Contributor (`accessLevel: 'High'`). See our RBAC matrix in CAPABILITY-CONTRACTS.md §10." |
| 3 | "Is this production-ready?" | "Azure SRE Agent is GA, but this demo lab is not a production blueprint. We keep operator-controlled remediation, broad demo permissions, and a `2025-05-01-preview` API pin in this subscription until `2026-01-01` is exposed and validated." |
| 4 | "What about auto-remediation?" | "Auto mode exists but we deliberately run in Review mode. Auto requires a separate security review — rollback procedures, blast radius containment, and kill-switch documentation." |
| 5 | "Where's the audit trail?" | "SRE Agent operational telemetry is configured to App Insights; ARM-level actions appear in the Activity Log. Exact conversation/action fields are SCHEMA_TBD until verified in the deployed API version. We capture KQL evidence for every demo run." |
| 6 | "What if the agent is wrong?" | "In Review mode for this demo, treat the output as a recommendation. If it's wrong, the operator does not execute it. Do not claim a specific reject/deny API unless the portal exposes it and you capture evidence." |
| 7 | "Does it replace my SRE team?" | "No. It assists with repetitive early manual triage. Your SREs still make the decisions — they just get a clearer diagnosis path." |
| 8 | "How does it know about my infrastructure?" | "It reads your Azure resource graph, Container Insights logs, and App Insights telemetry. It has the same view as an SRE with Reader access." |
| 9 | "What about data privacy?" | "SRE Agent operates within your Azure tenant. Conversation data handling follows Azure's standard data processing terms. See Microsoft's Preview terms for specifics." |
| 10 | "What does it cost?" | "The demo lab costs ~$34-40/day including SRE Agent. Production pricing follows Azure's standard consumption model — see our COSTS.md for the full breakdown." |

---

## What NOT to Say

See [SAFE-LANGUAGE-GUARDRAILS.md](SAFE-LANGUAGE-GUARDRAILS.md) for the complete list. Key items:

- ❌ "Reduces MTTR by X%" → ✅ "Reduces manual investigation from ~5 kubectl commands to a single prompt"
- ❌ "Autonomous incident detection" → ✅ "Diagnoses issues you point it to; can be wired to alerts"
- ❌ "Full audit trail" → ✅ "Operational telemetry is configured to App Insights; exact fields are SCHEMA_TBD"
- ❌ "Production-grade RBAC" → ✅ "Demo uses broad permissions; see our production RBAC guidance"

---

## Document History

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-04-29 | 0.5 | Added persona routing for executive buyer, SRE manager, and security reviewer paths | Lambert (QA/Docs) |
| 2025-07-22 | 0.4 | SCHEMA_TBD audit fix — replace all "conversations logged in App Insights" with evidence-safe telemetry language | Lambert (QA/Docs) |
| 2025-07-22 | 0.3 | Security fix — soften 3 audit overclaims per SAFE-LANGUAGE-GUARDRAILS alignment | Lambert (QA/Docs) |
| 2026-04-26 | 0.2 | Wave 0 polish — Core/Extended demo split, scenario table alignment | Lambert (QA/Docs) |
| 2026-04-26 | 0.1 | Wave 0 — Initial demo narrative | Lambert (QA/Docs) |
