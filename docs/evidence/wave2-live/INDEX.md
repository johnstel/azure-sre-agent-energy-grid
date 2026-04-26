# Wave 2 Live Evidence — Index

**Status**: ⏳ PENDING_CLUSTER_START
**Scenarios**: MongoDBDown, ServiceMismatch
**Owner**: Parker
**Last Updated**: 2026-04-26T07:52:00Z

---

## Quick Links

| Document | Purpose | Status |
|----------|---------|--------|
| **BLOCKER-CLUSTER-STOPPED.md** | Critical blocker summary + options | ✅ COMPLETE |
| **PARKER-FINAL-REPORT.md** | Wave 2 completion summary + escalation | ✅ COMPLETE |
| **mongodb-down/** | MongoDBDown scenario evidence | ⏳ PENDING |
| **service-mismatch/** | ServiceMismatch scenario evidence | ⏳ PENDING |

---

## Blocker Summary

**Critical Blocker**: AKS cluster `aks-srelab` is **Stopped**
**Impact**: Cannot execute live kubectl + KQL evidence capture
**Resolution Required**: John approval to restart cluster
**Details**: See `BLOCKER-CLUSTER-STOPPED.md`

---

## Scenario Status

### MongoDBDown — Cascading Dependency Failure
**Complexity**: Medium
**Status**: ⏳ PENDING_CLUSTER_START

**Assets Ready**:
- ✅ Scenario manifest: `k8s/scenarios/mongodb-down.yaml`
- ✅ KQL queries: `docs/evidence/kql/stable/scenario-mongodb-down.kql`, `pod-lifecycle.kql`
- ✅ Evidence plan: `mongodb-down/EVIDENCE-PLAN.md`
- ✅ Execution guide: `mongodb-down/EXECUTION-GUIDE.md`
- ✅ Evidence status: `mongodb-down/EVIDENCE-STATUS.md`
- ✅ SRE Agent checklist: `mongodb-down/sre-agent/HUMAN-ACTION-CHECKLIST.md`

**Evidence Pending** (when cluster starts):
- ⏳ T0-T5 kubectl evidence (16 files)
- ⏳ KQL results (2 files)
- ⏳ MTTR calculation
- ⏳ SRE Agent portal capture

**Estimated Time**: 35-45 minutes after cluster start

---

### ServiceMismatch — Silent Configuration Mismatch
**Complexity**: High
**Status**: ⏳ PENDING_CLUSTER_START

**Assets Ready**:
- ✅ Scenario manifest: `k8s/scenarios/service-mismatch.yaml`
- ✅ KQL queries: `docs/evidence/kql/stable/scenario-service-mismatch.kql`, `pod-lifecycle.kql`
- ✅ Evidence plan: `service-mismatch/EVIDENCE-PLAN.md`
- ✅ Execution guide: `service-mismatch/EXECUTION-GUIDE.md`
- ✅ Evidence status: `service-mismatch/EVIDENCE-STATUS.md`
- ✅ SRE Agent checklist: `service-mismatch/sre-agent/HUMAN-ACTION-CHECKLIST.md`

**Evidence Pending** (when cluster starts):
- ⏳ T0-T5 kubectl evidence (14 files, including critical K8s API evidence)
- ⏳ KQL results (2 files)
- ⏳ MTTR calculation
- ⏳ SRE Agent portal capture

**Estimated Time**: 35-45 minutes after cluster start

---

## Evidence Structure

```
docs/evidence/wave2-live/
├── INDEX.md                              # ← You are here
├── BLOCKER-CLUSTER-STOPPED.md            # ✅ COMPLETE
├── PARKER-FINAL-REPORT.md                # ✅ COMPLETE
├── mongodb-down/
│   ├── EVIDENCE-PLAN.md                  # ✅ READY
│   ├── EVIDENCE-STATUS.md                # ✅ READY
│   ├── EXECUTION-GUIDE.md                # ✅ READY
│   ├── kubectl-output/                   # ⏳ PENDING (16 files)
│   ├── kql-results/                      # ⏳ PENDING (2 files)
│   ├── metrics/                          # ⏳ PENDING (mttr-summary.yaml)
│   └── sre-agent/
│       └── HUMAN-ACTION-CHECKLIST.md     # ✅ READY
└── service-mismatch/
    ├── EVIDENCE-PLAN.md                  # ✅ READY
    ├── EVIDENCE-STATUS.md                # ✅ READY
    ├── EXECUTION-GUIDE.md                # ✅ READY
    ├── kubectl-output/                   # ⏳ PENDING (14 files)
    ├── kql-results/                      # ⏳ PENDING (2 files)
    ├── metrics/                          # ⏳ PENDING (mttr-summary.yaml)
    └── sre-agent/
        └── HUMAN-ACTION-CHECKLIST.md     # ✅ READY
```

---

## Execution Path (When Cluster Started)

1. **Start Cluster** (5-10 min)
   ```bash
   az aks start --resource-group rg-srelab-eastus2 --name aks-srelab
   ```

2. **Execute MongoDBDown** (35-45 min)
   - Follow: `mongodb-down/EXECUTION-GUIDE.md`
   - Output: 16 kubectl files + 2 KQL results + MTTR metrics

3. **Execute ServiceMismatch** (35-45 min)
   - Follow: `service-mismatch/EXECUTION-GUIDE.md`
   - Output: 14 kubectl files + 2 KQL results + MTTR metrics

4. **SRE Agent Portal Capture** (10-15 min per scenario)
   - MongoDBDown: Follow `mongodb-down/sre-agent/HUMAN-ACTION-CHECKLIST.md`
   - ServiceMismatch: Follow `service-mismatch/sre-agent/HUMAN-ACTION-CHECKLIST.md`

**Total Time**: ~2 hours

---

## Reference Evidence

**Wave 1 OOMKilled** (accepted baseline):
- Location: `docs/evidence/wave1-live/oom-killed/`
- Status: ✅ PASS (kubectl + KQL evidence complete, SRE Agent PENDING_HUMAN_PORTAL)
- Template: Wave 2 scenarios follow Wave 1 structure

---

## Contract Validation

**Wave 2 vs. Wave 1 Contract**:
- ✅ T0-T5 kubectl evidence structure
- ✅ KQL queries using stable Container Insights schema
- ✅ MTTR < 900s threshold
- ✅ Root cause vs. symptom documentation
- ✅ Redaction guidelines
- ✅ SRE Agent portal evidence placeholders

**No contract gaps identified** — Wave 2 ready for execution when cluster is available.

---

## Next Steps

1. **John**: Review `BLOCKER-CLUSTER-STOPPED.md` and approve cluster restart (or select alternative)
2. **John**: Restart cluster if approved
3. **Parker**: Execute MongoDBDown + ServiceMismatch following execution guides
4. **John**: Capture SRE Agent portal evidence for both scenarios
5. **Parker**: Update evidence status trackers and create final report

---

## Support

**Questions/Issues**:
- Scenario design: Parker
- Cluster restart: Ripley (infrastructure boundary)
- SRE Agent portal: John (non-interactive requirement)
- Evidence validation: Lambert (UAT gatekeeper)
