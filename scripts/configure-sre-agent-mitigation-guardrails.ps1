<#
.SYNOPSIS
    Applies and verifies the Review-mode mitigation guardrails for the Energy Grid lab (issue #80).

.DESCRIPTION
    Implements the enforcement boundary described in docs/REVIEW-MODE-MITIGATION.md §3:

      Layer 1  Global Tool Access Policy (infra/sre-agent/tool-access-policy.json), PUT to the
               documented endpoint /api/v2/agent/settings/global
               (https://learn.microsoft.com/azure/sre-agent/tool-access-policies#global-policies).
      Layer 3  Azure control-plane custom role instead of Contributor.

    The script is deliberately conservative:
      * -WhatIf is supported and no write happens without an explicit -Apply.
      * It NEVER creates, deletes, or modifies any Azure resource other than PUTting the tool
        access policy for the named agent.
      * Every check reports what was actually observed. A check that cannot be performed is
        reported as UNKNOWN, never as PASS.

.PARAMETER ResourceGroupName
    Resource group containing the SRE Agent.

.PARAMETER AgentName
    Name of the Microsoft.App/agents resource. Discovered from the resource group when omitted.

.PARAMETER Apply
    Actually PUT the tool access policy. Without this, the script only reports what it would do.

.EXAMPLE
    ./scripts/configure-sre-agent-mitigation-guardrails.ps1 -ResourceGroupName rg-srelab-eastus2

.EXAMPLE
    ./scripts/configure-sre-agent-mitigation-guardrails.ps1 -ResourceGroupName rg-srelab-eastus2 -Apply
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [string]$AgentName,

    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$policyPath = Join-Path $repoRoot 'infra/sre-agent/tool-access-policy.json'

if (-not (Test-Path $policyPath)) {
    throw "Tool access policy not found: $policyPath"
}

function Write-Result {
    param([string]$Status, [string]$Message)
    $colour = switch ($Status) {
        'PASS'    { 'Green' }
        'FAIL'    { 'Red' }
        'WARN'    { 'Yellow' }
        'UNKNOWN' { 'DarkYellow' }
        default   { 'Gray' }
    }
    Write-Host ("[{0,-7}] {1}" -f $Status, $Message) -ForegroundColor $colour
}

Write-Host ''
Write-Host 'Review-mode mitigation guardrails (issue #80)' -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host "Design document: docs/REVIEW-MODE-MITIGATION.md"
Write-Host ''

# -----------------------------------------------------------------------------
# 1. Validate the policy document itself, before touching Azure.
# -----------------------------------------------------------------------------

$policyRaw = Get-Content -Path $policyPath -Raw
try {
    $policy = $policyRaw | ConvertFrom-Json
} catch {
    throw "Tool access policy is not valid JSON: $($_.Exception.Message)"
}

if (-not $policy.permissions) {
    throw 'Tool access policy is missing the required `permissions` object.'
}

$askRules = @($policy.permissions.ask)
$denyRules = @($policy.permissions.deny)
$allowRules = @($policy.permissions.allow)

$expectedAsk = @(
    'RunKubectlWriteCommand(kubectl scale deployment/mongodb -n energy --replicas=1)',
    'RunKubectlWriteCommand(kubectl scale deployment/mongodb -n energy --replicas=0)'
)

$failures = 0

if (($askRules.Count -eq $expectedAsk.Count) -and (-not (Compare-Object $askRules $expectedAsk))) {
    Write-Result 'PASS' "Ask rules are exactly the two allowlisted scale commands."
} else {
    Write-Result 'FAIL' "Ask rules drifted from the documented allowlist. Expected: $($expectedAsk -join ', ')"
    $failures++
}

# The deny list must block the categories issue #80 forbids outright.
$requiredDenyPatterns = @(
    'kubectl delete', 'kubectl exec', 'RunAzCliWriteCommands', 'az keyvault',
    'az aks command invoke', 'ExecutePythonCode', 'RunShellCommand', 'RunInTerminal'
)
foreach ($pattern in $requiredDenyPatterns) {
    if ($denyRules -match [regex]::Escape($pattern)) {
        Write-Result 'PASS' "Deny rule present for '$pattern'."
    } else {
        Write-Result 'FAIL' "Deny rule MISSING for '$pattern'. Issue #80 forbids this category."
        $failures++
    }
}

# An allow rule that matches a write tool would bypass the ask gate entirely.
foreach ($rule in $allowRules) {
    if ($rule -match 'Write|delete|exec|Terminal|Shell|Python') {
        Write-Result 'FAIL' "Allow rule '$rule' would bypass the approval gate. Allow must be read-only."
        $failures++
    }
}
if ($allowRules.Count -gt 0 -and $failures -eq 0) {
    Write-Result 'PASS' "Allow rules are read-only ($($allowRules.Count) rule(s))."
}

if ($failures -gt 0) {
    throw "Tool access policy failed static validation with $failures error(s). Refusing to apply it."
}

# -----------------------------------------------------------------------------
# 2. Discover the agent and report its Azure RBAC posture.
# -----------------------------------------------------------------------------

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Result 'UNKNOWN' 'Azure CLI is not on PATH; skipping all live checks. Static policy validation passed.'
    Write-Host ''
    Write-Host 'Static validation only. Live guardrail state was NOT verified.' -ForegroundColor Yellow
    exit 0
}

if (-not $AgentName) {
    $AgentName = az resource list --resource-group $ResourceGroupName --resource-type 'Microsoft.App/agents' --query '[0].name' -o tsv 2>$null
}

if (-not $AgentName) {
    Write-Result 'UNKNOWN' "No Microsoft.App/agents resource found in '$ResourceGroupName'. Live checks skipped."
    Write-Host ''
    Write-Host 'Static validation only. Live guardrail state was NOT verified.' -ForegroundColor Yellow
    exit 0
}

Write-Result 'INFO' "Agent: $AgentName (resource group $ResourceGroupName)"

$principalId = az resource show --resource-group $ResourceGroupName --name $AgentName --resource-type 'Microsoft.App/agents' --query 'properties.actionConfiguration.identity' -o tsv 2>$null

$identityPrincipal = $null
if ($principalId) {
    $identityPrincipal = az identity show --ids $principalId --query 'principalId' -o tsv 2>$null
}

if ($identityPrincipal) {
    $assignments = az role assignment list --assignee $identityPrincipal --all -o json 2>$null | ConvertFrom-Json
    $contributor = @($assignments | Where-Object { $_.roleDefinitionName -eq 'Contributor' })

    if ($contributor.Count -gt 0) {
        # Loud, non-suppressible: issue #80 requires Contributor to be replaced on this path.
        Write-Result 'FAIL' "The agent identity holds Contributor at: $((($contributor | ForEach-Object { $_.scope }) -join ', ')). Issue #80 requires the Review-mode mitigation path to use the narrow custom role instead. Redeploy with sreAgentAccessLevel = 'Mitigation'."
        $failures++
    } else {
        Write-Result 'PASS' 'The agent identity does NOT hold Contributor.'
    }

    $customRole = @($assignments | Where-Object { $_.roleDefinitionName -like 'SRE Agent Energy Grid Mitigation Operator*' })
    if ($customRole.Count -gt 0) {
        Write-Result 'PASS' "Narrow mitigation custom role assigned at: $((($customRole | ForEach-Object { $_.scope }) -join ', '))"
    } else {
        Write-Result 'WARN' "The narrow mitigation custom role is not assigned. Deploy with enableReviewModeMitigation = true."
    }

    $k8sRole = @($assignments | Where-Object { $_.roleDefinitionName -like 'SRE Agent Energy Grid Deployment Scaler*' })
    if ($k8sRole.Count -gt 0) {
        Write-Result 'PASS' 'Layer 2 active: the Kubernetes boundary is enforced by the API server at namespace scope.'
    } else {
        Write-Result 'WARN' 'DEMO-ONLY PERMISSION BREADTH: Layer 2 (Azure RBAC for Kubernetes) is inactive, so the cluster-user credential is broader than this action needs. The tool access policy still constrains what the agent will run. See docs/REVIEW-MODE-MITIGATION.md section 4. Deploy with enableAgentKubernetesRbac = true to remove this breadth.'
    }
} else {
    Write-Result 'UNKNOWN' 'Could not resolve the agent managed identity principal; RBAC posture NOT verified.'
}

# -----------------------------------------------------------------------------
# 3. Apply the tool access policy.
# -----------------------------------------------------------------------------

$permissionsBody = ($policy | Select-Object -Property permissions | ConvertTo-Json -Depth 10 -Compress)

if (-not $Apply) {
    Write-Host ''
    Write-Result 'INFO' 'Dry run. Re-run with -Apply to PUT the tool access policy.'
    Write-Host "Would PUT to: https://<agent-endpoint>/api/v2/agent/settings/global"
    Write-Host "Body: $permissionsBody"
} elseif ($PSCmdlet.ShouldProcess("$AgentName global tool access policy", 'PUT permissions')) {
    $endpoint = az resource show --resource-group $ResourceGroupName --name $AgentName --resource-type 'Microsoft.App/agents' --query 'properties.endpoint' -o tsv 2>$null
    if (-not $endpoint) {
        Write-Result 'UNKNOWN' 'The agent endpoint could not be resolved from ARM. Apply the policy from the portal: Settings > Permissions.'
    } else {
        $token = az account get-access-token --resource 'https://management.azure.com/' --query accessToken -o tsv 2>$null
        if (-not $token) {
            Write-Result 'FAIL' 'Could not acquire an access token; the policy was NOT applied.'
            $failures++
        } else {
            try {
                Invoke-RestMethod -Method Put `
                    -Uri "$endpoint/api/v2/agent/settings/global" `
                    -Headers @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' } `
                    -Body $permissionsBody | Out-Null
                Write-Result 'PASS' 'Global tool access policy applied.'
            } catch {
                Write-Result 'FAIL' "Failed to apply the tool access policy: $($_.Exception.Message)"
                $failures++
            }
        }
    }
}

Write-Host ''
if ($failures -gt 0) {
    throw "Review-mode mitigation guardrails FAILED with $failures error(s). Do not run the demonstration until these are resolved."
}

Write-Host 'Guardrail checks completed. Review any WARN/UNKNOWN lines above before demonstrating.' -ForegroundColor Green
Write-Host 'Live deny/approve proof is captured separately -- see docs/REVIEW-MODE-MITIGATION.md section 10.' -ForegroundColor Yellow
