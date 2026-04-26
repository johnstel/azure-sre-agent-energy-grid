# Run Notes: oom-killed

**Date**: _Not yet run_
**Operator**: _TBD_
**Scenario**: oom-killed
**Verdict**: NOT RUN

---

## MTTR Timestamps

| Label | Timestamp | Notes |
|-------|-----------|-------|
| T0 — Scenario injected | | `kubectl apply -f k8s/scenarios/oom-killed.yaml` |
| T1 — Alert / symptom detected | | First observable signal (OOMKilled event visible in kubectl) |
| T2 — SRE Agent conversation started | | Operator submits first diagnostic prompt to SRE Agent portal |
| T3 — Diagnosis received | | SRE Agent returns root cause (expected: memory limit too low) |
| T4 — Remediation applied | | Human approves / executes fix (`kubectl apply -f k8s/base/application.yaml`) |
| T5 — Service healthy | | All pods Running/Ready, no restarts |

**MTTR** (T5 − T1): ___
**Agent diagnosis time** (T3 − T2): ___

---

## Evidence Artifacts

| Artifact | Captured? | File Path | Notes |
|----------|-----------|-----------|-------|
| Screenshot: failure state | ☐ | `screenshots/oom-killed_failure.png` | |
| Screenshot: SRE Agent diagnosis | ☐ | `screenshots/oom-killed_diagnosis.png` | |
| Screenshot: action proposal | ☐ | `screenshots/oom-killed_proposal.png` | |
| Screenshot: recovery state | ☐ | `screenshots/oom-killed_recovered.png` | |
| KQL: diagnosis query | ☐ | `kql/oom-killed_diagnosis.kql` | |
| KQL: recovery verification | ☐ | `kql/oom-killed_recovery.kql` | |
| kubectl output: pod state | ☐ | (paste inline below) | |
| kubectl output: events | ☐ | (paste inline below) | |

---

## Azure SRE Agent Evidence

**SRE Agent Portal URL**: _TBD_

**Diagnostic Prompt Submitted**:
```
[Paste exact prompt text here]
```

**SRE Agent Response**:
```
[Paste SRE Agent's diagnosis and remediation recommendation here]
```

**SRE Agent Correctness Assessment**:

| Criterion | Pass? | Notes |
|-----------|-------|-------|
| Correctly identified OOMKilled as root cause | ☐ | |
| Identified low memory limit (64Mi in breakable scenario) | ☐ | |
| Recommended increasing memory limit or restoring healthy config | ☐ | |
| Response time acceptable (< 60 seconds) | ☐ | |

---

## Pass/Fail Assessment

| Criterion | Pass? | Notes |
|-----------|-------|-------|
| SRE Agent identifies correct root cause | ☐ | |
| SRE Agent recommends appropriate remediation | ☐ | |
| Fix restores healthy state | ☐ | |
| Evidence artifacts captured | ☐ | |

---

## Raw Output

### kubectl get pods -n energy (T0 — Healthy Baseline)

```
[Paste output here]
```

### kubectl get pods -n energy (T1 — Failure State)

```
[Paste output here]
```

### kubectl describe pod <failing-pod> -n energy

```
[Paste output here]
```

### kubectl get events -n energy --sort-by='.lastTimestamp' | head -30

```
[Paste output here]
```

### KQL Diagnosis Query Output

```
[Paste KQL query results here — ContainerInventory, Perf, KubePodInventory, or custom query]
```

### kubectl get pods -n energy (T5 — Recovered State)

```
[Paste output here]
```

---

## Notes & Observations

_Add any blockers, workarounds, unexpected behavior, or Wave 2 recommendations here._

---

## Related Files

- **Scenario manifest**: `k8s/scenarios/oom-killed.yaml`
- **Healthy baseline**: `k8s/base/application.yaml`
- **Evidence index**: `docs/evidence/wave1-live/README.md`
- **Scenario metadata**: `docs/evidence/scenarios/scenario-manifest.yaml`
