# Deep Context Bootstrap — Governance & Maintenance

## Overview

This document defines the governance lifecycle for SRE Agent deep-context configuration:
Code Access, Knowledge Base uploads, Memory, and Session Insights.

**Authority**: `docs/deep-context/KNOWLEDGE-MANIFEST.yaml`
**Review cadence**: Quarterly (next: 2026-11-12)
**Owner**: @johnstel

---

## 1. Knowledge Manifest Review

### Quarterly Freshness Review

Every 90 days (or after a major architecture change):

1. Run `scripts/validate-deep-context.ps1 -CheckFreshness`
2. For each source past `review_due`:
   - Re-validate the document is accurate against current system state.
   - Update `last_validated` and `review_due` dates.
   - If the source is stale or contradictory → move to `exclusions` with rationale.
3. Commit manifest changes with review evidence.

### Adding a New Source

1. Confirm the source is **authoritative** (validated, non-speculative, non-transient).
2. Verify it contains **no secrets, raw customer data, or unredacted identifiers**.
3. Add an entry to `sources:` in the manifest with all required fields.
4. Run `python tests/deep-context/test_manifest_schema.py` to validate schema.
5. Upload to Knowledge Base or rely on Code Access (per `upload_target`).

### Removing/Retiring a Source

1. Move the entry from `sources:` to `exclusions:` with a dated rationale.
2. Remove the document from SRE Agent Knowledge Base (Builder > Knowledge base > Delete).
3. Commit the manifest change.

---

## 2. Code Access — Rotation & Revocation

### OAuth (Recommended for github.com)

- **Auto-refresh**: Tokens refresh automatically before 8-hour expiry (20-min buffer).
- **Chain lifetime**: ~6 months. After that, operator must re-authenticate.
- **Revocation**: GitHub Settings > Applications > Revoke OAuth App.
- **Rotation signal**: `scripts/validate-deep-context.ps1 -CheckConnector` will detect
  a failed Code Access connection.

### PAT (Alternative)

- **Lifetime**: Set to maximum 90 days; rotate before expiry.
- **Minimum scope**: `public_repo` (this is a public repository).
- **Revocation**: GitHub Settings > Developer settings > Personal access tokens > Delete.
- **Do NOT use** `repo` (full private access) unless the repository becomes private.

### BYO GitHub App (Enterprise)

- **Key rotation**: Rotate private key in Azure Key Vault annually or on compromise.
- **Minimum permissions**: Repository Metadata: Read, Contents: Read.
- **Revocation**: Uninstall the GitHub App from the repository.

---

## 3. Knowledge Update & Deletion

### Updating Uploaded Documents

1. Update the source document in the repository.
2. Re-upload to SRE Agent Knowledge Base (Builder > Knowledge base > Upload).
3. Update `last_validated` in the manifest.
4. Verify via `#retrieve` that the agent returns current information.

### Deleting/Forgetting Knowledge

| Action | Method |
|--------|--------|
| Remove uploaded document | Builder > Knowledge base > Delete file |
| Forget a user memory | Chat: `#forget <description>` |
| Remove synthesized knowledge | Delete file from `memories/synthesizedKnowledge/` directory |
| Purge session insight | Monitor > Session insights > Delete (if available) |

### Stale/Contradictory Detection

The evaluation harness (`tests/deep-context/test_evaluation_harness.py`) includes a
**Stale Document Test** that uploads a deliberately contradictory document and verifies
the agent does not silently prefer it over authoritative sources.

---

## 4. Session Insight Management

### Generation

- Insights generate automatically 30 minutes after a thread goes quiet.
- No manual trigger is needed; ensure threads reach a natural conclusion.

### Verification

After an incident resolution:

1. Wait 30+ minutes for insight generation.
2. Navigate to Monitor > Session insights.
3. Verify the insight contains: symptoms, resolution, root cause, pitfalls.
4. Record the insight ID for repeat-incident testing.

### Repeat-Incident Evidence

1. Trigger the same scenario again.
2. Ask the agent the same diagnostic question.
3. Verify the response references the prior session insight (clickable citation).
4. If no prior context is surfaced, document as `LIVE_GATE_PENDING`.

### Cleanup

- Delete session insights that contain incorrect resolutions.
- Do not allow stale insights to persist beyond 2 review cycles.

---

## 5. MCP Connector Governance

If GitHub MCP connector is enabled:

- **Tool selection**: Enable only read-only tools (code search, file read).
- **Approval policies**: Require operator approval for any write operations.
- **Audit**: Review MCP tool invocations monthly via Monitor.
- **Revocation**: Builder > Connectors > Remove connector.

---

## 6. Security Boundaries

| Prohibited | Rationale |
|------------|-----------|
| Upload credentials/secrets | Secret leakage risk |
| Upload raw kubectl output with resource IDs | PII/resource exposure |
| Upload binary screenshots with tenant info | Credential visibility |
| Grant GitHub write scope for read-only use | Principle of least privilege |
| Upload generated/speculative content as authority | Hallucination propagation |
| Store incident evidence without redaction | Customer data protection |

### Secret Scanning

Run before every upload:
```bash
python tests/deep-context/test_secret_scan.py
```

This checks all manifest-listed sources for common secret patterns (API keys, connection strings, tokens, passwords, certificates).

---

## 7. Validation Commands

| Command | Purpose |
|---------|---------|
| `scripts/validate-deep-context.ps1` | Full validation (connector, freshness, schema, secrets) |
| `scripts/validate-deep-context.ps1 -CheckConnector` | Connector health only |
| `scripts/validate-deep-context.ps1 -CheckFreshness` | Overdue sources only |
| `python tests/deep-context/test_manifest_schema.py` | YAML schema validation |
| `python tests/deep-context/test_secret_scan.py` | Secret pattern detection |
| `python tests/deep-context/test_evaluation_harness.py` | Evaluation rubric dry-run |
