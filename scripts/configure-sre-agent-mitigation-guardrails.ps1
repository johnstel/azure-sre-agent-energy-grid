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
    Actually PUT the tool access policy, and create the namespace-scoped Layer 2 role assignment
    when its custom role definition exists. Without this, the script only reports what it would do.

.PARAMETER KubernetesNamespace
    The single Kubernetes namespace the Layer 2 assignment may target. Any assignment found at a
    different scope -- including the bare cluster scope -- is reported as a FAILURE, never as
    namespace enforcement.

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

    [ValidatePattern('^[a-z0-9]([-a-z0-9]*[a-z0-9])?$')]
    [string]$KubernetesNamespace = 'energy',

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

    # Resolve the ONE scope at which the Layer 2 assignment is permitted to exist. Azure RBAC for
    # Kubernetes Authorization scopes a namespace grant to <aksResourceId>/namespaces/<namespace>
    # (https://learn.microsoft.com/azure/aks/manage-azure-rbac). Anything else -- notably the bare
    # cluster id -- is a cluster-wide grant and must never be reported as namespace enforcement.
    $aksId = az resource list --resource-group $ResourceGroupName --resource-type 'Microsoft.ContainerService/managedClusters' --query '[0].id' -o tsv 2>$null
    $expectedNamespaceScope = if ($aksId) { "$aksId/namespaces/$KubernetesNamespace" } else { $null }

    if ($k8sRole.Count -eq 0) {
        Write-Result 'WARN' 'DEMO-ONLY PERMISSION BREADTH: Layer 2 (Azure RBAC for Kubernetes) is inactive, so the cluster-user credential is broader than this action needs. The tool access policy still constrains what the agent will run. See docs/REVIEW-MODE-MITIGATION.md section 4. Deploy with enableAgentKubernetesRbac = true and re-run this script with -Apply to create the namespace-scoped assignment.'
    } elseif (-not $expectedNamespaceScope) {
        Write-Result 'UNKNOWN' 'A Deployment Scaler assignment exists but the AKS resource id could not be resolved, so its scope could NOT be verified. Not reporting namespace enforcement.'
    } else {
        # Compare exactly. A trailing-slash or casing difference is still a different scope, so
        # normalise only trailing slashes and compare case-insensitively (ARM ids are
        # case-insensitive but case-preserving).
        $normalizedExpected = $expectedNamespaceScope.TrimEnd('/')
        $correctlyScoped = @($k8sRole | Where-Object { $_.scope.TrimEnd('/') -ieq $normalizedExpected })
        $wronglyScoped = @($k8sRole | Where-Object { $_.scope.TrimEnd('/') -ine $normalizedExpected })

        foreach ($bad in $wronglyScoped) {
            if ($bad.scope.TrimEnd('/') -ieq $aksId.TrimEnd('/')) {
                Write-Result 'FAIL' "CLUSTER-WIDE GRANT: the Deployment Scaler role is assigned at the cluster scope '$($bad.scope)'. This is NOT namespace enforcement. Delete it with: az role assignment delete --ids $($bad.id)"
            } else {
                Write-Result 'FAIL' "OUT-OF-SCOPE GRANT: the Deployment Scaler role is assigned at '$($bad.scope)', which is not the expected '$normalizedExpected'. Delete it with: az role assignment delete --ids $($bad.id)"
            }
            $failures++
        }

        if ($correctlyScoped.Count -gt 0) {
            Write-Result 'PASS' "Layer 2 active: Deployment Scaler assigned at exactly '$($correctlyScoped[0].scope)' -- the Kubernetes boundary is enforced by the API server for namespace '$KubernetesNamespace'."
        } elseif ($wronglyScoped.Count -gt 0) {
            Write-Result 'FAIL' "No Deployment Scaler assignment exists at the required namespace scope '$normalizedExpected'. Layer 2 is NOT enforcing a namespace boundary."
            $failures++
        }
    }

    # Create the namespace-scoped assignment when asked. Bicep cannot express this scope (see
    # infra/bicep/modules/sre-agent-mitigation-role.bicep), so it is created here -- idempotently,
    # and only ever at the exact namespace path.
    if ($Apply -and $expectedNamespaceScope) {
        $scalerRoleName = az role definition list --custom-role-only true --query "[?starts_with(roleName, 'SRE Agent Energy Grid Deployment Scaler')].roleName | [0]" -o tsv 2>$null
        if (-not $scalerRoleName) {
            Write-Result 'WARN' 'The Deployment Scaler custom role definition does not exist. Deploy with enableAgentKubernetesRbac = true before creating the namespace assignment.'
        } elseif ($PSCmdlet.ShouldProcess($expectedNamespaceScope, "Assign '$scalerRoleName'")) {
            $normalizedExpected = $expectedNamespaceScope.TrimEnd('/')
            $already = @($k8sRole | Where-Object { $_.scope.TrimEnd('/') -ieq $normalizedExpected })
            if ($already.Count -gt 0) {
                Write-Result 'INFO' "Namespace-scoped assignment already exists at '$normalizedExpected'; nothing to do (idempotent)."
            } else {
                $created = az role assignment create --assignee-object-id $identityPrincipal --assignee-principal-type ServicePrincipal --role "$scalerRoleName" --scope $normalizedExpected -o json 2>$null | ConvertFrom-Json
                if (-not $created) {
                    Write-Result 'FAIL' "Failed to create the namespace-scoped assignment at '$normalizedExpected'."
                    $failures++
                } else {
                    # Read back and assert the scope the SERVICE returned, not the one requested.
                    $readBack = az role assignment show --scope $normalizedExpected --assignee $identityPrincipal --role "$scalerRoleName" -o json 2>$null | ConvertFrom-Json
                    $actualScope = if ($readBack) { @($readBack)[0].scope } else { $created.scope }
                    if ($actualScope -and $actualScope.TrimEnd('/') -ieq $normalizedExpected) {
                        Write-Result 'PASS' "Created and verified namespace-scoped assignment. Returned scope: '$actualScope'"
                    } else {
                        Write-Result 'FAIL' "Assignment was created but its returned scope '$actualScope' does not match the required '$normalizedExpected'. Treating Layer 2 as NOT enforced."
                        $failures++
                    }
                }
            }
        }
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
