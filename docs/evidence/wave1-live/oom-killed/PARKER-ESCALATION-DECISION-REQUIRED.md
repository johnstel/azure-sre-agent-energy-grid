# DECISION REQUIRED: KQL Evidence Path — John Action

**From**: Parker (SRE Dev)
**To**: John
**Priority**: HIGH
**Status**: ⏸️ PAUSED (awaiting rerun authorization)
**Date**: 2026-04-26T03:25:00Z

---

## Situation

Container Insights blocker has been **RESOLVED** by Ripley. Data ingestion is now functional (909 KubePodInventory rows, 110 KubeEvents). However, the original OOMKilled scenario execution window (02:19:27Z - 02:21:18Z) was **NOT captured** due to a 62-minute timing gap between scenario execution and Container Insights pipeline activation.

**Result**: All KQL queries returned **0 rows** for the 'energy' namespace.

---

## Background

### Wave 1 OOMKilled Evidence Status

| Evidence Category | Status | Notes |
|-------------------|--------|-------|
| kubectl Output    | ✅ **PASS** | Complete (T0-T5), MTTR 21s, Redacted, Authorized for Git commit |
| KQL Queries       | ❌ **BLOCKED** | Original window unrecoverable (data loss due to timing gap) |
| SRE Agent Portal  | ⏳ **PENDING** | PENDING_HUMAN_PORTAL (your action - see HUMAN-ACTION-CHECKLIST.md) |

### What Happened

1. **Original Scenario Execution**: 02:19:27Z - 02:21:18Z (SUCCESS)
   - kubectl evidence captured successfully (T0-T5 complete)
   - MTTR: 21 seconds (PASS)
   - All evidence redacted per Lambert gate requirements

2. **Container Insights Pipeline Issue**: 02:21:18Z - 03:22:46Z
   - Pipeline not ingesting data during this 62-minute window
   - Ripley resolved the blocker (unknown when resolution occurred)
   - Data ingestion started at ~03:22:46Z (AFTER scenario completion)

3. **KQL Retry #2 Findings**: 03:21:17Z
   - ✅ Container Insights: WORKING (system namespaces have data)
   - ❌ 'energy' namespace: 0 rows (no data for ANY timeframe)
   - ❌ Application: REMOVED (energy namespace is empty - all pods gone)

---

## The Problem

**Original scenario window (02:19-02:21) is permanently unrecoverable**. Container Insights cannot backfill historical data from before pipeline activation.

**'energy' namespace is completely empty**. The entire grid platform application has been removed from the cluster (unknown when/why).

---

## Decision Required

### Option A: Re-Execute OOMKilled Scenario ✅ **PARKER RECOMMENDS**

**Prerequisites**:
1. Redeploy grid platform to 'energy' namespace
2. Verify Container Insights actively ingesting 'energy' namespace
3. Re-execute T0-T5 OOMKilled scenario
4. Wait 5-15 minutes for ingestion
5. Retry KQL queries with new timestamp window

**Pros**:
- ✅ Complete KQL evidence (queries guaranteed to work)
- ✅ Demonstrates full kubectl + KQL + SRE Agent path (Wave 1 objective)
- ✅ kubectl evidence UNCHANGED (already PASS, authorized for commit)
- ✅ Container Insights proven working (909 rows in system namespaces)

**Cons**:
- ⏱️ Time investment: ~30-45 minutes (redeploy + scenario + ingestion + queries)
- 📝 Original window evidence lost (acceptable per "no fabrication" requirement)

**Impact on Existing kubectl Evidence**:
- **NO IMPACT** - kubectl evidence is already complete and authorized
- Original T0-T5 timeline remains the official record
- Scenario rerun would be NEW evidence (not replacing originals)

**Time Estimate**: ~45 minutes total
- 10 min: Application redeployment + verification
- 5 min: T0-T5 scenario re-execution
- 15 min: Container Insights ingestion wait
- 10 min: KQL queries + redaction
- 5 min: Final evidence status update

### Option B: Accept BLOCKED Status (Incomplete Wave 1)

**Pros**:
- ✅ No re-work required
- ✅ Transparent documentation of real-world Container Insights limitation
- ✅ kubectl evidence already demonstrates MTTR capability

**Cons**:
- ❌ Does NOT demonstrate KQL evidence path (incomplete objective)
- ❌ SRE Agent evidence may also be blocked (if portal relies on Container Insights)
- ❌ Wave 1 UAT only 1/3 complete (kubectl only)

---

## Parker's Recommendation

**Option A - Re-Execute Scenario**

**Rationale**:
1. Container Insights is NOW proven working (909 rows verified)
2. Complete end-to-end evidence path aligns with Wave 1 objective
3. kubectl evidence is unaffected (already PASS)
4. Time investment justified by complete evidence delivery
5. Demonstrates real production SRE workflow (kubectl + KQL + portal)

---

## Questions for You

1. **Authorization**: Approve Option A (scenario rerun)?
2. **Application Removal**: Was 'energy' namespace teardown intentional? Can it be restored?
3. **Cluster Availability**: Is `aks-gridmon-dev` available for rerun?
4. **Timeline**: Any urgency constraints on Wave 1 evidence delivery?

---

## What Parker Will Do (If Option A Approved)

1. ✅ Verify cluster access and health
2. ✅ Deploy grid platform application (`kubectl apply -f k8s/base/application.yaml`)
3. ✅ Verify Container Insights ingesting 'energy' namespace (pre-flight check)
4. ✅ Execute T0-T5 OOMKilled scenario (same methodology as original)
5. ✅ Wait 15 minutes for Container Insights ingestion
6. ✅ Execute all 3 KQL queries
7. ✅ Redact KQL results (subscription IDs, resource IDs)
8. ✅ Update EVIDENCE-STATUS.md with final verdict (PASS/PARTIAL/BLOCKED)
9. ✅ Hand off to you for SRE Agent portal evidence

**No kubectl evidence will be modified or replaced** - original T0-T5 captures remain the official record.

---

## Supporting Evidence

- ✅ Full retry analysis: `kql-results/KQL-RETRY-OUTCOME.md` (9K)
- ✅ Diagnostic queries: Data availability verified (Heartbeat, KubeEvents, KubePodInventory)
- ✅ Namespace distribution: 'energy' = 0 rows, 'kube-system' = 1001 rows
- ✅ Timeline gap: 62 minutes between scenario and ingestion start

---

## Parker Status

**Current**: ⏸️ **PAUSED** - Awaiting your decision
**Next Action**: Execute Option A (if approved) or update evidence status to BLOCKED (if Option B)
**Availability**: Standing by for immediate execution

---

**Reply with**:
- "Option A - Proceed with rerun" → Parker will execute immediately
- "Option B - Accept BLOCKED" → Parker will update evidence status and close KQL path
- "Need more info on [topic]" → Parker will provide additional analysis

**Time-sensitive**: If Option A, sooner is better (cluster availability unknown)
