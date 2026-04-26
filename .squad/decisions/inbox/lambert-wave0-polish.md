# Lambert — Wave 0 Polish Pass (Brand + Operator Fixes)

| Field | Value |
|-------|-------|
| **Decision ID** | `LAMBERT-WAVE0-POLISH-001` |
| **Date** | 2025-07-22 |
| **Requested by** | John Stelmaszek |
| **Source reviews** | `brand-wave0-final-verdict.md` (APPROVE WITH FIXES), `operator-wave0-final-uat.md` (APPROVE WITH FIXES) |
| **Scope** | Docs-only polish — no runtime file modifications |

---

## Fixes Applied

### Fix 1: `fix-all` ambiguity (Operator FIX-1)
**File**: `docs/DEMO-RUNBOOK.md` Step 5
**Change**: Portable `kubectl apply` command listed first; `fix-all` documented as dev-container-only alias with parenthetical explaining source (`.devcontainer/post-create.sh`).

### Fix 2: Inline scenario prompts (Operator FIX-2)
**File**: `docs/DEMO-RUNBOOK.md` Step 4c
**Change**: Added inline prompt table for the three recommended scenarios (OOMKilled, MongoDBDown, ServiceMismatch) so operator does not need to open a separate doc during a live demo.

### Fix 3: Wave 0 completion checklist (Operator FIX-5)
**File**: `docs/DEMO-RUNBOOK.md` (new section at end)
**Change**: Added 8-item checklist covering docs present, evidence layout, scenario manifest, safe language, scenario ordering alignment, no runtime changes, cross-references, and review status.

### Fix 4: Scenario ordering conflict (Brand FIX-1 + Operator FIX-4)
**File**: `docs/BREAKABLE-SCENARIOS.md` § Comprehensive Demo
**Change**: Replaced conflicting OOM→NetworkBlock→CrashLoop sequence with one-liner deferring to DEMO-NARRATIVE.md as canonical source, plus the recommended 3-scenario sequence.

### Fix 5: README "Breaking Things" — MongoDB visibility (Brand FIX-2)
**File**: `README.md` § Breaking Things
**Change**: Added callout mentioning `break-mongodb` for cascading failure, pointing to DEMO-NARRATIVE.md. Also clarified `fix-all` as dev-container-only with portable kubectl command.

### Fix 6: DEMO-NARRATIVE.md Core vs Extended demo (Brand FIX-3)
**File**: `docs/DEMO-NARRATIVE.md` § Recommended Scenario Ordering
**Change**: Split single 5-scenario table into "Core Demo (20 min)" (3 scenarios matching Act 2) and "Extended Demo (25+ min)" (all 5 scenarios). Updated version history.

---

## Files Changed

| File | Type of Change |
|------|---------------|
| `docs/DEMO-RUNBOOK.md` | Step 5 rewrite, Step 4c prompt table, Wave 0 checklist |
| `docs/DEMO-NARRATIVE.md` | Core/Extended demo split, version history update |
| `docs/BREAKABLE-SCENARIOS.md` | Comprehensive Demo section replaced |
| `README.md` | MongoDB callout + fix-all clarification |
| `.squad/agents/lambert/history.md` | Learnings appended |
| `.squad/decisions/inbox/lambert-wave0-polish.md` | This file |

---

## Validation

| Check | Result |
|-------|--------|
| Old conflicting sequence (OOM→NetworkBlock→CrashLoop) removed | ✅ grep returns 0 matches |
| MongoDBDown/cascading mentioned in README | ✅ `break-mongodb` + DEMO-NARRATIVE link present |
| No runtime files modified (Bicep, K8s, scripts, app code) | ✅ Only `.md` files in diff |
| Scenario ordering aligned across DEMO-NARRATIVE ↔ BREAKABLE-SCENARIOS | ✅ Both defer to same Core Demo sequence |
| `fix-all` explained as dev-container alias | ✅ In RUNBOOK Step 5 and README |
| Inline prompts for recommended trio | ✅ Table in RUNBOOK Step 4c |
| Wave 0 completion checklist present | ✅ End of DEMO-RUNBOOK.md |

---

## Verdict

All 6 fixes from Brand and Operator reviews are applied. **Ready for re-check by both reviewers.**

---

*Lambert (QA/Docs) · Wave 0 Polish Pass · 2025-07-22*
