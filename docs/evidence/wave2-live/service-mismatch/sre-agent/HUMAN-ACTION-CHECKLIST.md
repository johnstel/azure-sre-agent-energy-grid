# SRE Agent Portal Capture Checklist — ServiceMismatch

**Status**: ⏳ PENDING_HUMAN_PORTAL
**Owner**: John
**Scenario**: Service Selector Mismatch - Meter Service Routing Failure (Silent Failure)

---

## Prerequisites

- [ ] Wave 2 ServiceMismatch kubectl evidence captured and validated
- [ ] AKS cluster `aks-srelab` is running
- [ ] Service selector mismatch still active (scenario applied)
- [ ] John has access to https://aka.ms/sreagent/portal

---

## Diagnosis Prompt

```
The grid dashboard loads fine but submitting meter readings fails silently.
Meter-service pods are Running. What's wrong with the meter-service in the energy namespace?
```

---

## Expected SRE Agent Diagnosis

**SRE Agent should identify**:
1. Meter-service pods are Running/Ready (healthy)
2. Service endpoints show 0 ready addresses
3. Service selector `app: meter-service-v2` doesn't match pod labels `app: meter-service`
4. This is a configuration mismatch, not a runtime failure

**SRE Agent should recommend**:
- Correct service selector to match pod labels: `app: meter-service`
- Or update pod labels to match service selector (less common)

---

## Capture Steps

1. Navigate to https://aka.ms/sreagent/portal
2. Authenticate with Azure credentials
3. Select subscription: `ME-MngEnvMCAP550731-jostelma-2` (ca7bde74-xxx)
4. Select resource group: `rg-srelab-eastus2`
5. Select AKS cluster: `aks-srelab`
6. Input diagnosis prompt (exact text above)
7. Wait for SRE Agent to analyze and respond
8. Copy/screenshot diagnosis output
9. Save redacted output to: `diagnosis-output.json`
10. Note timestamp and response time in: `diagnosis-metadata.yaml`

---

## Output Files to Create

### diagnosis-output.json
```json
{
  "scenario": "service-mismatch",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "prompt": "The grid dashboard loads fine but submitting meter readings fails silently. Meter-service pods are Running. What's wrong with the meter-service in the energy namespace?",
  "sre_agent_diagnosis": "PASTE SRE AGENT OUTPUT HERE (redacted)",
  "root_cause_identified": true/false,
  "recommendation_provided": true/false,
  "pass_fail": "PASS/FAIL"
}
```

### diagnosis-metadata.yaml
```yaml
scenario: service-mismatch
capture_timestamp: "YYYY-MM-DDTHH:MM:SSZ"
cluster: aks-srelab
resource_group: rg-srelab-eastus2
sre_agent_response_time_seconds: TBD
root_cause_identified: true/false
recommendation_matches_expected: true/false
pass_criteria:
  - Identified service selector mismatch
  - Analyzed service selector vs. pod labels
  - Recommended correcting service selector
pass_fail: PASS/FAIL
notes: |
  This is a high-complexity "silent failure" scenario. SRE Agent must analyze
  Kubernetes API configuration (selector vs. labels) to diagnose root cause.
  Pods are healthy (Running/Ready) but unreachable due to selector mismatch.
```

---

## Redaction Checklist

Before saving `diagnosis-output.json`:
- [ ] Remove subscription IDs
- [ ] Remove resource group names (if present)
- [ ] Remove internal IPs
- [ ] Remove node names
- [ ] Remove cluster FQDNs
- [ ] Verify no sensitive credentials or secrets

---

## Pass Criteria

**SRE Agent diagnosis PASS if**:
- ✅ Identified service selector mismatch between Service and pods
- ✅ Analyzed service selector `app: meter-service-v2` vs. pod labels `app: meter-service`
- ✅ Recommended correcting service selector to match pod labels

**SRE Agent diagnosis PARTIAL if**:
- ⚠️ Identified symptom (service unreachable) but not configuration root cause
- ⚠️ Recommended checking endpoints without analyzing selector mismatch

**SRE Agent diagnosis FAIL if**:
- ❌ Did not identify configuration mismatch
- ❌ Recommended pod restart or other runtime-focused actions

---

## Post-Capture Actions

1. Update `docs/evidence/wave2-live/service-mismatch/EVIDENCE-STATUS.md`:
   - Mark SRE Agent portal evidence as COMPLETE
   - Document pass/fail verdict
2. Restore healthy state if scenario still active:
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
3. Notify Parker that SRE Agent capture is complete

---

## Notes

**Diagnosis Complexity**: HIGH

This scenario tests SRE Agent's ability to analyze **configuration mismatches** vs. runtime failures. Unlike OOMKilled or CrashLoopBackOff, there are no visible pod failures. SRE Agent must:
1. Recognize pods are healthy
2. Check service endpoints (0 ready addresses)
3. Compare service selector vs. pod labels (configuration analysis)
4. Recommend configuration fix

This is a critical test of SRE Agent's advanced diagnostic capabilities.
