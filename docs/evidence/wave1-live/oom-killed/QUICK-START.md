# Quick Start — Execute OOMKilled Evidence Collection (When Cluster Healthy)

> **This is a cheat sheet for Parker** — Execute this sequence once Ripley confirms cluster health is restored.

---

## Pre-Flight Check

```bash
# Verify cluster health
kubectl get nodes
# EXPECTED: All nodes show Ready

kubectl get pods -n energy
# EXPECTED: All pods show 1/1 Running, RestartCount=0

# If any issues, STOP and notify Ripley
```

---

## T0: Baseline Evidence (2 minutes)

```bash
cd /Users/johnstel/Code/azure-sre-agent-energy-grid

# Capture baseline pod state
kubectl get pods -n energy -o wide > docs/evidence/wave1-live/oom-killed/kubectl-output/T0-baseline-pods.txt

# Capture baseline events
kubectl get events -n energy --sort-by='.lastTimestamp' > docs/evidence/wave1-live/oom-killed/kubectl-output/T0-baseline-events.txt

# Record timestamp in run-notes.md
echo "T0: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/evidence/wave1-live/oom-killed/run-notes.md

# Verify meter-service is healthy
kubectl get pods -n energy | grep meter-service
# EXPECTED: meter-service-XXXXXXX-XXXXX   1/1   Running   0   Xm
```

---

## T1: Apply Scenario (30 seconds)

```bash
# Record start time
echo "T1: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/evidence/wave1-live/oom-killed/run-notes.md

# Apply OOMKilled scenario
kubectl apply -f k8s/scenarios/oom-killed.yaml

# Immediately capture post-apply state
kubectl get pods -n energy -o wide > docs/evidence/wave1-live/oom-killed/kubectl-output/T1-scenario-applied.txt
```

---

## T2: Observe Failure (30-60 seconds after T1)

```bash
# Watch for OOMKilled (wait ~30-60 seconds)
kubectl get pods -n energy | grep meter-service
# EXPECTED: CrashLoopBackOff or OOMKilled status

# Record OOMKilled timestamp
echo "T2: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/evidence/wave1-live/oom-killed/run-notes.md

# Capture meter-service status
kubectl get pods -n energy | grep meter-service > docs/evidence/wave1-live/oom-killed/kubectl-output/T2-meter-status.txt

# Capture OOMKilled events
kubectl get events -n energy --field-selector involvedObject.name=meter-service --sort-by='.lastTimestamp' > docs/evidence/wave1-live/oom-killed/kubectl-output/T2-oomkilled-events.txt

# Verify OOMKilled event is present
grep -i "oomkilled" docs/evidence/wave1-live/oom-killed/kubectl-output/T2-oomkilled-events.txt
```

---

## T3: Detailed Diagnosis (2 minutes)

```bash
# Record diagnosis timestamp
echo "T3: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/evidence/wave1-live/oom-killed/run-notes.md

# Describe pods (shows OOMKilled in Events, memory limits)
kubectl describe pod -n energy -l app=meter-service > docs/evidence/wave1-live/oom-killed/kubectl-output/T3-describe-pod.txt

# Capture previous container logs (if available)
kubectl logs -n energy -l app=meter-service --previous --tail=50 > docs/evidence/wave1-live/oom-killed/kubectl-output/T3-previous-logs.txt 2>&1 || echo "No previous logs available"

# Verify memory limit is 16Mi
grep -A 5 "Limits:" docs/evidence/wave1-live/oom-killed/kubectl-output/T3-describe-pod.txt
# EXPECTED: memory: 16Mi
```

---

## T4: Apply Fix (1 minute)

```bash
# Record fix timestamp
echo "T4: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/evidence/wave1-live/oom-killed/run-notes.md

# Restore healthy state
kubectl apply -f k8s/base/application.yaml

# Watch pods recover
kubectl get pods -n energy -w
# Press Ctrl+C when all meter-service pods are Running

# Capture post-fix state
kubectl get pods -n energy -o wide > docs/evidence/wave1-live/oom-killed/kubectl-output/T4-restore-healthy.txt
```

---

## T5: Verify Recovery (1 minute)

```bash
# Record recovery timestamp
echo "T5: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/evidence/wave1-live/oom-killed/run-notes.md

# Verify all pods healthy
kubectl get pods -n energy | grep meter-service
# EXPECTED: All Running, RestartCount=0 for new pods

# Capture post-recovery events
kubectl get events -n energy --sort-by='.lastTimestamp' | head -20 > docs/evidence/wave1-live/oom-killed/kubectl-output/T5-post-recovery-events.txt

# Verify no recent OOMKilled events
grep -i "oomkilled" docs/evidence/wave1-live/oom-killed/kubectl-output/T5-post-recovery-events.txt
# EXPECTED: No OOMKilled events in last 2 minutes
```

---

## KQL Evidence (5-10 minutes)

**Wait 2-5 minutes** for Log Analytics ingestion after T2 before running KQL queries.

