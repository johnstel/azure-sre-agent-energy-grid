# Azure SRE Agent Evidence Capture — Human Action Checklist

> **Scenario**: OOMKilled (Meter Service Memory Exhaustion)
> **Status**: ⏳ PENDING_HUMAN_PORTAL — automated evidence complete; portal validation required
> **Operator**: John Stelmaszek (or designated operator)

---

## Purpose

This checklist guides the human operator through capturing Azure SRE Agent portal evidence. **Parker cannot automate this** — portal interaction requires a human.

---

## Prerequisites

- [ ] AKS cluster is healthy (all nodes Ready, all pods Running)
- [ ] OOMKilled scenario has been applied: `kubectl apply -f k8s/scenarios/oom-killed.yaml`
- [ ] OOMKilled event has occurred (verify with `kubectl get events -n energy`)
- [ ] Azure SRE Agent is deployed and accessible
- [ ] Operator has access to Azure Portal

---

## Step-by-Step Instructions

### Step 1: Navigate to Azure SRE Agent Portal

1. Open browser and navigate to: **https://aka.ms/sreagent/portal**
2. Sign in with Azure credentials (if prompted)
3. Select the subscription where the SRE Agent is deployed
4. Locate the SRE Agent resource in the resource group (likely named `rg-srelab-eastus2`)
5. Click on the SRE Agent resource to open the details pane

**Expected**: You should see the SRE Agent conversation interface

**Evidence**: Take a screenshot of the SRE Agent resource overview → save as `screenshots/sre-agent-resource.png`

---

### Step 2: Open Conversation Pane

1. In the SRE Agent resource pane, locate the "Conversation" or "Chat" section
2. Click to open the conversation interface

**Expected**: You should see a text input box for entering prompts

**Evidence**: Take a screenshot of the empty conversation pane → save as `screenshots/conversation-ready.png`

---

### Step 3: Enter Diagnosis Prompt

1. Open the file: `docs/evidence/wave1-live/oom-killed/sre-agent/diagnosis-prompt.txt`
2. Copy the exact prompt text:
   ```
   Why are meter-service pods crashing in the energy namespace?
   ```
3. Paste the prompt into the SRE Agent conversation input box
4. **DO NOT MODIFY THE PROMPT** — use the exact text from the file

**Evidence**: Take a screenshot showing the prompt in the input box (before sending) → save as `screenshots/prompt-ready.png`

---

### Step 4: Submit Prompt and Wait for Response

1. Click "Send" or press Enter to submit the prompt
2. Wait for the SRE Agent to process the request (may take 10-60 seconds)
3. Observe the response as it appears

**Expected**: SRE Agent will analyze the cluster and return a diagnosis

**Evidence**: Do NOT take a screenshot yet — wait for the full response to complete

---

### Step 5: Capture SRE Agent Response

1. Wait for the SRE Agent response to fully complete (look for "Response complete" or similar indicator)
2. Copy the **entire response text** (including any formatting, code blocks, or recommendations)
3. Paste the response into a new file: `docs/evidence/wave1-live/oom-killed/sre-agent/diagnosis-response.md`
4. Preserve all formatting (use markdown format if the response includes code blocks)
5. Add a header to the file:
   ```markdown
   # Azure SRE Agent Diagnosis Response

   **Scenario**: OOMKilled (Meter Service Memory Exhaustion)
   **Timestamp**: [INSERT_TIMESTAMP_HERE]
   **Prompt**: "Why are meter-service pods crashing in the energy namespace?"

   ---

   [PASTE_FULL_RESPONSE_HERE]
   ```

**Evidence**: Take a screenshot of the full conversation (prompt + response) → save as `screenshots/diagnosis-complete.png`

---

### Step 6: Verify SRE Agent Accuracy

Review the SRE Agent response and check for the following:

- [ ] **OOMKilled events detected**: Did the agent mention OOMKilled events or memory exhaustion?
- [ ] **Memory limits identified**: Did the agent identify that memory limits are too low (16Mi)?
- [ ] **Recommendation provided**: Did the agent recommend increasing memory limits?
- [ ] **Correct service identified**: Did the agent correctly identify `meter-service` as the affected service?

**Accuracy Assessment**:
- [ ] **PASS**: Agent correctly identified root cause and recommended fix
- [ ] **FAIL**: Agent missed root cause or recommended incorrect fix
- [ ] **PARTIAL**: Agent identified symptom but not root cause

