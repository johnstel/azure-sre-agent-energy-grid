# Complete Failure Bundle — SRE Agent Portal Capture Checklist

**Status**: ⏳ PENDING_HUMAN_PORTAL
**Owner**: John (demo operator) — Lambert validates after capture
**Scenario**: `k8s/scenarios/complete-failure-bundle/scenario.yaml`
**Issue**: #48 (supporting #37)

---

## Prerequisites

- [ ] AKS cluster deployed in a supported SRE Agent Preview region (eastus2, swedencentral, australiaeast)
- [ ] All pods in `energy` namespace are `Running/Ready` (healthy baseline)
- [ ] John has access to https://aka.ms/sreagent/portal and can authenticate
- [ ] SRE Agent resource is deployed: `az resource list -g <rg> --resource-type Microsoft.App/agents`
- [ ] Complete-failure-bundle **not yet applied** (start from healthy state)
- [ ] Operator terminal ready with kubectl access to the cluster

---

## Phase 1: Capture Healthy Baseline (T0)

```bash
kubectl get pods -n energy
kubectl get endpoints -n energy
kubectl get events -n energy --sort-by='.lastTimestamp' | head -20
```

Save output as:
- `kubectl-output/T0-baseline-pods.txt`
- `kubectl-output/T0-baseline-endpoints.txt`
- `kubectl-output/T0-baseline-events.txt`
- `kubectl-output/T0-timestamp.txt` (record `date -u +"%Y-%m-%dT%H:%M:%SZ"`)

---

## Phase 2: Inject the Bundle (T1)

```bash
kubectl apply -f k8s/scenarios/complete-failure-bundle/scenario.yaml
```

Save output as:
- `kubectl-output/T1-bundle-applied.txt`
- `kubectl-output/T1-timestamp.txt`

---

## Phase 3: Observe Degraded State (T2)

Wait 60-90 seconds for failures to manifest, then capture:

```bash
kubectl get pods -n energy
kubectl get endpoints -n energy
kubectl get events -n energy --sort-by='.lastTimestamp' | head -30
kubectl describe networkpolicy deny-meter-service -n energy
kubectl get deploy mongodb -n energy -o yaml | grep -A3 "replicas:"
```

Save output as:
- `kubectl-output/T2-degraded-pods.txt`
- `kubectl-output/T2-degraded-endpoints.txt`
- `kubectl-output/T2-degraded-events.txt`
- `kubectl-output/T2-networkpolicy.txt`
- `kubectl-output/T2-mongodb-replicas.txt`
- `kubectl-output/T2-timestamp.txt`

---

## Phase 4: Azure SRE Agent Portal Interaction (T3)

> **Critical**: This phase requires real Azure SRE Agent portal interaction.
> Do NOT fabricate portal output, screenshots, or transcripts.

### Step 1: Open portal

Navigate to: **https://aka.ms/sreagent/portal**

Authenticate with Azure credentials. Select the subscription and resource group where
the SRE Agent is deployed.

**Screenshot**: SRE Agent resource overview → `sre-agent/screenshots/sre-agent-resource.png`

### Step 2: Start diagnosis conversation

Open the conversation/chat interface.

**Screenshot**: Empty conversation pane → `sre-agent/screenshots/conversation-ready.png`

### Step 3: Submit the opening prompt

Use the exact prompt from `sre-agent/diagnosis-prompt.txt`:

```
The energy grid platform is experiencing a broad outage.
Multiple services are failing in the energy namespace.
Can you investigate and tell me what's wrong?
```

**Screenshot**: Prompt in input box before sending → `sre-agent/screenshots/prompt-entered.png`

### Step 4: Capture SRE Agent response

Wait for the full response. Capture:
- **Screenshot**: Full portal conversation (prompt + response) → `sre-agent/screenshots/diagnosis-complete.png`
- **Text copy**: Paste full response to `sre-agent/diagnosis-response.md` with header:

```markdown
# SRE Agent Diagnosis Response — Complete Failure Bundle

**Timestamp**: [INSERT UTC TIMESTAMP]
**Prompt**: [exact prompt used]

---

[PASTE FULL RESPONSE HERE — do not paraphrase]
```

### Step 5: Assess diagnosis accuracy

- [ ] Did SRE Agent identify MongoDB as scaled to 0 replicas?
- [ ] Did SRE Agent identify the NetworkPolicy blocking meter-service?
- [ ] Did SRE Agent identify the service selector mismatch?
- [ ] Did SRE Agent provide a recovery sequence?