1. Open Azure Portal → Log Analytics workspace (log-srelab)
2. Go to "Logs" section
3. Run each query and export results:

### Query 1: scenario-oom-killed.kql
```kql
# Copy from: docs/evidence/kql/stable/scenario-oom-killed.kql
# Export results to CSV: docs/evidence/wave1-live/oom-killed/kql-results/scenario-oom-killed.csv
```

### Query 2: pod-lifecycle.kql
```kql
# Copy from: docs/evidence/kql/stable/pod-lifecycle.kql
# Export results to CSV: docs/evidence/wave1-live/oom-killed/kql-results/pod-lifecycle.csv
```

### Query 3: alert-history.kql
```kql
# Copy from: docs/evidence/kql/stable/alert-history.kql
# Export results to CSV: docs/evidence/wave1-live/oom-killed/kql-results/alert-history.csv
```

**If no results**: Document ingestion delay in run-notes.md and wait 5 more minutes.

---

## SRE Agent Evidence (Human Required)

**Parker stops here** — Coordinate with John for portal interaction.

**John's Action**: Follow step-by-step guide in:
```
docs/evidence/wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md
```

**Evidence to capture**:
- `sre-agent/diagnosis-response.md` (full response text)
- `sre-agent/screenshots/diagnosis-complete.png` (conversation screenshot)
- Accuracy assessment (PASS/FAIL/PARTIAL)

---

## MTTR Calculation (5 minutes)

Extract timestamps from run-notes.md and calculate metrics:

```bash
# Create MTTR summary
cat > docs/evidence/wave1-live/oom-killed/metrics/mttr-summary.yaml << 'EOF'
scenario: oom-killed
T0_baseline: "TBD"  # From run-notes.md
T1_scenario_applied: "TBD"
T2_first_oomkilled: "TBD"
T3_diagnosis_complete: "TBD"
T4_fix_applied: "TBD"
T5_recovery_verified: "TBD"

mttr_seconds: TBD  # T4 - T2
detection_time_seconds: TBD  # T2 - T1
recovery_time_seconds: TBD  # T5 - T4

pass_criteria_met: TBD  # true if MTTR < 900 seconds
EOF
```

Calculate timestamps and populate the YAML file.

---

## Evidence Redaction (5 minutes)

Before committing evidence:

```bash
# Redact sensitive data from all kubectl output files
cd docs/evidence/wave1-live/oom-killed/kubectl-output/

# Redact subscription IDs
sed -i '' 's/[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}/<REDACTED_SUBSCRIPTION_ID>/g' *.txt

# Redact resource IDs
sed -i '' 's|/subscriptions/.*/resourceGroups/.*|<REDACTED_AKS_RESOURCE_ID>|g' *.txt

# Redact IP addresses
sed -i '' 's/10\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}/<REDACTED_IP>/g' *.txt

# Redact node names (keep pod names)
sed -i '' 's/aks-[a-z0-9-]*vmss[0-9a-f]*/<REDACTED_NODE>/g' *.txt

# Verify redaction
grep -r "10\." . || echo "IP redaction OK"
grep -r "vmss" . || echo "Node redaction OK"
```

**Do NOT redact**: Pod names, namespace, event reasons, container names.

---

## Finalize Documentation (10 minutes)

1. **Update run-notes.md**:
   - Fill in all TBD timestamps
   - Add observations for each phase (T0-T5)
   - Document SRE Agent accuracy assessment
   - Add unexpected behaviors or blockers

2. **Update checklist.md**:
   - Mark all checkboxes as complete
   - Update status to ✅ COMPLETE

3. **Update README.md**:
   - Change status from 🚨 BLOCKER to ✅ COMPLETE
   - Add completion timestamp

4. **Append to history.md**:
   - Add learnings section for OOMKilled execution
   - Document any unexpected behaviors or process improvements

---

## Commit Evidence

```bash
git add docs/evidence/wave1-live/
git commit -m "Wave 1: OOMKilled scenario evidence collection

- Complete T0-T5 timeline with kubectl evidence
- KQL query results (scenario-oom-killed, pod-lifecycle, alert-history)
- SRE Agent diagnosis captured and assessed
- MTTR measured: TBD seconds (PASS: < 900s)
- Evidence redacted per policy

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Completion Checklist

- [ ] T0-T5 kubectl evidence captured
- [ ] KQL results exported (3 files)
- [ ] SRE Agent evidence captured (human action)
- [ ] MTTR calculated and documented
- [ ] Evidence redacted
- [ ] run-notes.md completed
- [ ] checklist.md marked complete
- [ ] README.md status updated
- [ ] history.md learnings appended
- [ ] Evidence committed to Git

---

**Estimated Total Time**: 30-40 minutes (including waiting periods)

**Parker Time**: 20-25 minutes
**John Time**: 5-10 minutes (SRE Agent portal)
**Waiting Time**: 2-5 minutes (Log Analytics ingestion)
