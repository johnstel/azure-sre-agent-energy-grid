# Portal Validation Testing Checklist

## Quick Start
```bash
cd mission-control
npm run dev
# Open http://localhost:5173
# Click "Controls" → scroll to "Portal Evidence Validation"
```

## Testing Workflow

### ✅ Test 1: OOMKilled Scenario
- [ ] Timestamp is auto-filled with current ISO datetime
- [ ] Enter operator initials: `JS` (2-4 letters)
- [ ] Enter evidence path: `docs/evidence/wave1-live/oom-killed/sre-agent/screenshot.png`
- [ ] Enter notes: `Captured portal showing OOM detection and pod restart recommendation`
- [ ] Check checkbox: "I captured real SRE Agent portal evidence for this scenario."
- [ ] "Mark Confirmed" button becomes enabled
- [ ] Click "Mark Confirmed"
- [ ] Status changes from "Awaiting ⏳" to "Confirmed ✓"
- [ ] Header badge updates from "3/3 PENDING" to "2/3 PENDING"
- [ ] All fields become disabled (read-only)

### ✅ Test 2: MongoDBDown Scenario
- [ ] Timestamp is auto-filled
- [ ] Enter operator initials: `AB` (different operator)
- [ ] Enter evidence path: `docs/evidence/wave1-live/mongodb-down/sre-agent/screenshot.png`
- [ ] Check evidence checkbox
- [ ] Click "Mark Confirmed"
- [ ] Status → "Confirmed ✓"
- [ ] Header badge → "1/3 PENDING"

### ✅ Test 3: ServiceMismatch Scenario
- [ ] Timestamp is auto-filled
- [ ] Enter operator initials: `CD`
- [ ] Enter evidence path: `docs/evidence/wave1-live/service-mismatch/sre-agent/screenshot.png`
- [ ] Check evidence checkbox
- [ ] Click "Mark Confirmed"
- [ ] Status → "Confirmed ✓"
- [ ] Header badge → "READY FOR DEMO ✓" (green)

### ✅ Test 4: Refresh Persistence
- [ ] Refresh browser (F5)
- [ ] All three scenarios still show "Confirmed ✓"
- [ ] All timestamps, initials, evidence paths, notes persisted
- [ ] Header badge still shows "READY FOR DEMO ✓"

### ✅ Test 5: Single Scenario Reset
- [ ] Click "Reset" on OOMKilled scenario
- [ ] Status changes to "Awaiting ⏳"
- [ ] All fields cleared
- [ ] Timestamp auto-fills with new current time
- [ ] Header badge → "1/3 PENDING"
- [ ] Other scenarios still confirmed

### ✅ Test 6: Reset All (Inline Confirmation)
- [ ] Click "Reset all confirmations" button
- [ ] Inline confirmation UI appears
- [ ] Safety message displayed: "This will clear all three scenario confirmations and evidence paths. This cannot be undone."
- [ ] Two buttons shown: "Yes, reset all" and "Cancel"
- [ ] Click "Cancel" → confirmation UI disappears, nothing reset
- [ ] Click "Reset all confirmations" again
- [ ] Click "Yes, reset all"
- [ ] All three scenarios reset to "Awaiting ⏳"
- [ ] All fields cleared
- [ ] Header badge → "3/3 PENDING"

### ✅ Test 7: Validation Rules
- [ ] Without checking evidence checkbox → "Mark Confirmed" is disabled
- [ ] With checkbox but empty initials → "Mark Confirmed" is disabled
- [ ] With checkbox but 1-letter initials (e.g., "J") → "Mark Confirmed" is disabled
- [ ] With checkbox but 5+ letter initials (e.g., "JOHNS") → "Mark Confirmed" is disabled
- [ ] With checkbox and 2-4 letter initials → "Mark Confirmed" is enabled
- [ ] Empty evidence path is allowed (optional field)
- [ ] Empty notes is allowed (optional field)

### ✅ Test 8: Redaction Reminder
- [ ] Yellow alert box visible at top of section
- [ ] Message: "Before recording confirmation, redact subscription ID, tenant ID, resource IDs, principal IDs, and all sensitive identifiers from screenshots and transcripts."
- [ ] Alert remains visible throughout workflow

### ✅ Test 9: Keyboard Accessibility
- [ ] Tab key navigates through all form fields in logical order
- [ ] Labels are associated with inputs (clicking label focuses input)
- [ ] Enter key works in text inputs
- [ ] Buttons respond to Enter and Space keys when focused
- [ ] No keyboard traps (can tab out of all fields)

### ✅ Test 10: Prepared Prompts
- [ ] Each scenario card shows correct description:
  - OOMKilled: "Meter service pods crashing — memory exhaustion"
  - MongoDBDown: "Cascading failure — MongoDB dependency unavailable"
  - ServiceMismatch: "Silent failure — service selector does not match pods"

## API Testing (Optional)

```bash
# Get current state
curl http://localhost:3333/api/portal-validations | jq

# Get OOMKilled prompt
curl http://localhost:3333/api/portal-validations/OOMKilled/prompt | jq

# Update evidence path
curl -X PATCH http://localhost:3333/api/portal-validations/OOMKilled \
  -H "Content-Type: application/json" \
  -d '{"evidencePath": "docs/evidence/test.png"}' | jq

# Update evidence checkbox
curl -X PATCH http://localhost:3333/api/portal-validations/OOMKilled \
  -H "Content-Type: application/json" \
  -d '{"evidenceCaptured": true}' | jq

# Confirm scenario
curl -X POST http://localhost:3333/api/portal-validations/OOMKilled/confirm \
  -H "Content-Type: application/json" \
  -d '{"timestamp": "2026-04-26T14:00:00.000Z", "operatorInitials": "JS"}' | jq

# Reset scenario
curl -X POST http://localhost:3333/api/portal-validations/OOMKilled/reset | jq

# Reset all
curl -X POST http://localhost:3333/api/portal-validations/reset-all | jq
```

## Expected State Transitions

### Initial State
```json
{
  "confirmedCount": 0,
  "validations": [
    {"scenarioName": "OOMKilled", "status": "awaiting"},
    {"scenarioName": "MongoDBDown", "status": "awaiting"},
    {"scenarioName": "ServiceMismatch", "status": "awaiting"}
  ]
}
```

### After Confirming OOMKilled
```json
{
  "confirmedCount": 1,
  "validations": [
    {
      "scenarioName": "OOMKilled",
      "status": "confirmed",
      "evidenceCaptured": true,
      "timestamp": "2026-04-26T14:00:00.000Z",
      "operatorInitials": "JS",
      "evidencePath": "docs/evidence/...",
      "notes": "..."
    },
    {"scenarioName": "MongoDBDown", "status": "awaiting"},
    {"scenarioName": "ServiceMismatch", "status": "awaiting"}
  ]
}
```

### After Confirming All
```json
{
  "confirmedCount": 3,
  "validations": [
    {"scenarioName": "OOMKilled", "status": "confirmed", ...},
    {"scenarioName": "MongoDBDown", "status": "confirmed", ...},
    {"scenarioName": "ServiceMismatch", "status": "confirmed", ...}
  ]
}
```

## Success Criteria

✅ All test cases pass
✅ State persists across refresh
✅ Progress badge transitions correctly
✅ Validation rules enforced
✅ Redaction reminder visible
✅ Inline reset confirmation works
✅ Keyboard accessible
✅ No console errors

---

**Status**: Ready for user acceptance testing
**Last Updated**: 2026-04-26
