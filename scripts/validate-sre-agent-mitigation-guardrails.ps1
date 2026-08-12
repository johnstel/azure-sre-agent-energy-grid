<#
.SYNOPSIS
    Static regression guard for the Review-mode mitigation guardrails (issue #80).

.DESCRIPTION
    Runs entirely offline. It proves that the enforcement boundary described in
    docs/REVIEW-MODE-MITIGATION.md has not silently drifted in source:

      1. The tool access policy allowlist is exactly the two documented scale commands, the deny
         list covers every category issue #80 forbids, and no allow rule can bypass the ask gate.
      2. The backend allowlist constant matches the policy document, so Mission Control's own
         re-check cannot diverge from what the agent is configured to permit.
      3. The Bicep 'Mitigation' access level grants NO Contributor.
      4. The custom role grants no admin credential, no runCommand, and no write action.
      5. The lifecycle module still refuses to accept caller-asserted lifecycle state.

    This is intentionally narrow. It does not attempt to be a general linter, and it never
    contacts Azure -- live posture is checked by configure-sre-agent-mitigation-guardrails.ps1.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$policyPath = Join-Path $repoRoot 'infra/sre-agent/tool-access-policy.json'
$rolePath = Join-Path $repoRoot 'infra/bicep/modules/sre-agent-mitigation-role.bicep'
$agentBicepPath = Join-Path $repoRoot 'infra/bicep/modules/sre-agent.bicep'
$lifecyclePath = Join-Path $repoRoot 'mission-control/backend/src/services/sre-agent/mitigationLifecycle.ts'
$servicePath = Join-Path $repoRoot 'mission-control/backend/src/services/ReviewModeMitigationService.ts'
$docPath = Join-Path $repoRoot 'docs/REVIEW-MODE-MITIGATION.md'

$failures = New-Object System.Collections.Generic.List[string]

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if ($Condition) {
        Write-Host "[PASS   ] $Message" -ForegroundColor Green
    } else {
        Write-Host "[FAIL   ] $Message" -ForegroundColor Red
        $script:failures.Add($Message)
    }
}

Write-Host ''
Write-Host 'Review-mode mitigation guardrails - static validation (issue #80)' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

foreach ($required in @($policyPath, $rolePath, $agentBicepPath, $lifecyclePath, $servicePath, $docPath)) {
    if (-not (Test-Path $required)) {
        throw "Required guardrail artifact is missing: $required"
    }
}

# -----------------------------------------------------------------------------
# 1. Tool access policy
# -----------------------------------------------------------------------------

$policy = Get-Content -Path $policyPath -Raw | ConvertFrom-Json
$askRules = @($policy.permissions.ask)
$denyRules = @($policy.permissions.deny)
$allowRules = @($policy.permissions.allow)

$expectedAsk = @(
    'RunKubectlWriteCommand(kubectl scale deployment/mongodb -n energy --replicas=1)',
    'RunKubectlWriteCommand(kubectl scale deployment/mongodb -n energy --replicas=0)'
)

Assert-True (($askRules.Count -eq 2) -and (-not (Compare-Object $askRules $expectedAsk))) `
    'Tool access policy ask rules are exactly the two documented scale commands.'

foreach ($pattern in @('kubectl delete', 'kubectl exec', 'kubectl port-forward', 'RunAzCliWriteCommands',
                       'az keyvault', 'az aks command invoke', 'ExecutePythonCode', 'RunShellCommand',
                       'RunInTerminal', '--all-namespaces')) {
    Assert-True ([bool]($denyRules -match [regex]::Escape($pattern))) "Deny rule present for '$pattern'."
}

$bypassing = @($allowRules | Where-Object { $_ -match 'Write|delete|exec|Terminal|Shell|Python' })
Assert-True ($bypassing.Count -eq 0) 'No allow rule can bypass the ask approval gate (allow is read-only).'

# -----------------------------------------------------------------------------
# 2. Backend allowlist matches the policy document
# -----------------------------------------------------------------------------

$lifecycle = Get-Content -Path $lifecyclePath -Raw

foreach ($command in @('kubectl scale deployment/mongodb -n energy --replicas=1',
                       'kubectl scale deployment/mongodb -n energy --replicas=0')) {
    Assert-True ($lifecycle -match [regex]::Escape($command)) `
        "Backend allowlist contains '$command', matching the tool access policy."
}

