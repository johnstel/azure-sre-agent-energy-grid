# Evidence Run Notes — Complete Failure Bundle (RB-011)

**Status:** `PENDING_HUMAN_PORTAL` — Template ready for operator capture.

> This file is a template. John (demo operator) fills in this document during a live lab run.
> Do **not** fabricate portal output, screenshots, or agent diagnosis text.
> If the portal is unavailable, record blocker notes in the Blockers section.

---

## Run Metadata

| Field | Value |
|-------|-------|
| **Run date** | `YYYY-MM-DD` |
| **Operator** | *(John / initials)* |
| **AKS cluster** | *(cluster name — redact subscription/tenant)* |
| **Azure SRE Agent portal** | https://aka.ms/sreagent/portal |
| **Namespace** | `energy` |
| **Runbook** | `RB-011-complete-failure-bundle` |
| **Redacted?** | ☐ Subscription IDs / ☐ Tenant IDs / ☐ Emails / ☐ IPs / ☐ Secrets |

---

## Pre-Run Baseline

> Capture healthy state before applying the bundle.

```bash
kubectl get pods -n energy
# Paste output here
```

```bash
kubectl get endpoints meter-service -n energy
# Expected: populated with pod IPs
# Paste output here
```

```bash
kubectl get deployment mongodb -n energy
# Expected: READY 1/1
# Paste output here
```

```bash
kubectl get deployment rabbitmq -n energy
# Expected: READY 1/1
# Paste output here
```

```bash
kubectl get endpoints mongodb rabbitmq -n energy
# Expected: populated with pod IPs
# Paste output here
```

**Baseline timestamp:** `HH:MM UTC`

---

## Bundle Application

```bash
kubectl apply -f k8s/scenarios/complete-failure-bundle/scenario.yaml
# Paste output here
```

**Application timestamp:** `HH:MM UTC`

### Observed degraded state

```bash
kubectl get pods,svc,endpoints -n energy
# Paste output here
```

```bash
kubectl get events -n energy --sort-by=.lastTimestamp | tail -30
# Paste output here
```

**Degraded state confirmed at:** `HH:MM UTC`

---

## Azure SRE Agent Portal Interaction

> Record the real portal output. Do not paraphrase or infer.
> If you cannot access the portal, skip to the Blockers section.

### Prompt 1: Initial triage
**Prompt sent:** `"Why is the entire energy grid platform down?"`

**Agent response (verbatim or screenshot reference):**
```
[PASTE AGENT RESPONSE HERE or note: see screenshot complete-failure-bundle_03_initial-triage.png]
```

**Agent identified root causes:**
- [ ] MongoDB scaled to replicas: 0
- [ ] RabbitMQ scaled to replicas: 0
- [ ] NetworkPolicy deny-meter-service
- [ ] Service selector mismatch (meter-service-v2)
- [ ] Other: ___

---

### Prompt 2: Dependency separation
**Prompt sent:** `"Separate root cause from downstream symptoms across services in the energy namespace"`

**Agent response:**
```
[PASTE AGENT RESPONSE HERE or screenshot reference]
```

---

### Prompt 3: Recovery planning
**Prompt sent:** `"Recommend a prioritized recovery plan with dependencies first"`

**Agent response:**
```
[PASTE AGENT RESPONSE HERE or screenshot reference]
```

**Agent recommendation included staged sequence?** ☐ Yes / ☐ No / ☐ Partial

---

### Prompt 4: Post-recovery verification
**Prompt sent:** `"Verify that meter-service endpoints, MongoDB availability, RabbitMQ availability, and network access are all healthy"`

**Agent response:**
```
[PASTE AGENT RESPONSE HERE or screenshot reference]
```

---

## Operator-Executed Recovery Sequence

> Record what you actually ran, in order.

**Step 1 — Restore dependency and Service specs**
```bash
kubectl apply -f k8s/base/application.yaml
# Paste output here
```
**Timestamp:** `HH:MM UTC`

**Step 2 — Validate data layer and Service routing**
```bash
kubectl get deployment mongodb rabbitmq -n energy
# Expected: READY 1/1 for both
# Paste output here
```

```bash
kubectl get endpoints mongodb rabbitmq -n energy
# Expected: populated
# Paste output here
```

```bash
kubectl get endpoints meter-service -n energy
# Expected: populated
# Paste output here
```
**Timestamp:** `HH:MM UTC`

**Step 3 — Remove remaining network isolation**
```bash
kubectl delete networkpolicy deny-meter-service -n energy
# Paste output here
```
**Timestamp:** `HH:MM UTC`

---

## Post-Recovery Validation

```bash
kubectl get pods -n energy
# Paste output here
```

```bash
kubectl get endpoints meter-service -n energy
# Expected: populated
# Paste output here
```

```bash
kubectl get deployment mongodb rabbitmq -n energy
# Expected: READY 1/1 for both
# Paste output here
```

```bash
kubectl get endpoints mongodb rabbitmq -n energy
# Expected: populated
# Paste output here
```

```bash
kubectl get networkpolicy -n energy
# Expected: deny-meter-service absent
# Paste output here
```

**Full recovery confirmed at:** `HH:MM UTC`
**Total incident duration (degraded → recovered):** `~N minutes`

---

## Pass / Fail Assessment

| Criterion | Result |
|-----------|--------|
| Agent distinguished root causes from symptoms | ☐ PASS / ☐ FAIL / ☐ N/A (portal unavailable) |
| Agent recommended staged recovery (deps first) | ☐ PASS / ☐ FAIL / ☐ N/A |
| Operator restored clean baseline | ☐ PASS / ☐ FAIL |
| meter-service endpoints populated after recovery | ☐ PASS / ☐ FAIL |
| deny-meter-service NetworkPolicy absent after recovery | ☐ PASS / ☐ FAIL |
| MongoDB READY 1/1 after recovery | ☐ PASS / ☐ FAIL |
| RabbitMQ READY 1/1 after recovery | ☐ PASS / ☐ FAIL |

**Overall result:** ☐ PASS / ☐ FAIL / ☐ BLOCKED

---

## Blockers

> If the portal was unavailable or the agent did not produce a usable recommendation, record here instead of substituting expected output.

| # | Blocker | Impact | Owner |
|---|---------|--------|-------|
| 1 | | | |

---

## Screenshots

> Place screenshot files alongside this document as `complete-failure-bundle_NN_description.png`.

| File | Step | Notes |
|------|------|-------|
| `complete-failure-bundle_01_baseline.png` | Healthy baseline | |
| `complete-failure-bundle_02_degraded.png` | Bundle applied, degraded state | |
| `complete-failure-bundle_03_sre-agent-triage.png` | Portal: initial triage response | |
| `complete-failure-bundle_04_sre-agent-recommendation.png` | Portal: recovery plan | |
| `complete-failure-bundle_05_recovery-validation.png` | kubectl post-recovery validation | |

---

## Redaction Checklist

Before committing this file or any screenshots:

- [ ] Subscription IDs removed or replaced with `[SUBSCRIPTION-REDACTED]`
- [ ] Tenant IDs removed or replaced with `[TENANT-REDACTED]`
- [ ] Email addresses removed
- [ ] Public IP addresses removed
- [ ] Resource group names containing org/customer identifiers removed
- [ ] No secrets, tokens, or credentials visible

---

## Lambert / Dallas Review

> Lambert validates safe-language compliance. Dallas approves before external/customer presentation.

- [ ] Lambert reviewed — safe-language compliance confirmed
- [ ] Dallas approved — #37 and #48 can be closed

**Notes:**
