# Wave 2 — Standing By for Cluster Resolution

**Date**: 2026-04-26T08:05:00Z
**Status**: ⏸️ **STANDING BY** (Ripley resolving cluster blocker)
**Owner**: Parker → Awaiting Ripley handoff

---

## Current Situation

### Cluster Name Discrepancy Identified ✅

**Wave 1 Evidence** (OOMKilled — successful):
- Cluster: `aks-gridmon-dev`
- Resource Group: `rg-gwsrelab-eastus2` (inferred from evidence)
- Evidence: `docs/evidence/wave1-live/oom-killed/`

**Wave 2 Target** (Parker initial attempt):
- Cluster: `aks-srelab`
- Resource Group: `rg-srelab-eastus2`
- Status: **Stopped** (power state)

**Issue**: Different cluster names — Wave 1 used `aks-gridmon-dev`, Parker targeted `aks-srelab`. Need Ripley to confirm correct target cluster.

---

## What's Ready (Preserved) ✅

### Wave 2 Evidence Infrastructure (19 files, 16 directories)
- ✅ MongoDBDown: Execution guide, evidence plan, status tracker, alert integration
- ✅ ServiceMismatch: Execution guide, evidence plan, status tracker, alert integration
- ✅ Alert firing evidence integration (ARG queries, NO_ALERT_FIRED docs)
- ✅ SRE Agent portal checklists
- ✅ Directory structure created
- ✅ Evidence templates prepared

**All assets validated against Wave 1 OOMKilled template** — ready to execute.

---

## What's Pending Ripley Resolution ⏳

### Cluster Information Required
- [ ] Correct cluster name (aks-gridmon-dev or aks-srelab?)
- [ ] Correct resource group name
- [ ] Cluster power state: Running
- [ ] Log Analytics workspace name/ID
- [ ] Confirmation Container Insights is active

**Once Ripley provides**:
1. Verify cluster is Running
2. Update cluster names in guides if needed (find/replace)
3. Execute MongoDBDown live capture (35-45 min)
4. Execute ServiceMismatch live capture (35-45 min)
5. Capture SRE Agent portal evidence (John)

---

## Execution Readiness

### MongoDBDown — Ready ✅
**Guide**: `docs/evidence/wave2-live/mongodb-down/EXECUTION-GUIDE.md`
**Evidence Directories**: kubectl-output/, kql-results/, metrics/, sre-agent/
**Alert Integration**: ARG query with possible pod-failures/http-5xx alerts
**Estimated Time**: 35-45 minutes after cluster confirmation

**Pre-flight Steps** (when cluster available):
1. Verify cluster Running: `az aks show --query powerState.code`
2. Get credentials: `az aks get-credentials`
3. Verify energy namespace: `kubectl get pods -n energy`
4. Verify Container Insights: Check KQL ingestion (last 5 minutes)
5. Execute T0-T5 capture following guide

### ServiceMismatch — Ready ✅
**Guide**: `docs/evidence/wave2-live/service-mismatch/EXECUTION-GUIDE.md`
**Evidence Directories**: kubectl-output/, kql-results/, metrics/, sre-agent/
**Alert Integration**: ARG query with NO_ALERT_FIRED expected (silent failure)
**Estimated Time**: 35-45 minutes after cluster confirmation

**Pre-flight Steps** (when cluster available):
1. Same as MongoDBDown (shared cluster)
2. Execute T0-T5 capture following guide
3. Capture critical K8s API evidence (selector vs. labels mismatch)

---

## Cluster Name Update Plan (If Needed)

**If target cluster is** `aks-gridmon-dev` (not `aks-srelab`):

### Files to Update
```bash
# Find/replace cluster name
find docs/evidence/wave2-live -type f -name "*.md" -exec sed -i '' 's/aks-srelab/aks-gridmon-dev/g' {} +

# Find/replace resource group (if different)
find docs/evidence/wave2-live -type f -name "*.md" -exec sed -i '' 's/rg-srelab-eastus2/rg-gwsrelab-eastus2/g' {} +

# Verify updates
grep -r "aks-srelab\|rg-srelab" docs/evidence/wave2-live/
```

**Estimated time**: 5 minutes to update + verify

---

## Alert Rules Verification (When Cluster Available)

**Deployed Alert Rules** (from Wave 1):
- `alert-gridmon-dev-crashloop-oom` (Sev1) — Note: uses "gridmon-dev" prefix
- `alert-gridmon-dev-pod-restarts` (Sev2)
- `alert-gridmon-dev-http-5xx` (Sev2)
- `alert-gridmon-dev-pod-failures` (Sev2)

**If cluster is** `aks-gridmon-dev`:
- Alert names already match Wave 1 evidence
- ARG queries will use correct alert rule names

**If cluster is** `aks-srelab`:
- Alert names may need adjustment (alert-srelab-* vs alert-gridmon-dev-*)
- Verify alert rules deployed in target resource group

---

## Communication Protocol

### When Ripley Provides Cluster Info:
1. **Ripley → Parker**: Cluster name, resource group, power state, workspace ID
2. **Parker → Parker**: Verify cluster Running, update guides if needed
3. **Parker → John**: "Ready to execute Wave 2 MongoDBDown — starting in 5 minutes"
4. **Parker → Parker**: Execute MongoDBDown T0-T5 + alert ARG + KQL
5. **Parker → John**: "MongoDBDown complete — ready for SRE Agent portal capture"
6. **Parker → Parker**: Execute ServiceMismatch T0-T5 + alert ARG (NO_ALERT_FIRED) + KQL
7. **Parker → John**: "ServiceMismatch complete — ready for SRE Agent portal capture"
8. **Parker → Lambert**: "Wave 2 kubectl + KQL evidence complete — awaiting SRE Agent portal"

---

## Risk Assessment

**LOW RISK** — All prep work complete, execution is straightforward:
- ✅ Guides tested against existing cluster structure
- ✅ KQL queries stable and validated
- ✅ Alert integration follows Ripley's proven ARG pattern
- ✅ Wave 1 OOMKilled template validates methodology
- ⚠️ Only risk: Cluster name mismatch (easily corrected with find/replace)

---

## Parker's Status

**Standing by** for Ripley cluster resolution. All Wave 2 evidence infrastructure ready. MongoDBDown and ServiceMismatch execution guides prepared with alert-firing integration. Can execute live captures within **~90 minutes** of cluster confirmation (both scenarios + redaction, excluding SRE Agent portal). Cluster name discrepancy noted (`aks-srelab` vs `aks-gridmon-dev`) — ready to update guides if target was incorrect. No terminal blockers — ready to proceed immediately when cluster is available.

---

**Next**: Ripley provides cluster details → Parker updates guides (if needed) → Parker executes live captures → John captures SRE Agent portal evidence → Parker finalizes Wave 2 report.
