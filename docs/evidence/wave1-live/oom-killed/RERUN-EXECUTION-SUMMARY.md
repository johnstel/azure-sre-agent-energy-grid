# Wave 1 OOMKilled Scenario - Rerun Execution Summary

## Execution Metadata
- **Date**: 2026-04-26
- **Execution Type**: Rerun (telemetry-backed evidence collection)
- **Reason**: Original scenario (02:19-02:21Z) occurred during Container Insights ingestion gap
- **Cluster**: aks-gridmon-dev (rg-gwsrelab-eastus2)
- **Workspace**: log-gridmon-dev (e705c573-15bb-42d1-a268-1d6879dea792)
- **Namespace**: energy

## Pre-Flight Checks
- **Container Insights Status**: ✅ ACTIVE (verified 72 Running pods at 03:39:46Z)
- **Target Namespace Ingestion**: ✅ CONFIRMED ('energy' namespace data present)
- **Cluster Health**: ✅ PASS (3 nodes, all pods Running)
- **Pre-flight Verdict**: PASS - Safe to proceed

## Timeline

| Phase | Timestamp | Duration | Description |
|-------|-----------|----------|-------------|
| T0 | 2026-04-26T03:41:03Z | - | Baseline capture (all pods Running) |
| T1 | 2026-04-26T03:41:04Z | +1s | Applied oom-killed.yaml (16Mi memory limit) |
| T2 | 2026-04-26T03:42:27Z | +83s | Detected CrashLoopBackOff (3 restarts) |
| T3 | 2026-04-26T03:42:29Z | +2s | Diagnosed OOMKilled root cause |
| T4 | 2026-04-26T03:42:45Z | +16s | Applied fix (restored 256Mi) |
| T5 | 2026-04-26T03:43:31Z | +46s | Verified recovery (both pods Running) |

## MTTR Calculation
- **Detection Time**: 83 seconds (T1 → T2)
- **Diagnosis Time**: 18 seconds (T2 → T4)
- **Recovery Time**: 46 seconds (T4 → T5)
- **Total MTTR**: **147 seconds** ✅ PASS (< 900s threshold)
- **Margin**: 753 seconds under threshold

## Evidence Collected

### kubectl Evidence (9 files)
✅ **COMPLETE** - All files captured and redacted
- T0-baseline-pods.txt
- T0-baseline-events.txt
- T1-scenario-applied.txt
- T2-meter-status.txt
- T2-oomkilled-events.txt (expected empty - OOMKilled not in KubeEvents)
- T3-describe-pod.txt (PRIMARY EVIDENCE - OOMKilled reason, 16Mi limit, 3 restarts)
- T3-previous-logs.txt
- T4-restore-healthy.txt
- T5-recovery-pods.txt
- T5-post-recovery-events.txt

### KQL Evidence (2 queries successful, 1 schema issue)

#### scenario-oom-killed-enhanced.json ✅ PASS
- **Purpose**: Custom query targeting ContainerStatusReason in KubePodInventory
- **Results**: 1 row
- **Key Evidence**:
  - Pod: meter-service-686c5dbfc7-mfvgw
  - Timestamp: 2026-04-26T03:42:46Z
  - ContainerStatusReason: OOMKilled
  - RestartCount: 4
  - ContainerStatus: terminated
- **Note**: Original scenario-oom-killed.kql query returned 0 rows because it looks for "OOMKilled" in KubeEvents.Reason, but Container Insights captures this as ContainerStatusReason in KubePodInventory

#### pod-lifecycle.json ✅ PASS
- **Results**: 28 rows across all 'energy' namespace pods
- **Key meter-service Evidence**:
  - meter-service-686c5dbfc7-mfvgw: 4 restarts, BackOff events
  - meter-service-686c5dbfc7-gds69: 3 restarts, BackOff events
  - meter-service-5b8f45f67f-tpfq6: 0 restarts, FailedScheduling event (recovery pod)
  - meter-service-5b8f45f67f-dkd5c: 0 restarts (recovery pod)
