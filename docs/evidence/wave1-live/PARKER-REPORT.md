# Parker's Wave 1 OOMKilled Evidence Path — Completion Report

**Date**: 2026-04-25
**Owner**: Parker (SRE Dev)
**Status**: ✅ FRAMEWORK COMPLETE — 🚨 EXECUTION BLOCKED (awaiting Ripley)

---

## Executive Summary

I have **completed the OOMKilled end-to-end SRE evidence path framework** for Wave 1 live UAT. Everything is ready for execution once Ripley restores cluster health.

**Current Blocker**: 4/5 AKS nodes are NotReady, all pods stuck in Pending. This is a Ripley-level infrastructure issue, not a K8s application issue. I cannot execute the scenario until the cluster is healthy.

**What I Built**:
- Complete Wave 1 evidence collection framework with T0-T5 timeline templates
- Step-by-step execution guides (QUICK-START.md for me, HUMAN-ACTION-CHECKLIST.md for you)
- Directory structure for kubectl evidence, KQL results, SRE Agent portal captures, and MTTR metrics
- Exact prompts and checklists for all human-required actions (SRE Agent portal)
- Transparent blocker documentation so the team knows exactly what's blocking Wave 1

**What I Did NOT Do**:
- Did not fake evidence or portal output (per your instructions)
- Did not modify Bicep or deployment scripts (Ripley's domain)
- Did not create new K8s scenarios (only evidence collection)
- Did not work around the cluster health blocker

---

## Deliverables Created

### 1. Evidence Framework Documentation

| File | Purpose | Status |
|------|---------|--------|
| `wave1-live/README.md` | Blocker tracking, dependency on Ripley | ✅ |
| `wave1-live/STATUS.md` | Execution status dashboard | ✅ |
| `wave1-live/checklist.md` | Wave 1 evidence requirements (T0-T5) | ✅ |
| `wave1-live/BLOCKER-SUMMARY.md` | Executive summary for team | ✅ |

### 2. OOMKilled Scenario Framework

| File | Purpose | Status |
|------|---------|--------|
| `oom-killed/run-notes.md` | T0-T5 timeline template with MTTR tracking | ✅ |
| `oom-killed/QUICK-START.md` | Parker's execution cheat sheet | ✅ |
| `oom-killed/sre-agent/diagnosis-prompt.txt` | Exact SRE Agent prompt | ✅ |
| `oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md` | Your step-by-step portal guide | ✅ |
| `oom-killed/kubectl-output/README.md` | Evidence file guide | ✅ |
| `oom-killed/kql-results/README.md` | KQL export guide | ✅ |

### 3. Directory Structure

```
wave1-live/oom-killed/
├── run-notes.md
├── QUICK-START.md
├── kubectl-output/          # Ready for T0-T5 evidence
├── kql-results/             # Ready for CSV exports
├── sre-agent/               # Ready for portal evidence
│   ├── diagnosis-prompt.txt
│   ├── HUMAN-ACTION-CHECKLIST.md
│   └── screenshots/
└── metrics/                 # Ready for MTTR YAML
```

---

## Cluster Health Blocker

**Issue**: 4/5 AKS nodes NotReady for 9+ hours
**Symptoms**: All energy namespace pods stuck in Pending
**Root Cause**: Node-level (VM health, kubelet, or network)
**Owner**: Ripley (Infrastructure)

**Impact**: Cannot execute OOMKilled scenario until cluster is healthy.

**See**: `wave1-live/BLOCKER-SUMMARY.md` for full details

---

## Execution Flow (When Cluster Healthy)

### Phase 1: Parker Executes Scenario (20-25 minutes)

1. Verify baseline health (all pods Running)
2. Follow `oom-killed/QUICK-START.md`:
   - T0: Capture baseline kubectl evidence
   - T1: Apply oom-killed.yaml
   - T2: Observe OOMKilled event (30-60s wait)
   - T3: Capture detailed diagnosis kubectl evidence
   - T4: Restore healthy state with application.yaml
   - T5: Verify recovery
3. Wait 2-5 minutes for Log Analytics ingestion
4. Run 3 KQL queries and export to CSV
5. Notify you when ready for portal evidence

### Phase 2: You Capture SRE Agent Evidence (5-10 minutes)

**Your Guide**: `oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md`

**Your Actions**:
1. Open Azure SRE Agent portal (aka.ms/sreagent/portal)
2. Enter exact prompt from `diagnosis-prompt.txt`:
   ```
   Why are meter-service pods crashing in the energy namespace?
   ```
3. Wait for response
4. Copy full response → save as `diagnosis-response.md`
5. Take screenshot of conversation
6. Assess accuracy (PASS/FAIL/PARTIAL):
   - Did it detect OOMKilled?
   - Did it identify 16Mi memory limit?
   - Did it recommend increasing memory?

### Phase 3: Parker Finalizes Documentation (10 minutes)

1. Calculate MTTR from T0-T5 timestamps
2. Complete run-notes with observations
3. Redact sensitive data (IPs, resource IDs)
4. Update checklist and status to COMPLETE
5. Append learnings to history
6. Commit evidence to Git

**Total Time**: ~35-45 minutes

---

## Dependencies

| Dependency | Owner | Status | Blocking |
|------------|-------|--------|----------|
| **Cluster Health** | Ripley | 🚨 BLOCKING | Everything |
| **Baseline Verification** | Parker | ⏳ PENDING | Cluster health |
| **OOMKilled Execution** | Parker | ⏳ PENDING | Cluster health |
| **SRE Agent Portal** | John | ⏳ PENDING | Parker T1-T3 |
| **MTTR Calculation** | Parker | ⏳ PENDING | All evidence |

---

## What You Need to Know

1. **I cannot execute until Ripley fixes the cluster** — 4/5 nodes are NotReady, all pods are Pending. This is not something I can fix in K8s manifests.

2. **I did not fake SRE Agent evidence** — I created an exact prompt and a step-by-step guide for you to capture portal evidence. The guide is in `oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md`.

3. **Everything is ready for execution** — The moment Ripley notifies me the cluster is healthy, I can execute the full T0-T5 timeline in ~20-25 minutes, then coordinate with you for portal evidence.

4. **Evidence framework is reusable** — This same structure (run-notes, QUICK-START, HUMAN-ACTION-CHECKLIST) can be reused for MongoDBDown and ServiceMismatch scenarios in the future.

5. **Redaction is built-in** — The QUICK-START includes sed commands to redact subscription IDs, resource IDs, and IPs from all evidence files before committing.

---

## Next Actions

**RIPLEY (BLOCKING)**:
1. Investigate why 4/5 nodes are NotReady
2. Restore all nodes to Ready state
3. Verify all energy namespace pods reach Running state
4. Notify Parker when cluster is healthy

**PARKER (when unblocked)**:
1. Verify baseline health
2. Execute QUICK-START.md (T0-T5)
3. Run KQL queries and export CSVs
4. Notify John when ready for portal evidence

**JOHN (after Parker T1-T3)**:
1. Follow HUMAN-ACTION-CHECKLIST.md
2. Capture SRE Agent portal evidence
3. Assess accuracy (PASS/FAIL/PARTIAL)

**PARKER (after John completes)**:
1. Calculate MTTR
2. Complete documentation
3. Redact and commit evidence

---

## Key Files to Review

1. **For blocker details**: `wave1-live/BLOCKER-SUMMARY.md`
2. **For execution status**: `wave1-live/STATUS.md`
3. **For evidence checklist**: `wave1-live/checklist.md`
4. **For Parker's execution**: `wave1-live/oom-killed/QUICK-START.md`
5. **For your portal action**: `wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md`

---

## Learnings Documented

I appended a detailed learning entry to `.squad/agents/parker/history.md` covering:
- The blocker encountered and how I handled it
- The evidence framework I built
- Key decisions (don't fake evidence, document blocker transparently)
- Learnings about hard dependencies, human-action checklists, and cross-role coordination
- Reusable patterns for future scenarios

---

## Summary

**What I Delivered**: Complete OOMKilled evidence collection framework, ready for execution.

**What's Blocking**: Ripley must restore cluster health (4/5 nodes NotReady).

**What Happens Next**: Ripley fixes cluster → Parker executes T0-T5 → You capture SRE Agent portal evidence → Parker finalizes documentation → Wave 1 OOMKilled complete.

**Estimated Time to Complete** (once unblocked): 35-45 minutes total.

---

**Parker**
SRE Dev | Kubernetes & Observability
2026-04-25 19:30 UTC
