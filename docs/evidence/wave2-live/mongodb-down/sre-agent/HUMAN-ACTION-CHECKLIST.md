# SRE Agent Portal Capture Checklist — MongoDBDown

**Status**: ⏳ PENDING_HUMAN_PORTAL
**Owner**: John
**Scenario**: MongoDB Down - Meter Database Outage (Cascading Failure)

---

## Prerequisites

- [ ] Wave 2 MongoDBDown kubectl evidence captured and validated
- [ ] AKS cluster `aks-srelab` is running
- [ ] MongoDB scaled to 0 replicas (scenario still active)
- [ ] John has access to https://aka.ms/sreagent/portal

---

## Diagnosis Prompt

```
The meter database appears to be offline and dispatch-service can't process readings.
What's wrong with MongoDB in the energy namespace?
```

---

## Expected SRE Agent Diagnosis

**SRE Agent should identify**:
1. MongoDB deployment scaled to 0 replicas
2. Dependency chain: dispatch-service → MongoDB
3. MongoDB pod observations absent or stale
4. Endpoint has no ready addresses

**SRE Agent should recommend**:
- Scale MongoDB deployment to 1 replica
- Verify dependent services recover after MongoDB is back

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
  "scenario": "mongodb-down",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "prompt": "The meter database appears to be offline and dispatch-service can't process readings. What's wrong with MongoDB in the energy namespace?",
  "sre_agent_diagnosis": "PASTE SRE AGENT OUTPUT HERE (redacted)",
  "root_cause_identified": true/false,
  "recommendation_provided": true/false,
  "pass_fail": "PASS/FAIL"
}
```

### diagnosis-metadata.yaml
```yaml
scenario: mongodb-down
capture_timestamp: "YYYY-MM-DDTHH:MM:SSZ"
cluster: aks-srelab
resource_group: rg-srelab-eastus2
sre_agent_response_time_seconds: TBD
root_cause_identified: true/false
recommendation_matches_expected: true/false
pass_criteria:
  - Identified MongoDB deployment scaled to 0 replicas
  - Traced dependency: dispatch-service → MongoDB
  - Recommended scaling MongoDB deployment
pass_fail: PASS/FAIL
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
- ✅ Identified MongoDB deployment scaled to 0 replicas
- ✅ Traced dependency: dispatch-service → MongoDB
- ✅ Recommended scaling MongoDB deployment to 1 replica

**SRE Agent diagnosis PARTIAL if**:
- ⚠️ Identified symptom (MongoDB unavailable) but not root cause (replicas: 0)
- ⚠️ Provided generic recommendation without specific kubectl command

**SRE Agent diagnosis FAIL if**:
- ❌ Did not identify MongoDB as root cause
- ❌ Recommended unrelated actions

---

## Post-Capture Actions

1. Update `docs/evidence/wave2-live/mongodb-down/EVIDENCE-STATUS.md`:
   - Mark SRE Agent portal evidence as COMPLETE
   - Document pass/fail verdict
2. Restore healthy state if scenario still active:
   ```bash
   kubectl apply -f k8s/base/application.yaml
   ```
3. Notify Parker that SRE Agent capture is complete