- **Failure Reasons Captured**: ["BackOff"], ["FailedScheduling"]

#### alert-history.kql ❌ BLOCKED (schema issue)
- **Status**: Query returned 0 rows
- **Known Issue**: Query expects `properties_s` column in AzureDiagnostics (Activity Log JSON blob)
- **Schema Reality**: Column does NOT exist in current workspace schema
- **Previous Investigation**: Ripley claimed Activity Log diagnostics configured, but schema evidence shows otherwise
- **Impact**: Non-critical for Wave 1 UAT (alerts not primary success criteria)
- **Recommendation**: Mark as BLOCKED, document in status, proceed with kubectl + KQL pod evidence

## Observations

### Scenario Behavior
- Both meter-service pods crashed simultaneously after applying 16Mi memory limit
- OOMKilled trigger time: ~60-70 seconds after scenario application
- Restart pattern: 3-4 restarts before diagnosis
- Recovery clean: No residual CrashLoopBackOff after fix applied

### Container Insights Ingestion
- Telemetry lag: ~1 minute (scenario at 03:42:27Z, visible at 03:42:46Z)
- Data completeness: Both KubePodInventory and KubeEvents tables populated
- **Important**: OOMKilled appears as `ContainerStatusReason` in KubePodInventory, NOT as `Reason` in KubeEvents

### Cluster Issues Encountered
- **Node Scheduling**: All pods initially Pending due to missing `nodepool-type=user` label on workload node
- **Resolution**: Manually labeled aks-workload-52238159-vmss000003 with `nodepool-type=user`
- **Impact**: 5-minute delay in baseline deployment, no impact on scenario execution

## Redaction Summary
- **kubectl Output**: ✅ 0 remaining UUIDs, 0 IPs, 0 node names
- **KQL Output**: ✅ 0 remaining subscription IDs, 0 resource group names
- **Backup Location**: kubectl-output-rerun-raw/, kql-results-rerun/*-raw.json (.gitignore protected)

## Final Verdict

| Category | Status | Details |
|----------|--------|---------|
| **MTTR** | ✅ PASS | 147 seconds (< 900s threshold) |
| **kubectl Evidence** | ✅ COMPLETE | 9 files, fully redacted |
| **KQL Evidence** | ✅ PARTIAL | 2/3 queries successful (alert-history blocked by schema) |
| **Overall** | ✅ **PASS** | Wave 1 OOMKilled UAT objectives met |

## Comparison to Original Run

| Metric | Original (2026-04-26 02:19-02:21Z) | Rerun (03:41-03:43Z) |
|--------|----------------------------------|----------------------|
| MTTR | 21 seconds | 147 seconds |
| kubectl Evidence | ✅ COMPLETE | ✅ COMPLETE |
| KQL Evidence | ❌ BLOCKED (timing gap) | ✅ PARTIAL (2/3 queries) |
| Container Insights | ❌ Not ingesting | ✅ Active ingestion |
| Overall Verdict | PASS (kubectl only) | **✅ PASS (telemetry-backed)** |

## Next Steps
1. Update EVIDENCE-STATUS.md with final rerun verdict
2. Preserve original kubectl evidence as historical record
3. Mark rerun as "official Wave 1 telemetry-backed evidence"
4. Keep SRE Agent portal evidence as PENDING_HUMAN_PORTAL (John's responsibility)
5. Cluster remains running for additional Wave 1 scenarios (Ripley handles cost-stop after Lambert gate close)

---
**Parker's Notes**:
- Pre-flight Container Insights check prevented second data loss incident
- Enhanced OOMKilled query compensates for KubeEvents.Reason limitation
- pod-lifecycle.kql provides comprehensive pod state tracking
- alert-history.kql schema issue requires Ripley/John investigation (non-blocking for Wave 1)
