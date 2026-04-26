# Wave 5 Redaction, Final Evidence Checklist, and Verdict

**Scope**: Azure SRE Agent Service customer demo evidence
**Mission Control**: Out of scope
**Verdict recommendation**: `PASS_WITH_PENDING_HUMAN_PORTAL`

## Evidence redaction checklist

Before sharing or committing any customer-demo evidence, verify every item below.

### Portal screenshots and transcripts

- [ ] No subscription ID visible.
- [ ] No tenant ID visible.
- [ ] No full resource ID visible unless intentionally masked.
- [ ] No principal ID, object ID, client ID, or managed identity ID visible.
- [ ] No user email, UPN, or display name visible unless approved for the demo.
- [ ] No access token, connection string, API key, webhook URL, kubeconfig, or secret value visible.
- [ ] No unredacted IP addresses, private DNS names, or node names visible if they identify the environment.
- [ ] Screenshots show only the relevant SRE Agent recommendation/diagnosis area.
- [ ] Transcript text is copied exactly from the live portal; no synthetic transcript text is introduced.
- [ ] If approval UI is shown, the exact wording is preserved and redacted only for identifiers.

### CLI and KQL output

- [ ] Prompt history does not include secrets.
- [ ] `az account show`, kubeconfig paths, tokens, and service principal details are excluded or redacted.
- [ ] Role assignment output masks assignee IDs and principal names.
- [ ] Azure Activity Log output masks caller identity if customer-facing.
- [ ] KQL output contains only real query results from the target environment.
- [ ] Empty KQL results are labeled as empty results, not converted into positive findings.
- [ ] Alert history output is included only if actually queried from the live environment.
- [ ] No KQL query is presented as executed unless execution output is captured.

### Evidence metadata

- [ ] Evidence file or note includes collection date/time.
- [ ] Evidence file or note names the scenario, if applicable.
- [ ] Evidence file or note identifies the collector role, not a personal name, where possible.
- [ ] Evidence states whether it is repo/config evidence, live portal evidence, CLI output, KQL output, or limitation note.
- [ ] Evidence states the limitation if it depends on Preview behavior.
- [ ] Evidence is tagged `SCHEMA_TBD` if it relies on unverified SRE Agent telemetry fields.

## Final customer-demo evidence checklist

### Required before customer demo

- [ ] Confirm customer scope: Azure SRE Agent Service only; Mission Control out of scope.
- [ ] Confirm Wave 2 status remains `PASS_WITH_PENDING_HUMAN_PORTAL`.
- [ ] Review `docs/SAFE-LANGUAGE-GUARDRAILS.md`.
- [ ] Review `docs/evidence/wave3-live/SECURITY-STATUS.md`.
- [ ] Review `docs/evidence/wave4-live/STATUS.md`.
- [ ] Confirm no customer-facing material claims autonomous remediation.
- [ ] Confirm no customer-facing material claims stable SRE Agent telemetry schema.
- [ ] Confirm no customer-facing material claims alert firing unless alert-history evidence exists.
- [ ] Confirm broad demo roles are labeled demo-only.
- [ ] Confirm final deck/script says “agent recommends, operator executes.”

### Required for upgrading verdict to `PASS`

Do not upgrade from `PASS_WITH_PENDING_HUMAN_PORTAL` to `PASS` until all of these are complete:

- [ ] Real SRE Agent portal screenshot or transcript captured for MongoDBDown.
- [ ] Real SRE Agent portal screenshot or transcript captured for ServiceMismatch.
- [ ] Portal evidence redacted and reviewed.
- [ ] Evidence shows what the SRE Agent actually recommended; no paraphrased or invented output.
- [ ] If an approval UI appears, screenshot/transcript captures the exact UI wording.
- [ ] If no approval UI appears, package says recommendation-only.
- [ ] Operator execution evidence captured separately from recommendation evidence.
- [ ] Recovery verification captured after operator action.
- [ ] SRE Agent telemetry fields are either observed and documented or remain explicitly `SCHEMA_TBD`.
- [ ] Any alert-firing claim is backed by alert-management history or live KQL output.

### Acceptable evidence bundle for a single scenario

| Evidence item | Required? | Acceptable source | Notes |
|---------------|-----------|-------------------|-------|
| Scenario injected | Yes | kubectl output or run notes | Must include timestamp or collection note. |
| Symptom observed | Yes | kubectl, KQL, or portal | Do not infer alert firing. |
| SRE Agent recommendation | Required for final PASS | Real portal screenshot/transcript | Pending until human portal validation. |
| Operator action | Yes if claiming recovery | kubectl/az output or approved runbook execution note | Human/operator action only. |
| Recovery verification | Yes if claiming recovery | kubectl endpoints/pods or KQL | Must show healthy state after restore. |
| Audit trail | Recommended | Azure Activity Log/Kube evidence | Activity Log proves ARM operations, not all Kubernetes operations. |
| Limitation note | Required when evidence missing | Markdown note in evidence package | Use explicit pending/not-tested language. |

## Verdict recommendation

**Recommendation**: `PASS_WITH_PENDING_HUMAN_PORTAL`

### Rationale

The Wave 5 compliance/audit package is ready for a customer demo gate because:

- It maps customer audit questions to concrete repo evidence.
- It identifies gaps without fabricating portal behavior, KQL results, alert history, or approval workflows.
- It preserves the safe operating boundary: Review mode means “agent recommends, operator executes.”
- It labels broad RBAC as demo-only and presents `Low` access as the production starting point.
- It keeps SRE Agent Preview telemetry schema as `SCHEMA_TBD`.

### Why not `PASS`

`PASS` is not appropriate yet because:

- Human SRE Agent portal validation remains pending.
- SRE Agent conversation/action telemetry fields and retention are not proven.
- A specific approval/denial UI is not proven.
- Alert firing must not be claimed without live alert-history evidence.

### Why not `PARTIAL_WITH_LIMITATIONS`

`PARTIAL_WITH_LIMITATIONS` would be appropriate if the package lacked a clear customer-safe narrative or if major evidence mappings were missing. The package is complete enough for the demo gate, provided the pending human portal validation is clearly stated.

### Why not `BLOCKED`

`BLOCKED` would be appropriate if customer-facing materials required unsupported claims. This package avoids those claims and gives safe alternative phrasing.

## Final approved closing statement

> “The compliance evidence package is ready for demo review with one explicit pending item: real SRE Agent portal validation. Until that is captured, the correct verdict is `PASS_WITH_PENDING_HUMAN_PORTAL`, and the customer-safe operating model remains: Azure SRE Agent recommends, the operator executes.”
