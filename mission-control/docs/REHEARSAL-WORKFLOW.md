# Rehearsal Workflow (Issue #70)

The rehearsal workflow lets operators drive a structured SRE Agent diagnosis rehearsal through a deterministic state machine while enforcing evidence completeness and sensitive-data redaction before any run is marked **customer-ready**.

---

## State Machine Phases

A rehearsal run progresses through these phases in order:

| # | Phase | Purpose |
|---|-------|---------|
| 1 | `preflight` | Validate cluster connectivity, scenario existence |
| 2 | `baseline` | Record healthy-state metrics (timestamp `t1`) |
| 3 | `injection` | Apply the breakable scenario (`t2`) |
| 4 | `detection` | Confirm the failure is observable (`t3`) |
| 5 | `prompt_gate` | Operator verifies the SRE Agent prompt is correct |
| 6 | `diagnosis_gate` | Operator confirms diagnosis output (`t4`) |
| 7 | `restore` | Apply fix / restore healthy state |
| 8 | `recovery_verification` | Confirm pods/services return to normal |
| 9 | `evidence_package` | Collect and validate all evidence (`t5`) |
| 10 | `completed` | Run finalized; `customerReady` set if gate passes |

### Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Created but not yet started |
| `in_progress` | Actively advancing through phases |
| `interrupted` | Paused by operator (can resume) |
| `completed` | Reached final phase |
| `reset` | Returned to seed state for re-execution |

---

## Evidence Package

Each run carries a `RehearsalEvidencePackage` with optional repo-relative paths:

| Field | Description |
|-------|-------------|
| `evidencePath` | Primary evidence markdown/log |
| `manifestPath` | Run manifest JSON |
| `configDiffPath` | Before/after config diff |
| `inventoryPath` | Resource inventory snapshot |
| `eventsPath` | K8s events export |
| `logsPath` | Pod/container logs |
| `alertHistoryPath` | Alert timeline |
| `kqlExportPath` | KQL query results |
| `recoveryCheckPath` | Post-recovery verification |
| `summaryPath` | Operator-facing summary package |
| `artifactDirectory` | Deterministic package root for generated files |
| `attachmentChecksums` | `{ key: sha256 }` map for integrity |
| `sensitivePatterns` | Configured regex-like patterns that trigger redaction checks |
| `complete` | Boolean — operator asserts package is final |

**Path rules** — all evidence paths must:
- Be repo-relative (not absolute, not URLs)
- Live under `docs/evidence/`
- Be validated before they are persisted to the rehearsal package

Generated artifact bundles are written under the selected `artifactDirectory` (default `docs/evidence/mission-control/<scenario>`), with a manifest and summary file emitted as part of the evidence-package phase.

---

## Redaction Gating

Before a run can be marked customer-ready, evidence inputs are scanned for sensitive patterns:

- subscription ID, tenant ID, principal ID, resource ID
- secrets, passwords, tokens, SAS, client secrets

If any pattern matches, `redactionFindings` is populated and the gate status becomes `REDACTION_BLOCKED`. The operator must remove the sensitive content and re-submit evidence.

### Gate Status Values

| Value | Meaning |
|-------|---------|
| `PASS` | Evidence complete, no redaction issues |
| `PASS_WITH_PENDING_HUMAN_PORTAL` | Evidence incomplete or paths missing |
| `REDACTION_BLOCKED` | Sensitive content detected — cannot proceed |

A run is `customerReady = true` only when gate status is `PASS` at completion.

---

## Interruption, Resume & Reset

| Action | Effect |
|--------|--------|
| **Interrupt** | Sets status to `interrupted`, records timestamp and reason. Phase is preserved. |
| **Resume** | Returns status to `in_progress` from interrupted state. Appends a note. |
| **Reset** | Returns the run to seed state (`preflight`, empty evidence). Status becomes `reset`. |

All three operations preserve the run identity (same scenario slot is reused).

## Deterministic Replay and Dry Run

Replays are available through the backend replay endpoint and produce a deterministic step-by-step preview of the state machine without mutating persisted rehearsal state. Dry-run advancement is also supported for operator review before a real phase transition is committed.

The replay payload exposes the current phase and a sequence of preview steps with the same phase ordering, gate evaluation, and timing markers that the live run would use.

---

## API Endpoints

Base path: `/api/rehearsals`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rehearsals` | Get full rehearsal state (all runs) |
| `GET` | `/api/rehearsals/scenarios` | List supported scenario names |
| `POST` | `/api/rehearsals` | Create (or restart) a rehearsal run |
| `POST` | `/api/rehearsals/:scenarioName/advance` | Advance to the next phase |
| `POST` | `/api/rehearsals/interrupt` | Interrupt a running rehearsal |
| `POST` | `/api/rehearsals/resume` | Resume an interrupted rehearsal |
| `POST` | `/api/rehearsals/:scenarioName/reset` | Reset a run to initial state |
| `PATCH` | `/api/rehearsals/evidence` | Update evidence package fields |
| `GET` | `/api/rehearsals/:scenarioName/replay` | Return a deterministic replay preview without mutating state |

### Request Bodies

**Create** (`POST /api/rehearsals`):
```json
{ "scenarioName": "OOMKilled", "prompt": "optional override", "diagnosisSummary": "optional" }
```

**Advance** (`POST /api/rehearsals/:scenarioName/advance`):
```json
{ "notes": "optional operator note" }
```

**Interrupt** (`POST /api/rehearsals/interrupt`):
```json
{ "scenarioName": "OOMKilled", "reason": "Waiting for customer approval" }
```

**Resume** (`POST /api/rehearsals/resume`):
```json
{ "scenarioName": "OOMKilled" }
```

**Update Evidence** (`PATCH /api/rehearsals/evidence`):
```json
{
  "scenarioName": "OOMKilled",
  "evidencePath": "docs/evidence/oom-diagnosis.md",
  "manifestPath": "docs/evidence/oom-manifest.json",
  "attachmentChecksums": { "portal": "sha256:abc123" },
  "complete": true,
  "notes": "Reviewed by operator"
}
```

### Responses

All mutation endpoints return `{ run: RehearsalRun }` on success or `{ error: string }` with HTTP 400 on failure.

---

## Supported Scenarios

| Name | Description |
|------|-------------|
| `OOMKilled` | Meter service memory spike |
| `MongoDBDown` | Cascading database failure |
| `ServiceMismatch` | Endpoint routing after v2 upgrade |

---

## Frontend Component

`mission-control/frontend/src/components/RehearsalWorkflow.vue` provides the operator UI with:
- Scenario selector and run list
- Phase advancement, interrupt, resume, and reset buttons
- Evidence form with all path fields and completion checkbox
- Live redaction findings display
- Gate status badge (green/yellow/red)

---

## Timing Metrics

The service records timestamps at key transitions and computes:
- `automatedScenarioDurationMs` — `t0` → `t3` (preflight through detection)
- `humanTimingMs` — `t3` → `t4` (detection through diagnosis gate)
- `sreAgentAssistedTimingMs` — `t4` → `t5` (diagnosis gate through evidence)