**Document your assessment** in the `diagnosis-response.md` file at the end:

```markdown
---

## Accuracy Assessment

**Status**: [PASS/FAIL/PARTIAL]

**Checklist**:
- [x/  ] OOMKilled events detected
- [x/  ] Memory limits identified as too low (16Mi)
- [x/  ] Recommendation to increase memory limits
- [x/  ] Correct service identified (meter-service)

**Notes**: [Add any observations about the diagnosis quality, missing details, or incorrect information]
```

---

### Step 7: Capture Additional Evidence (Optional)

If the SRE Agent provides additional insights or commands:

1. Take screenshots of any additional details, charts, or recommendations
2. Save as `screenshots/additional-evidence-1.png`, `additional-evidence-2.png`, etc.
3. If the agent suggests running commands, document those commands in `diagnosis-response.md`

---

### Step 8: Test Follow-Up Prompts (Optional)

If time permits, test the SRE Agent's ability to answer follow-up questions:

**Follow-up Prompt 1**:
```
What should I do to fix this issue?
```

**Follow-up Prompt 2**:
```
Can you show me the memory limits for meter-service?
```

**Evidence**: Capture these follow-up prompts and responses in a separate file: `sre-agent/follow-up-conversation.md`

---

## Evidence Files Checklist

After completing all steps, verify the following files exist:

- [ ] `sre-agent/diagnosis-prompt.txt` — Exact prompt used (already created by Parker)
- [ ] `sre-agent/diagnosis-response.md` — Full SRE Agent response with accuracy assessment
- [ ] `sre-agent/screenshots/sre-agent-resource.png` — SRE Agent resource overview
- [ ] `sre-agent/screenshots/conversation-ready.png` — Empty conversation pane
- [ ] `sre-agent/screenshots/prompt-ready.png` — Prompt in input box before sending
- [ ] `sre-agent/screenshots/diagnosis-complete.png` — Full conversation (prompt + response)
- [ ] `sre-agent/follow-up-conversation.md` — Optional follow-up prompts (if tested)

---

## Common Issues & Troubleshooting

### Issue: SRE Agent Portal Not Accessible

**Symptoms**: Portal returns 404 or "Resource not found"

**Troubleshooting**:
1. Verify SRE Agent is deployed: `az resource list --resource-type Microsoft.App/agents -g <resource-group-name>`
2. Verify you are in the correct subscription
3. Verify you have Reader or SRE Agent Administrator role
4. Try accessing via Azure Portal → Resource Group → SRE Agent resource

---

### Issue: SRE Agent Returns "No Data" or "Unable to Access Cluster"

**Symptoms**: Agent says it cannot access the AKS cluster or find the namespace

**Troubleshooting**:
1. Verify AKS cluster is not a private cluster (SRE Agent requires public API endpoint)
2. Verify SRE Agent has correct RBAC permissions on the AKS cluster
3. Verify namespace `energy` exists: `kubectl get namespace energy`
4. Wait 5 minutes and try again (SRE Agent may need time to sync with cluster)

---

### Issue: SRE Agent Response is Generic or Unhelpful

**Symptoms**: Agent provides generic Kubernetes troubleshooting advice without specific diagnosis

**Troubleshooting**:
1. Verify the OOMKilled event actually occurred: `kubectl get events -n energy | grep OOMKilled`
2. Wait 2-5 minutes for Log Analytics ingestion
3. Try a more specific prompt: "Show me the OOMKilled events for meter-service in the energy namespace"
4. Document the unhelpful response as-is — this is still valid evidence of SRE Agent performance

---

## Redaction Policy

Before committing evidence files:

- [ ] Redact subscription IDs from screenshots (if visible)
- [ ] Redact resource IDs (if visible)
- [ ] Redact IP addresses (if visible)
- [ ] **DO NOT** redact: namespace names, pod names, event reasons, container names

---

## Completion

- [ ] All evidence files captured
- [ ] Accuracy assessment completed
- [ ] Evidence redacted per policy
- [ ] Files saved to `docs/evidence/wave1-live/oom-killed/sre-agent/`
- [ ] Checklist status updated in `wave1-live/checklist.md`
- [ ] Run-notes updated in `oom-killed/run-notes.md`

---

**Operator Signature**: ___________________
**Completion Date**: ___________________
**Status**: [COMPLETE/INCOMPLETE/BLOCKED]
