# BLOCKER SUMMARY — Wave 1 OOMKilled Evidence Collection

**Date**: 2026-04-25
**Owner**: Parker (SRE Dev)
**Dependency**: Ripley (Infrastructure)
**Status**: 🚨 BLOCKED

---

## Executive Summary

**Task**: Own the OOMKilled end-to-end SRE evidence path for Wave 1 live UAT.

**Current Status**: BLOCKED — Cannot execute scenario due to AKS cluster health issues.

**Blocker**: 4/5 AKS nodes are NotReady, all `energy` namespace pods are Pending due to insufficient resources and node taints.

**Actions Taken**: Created complete Wave 1 evidence framework (run-notes, checklists, prompts, directory structure) so execution can proceed immediately once cluster is healthy.

**Next Step**: Ripley must investigate and restore AKS cluster health before Parker can proceed.

---

## Cluster Health Status

```
NAME                               STATUS     ROLES    AGE    VERSION
aks-system-33466352-vmss000003     NotReady   <none>   9h     v1.34.4
aks-workload-33466352-vmss000008   NotReady   <none>   9h     v1.34.4
aks-workload-33466352-vmss000009   NotReady   <none>   9h     v1.34.4
aks-workload-33466352-vmss00000a   NotReady   <none>   9h     v1.34.4
aks-workload-33466352-vmss00000b   Ready      <none>   176m   v1.34.4
```

**Impact**: All `energy` namespace pods stuck in Pending state:
- FailedScheduling: `0/5 nodes are available: 1 Insufficient cpu, 1 Too many pods, 4 node(s) had untolerated taint(s)`

**Root Cause Area**: Node-level issue (Azure VM, kubelet, network) — NOT a Kubernetes application issue

---

## Evidence Framework Status

✅ **COMPLETE** — Ready for execution once cluster is healthy:

| Component | Status | Location |
|-----------|--------|----------|
| Evidence README | ✅ Created | `docs/evidence/wave1-live/README.md` |
| Wave 1 Checklist | ✅ Created | `docs/evidence/wave1-live/checklist.md` |
| OOMKilled Run Notes (T0-T5) | ✅ Created | `wave1-live/oom-killed/run-notes.md` |
| SRE Agent Diagnosis Prompt | ✅ Created | `wave1-live/oom-killed/sre-agent/diagnosis-prompt.txt` |
| Human Action Checklist | ✅ Created | `wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md` |
| Directory Structure | ✅ Created | kubectl-output/, kql-results/, sre-agent/screenshots/, metrics/ |
| KQL Query Files | ✅ Verified | scenario-oom-killed.kql, pod-lifecycle.kql, alert-history.kql |

---

## Dependencies

### RIPLEY (Infrastructure Owner) — BLOCKING

**Must Do** (before Parker can proceed):
1. Investigate why 4/5 nodes are NotReady (9+ hours post-deployment)
2. Check:
   - Azure VM health for affected nodes
   - kubelet logs on NotReady nodes
   - Network connectivity (node-to-control-plane)
   - Node resource pressure (disk, memory)
   - Taints on NotReady nodes
3. Restore all nodes to Ready state
4. Verify all `energy` namespace pods reach Running state
5. Notify Parker when cluster is healthy

**Expected Outcome**: All nodes Ready, all pods Running, cluster ready for scenario execution

---

### PARKER (SRE Dev) — PENDING

**Waiting For**: Ripley to restore cluster health

**Ready To Execute** (once cluster is healthy):
1. T0: Verify baseline health per `run-notes.md`
2. T1-T5: Execute OOMKilled scenario per `run-notes.md`
3. Capture kubectl evidence per `checklist.md`
4. Run KQL queries and export results per `checklist.md`
5. Coordinate with John for SRE Agent portal evidence per `HUMAN-ACTION-CHECKLIST.md`
6. Calculate MTTR and complete learnings per `run-notes.md`

---

### JOHN (Operator) — PENDING

**Waiting For**: Parker to complete T1-T3 (scenario execution and kubectl evidence)

**Required Action**: Capture Azure SRE Agent portal evidence
- **When**: After Parker confirms OOMKilled event has occurred
- **How**: Follow step-by-step guide in `wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md`
- **Evidence**: Diagnosis response, screenshots, accuracy assessment

---

## Execution Readiness

**Pre-Execution Requirements**:
- [ ] All nodes in Ready state
- [ ] All pods in Running state (1/1 Ready)
- [ ] No Pending/CrashLoop pods in `energy` namespace
- [ ] Baseline health verified per T0 checklist

**Once Pre-Execution Complete**:
- Estimated execution time: 15-20 minutes (T0 → T5)
- Estimated human action time: 5-10 minutes (SRE Agent portal)
- Total Wave 1 OOMKilled evidence: ~30 minutes

---

## Evidence Framework Locations

All evidence will be captured in `docs/evidence/wave1-live/oom-killed/`:

```
oom-killed/
├── run-notes.md                    # T0-T5 timeline, observations, MTTR
├── kubectl-output/                 # CLI evidence
│   ├── T0-baseline-pods.txt
│   ├── T1-scenario-applied.txt
│   ├── T2-oomkilled-events.txt
│   ├── T3-describe-pod.txt
│   ├── T4-restore-healthy.txt
│   └── T5-post-recovery-events.txt
├── kql-results/                    # Log Analytics evidence
│   ├── scenario-oom-killed.csv
│   ├── pod-lifecycle.csv
│   └── alert-history.csv
├── sre-agent/                      # Azure SRE Agent evidence
│   ├── diagnosis-prompt.txt
│   ├── diagnosis-response.md
│   ├── HUMAN-ACTION-CHECKLIST.md
│   └── screenshots/
│       ├── conversation-ready.png
│       ├── prompt-ready.png
│       └── diagnosis-complete.png
└── metrics/                        # MTTR tracking
    └── mttr-summary.yaml
```

---

## Next Actions

| Owner | Action | Status |
|-------|--------|--------|
| **Ripley** | Investigate node NotReady root cause | 🚨 REQUIRED |
| **Ripley** | Restore all nodes to Ready state | ⏳ PENDING |
| **Ripley** | Verify all pods Running | ⏳ PENDING |
| **Ripley** | Notify Parker when cluster healthy | ⏳ PENDING |
| **Parker** | Verify baseline health (T0) | ⏳ BLOCKED |
| **Parker** | Execute OOMKilled scenario (T1-T5) | ⏳ BLOCKED |
| **Parker** | Capture kubectl/KQL evidence | ⏳ BLOCKED |
| **John** | Capture SRE Agent portal evidence | ⏳ BLOCKED |
| **Parker** | Complete MTTR and learnings | ⏳ BLOCKED |

---

## Contact

**Questions about blocker**: Contact Ripley (Infrastructure owner)
**Questions about evidence framework**: Contact Parker (SRE Dev)
**Questions about execution**: See `wave1-live/checklist.md` and `oom-killed/run-notes.md`

---

**Last Updated**: 2026-04-25 19:30 UTC
**Next Review**: When Ripley reports cluster health restored
