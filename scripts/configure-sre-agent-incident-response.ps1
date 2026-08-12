<#
.SYNOPSIS
    Connects Azure Monitor as the SRE Agent's incident platform and configures an Energy Grid
    incident response plan (issue #76), using the most supportable automation surface available,
    with explicit portal instructions for anything that remains portal-only.

.DESCRIPTION
    This script performs a live capability spike + idempotent setup pass against a deployed Azure
    SRE Agent resource:

    1. Verifies the SRE Agent resource exists and reports whether
       `incidentManagementConfiguration.type` (documented Microsoft.App/agents ARM property, set by
       `infra/bicep/modules/sre-agent.bicep` when `sreAgentIncidentPlatform = 'AzureMonitor'`) is
       already connected to Azure Monitor.
    2. Verifies the agent's managed identity has the Monitoring Contributor role required for
       Azure Monitor alerts to become visible to the agent
       (https://learn.microsoft.com/azure/sre-agent/azure-monitor-alerts).
    3. Idempotently creates (or confirms) a named Energy Grid incident response plan using the
       documented Azure MCP Server tool (`azmcp sreagent incidents plans create`,
       https://learn.microsoft.com/azure/developer/azure-mcp-server/tools/azure-sre-agent) when the
       `azmcp` CLI is available. That tool is NOT idempotent on its own (repeated calls create
       duplicate plans), so this script always lists existing plans first and only creates when
       missing.
    4. Always prints the exact portal steps for anything this script cannot confirm or automate:
       reinvestigation cooldown configuration, custom-agent routing, and title-contains parity are
       not exposed by the documented ARM schema or by the Azure MCP Server response-plan tool as of
       this writing -- Microsoft Learn documents them only in the Builder > Incident response plans
       portal UI (https://learn.microsoft.com/azure/sre-agent/response-plan).

    This script never enables Autonomous mode and never touches the excluded AmeriGas resource
    group `rg-srelab-northcentralus`. It is read-mostly: the only mutating calls are the response
    plan creation (guarded by the list-first idempotency check above) and are skipped entirely
    under -WhatIf.

.PARAMETER ResourceGroupName
    Resource group containing the deployed SRE Agent.

.PARAMETER AgentName
    Existing SRE Agent resource name.

.PARAMETER ResponsePlanName
    Name for the Energy Grid incident response plan.

.PARAMETER Severity
    Incident severity filter for the response plan: critical, high, medium, or low (per the
    documented Azure MCP Server tool parameter). Does not map 1:1 to the portal's Sev0-4 selector;
    confirm the effective filter in the portal after creation.

.PARAMETER TriggerCondition
    Text used as the response-plan trigger condition / title filter. Maps loosely to the portal's
    "Title contains" field; exact matching semantics are not documented for this MCP tool parameter,
    so treat this as best-effort until confirmed live.

.PARAMETER Services
    Affected service names to scope the response plan to.

.PARAMETER Steps
    Investigation/response steps recorded on the response plan.

.PARAMETER AgentMode
    Agent autonomy level: 'review' (default, required for this demo) or 'autonomous'. Autonomous is
    blocked unless -AllowAutonomous is also passed (see docs/CAPABILITY-CONTRACTS.md SS9).

.PARAMETER AllowAutonomous
    Required in addition to -AgentMode autonomous to acknowledge the safety review requirement
    before enabling Autonomous mode. Omit for the default, safe Review-mode setup.

.PARAMETER SubscriptionId
    Optional subscription override. Defaults to the current az CLI context. Applied consistently
    to every az/azmcp call in this script so validation and mutation never target different
    subscriptions.

.PARAMETER MonitoringContributorScope
    Scope to check/report for the Monitoring Contributor role: 'ResourceGroup' (default, matches
    the least-privilege scope `sre-agent.bicep` actually assigns) or 'Subscription' (matches the
    literal scope Microsoft Learn recommends for broad alert visibility across resource groups).
    This demo's alerts, AKS cluster, and Log Analytics workspace all live in one resource group, so
    resource-group scope is sufficient here; use 'Subscription' only if the agent must scan alerts
    in other resource groups too.

.PARAMETER ExpectedIncidentPlatformType
    Expected value of `incidentManagementConfiguration.type` once connected. Must match the
    `incidentManagementConfigurationType` Bicep parameter (default 'AzMonitor'). The Azure SRE
    Agent API reference (https://learn.microsoft.com/azure/sre-agent/api-reference#agent-properties)
    documents this as an enum: PagerDuty, AzMonitor, ServiceNow, or None. Kept as a parameter, not
    hardcoded, in case a future API revision changes the literal.

.PARAMETER WhatIf
    Reports capability status and prints what would be created without creating or modifying the
    response plan.

.EXAMPLE
    .\scripts\configure-sre-agent-incident-response.ps1 -ResourceGroupName rg-srelab-eastus2

.EXAMPLE
    .\scripts\configure-sre-agent-incident-response.ps1 -ResourceGroupName rg-srelab-eastus2 -WhatIf

.NOTES
    Exit codes:
    - 0: fully automated and confirmed (or -WhatIf completed with no blockers found)
    - 1: hard error (missing az CLI/login, resource group guard violation, invalid parameters)
    - 2: blocked on a portal-only step -- read the printed instructions and complete them manually
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter()]
    [string]$AgentName = 'sre-srelab',

    [Parameter()]
    [string]$ResponsePlanName = 'energy-grid-response-plan',

    [Parameter()]
    [ValidateSet('critical', 'high', 'medium', 'low')]
    [string]$Severity = 'high',

    [Parameter()]
    [string]$TriggerCondition = 'Energy Grid',

    [Parameter()]
    [string[]]$Services = @('meter-service', 'asset-service', 'dispatch-service', 'mongodb', 'rabbitmq'),

    [Parameter()]
    [string[]]$Steps = @(
        'Correlate the firing alert with recent KubePodInventory/KubeEvents signals in the energy namespace.',
        'Check MongoDB/RabbitMQ dependency health before assuming an application-level defect.',
        'Recommend remediation for operator approval; do not execute changes autonomously.'
    ),

    [Parameter()]
    [ValidateSet('review', 'autonomous')]
    [string]$AgentMode = 'review',

    [Parameter()]
    [switch]$AllowAutonomous,

    [Parameter()]
    [string]$SubscriptionId,

    [Parameter()]
    [ValidateSet('ResourceGroup', 'Subscription')]
    [string]$MonitoringContributorScope = 'ResourceGroup',

    [Parameter()]
    [ValidateSet('AzMonitor', 'PagerDuty', 'ServiceNow', 'None')]
    [string]$ExpectedIncidentPlatformType = 'AzMonitor',

    [Parameter()]
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

# Hard safety guard -- never run against the known AmeriGas resource group, no matter the mode.
$excludedResourceGroups = @('rg-srelab-northcentralus')
if ($excludedResourceGroups -contains $ResourceGroupName) {
    Write-Host "BLOCKED: '$ResourceGroupName' is an excluded resource group. Refusing to run." -ForegroundColor Red
    exit 1
}

if ($AgentMode -eq 'autonomous' -and -not $AllowAutonomous) {
    Write-Host "BLOCKED: AgentMode 'autonomous' requires -AllowAutonomous to acknowledge the safety review requirement (docs/CAPABILITY-CONTRACTS.md SS9). This demo defaults to Review mode." -ForegroundColor Red
    exit 1
}

function Write-Status {
    param([string]$Message, [string]$Color = 'White')
    Write-Host $Message -ForegroundColor $Color
}

function Invoke-AzJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter()]
        [switch]$AllowNull
    )

    $output = & az @Arguments 2>&1
    $text = ($output | Out-String).Trim()

    if ($LASTEXITCODE -ne 0) {
        if ($AllowNull) { return $null }
        throw "az $($Arguments -join ' ') failed: $text"
    }

    if ([string]::IsNullOrWhiteSpace($text) -or $text -eq 'null') {
        if ($AllowNull) { return $null }
        throw "az $($Arguments -join ' ') returned no JSON output."
    }

    return $text | ConvertFrom-Json
}

$blockers = New-Object System.Collections.Generic.List[string]
$exitCode = 0

Write-Host @"

============================================================================
  Azure SRE Agent Native Incident Response Setup (issue #76)
============================================================================

"@ -ForegroundColor Cyan

Write-Status "Checking Azure account context..." 'Cyan'
$account = Invoke-AzJson -Arguments @('account', 'show', '--output', 'json')
if (-not $SubscriptionId) { $SubscriptionId = $account.id }
Write-Status "Account: $($account.name) ($SubscriptionId)" 'Gray'

Write-Status "`nLooking up SRE Agent '$AgentName' in resource group '$ResourceGroupName'..." 'Cyan'
$agent = Invoke-AzJson -Arguments @(
    'resource', 'show',
    '--subscription', $SubscriptionId,
    '--resource-group', $ResourceGroupName,
    '--name', $AgentName,
    '--resource-type', 'Microsoft.App/agents',
    '--output', 'json'
) -AllowNull

if (-not $agent) {
    Write-Status "BLOCKED: SRE Agent '$AgentName' was not found in '$ResourceGroupName' (subscription $SubscriptionId)." 'Yellow'
    Write-Status "Deploy it first with scripts/deploy.ps1 (deploySreAgent=true, the default), then rerun this script." 'Yellow'
    exit 2
}
Write-Status "Found SRE Agent: $($agent.id)" 'Green'

# -----------------------------------------------------------------------
# Step 1: Incident platform connection (Bicep-managed, documented ARM property)
# -----------------------------------------------------------------------
Write-Status "`n[1/3] Checking incidentManagementConfiguration (Azure Monitor incident platform)..." 'Cyan'
$incidentConfig = $agent.properties.incidentManagementConfiguration
$platformConnected = $false
if ($incidentConfig -and $incidentConfig.type -eq $ExpectedIncidentPlatformType) {
    Write-Status "  Connected: incidentManagementConfiguration.type = '$($incidentConfig.type)'" 'Green'
    $platformConnected = $true
} elseif ($incidentConfig -and $incidentConfig.type) {
    Write-Status "  UNEXPECTED VALUE: incidentManagementConfiguration.type = '$($incidentConfig.type)', expected '$ExpectedIncidentPlatformType'." 'Yellow'
    Write-Status "  This may be a different incident platform (PagerDuty/ServiceNow) or a schema drift; verify in the portal before assuming Azure Monitor is connected." 'Yellow'
    $blockers.Add("incidentManagementConfiguration.type is '$($incidentConfig.type)', not the expected '$ExpectedIncidentPlatformType'.")
} else {
    Write-Status "  NOT CONNECTED: incidentManagementConfiguration is not set on this agent." 'Yellow'
    Write-Status "  Fix (preferred): redeploy Bicep with sreAgentIncidentPlatform='AzureMonitor' (the default in main.bicepparam) via scripts/deploy.ps1." 'Yellow'
    Write-Status "  Fix (portal fallback, if Bicep cannot be reapplied): SRE Agent portal > Builder > Incident platform > select 'Azure Monitor' > Save. Wait for the 'Azure Monitor connected' checkpoint." 'Yellow'
    $blockers.Add('Azure Monitor incident platform is not connected.')
}

if ($platformConnected) {
    Write-Host @"

  !!! IMMEDIATE ACTION REQUIRED before any alert can fire against this agent !!!
  Connecting an incident platform auto-creates a 'Quickstart' response plan, and Microsoft Learn
  documents that NEW response plans default to Autonomous mode -- not Review. Until you confirm or
  delete the Quickstart plan in the portal (Builder > Incident response plans), an alert could be
  picked up by an Autonomous-mode plan instead of the Review-mode '$ResponsePlanName' plan this
  script manages. Do this check now, not after your first live alert test.
"@ -ForegroundColor Red
}

# -----------------------------------------------------------------------
# Step 2: Monitoring Contributor role for alert visibility
# -----------------------------------------------------------------------
Write-Status "`n[2/3] Checking Monitoring Contributor role assignment for the agent identity..." 'Cyan'

# Check every identity attached to the agent resource (system-assigned + all user-assigned),
# not just one. sre-agent.bicep assigns Monitoring Contributor to the user-assigned identity (the
# same one used by actionConfiguration.identity), but this check is defensive: it doesn't assume
# which identity the agent's own alert-scanning backend uses internally.
$candidatePrincipals = New-Object System.Collections.Generic.List[pscustomobject]
if ($agent.identity -and $agent.identity.principalId) {
    $candidatePrincipals.Add([pscustomobject]@{ Kind = 'SystemAssigned'; PrincipalId = $agent.identity.principalId })
}
if ($agent.identity -and $agent.identity.userAssignedIdentities) {
    foreach ($entry in $agent.identity.userAssignedIdentities.PSObject.Properties) {
        if ($entry.Value.principalId) {
            $candidatePrincipals.Add([pscustomobject]@{ Kind = "UserAssigned ($($entry.Name))"; PrincipalId = $entry.Value.principalId })
        }
    }
}

if ($candidatePrincipals.Count -eq 0) {
    Write-Status "  UNKNOWN: could not resolve any principal ID from the agent's identity block." 'Yellow'
    $blockers.Add('Could not resolve any agent managed identity principal ID to verify Monitoring Contributor.')
} else {
    $scopeId = if ($MonitoringContributorScope -eq 'Subscription') {
        "/subscriptions/$SubscriptionId"
    } else {
        "/subscriptions/$SubscriptionId/resourceGroups/$ResourceGroupName"
    }

    $anyHasRole = $false
    foreach ($candidate in $candidatePrincipals) {
        $roleAssignments = Invoke-AzJson -Arguments @(
            'role', 'assignment', 'list',
            '--subscription', $SubscriptionId,
            '--assignee', $candidate.PrincipalId,
            '--scope', $scopeId,
            '--output', 'json'
        ) -AllowNull
        $hasRole = @($roleAssignments | Where-Object { $_.roleDefinitionName -eq 'Monitoring Contributor' }).Count -gt 0
        if ($hasRole) {
            Write-Status "  Present: Monitoring Contributor is assigned to $($candidate.Kind) identity ($($candidate.PrincipalId)) on $scopeId." 'Green'
            $anyHasRole = $true
        }
    }

    if (-not $anyHasRole) {
        Write-Status "  MISSING: Monitoring Contributor is not assigned to any identity on this agent at $scopeId." 'Yellow'
        Write-Status "  Fix (preferred): redeploy Bicep -- sre-agent.bicep now assigns this role automatically when incidentPlatform='AzureMonitor'." 'Yellow'
        Write-Status "  Fix (script fallback, e.g. if Bicep role assignments are blocked by policy):" 'Yellow'
        foreach ($candidate in $candidatePrincipals) {
            Write-Status "    az role assignment create --assignee $($candidate.PrincipalId) --role `"Monitoring Contributor`" --scope $scopeId" 'Gray'
        }
        Write-Status "  Note: Microsoft Learn recommends subscription scope for this role; this script defaults to resource-group scope to match sre-agent.bicep's least-privilege pattern. Pass -MonitoringContributorScope Subscription if the agent must scan alerts outside this resource group." 'Gray'
        $blockers.Add('Monitoring Contributor role is not assigned to any agent identity.')
    }
}

# -----------------------------------------------------------------------
# Step 3: Energy Grid incident response plan
# -----------------------------------------------------------------------
Write-Status "`n[3/3] Checking Energy Grid incident response plan '$ResponsePlanName'..." 'Cyan'
$azmcpCommand = Get-Command azmcp -ErrorAction SilentlyContinue

if (-not $azmcpCommand) {
    Write-Status "  Azure MCP Server CLI ('azmcp') was not found on PATH. Skipping automated response-plan setup." 'Yellow'
    Write-Status "  Install: https://learn.microsoft.com/azure/developer/azure-mcp-server/get-started (or use an MCP-enabled agent/IDE)." 'Yellow'
    $blockers.Add('azmcp CLI unavailable; response plan must be created via the portal.')
} else {
    try {
        $existingPlansRaw = & azmcp sreagent incidents plans list --agent $AgentName --resource-group $ResourceGroupName --subscription $SubscriptionId 2>&1
        if ($LASTEXITCODE -ne 0) {
            # Fail closed: a failed list is NOT the same as "no existing plans". Since
            # `incidents plans create` is documented as non-idempotent, creating on top of an
            # unconfirmed list could produce a duplicate active plan.
            throw "azmcp sreagent incidents plans list failed with exit code ${LASTEXITCODE}: $($existingPlansRaw | Out-String)"
        }

        $existingPlans = ($existingPlansRaw | Out-String).Trim() | ConvertFrom-Json
        $planNames = @()
        if ($existingPlans) {
            $planNames = @($existingPlans | ForEach-Object { $_.name ?? $_.Name ?? $_.planName })
        }

        if ($planNames -contains $ResponsePlanName) {
            Write-Status "  Already configured: response plan '$ResponsePlanName' exists (idempotent no-op)." 'Green'
        } elseif ($WhatIf) {
            Write-Status "  [WhatIf] Would create response plan '$ResponsePlanName' (severity=$Severity, agent-mode=$AgentMode)." 'Gray'
        } else {
            Write-Status "  Creating response plan '$ResponsePlanName' via azmcp (not idempotent on its own; list-checked above)..." 'Cyan'
            & azmcp sreagent incidents plans create `
                --name $ResponsePlanName `
                --severity $Severity `
                --trigger-condition $TriggerCondition `
                --services ($Services -join ',') `
                --steps ($Steps -join ';') `
                --agent-mode $AgentMode `
                --agent $AgentName `
                --resource-group $ResourceGroupName `
                --subscription $SubscriptionId
            if ($LASTEXITCODE -ne 0) {
                throw "azmcp sreagent incidents plans create failed with exit code $LASTEXITCODE"
            }
            Write-Status "  Created response plan '$ResponsePlanName'." 'Green'
        }
    } catch {
        Write-Status "  FAILED to query/create the response plan via azmcp: $($_.Exception.Message)" 'Red'
        $blockers.Add('azmcp response-plan list/create failed; fall back to the portal steps below.')
    }

    Write-Status "  NOTE: the azmcp response-plan tool does not expose reinvestigation cooldown or custom-agent routing fields; confirm these in the portal (see below)." 'Yellow'
}

Write-Status "`nPortal steps to confirm or complete manually (https://learn.microsoft.com/azure/sre-agent/response-plan, https://learn.microsoft.com/azure/sre-agent/automate-incidents):" 'Cyan'
Write-Status "  1. SRE Agent portal (sre.azure.com) > select this agent." 'Gray'
Write-Status "  2. Builder > Incident platform > confirm 'Azure Monitor connected' (green checkmark)." 'Gray'
Write-Status "  3. Builder > Incident response plans > table view > delete the auto-created 'Quickstart' plan if present, to avoid double-routing." 'Gray'
Write-Status "  4. Open or create '$ResponsePlanName': confirm severity filter, set 'Title contains' to '$TriggerCondition', select the response custom agent, and set autonomy to Review." 'Gray'
Write-Status "  5. Confirm 'Reinvestigation cooldown' is enabled (default 3h) so repeated alert firings merge into one investigation thread." 'Gray'
Write-Status "  6. Save, then confirm the plan's Status badge reads 'On'." 'Gray'

Write-Status "`n============================================================================" 'Cyan'
if ($blockers.Count -eq 0) {
    Write-Status "RESULT: All automatable checks passed. Complete the portal confirmation steps above before your first live validation run." 'Green'
    $exitCode = 0
} else {
    Write-Status "RESULT: $($blockers.Count) item(s) need attention:" 'Yellow'
    foreach ($blocker in $blockers) { Write-Status "  - $blocker" 'Yellow' }
    $exitCode = 2
}
Write-Status "The existing Action Group -> Mission Control webhook fallback is unaffected by this script and keeps working regardless of the above." 'Gray'

exit $exitCode