Record PASS / PARTIAL / FAIL in `diagnosis-response.md` with justification.

### Step 6: Capture any proposal UI

If the portal exposes a recommendation or approval UI, screenshot it exactly as shown →
`sre-agent/screenshots/proposal.png`.

If no approval UI is visible, do NOT create this file. Use safe language:
**agent recommends; operator executes.**

---

## Phase 5: Operator Recovery (T4)

Follow SRE Agent's recommendations (if useful) or apply the documented recovery sequence:

```bash
kubectl delete networkpolicy deny-meter-service -n energy
kubectl apply -f k8s/base/application.yaml
```

Save output as:
- `kubectl-output/T4-recovery-applied.txt`
- `kubectl-output/T4-timestamp.txt`

---

## Phase 6: Validate Recovery (T5)

Wait 60-90 seconds, then capture:

```bash
kubectl get pods -n energy
kubectl get endpoints -n energy
kubectl get events -n energy --sort-by='.lastTimestamp' | head -20
```

Save output as:
- `kubectl-output/T5-recovery-pods.txt`
- `kubectl-output/T5-recovery-endpoints.txt`
- `kubectl-output/T5-recovery-events.txt`
- `kubectl-output/T5-timestamp.txt`

**Recovery is complete when**:
- All pods show `Running/Ready`
- `kubectl get endpoints -n energy` shows active endpoints for mongodb and meter-service
- No error events in last 5 minutes

---

## Phase 7: Run Notes

Complete `run-notes.md` with:
- Timestamps for each phase
- SRE Agent response time (T3 prompt sent → full response received)
- Blockers encountered
- Portal availability status
- Redaction status

---

## Evidence Files Checklist

### kubectl evidence
- [ ] `kubectl-output/T0-baseline-pods.txt`
- [ ] `kubectl-output/T0-baseline-endpoints.txt`
- [ ] `kubectl-output/T0-baseline-events.txt`
- [ ] `kubectl-output/T0-timestamp.txt`
- [ ] `kubectl-output/T1-bundle-applied.txt`
- [ ] `kubectl-output/T1-timestamp.txt`
- [ ] `kubectl-output/T2-degraded-pods.txt`
- [ ] `kubectl-output/T2-degraded-endpoints.txt`
- [ ] `kubectl-output/T2-degraded-events.txt`
- [ ] `kubectl-output/T2-networkpolicy.txt`
- [ ] `kubectl-output/T2-mongodb-replicas.txt`
- [ ] `kubectl-output/T2-timestamp.txt`
- [ ] `kubectl-output/T4-recovery-applied.txt`
- [ ] `kubectl-output/T4-timestamp.txt`
- [ ] `kubectl-output/T5-recovery-pods.txt`
- [ ] `kubectl-output/T5-recovery-endpoints.txt`
- [ ] `kubectl-output/T5-recovery-events.txt`
- [ ] `kubectl-output/T5-timestamp.txt`

### SRE Agent evidence
- [ ] `sre-agent/screenshots/sre-agent-resource.png` — portal resource overview
- [ ] `sre-agent/screenshots/conversation-ready.png` — empty conversation pane
- [ ] `sre-agent/screenshots/prompt-entered.png` — prompt before sending
- [ ] `sre-agent/screenshots/diagnosis-complete.png` — full portal conversation
- [ ] `sre-agent/screenshots/proposal.png` — if approval UI is visible (optional)
- [ ] `sre-agent/diagnosis-response.md` — full text of SRE Agent response

### Run notes and metrics
- [ ] `run-notes.md` — complete with timestamps, blockers, portal status
- [ ] `metrics/mttr-summary.yaml` — timestamps T0-T5, total recovery time

---

## Redaction Checklist

Before committing any file:
- [ ] Remove subscription IDs
- [ ] Remove tenant IDs
- [ ] Remove resource group names (if sensitive context)
- [ ] Remove node names
- [ ] Remove internal IPs
- [ ] Remove cluster FQDNs
- [ ] Remove email addresses
- [ ] Verify no secrets or connection strings

---

## Post-Capture Actions

1. Notify Lambert that capture is complete for validation
2. Lambert reviews evidence for safe-language compliance
3. Lambert updates `BLOCKER-NOTE.md` status
4. Vasquez reviews for demo framing (advisory)
5. Dallas approves before external/customer presentation or #37/#48 closure

---

**Operator Signature**: ___________________
**Completion Date**: ___________________
**Status**: [COMPLETE / INCOMPLETE / BLOCKED]
