# Wave 5 Customer Demo Risk Register

**Scope**: Azure SRE Agent Service customer demo
**Out of scope**: Mission Control
**Verdict dependency**: Keep `PASS_WITH_PENDING_HUMAN_PORTAL` until real SRE Agent portal evidence exists.

| ID | Risk | Severity | Current state | Mitigation | Exact phrasing constraint |
|----|------|----------|---------------|------------|---------------------------|
| W5-R01 | Overclaiming SRE Agent portal diagnosis for MongoDBDown or ServiceMismatch | Critical | Wave 2/3/4 identify portal validation as pending. | Only present kubectl, runbook, and repo evidence unless live portal screenshots/transcripts are captured. | Say: “Portal validation is pending.” Do **not** say: “The agent diagnosed this scenario” unless real evidence exists. |
| W5-R02 | Claiming a specific approval/denial UI without evidence | Critical | Repo proves Review-mode configuration, not portal UX. | Treat Review mode as recommendation-only until observed. | Say: “agent recommends, operator executes.” Do **not** say: “the portal approval workflow enforced this” unless screenshot/transcript proves it. |
| W5-R03 | Claiming autonomous remediation | Critical | `sre-agent.bicep` configures `mode: 'Review'`; Auto mode is out of scope. | Keep operator-led remediation in the demo script. | Say: “Auto mode is not demonstrated.” Do **not** say: “the agent automatically fixed it.” |
| W5-R04 | Presenting demo RBAC as production least privilege | High | Default deployment passes `accessLevel: 'High'`, which adds Contributor. | Label `High` and script fallback roles as demo-only; present `Low` as production starting point. | Say: “broad permissions are demo-only.” Do **not** say: “production-grade least privilege is already implemented.” |
| W5-R05 | Treating SRE Agent Preview telemetry schema as stable | High | SRE Agent telemetry query is under `schema-tbd`; fields are `SCHEMA_TBD`. | Keep Preview schema caveat in all evidence and avoid field-level claims unless observed. | Say: “SRE Agent telemetry fields are `SCHEMA_TBD` until verified.” Do **not** say: “conversation/action logs contain field X” unless live evidence proves it. |
| W5-R06 | Claiming complete audit trail of every action | High | Activity Log export design exists; SRE Agent action/conversation fields are unproven. | Separate ARM/Kubernetes/operator evidence from SRE Agent telemetry. | Say: “ARM-level actions can be audited through Activity Log where exported; SRE Agent action schema remains Preview-dependent.” |
| W5-R07 | Exposing sensitive identifiers in customer artifacts | High | Evidence may include subscription IDs, tenant IDs, principal IDs, resource IDs, node names, IPs, screenshots, and command output. | Apply redaction checklist before sharing or committing. | Say: “redacted evidence available.” Do **not** share raw portal screenshots or CLI output with secrets/IDs. |
| W5-R08 | Claiming alert firing without history evidence | Medium | Wave 4 says do not claim alert firing unless alert-management evidence exists. | Use alert history script/KQL only when run live; otherwise mark `NO_ALERT_FIRED` or pending. | Say: “No alert firing is claimed for this run unless shown in alert history.” |
| W5-R09 | Claiming workload App Insights request/dependency telemetry is complete | Medium | Wave 4 states external sample images are used and request/dependency telemetry is not proven. | Keep infra-vs-app telemetry distinction. | Say: “Kubernetes/infrastructure telemetry is covered; app/dependency telemetry is a documented delta.” |
| W5-R10 | Unsafe live RBAC-denial testing | Medium | Safe-fail checklist says do not improvise tenant identity changes. | Use pre-approved read-only test identity or mark as not tested. | Say: “denial path is operator-executable; not tested in this environment” if no safe identity exists. |
| W5-R11 | Customer interprets package as certification-ready compliance program | Medium | This is a demo evidence package, not SOC 2/ISO certification evidence. | State readiness category and gaps. | Say: “demo audit evidence package.” Do **not** say: “SOC 2-ready” or “ISO-certified.” |
| W5-R12 | Confusing Mission Control capabilities with Azure SRE Agent Service | High | Mission Control is explicitly out of customer scope. | Do not use Mission Control screenshots/code as evidence for Azure SRE Agent capability. | Say: “Mission Control is out of scope.” Do **not** cite Mission Control UI as proof of SRE Agent Service behavior. |

## High-risk live-demo moments

1. **Customer asks whether the agent can approve and execute a fix**
   - Approved response: “For this demo, the agent is in Review mode. We treat it as recommending actions; the operator executes. We are not claiming Auto-mode remediation.”

2. **Customer asks for audit logs of the agent’s conversation**
   - Approved response: “The SRE Agent resource is connected to App Insights, but the Preview telemetry schema and retention fields are `SCHEMA_TBD` until observed in this environment. We can show ARM Activity Log and operator evidence separately.”

3. **Customer asks if this is least privilege**
   - Approved response: “The repo defines a `Low` read-only profile for production starting posture. The current demo uses broader `High` access for convenience and labels that as demo-only.”

4. **Customer asks whether an alert fired**
   - Approved response: “Only if alert-management history or live KQL output shows it. Otherwise we keep the run marked as pending or `NO_ALERT_FIRED`.”

5. **Portal unavailable or returns unexpected output**
   - Approved response: “We will not speculate. The portal behavior for this run is pending; here is the repo/config/runbook evidence we can prove.”
