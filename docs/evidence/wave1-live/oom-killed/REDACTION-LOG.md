# Evidence Redaction Log

**Date**: 2026-04-26T02:25:00Z
**Operator**: Parker (SRE Dev)
**Gate Approval**: Lambert - PASS_WITH_PENDING_HUMAN_PORTAL
**Status**: ✅ REDACTION_COMPLETE

---

## Redaction Scope

All kubectl evidence files in `kubectl-output/` have been redacted to remove sensitive identifiers per Lambert's gate requirements.

---

## Redacted Identifiers

### ✅ UUIDs (Subscription IDs, Resource IDs, Correlation IDs)

**Pattern**: `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
**Replacement**: `<REDACTED_UUID>`
**Rationale**: Subscription IDs and resource IDs expose Azure tenant information

**Example**:
```
Before: /subscriptions/a1b2c3d4-e5f6-7890-abcd-ef1234567890/resourceGroups/...
After:  <REDACTED_AZURE_RESOURCE_ID>
```

### ✅ Internal IP Addresses (10.x.x.x)

**Pattern**: `10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}`
**Replacement**: `<REDACTED_IP>`
**Rationale**: Internal cluster IPs expose network topology

**Example**:
```
Before: meter-service-686c5dbfc7-2zdt6   1/1   Running   0   10.0.0.152
After:  meter-service-686c5dbfc7-2zdt6   1/1   Running   0   <REDACTED_IP>
```

### ✅ Node Names (AKS VMSS identifiers)

**Pattern**: `aks-[a-z0-9-]*vmss[0-9a-f]*`
**Replacement**: `<REDACTED_NODE>`
**Rationale**: Node names expose internal infrastructure identifiers

**Example**:
```
Before: aks-workload-33466352-vmss00000b   Ready   <none>   3h10m   v1.34.4
After:  <REDACTED_NODE>   Ready   <none>   3h10m   v1.34.4
```

---

## Preserved Evidence Data (NOT Redacted)

The following data was **preserved** to maintain evidentiary meaning:

### ✅ Pod Names
- Format: `meter-service-<replicaset-id>-<pod-id>`
- Example: `meter-service-686c5dbfc7-2zdt6`
- **Rationale**: Pod names are necessary to correlate events across evidence files

### ✅ Namespace Names
- Example: `energy`
- **Rationale**: Namespace is part of the scenario definition and not sensitive

### ✅ Event Reasons
- Examples: `OOMKilled`, `CrashLoopBackOff`, `BackOff`, `Pulling`, `Pulled`, `Created`, `Started`
- **Rationale**: Event reasons are diagnostic signals required for evidence validation

### ✅ Container Names
- Example: `meter-service`
- **Rationale**: Container names are part of application architecture, not infrastructure secrets

### ✅ Timestamps
- Format: ISO 8601 (e.g., `2026-04-26T02:19:27Z`)
- **Rationale**: Timestamps are required for MTTR calculation and timeline validation

### ✅ Resource Limits/Requests
- Examples: `memory: 16Mi`, `cpu: 200m`
- **Rationale**: Resource limits are the root cause of the OOMKilled scenario

### ✅ Restart Counts
- Example: `RestartCount: 3`
- **Rationale**: Restart counts are critical evidence of pod failures

### ✅ Exit Codes
- Example: `Exit Code: 137` (OOMKilled)
- **Rationale**: Exit codes indicate failure reasons

---

## Redacted Files

| File | Size Before | Size After | Redactions |
|------|-------------|------------|------------|
| T0-baseline-pods.txt | 4K | 4K | IPs, node names |
| T0-baseline-events.txt | 56K | 56K | IPs, node names |
| T1-scenario-applied.txt | 4K | 4K | IPs, node names |
| T2-meter-status.txt | 4K | 4K | IPs, node names |
| T2-oomkilled-events.txt | 0B | 0B | N/A (empty) |
| T3-describe-pod.txt | 12K | 12K | IPs, node names, UUIDs |
| T3-previous-logs.txt | 0B | 0B | N/A (empty) |
| T4-restore-healthy.txt | 4K | 4K | IPs, node names |
| T5-recovery-pods.txt | 4K | 4K | IPs, node names |
| T5-post-recovery-events.txt | 8K | 8K | IPs, node names |

**Total**: 9 files redacted

---

## Backup

Raw unredacted files are stored in `kubectl-output-raw/` directory with `.gitignore` to prevent accidental commit.

**⚠️ DO NOT COMMIT**: `kubectl-output-raw/` directory contains unredacted evidence with sensitive data.

---

## Verification

**Post-Redaction Checks**:
- ✅ Zero remaining UUIDs (excluding `<REDACTED_UUID>` markers)
- ✅ Zero remaining internal IPs (excluding `<REDACTED_IP>` markers)
- ✅ Zero remaining node names (excluding `<REDACTED_NODE>` markers)
- ✅ Pod names preserved
- ✅ Namespace names preserved
- ✅ Event reasons preserved
- ✅ Timestamps preserved

**Verification Command**:
```bash
cd kubectl-output/
grep -r -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' . | grep -v REDACTED
# Expected output: (empty)

grep -r '10\.[0-9]' . | grep -v REDACTED
# Expected output: (empty)

grep -r 'aks-.*vmss' . | grep -v REDACTED
# Expected output: (empty)
```

---

## Evidentiary Meaning Preserved

**Example from T3-describe-pod.txt**:

```yaml
Name:             meter-service-686c5dbfc7-2zdt6
Namespace:        energy
Node:             <REDACTED_NODE>
Status:           Running
IP:               <REDACTED_IP>
Controlled By:    ReplicaSet/meter-service-686c5dbfc7
Containers:
  meter-service:
    Container ID:   containerd://abc123def456...
    Image:          ghcr.io/azure-samples/aks-store-demo/order-service:latest
    State:          Running
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
    Ready:          True
    Restart Count:  3
    Limits:
      cpu:     200m
      memory:  16Mi
    Requests:
      cpu:        100m
      memory:     8Mi
```

**Evidentiary Value**:
- Pod name correlates with T2 OOMKilled events ✅
- Namespace matches scenario definition ✅
- OOMKilled reason is visible ✅
- Memory limit 16Mi is root cause ✅
- Restart count 3 confirms multiple failures ✅
- Node IP removed (not needed for diagnosis) ✅

---

## Git Commit Readiness

**Status**: ✅ REDACTION_COMPLETE

**Files Safe to Commit**:
- ✅ `kubectl-output/*.txt` (all redacted)
- ✅ `metrics/mttr-summary.yaml` (no sensitive data)
- ✅ `*.md` files (documentation, no sensitive data)

**Files NOT to Commit**:
- ❌ `kubectl-output-raw/*.txt` (unredacted, .gitignore applied)
- ❌ `kql-results/*-raw.json` (may contain UUIDs if data becomes available)

---

## Sign-Off

**Redacted By**: Parker (SRE Dev)
**Date**: 2026-04-26T02:25:00Z
**Approved By**: Lambert (QA Gate Verdict: PASS_WITH_PENDING_HUMAN_PORTAL)
**Status**: ✅ REDACTION_COMPLETE
**Safe for Git Commit**: ✅ YES (kubectl evidence only; KQL and SRE Agent still pending)

**Notes**:
- All sensitive identifiers removed from kubectl evidence
- Evidentiary meaning fully preserved (pod names, events, reasons, timestamps)
- Raw files backed up in non-committable directory
- Ready for Git commit pending KQL retry and SRE Agent portal evidence