Assert-True ($lifecycle -match 'ALLOWLISTED_MITIGATION_TOOLS[^\n]*\n?[^\n]*RunKubectlWriteCommand') `
    'Backend restricts the mitigation tool to RunKubectlWriteCommand.'

Assert-True ($lifecycle -match 'SHELL_METACHARACTERS') `
    'Backend rejects shell metacharacters before normalising a command.'

# The guarantees that PR #85 lacked. These are asserted in source so a refactor cannot quietly
# reintroduce caller-asserted lifecycle state.
Assert-True ($lifecycle -match "state = 'verification-passed'|'verification-passed'") `
    'Backend defines the verification-passed state.'
Assert-True ($lifecycle -match 'deny-violation') `
    'Backend distinguishes a deny violation from a clean denial.'
Assert-True ($lifecycle -match 'denied-with-unverified-state') `
    'Backend cannot report `denied` without before/after no-mutation proof.'
Assert-True ($lifecycle -match 'blocked-run-mode') `
    'Backend blocks the flow when the effective run mode is not Review.'

$service = Get-Content -Path $servicePath -Raw
Assert-True ($service -match 'Unknown request field') `
    'The API rejects unknown request keys instead of silently dropping them.'
Assert-True ($service -notmatch "MITIGATION_REQUEST_KEYS[\s\S]{0,400}'state'") `
    'The API never accepts a caller-supplied lifecycle state.'

# -----------------------------------------------------------------------------
# 3. Bicep: Mitigation access level must not grant Contributor
# -----------------------------------------------------------------------------

$agentBicep = Get-Content -Path $agentBicepPath -Raw
$contributorId = 'b24988ac-6180-42a0-ab88-20f7382dd24c'

if ($agentBicep -match '(?s)Mitigation:\s*\[(.*?)\]') {
    $mitigationBlock = $Matches[1]
    Assert-True ($mitigationBlock -notmatch [regex]::Escape($contributorId)) `
        "The 'Mitigation' access level does NOT grant Contributor."
} else {
    Assert-True $false "The 'Mitigation' access level block was not found in sre-agent.bicep."
}

Assert-True ($agentBicep -match "mode: 'Review'") `
    "The agent's actionConfiguration mode remains 'Review'."
Assert-True ($agentBicep -notmatch "mode: 'Autonomous'") `
    'No Autonomous mode is configured anywhere in the agent module.'

# -----------------------------------------------------------------------------
# 4. Custom role stays narrow
# -----------------------------------------------------------------------------

$role = Get-Content -Path $rolePath -Raw

# Only inspect the actual ARM action strings, not comments or the human-readable description --
# both legitimately mention what the role does NOT grant.
$roleActions = @([regex]::Matches($role, "'(Microsoft\.[A-Za-z0-9./_-]+)'") | ForEach-Object { $_.Groups[1].Value })

Assert-True ($roleActions -contains 'Microsoft.ContainerService/managedClusters/listClusterUserCredential/action') `
    'Custom role grants the cluster-USER credential.'
Assert-True (-not ($roleActions -match 'listClusterAdminCredential')) `
    'Custom role does NOT grant the cluster-ADMIN credential.'
Assert-True (-not ($roleActions -match 'runCommand')) `
    'Custom role does NOT grant runCommand (which would be arbitrary in-cluster shell).'
Assert-True (-not ($roleActions -match 'managedClusters/write|managedClusters/delete')) `
    'Custom role grants no cluster write or delete action.'
Assert-True ($roleActions.Count -gt 0 -and -not ($roleActions -match '\*')) `
    'Custom role contains no wildcard action.'
Assert-True ($role -match 'notDataActions') `
    'Custom role explicitly excludes secrets and pod exec via notDataActions.'

# -----------------------------------------------------------------------------
# 5. Documentation honesty
# -----------------------------------------------------------------------------

$doc = Get-Content -Path $docPath -Raw
Assert-True ($doc -match 'PENDING') `
    'The design document still records the live deny/approve proof as pending rather than claiming it.'
Assert-True ($doc -match 'DEMO-ONLY PERMISSION BREADTH|demo-only permission') `
    'The design document discloses the demo-only permission breadth.'

# -----------------------------------------------------------------------------

Write-Host ''
if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) guardrail check(s) did not pass." -ForegroundColor Red
    foreach ($failure in $failures) { Write-Host "  - $failure" -ForegroundColor Red }
    throw "Review-mode mitigation guardrail validation failed with $($failures.Count) error(s)."
}

Write-Host 'All Review-mode mitigation guardrail checks passed (static).' -ForegroundColor Green
Write-Host 'Live posture is verified separately by scripts/configure-sre-agent-mitigation-guardrails.ps1.' -ForegroundColor Yellow
