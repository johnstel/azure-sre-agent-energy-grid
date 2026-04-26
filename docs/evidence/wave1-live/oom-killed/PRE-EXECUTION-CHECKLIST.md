# Pre-Execution Checklist — OOMKilled Scenario

**Verify this checklist BEFORE executing the OOMKilled scenario.**

---

## ✅ Infrastructure Prerequisites

- [ ] **All AKS nodes are Ready**
  ```bash
  kubectl get nodes
  # EXPECTED: All nodes show STATUS = Ready
  ```

- [ ] **All energy namespace pods are Running**
  ```bash
  kubectl get pods -n energy
  # EXPECTED: All pods show STATUS = Running, READY = 1/1
  ```

- [ ] **No pods are Pending or CrashLooping**
  ```bash
  kubectl get pods -n energy --field-selector=status.phase!=Running
  # EXPECTED: No resources found
  ```

- [ ] **Meter-service pods are healthy**
  ```bash
  kubectl get pods -n energy | grep meter-service
  # EXPECTED: 2 pods, both Running, RestartCount = 0
  ```

---

## ✅ Required Files Exist

- [ ] **OOMKilled scenario manifest**
  ```bash
  ls -la k8s/scenarios/oom-killed.yaml
  # EXPECTED: File exists
  ```

- [ ] **Healthy baseline manifest**
  ```bash
  ls -la k8s/base/application.yaml
  # EXPECTED: File exists
  ```

- [ ] **KQL query files**
  ```bash
  ls -la docs/evidence/kql/stable/scenario-oom-killed.kql
  ls -la docs/evidence/kql/stable/pod-lifecycle.kql
  ls -la docs/evidence/kql/stable/alert-history.kql
  # EXPECTED: All 3 files exist
  ```

- [ ] **Evidence directories created**
  ```bash
  ls -la docs/evidence/wave1-live/oom-killed/kubectl-output/
  ls -la docs/evidence/wave1-live/oom-killed/kql-results/
  ls -la docs/evidence/wave1-live/oom-killed/sre-agent/screenshots/
  ls -la docs/evidence/wave1-live/oom-killed/metrics/
  # EXPECTED: All directories exist
  ```

---

## ✅ Observability Stack Ready

- [ ] **Log Analytics workspace is accessible**
  ```bash
  az monitor log-analytics workspace show --resource-group <rg-name> --workspace-name log-srelab
  # EXPECTED: Workspace details returned
  ```

- [ ] **Container Insights is enabled**
  ```bash
  az aks show -g <rg-name> -n <cluster-name> --query addonProfiles.omsagent.enabled -o tsv
  # EXPECTED: true
  ```

- [ ] **Azure SRE Agent is deployed and accessible**
  ```bash
  az resource list --resource-type Microsoft.App/agents -g <rg-name> -o table
  # EXPECTED: SRE Agent resource listed
  ```

---

## ✅ Tools & Access

- [ ] **kubectl context is correct**
  ```bash
  kubectl config current-context
  # EXPECTED: aks-srelab (or your cluster name)
  ```

- [ ] **kubectl can access the cluster**
  ```bash
  kubectl cluster-info
  # EXPECTED: Cluster info returned
  ```

- [ ] **Azure CLI is logged in**
  ```bash
  az account show
  # EXPECTED: Subscription details returned
  ```

- [ ] **You have write access to docs/evidence/wave1-live/**
  ```bash
  touch docs/evidence/wave1-live/oom-killed/.writetest && rm docs/evidence/wave1-live/oom-killed/.writetest
  # EXPECTED: No errors
  ```

---

## ✅ Execution Guides Ready

- [ ] **QUICK-START.md is ready**
  ```bash
  cat docs/evidence/wave1-live/oom-killed/QUICK-START.md | head -5
  # EXPECTED: Quick Start header visible
  ```

- [ ] **run-notes.md template is ready**
  ```bash
  grep "T0: Baseline" docs/evidence/wave1-live/oom-killed/run-notes.md
  # EXPECTED: T0 section found
  ```

- [ ] **HUMAN-ACTION-CHECKLIST.md exists for John**
  ```bash
  ls -la docs/evidence/wave1-live/oom-killed/sre-agent/HUMAN-ACTION-CHECKLIST.md
  # EXPECTED: File exists
  ```

---

## ✅ Coordination

- [ ] **Ripley has confirmed cluster health restoration**
  - Ripley sent notification that all nodes are Ready
  - Ripley confirmed all pods are Running

- [ ] **John is available for SRE Agent portal evidence capture**
  - Estimated time: 5-10 minutes after Parker completes T1-T3
  - John has reviewed HUMAN-ACTION-CHECKLIST.md

---

## ✅ Time Allocation

- [ ] **Parker has 30-40 minutes available for execution**
  - T0-T5 timeline: ~20-25 minutes
  - KQL evidence: ~5-10 minutes
  - Documentation buffer: ~5-10 minutes

- [ ] **John has 10-15 minutes available for portal evidence**
  - SRE Agent portal interaction: ~5-10 minutes
  - Buffer for unexpected delays: ~5 minutes

---

## 🚦 GO / NO-GO Decision

**GO Criteria** (all must be YES):
- [ ] All infrastructure prerequisites met (cluster healthy)
- [ ] All required files exist
- [ ] Observability stack ready
- [ ] Tools & access working
- [ ] Execution guides ready
- [ ] Team coordination confirmed
- [ ] Time allocated

**If ANY item is NO**: STOP and resolve blocker before proceeding.

---

## 🚀 When All Checks Pass

**Parker**: Execute `docs/evidence/wave1-live/oom-killed/QUICK-START.md`

**John**: Stand by for notification to execute `HUMAN-ACTION-CHECKLIST.md`

---

**Last Updated**: 2026-04-25
**Next Review**: When Ripley notifies Parker that cluster is healthy
