# Wave 2 Evidence - File Inventory

**Last Updated**: 2026-04-26T12:50:00Z

---

## MongoDBDown Evidence (19 files)

### kubectl Output (16 files)
```
kubectl-output/T0-timestamp.txt
kubectl-output/T0-baseline-pods.txt
kubectl-output/T0-baseline-mongodb-pods.txt
kubectl-output/T1-timestamp.txt
kubectl-output/T1-apply-result.txt
kubectl-output/T2-timestamp.txt
kubectl-output/T2-meter-service-pods.txt
kubectl-output/T2-mongodb-pods.txt
kubectl-output/T3-timestamp.txt
kubectl-output/T3-meter-service-describe.txt
kubectl-output/T3-mongodb-deployment-yaml.txt
kubectl-output/T3-events.txt
kubectl-output/T4-timestamp.txt
kubectl-output/T4-restore-result.txt
kubectl-output/T5-timestamp.txt
kubectl-output/T5-all-pods-healthy.txt
```

### Alert Evidence (1 file)
```
alert-firing-history.json (NO_ALERT_FIRED documented)
```

### MTTR Metrics (1 file)
```
metrics/mttr-summary.yaml (N/A for automated execution)
```

### Status Documentation (1 file)
```
EVIDENCE-STATUS-FINAL.md (⚠️ PARTIAL PASS)
```

**Total**: 19 files
**Redaction Status**: ✅ Complete (0 sensitive data)

---

## ServiceMismatch Evidence (24 files)

### kubectl Output (22 files)
```
kubectl-output/T0-timestamp.txt
kubectl-output/T0-service.yaml
kubectl-output/T0-endpoints.yaml
kubectl-output/T0-pods.txt
kubectl-output/T1-timestamp.txt
kubectl-output/T1-patch.txt
kubectl-output/T2-timestamp.txt
kubectl-output/T2-service.yaml
kubectl-output/T2-service-describe.txt
kubectl-output/T2-endpoints.yaml
kubectl-output/T2-endpointslice.yaml
kubectl-output/T2-pods.txt
kubectl-output/T3-timestamp.txt
kubectl-output/T3-service-selector.json
kubectl-output/T3-pod-labels.json
kubectl-output/T3-events.txt
kubectl-output/T4-timestamp.txt
kubectl-output/T4-restore.txt
kubectl-output/T5-timestamp.txt
kubectl-output/T5-service.yaml
kubectl-output/T5-endpoints.yaml
kubectl-output/T5-pods.txt
```

### Alert Evidence (1 file)
```
alert-firing-history.json (NO_ALERT_FIRED - expected for silent failure)
```

### MTTR Metrics (1 file)
```
metrics/mttr-summary.yaml (N/A for automated execution)
```

### Status Documentation (1 file)
```
EVIDENCE-STATUS-FINAL.md (✅ PASS)
```

**Total**: 24 files (22 kubectl + 2 supporting)
**Redaction Status**: ✅ Complete (0 sensitive data)

---

## Summary Files (5 files)

```
WAVE2-GATE-SUMMARY-LAMBERT.md (⚠️ QUALIFIED GO)
QUICK-STATUS.md (kubectl complete, portal pending)
FILE-INVENTORY.md (this file)
INDEX.md (navigation index)
PARKER-FINAL-REPORT.md (Wave 2 completion report - pending)
```

---

## Pending Evidence (Not Yet Captured)

### SRE Agent Portal (PENDING_HUMAN_PORTAL)
```
mongodb-down/sre-agent/HUMAN-ACTION-CHECKLIST.md (ready for John)
mongodb-down/sre-agent/screenshots/ (empty - awaiting capture)
service-mismatch/sre-agent/HUMAN-ACTION-CHECKLIST.md (ready for John)
service-mismatch/sre-agent/screenshots/ (empty - awaiting capture)
```

### KQL Evidence (OPTIONAL)
```
mongodb-down/kql/ (not captured - requires workspace access)
service-mismatch/kql/ (not captured - requires workspace access)
```

---

## Total Evidence Package

| Category | MongoDBDown | ServiceMismatch | Summary | Total |
|----------|-------------|-----------------|---------|-------|
| kubectl files | 16 | 22 | - | 38 |
| Alert JSON | 1 | 1 | - | 2 |
| MTTR YAML | 1 | 1 | - | 2 |
| Status docs | 1 | 1 | 5 | 7 |
| **Subtotal** | **19** | **24** | **5** | **48** |

**Redacted Files**: 38 kubectl files (100% redaction complete)
**Pending Human**: SRE Agent portal screenshots (2 scenarios)
**Optional**: KQL evidence (2 scenarios)

---

**Inventory Status**: ✅ Complete for automated kubectl evidence
**Next Update**: After SRE Agent portal capture
