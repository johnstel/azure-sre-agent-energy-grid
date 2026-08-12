# Grid Readiness Scheduled Task: Safe Setup and Evidence Gate

> **Status:** Configuration recipe only. No scheduled task has been created by this repository or this change.
>
> **Safety:** Use a sandbox subscription and a read-only, Review-mode agent. Do not enable write actions, deploy resources, or claim a proactive finding until a real task execution is captured.

Azure SRE Agent scheduled tasks are the supported proactive surface for a recurring readiness review. Each execution creates a conversation thread, and the Scheduled tasks view retains task and run history. See [Schedule tasks with Azure SRE Agent](https://learn.microsoft.com/azure/sre-agent/scheduled-tasks).

## Recommended Configuration

| Field | Value |
|---|---|
| Task name | `Grid Readiness - Energy Grid` |
| Cadence | Every 15 minutes (`*/15 * * * *`) |
| Agent autonomy | **Review** |
| Thread grouping | New thread per run |
| Scope | The sandbox Energy Grid resource group, AKS `energy` namespace, configured Log Analytics and Application Insights resources |
| Write access | None. The task prompt forbids mutations and only reviews connected read tools. |
| Evidence sources | `slo-meter-ingest` AppRequests, Azure Monitor alert state/history, Kubernetes deployment/endpoint state, recent Azure Activity Log changes, and SRE Agent audit events. |

The two-minute synthetic probe and 15-minute agent schedule have different roles: the probe produces an objective customer-journey SLI; the task reads and correlates that evidence. The task is not the SLI source.

### Read-only task prompt

Paste the following into the task instructions. Replace `<resource-group>` and `<agent-name>` only in the portal UI; do not place credentials or connection strings in the prompt.

```text
Perform a read-only Grid Readiness assessment for the Energy Grid demo.

Do not create, update, delete, scale, restart, deploy, execute remediation,
or request approval for any Azure or Kubernetes action. If a tool would mutate
state, skip it and state that the assessment is read-only.

Use only connected read tools and cite each evidence source:
1. Review the demo-only slo-meter-ingest synthetic transaction in AppRequests:
   Name = slo.meter-ingest.transaction,
   Properties["synthetic.name"] = slo-meter-ingest,
   Properties["synthetic.mode"] = demo.
   Evaluate unique correlation IDs, success rate, raw-run p95 DurationMs,
   and time since the last successful transaction.
2. Review recent Azure Monitor SLO alert state or history, including the
   burn, customer-impact, MongoDBDown, ServiceMismatch, and no-data signals.
3. Read AKS evidence for the energy namespace: deployment availability and
   Service endpoint readiness for mongodb, meter-service, and dispatch-service.
4. Review relevant recent Azure Activity Log changes in the scoped resource group.

Interpretation rules:
- No transaction data is NO_DATA/unknown, never healthy.
- A query, connector, identity, or permission failure is UNKNOWN, never healthy.
- MongoDB persistence failures and meter-service empty endpoints are customer-impact
  evidence even if pods are ready.
- Functional recovery requires a newer successful synthetic transaction, not pod
  readiness alone.

Return: status (healthy, degraded, critical, no-data, or unknown), cited
evidence with timestamps, affected customer journey/stage, confidence and
limitations, and the next read-only investigation step. Do not invent findings,
business loss, customer counts, or task results.
```

## Portal Setup (Preferred)

Use the portal because it exposes the autonomy selection needed to prove Review mode.

1. Open [Azure SRE Agent](https://aka.ms/sreagent/portal), select the sandbox agent, then open **Scheduled tasks**.
2. Create a task with the name, cadence, new-thread grouping, and prompt above.
3. Select **Review**, not Autonomous. Review the autonomy acknowledgement before saving.
4. Confirm that only read-capable connectors/tools are available to the agent. If a connected tool can mutate resources, leave it unused and preserve the explicit prompt boundary.
5. Capture the task row showing name, schedule, creator, task status, last run, next run, and completed-run count. This is configuration evidence, not a task finding.

The task is not ready to present as proactive merely because it is configured.

## MCP Support and Honest Fallback

The currently available Azure SRE Agent MCP surface exposes:

| MCP operation | Use |
|---|---|
| `sreagent_scheduledtasks_list` | Read task list for a named agent. |
| `sreagent_scheduledtasks_get` | Read one task by task ID. |
| `sreagent_scheduledtasks_create` | Creates a task from `name`, `cron-expression`, `message`, and `agent`. |

The current create schema does **not** expose a run-mode/autonomy parameter. Therefore, do not use MCP creation to meet this task's Review-mode requirement unless the portal confirms the resulting task is Review mode and no write-capable tool is enabled. The supportable path is:

1. Use portal creation for Review mode and its confirmation UI.
2. Use read-only MCP list/get calls, when a subscription, resource group, and agent name are already approved, to inspect the saved task.
3. If the portal or MCP task capability is unavailable, run the exact prompt manually in a normal Review-mode conversation and label it **manual, not proactive**. Do not fabricate scheduled-task output.

No live MCP call is included here because task creation changes a cloud resource and requires explicit environment approval.

## Task History and Audit Correlation

Task history is the primary source for scheduled-run identity, status, execution time, and thread navigation. For each observed run:

1. Record the task name, task ID if shown, task-history status, start/end time, and thread ID or thread link.
2. Open **Monitor > Logs** for the agent's Application Insights resource.
3. Use the thread ID to correlate agent audit events when it is available. Azure SRE Agent logs action telemetry to `customEvents`, including `AgentExecution`, `AgentToolExecution`, `AgentResponse`, model activity, and correlation fields such as `ThreadId`, `TraceId`, and `CorrelationId`.

```kusto
// Replace the placeholders only with values captured from a real task run.
customEvents
| where timestamp > ago(1d)
| extend
    ThreadId = tostring(customDimensions.ThreadId),
    TraceId = tostring(customDimensions.TraceId),
    CorrelationId = tostring(customDimensions.CorrelationId),
    EventType = tostring(customDimensions.EventType),
    Tool = tostring(customDimensions.ToolName)
| where ThreadId == "<observed-thread-id>"
| project timestamp, name, EventType, Tool, ThreadId, TraceId, CorrelationId
| order by timestamp asc
```

If the task-history UI does not expose a thread ID, correlate by the captured run time and agent name, and label the result **time-window correlation**, not a confirmed task-ID join. For ARM-level resource changes, use Azure Activity Log separately; this read-only task should not generate remediation actions.

Official references:

- [Scheduled tasks](https://learn.microsoft.com/azure/sre-agent/scheduled-tasks)
- [Audit agent actions](https://learn.microsoft.com/azure/sre-agent/audit-agent-actions)
- [Azure Monitor log search alerts](https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-log)

## Live Evidence Gate

Do not state that Azure SRE Agent detected an issue proactively until all of these are captured from the same target environment:

1. A task configuration record that proves cadence and Review mode.
2. One healthy scheduled execution with cited SLI and infrastructure evidence.
3. One scheduled execution during an approved MongoDBDown or ServiceMismatch demo state, with cited evidence.
4. Task-history/run identity plus an audit-event or explicitly labeled time-window correlation.
5. A recovery run that cites a successful synthetic transaction after repair.

Until then, describe this accurately: **"The repo provides a read-only scheduled-task configuration and validation path; no live scheduled-task finding is claimed."**
