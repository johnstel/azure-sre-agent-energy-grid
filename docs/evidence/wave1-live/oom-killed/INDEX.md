# OOMKilled Evidence Collection — File Index

**Quick navigation for all OOMKilled scenario evidence files.**

---

## 📋 Planning & Execution Guides

| File | Purpose | Audience |
|------|---------|----------|
| `INDEX.md` | This file — navigate all evidence files | All |
| `PRE-EXECUTION-CHECKLIST.md` | Verify readiness before execution | Parker |
| `QUICK-START.md` | Step-by-step execution commands (T0-T5) | Parker |
| `run-notes.md` | T0-T5 timeline with observations | Parker |

---

## 🤖 Human Action Guides

| File | Purpose | Audience |
|------|---------|----------|
| `sre-agent/diagnosis-prompt.txt` | Exact SRE Agent prompt to use | John |
| `sre-agent/HUMAN-ACTION-CHECKLIST.md` | Step-by-step portal evidence capture | John |

---

## 📊 Evidence Output (Captured During Execution)

### kubectl Evidence
Location: `kubectl-output/`

| File | Captured At | Content |
|------|-------------|---------|
| `T0-baseline-pods.txt` | T0 | Healthy baseline pod state |
| `T0-baseline-events.txt` | T0 | Baseline events before scenario |
| `T1-scenario-applied.txt` | T1 | Pod state after applying oom-killed.yaml |
| `T2-meter-status.txt` | T2 | Meter-service status showing failure |
| `T2-oomkilled-events.txt` | T2 | Events showing OOMKilled reason |
| `T3-describe-pod.txt` | T3 | Detailed pod description (memory limits, Events) |
| `T3-previous-logs.txt` | T3 | Previous container logs (if available) |
| `T4-restore-healthy.txt` | T4 | Pod state after fix applied |
| `T5-post-recovery-events.txt` | T5 | Events confirming recovery |
| `README.md` | N/A | Evidence file guide and redaction policy |

### KQL Evidence
Location: `kql-results/`

| File | Query Source | Content |
|------|--------------|---------|
| `scenario-oom-killed.csv` | `scenario-oom-killed.kql` | OOMKilled events for meter-service |
| `pod-lifecycle.csv` | `pod-lifecycle.kql` | Pod state transitions and restarts |
| `alert-history.csv` | `alert-history.kql` | Alert firing history |
| `README.md` | N/A | KQL export guide and redaction policy |

### SRE Agent Evidence
Location: `sre-agent/`

| File | Captured By | Content |
|------|-------------|---------|
| `diagnosis-prompt.txt` | Parker | Exact prompt used (already created) |
| `diagnosis-response.md` | John | Full SRE Agent response + accuracy assessment |
| `screenshots/conversation-ready.png` | John | Empty conversation pane |
| `screenshots/prompt-ready.png` | John | Prompt in input box |
| `screenshots/diagnosis-complete.png` | John | Full conversation with response |

### MTTR Metrics
Location: `metrics/`

| File | Created By | Content |
|------|------------|---------|
| `mttr-summary.yaml` | Parker | T0-T5 timestamps, MTTR calculation, pass/fail |

---

## 📚 Reference Documentation

| File | Purpose |
|------|---------|
| `../../STATUS.md` | Wave 1 execution status dashboard |
| `../../checklist.md` | Wave 1 evidence requirements checklist |
| `../../BLOCKER-SUMMARY.md` | Cluster health blocker details |
| `../../PARKER-REPORT.md` | Parker's completion report |
| `../../../kql/stable/scenario-oom-killed.kql` | KQL query source |
| `../../../kql/stable/pod-lifecycle.kql` | KQL query source |
| `../../../kql/stable/alert-history.kql` | KQL query source |
| `../../../../k8s/scenarios/oom-killed.yaml` | Scenario manifest |
| `../../../../k8s/base/application.yaml` | Healthy baseline manifest |

---

## 🔄 Execution Flow

```
PRE-EXECUTION-CHECKLIST.md
         ↓
   [Cluster healthy?] → NO → BLOCKED (Ripley dependency)
         ↓ YES
    QUICK-START.md (Parker)
         ↓
    T0: Baseline → kubectl-output/T0-*.txt
         ↓
    T1: Apply → kubectl-output/T1-*.txt
         ↓
    T2: Observe → kubectl-output/T2-*.txt
         ↓
    T3: Diagnose → kubectl-output/T3-*.txt
         ↓
    T4: Fix → kubectl-output/T4-*.txt
         ↓
    T5: Verify → kubectl-output/T5-*.txt
         ↓
    [Wait 2-5 min for Log Analytics ingestion]
         ↓
    KQL queries → kql-results/*.csv
         ↓
    HUMAN-ACTION-CHECKLIST.md (John)
         ↓
    SRE Agent evidence → sre-agent/diagnosis-response.md, screenshots/
         ↓
    MTTR calculation → metrics/mttr-summary.yaml
         ↓
    Redaction + Documentation
         ↓
    Git commit
         ↓
    ✅ COMPLETE
```

---

## 📦 Current Status

**Framework**: ✅ COMPLETE
**Execution**: 🚨 BLOCKED (awaiting Ripley cluster health restoration)

See `../../STATUS.md` for latest status.

---

**Last Updated**: 2026-04-25
**Owner**: Parker (SRE Dev)
