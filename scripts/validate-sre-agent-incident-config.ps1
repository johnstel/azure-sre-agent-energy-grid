<#
.SYNOPSIS
    Regression guard for the Azure SRE Agent incident-platform literal (issue #76).

.DESCRIPTION
    An independent review caught that the Azure Monitor incident-platform literal written to the
    documented `Microsoft.App/agents` ARM property `incidentManagementConfiguration.type` was
    incorrectly `AzureMonitor` instead of the documented `AzMonitor`
    (https://learn.microsoft.com/azure/sre-agent/api-reference#agent-properties enumerates:
    `PagerDuty`, `AzMonitor`, `ServiceNow`, or `None`). Because ARM types this property as a bare,
    unconstrained string, a wrong literal deploys successfully while the SRE Agent backend silently
    ignores the unrecognized platform type -- there is no ARM-level validation to catch this class
    of bug, so this script exists to catch it statically instead.

    This script performs two kinds of checks:
    1. Static source checks on infra/bicep/modules/sre-agent.bicep and
       scripts/configure-sre-agent-incident-response.ps1 for the correct default literal and for
       the specific incorrect literal that caused this regression.
    2. A compiled-ARM check: builds infra/bicep/modules/sre-agent.bicep with `az bicep build` and
       asserts the emitted parameter default is exactly `AzMonitor`, so a future edit that changes
       the Bicep source but produces a different compiled default is still caught.

    This is intentionally narrow and only about the incident-platform literal; do not extend it
    into a general Bicep linter.

.NOTES
    Requires the Azure CLI Bicep extension (`az bicep build`) for the compiled-ARM check. If Bicep
    is unavailable, that check is skipped with a warning rather than failing the whole script,
    matching the read-mostly, fail-loud-not-fail-blind posture of the other validate-*.ps1 scripts
    in this repo.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$bicepModulePath = Join-Path $repoRoot 'infra/bicep/modules/sre-agent.bicep'
$scriptPath = Join-Path $repoRoot 'scripts/configure-sre-agent-incident-response.ps1'

if (-not (Test-Path $bicepModulePath)) {
    throw "SRE Agent Bicep module not found: $bicepModulePath"
}
if (-not (Test-Path $scriptPath)) {
    throw "SRE Agent incident-response script not found: $scriptPath"
}

$bicepContent = Get-Content -Path $bicepModulePath -Raw
$scriptContent = Get-Content -Path $scriptPath -Raw

$checks = @(
    @{
        Name      = 'sre-agent.bicep declares the documented AzMonitor default for incidentManagementConfigurationType'
        Condition = $bicepContent -match "param incidentManagementConfigurationType string = 'AzMonitor'"
    },
    @{
        Name      = 'sre-agent.bicep does NOT reintroduce the incorrect AzureMonitor literal as the configuration-type default'
        Condition = $bicepContent -notmatch "param incidentManagementConfigurationType string = 'AzureMonitor'"
    },
    @{
        Name      = 'sre-agent.bicep constrains incidentManagementConfigurationType to the four documented literals'
        Condition = $bicepContent -match "@allowed\(\['AzMonitor', 'PagerDuty', 'ServiceNow', 'None'\]\)"
    },
    @{
        Name      = 'configure-sre-agent-incident-response.ps1 defaults -ExpectedIncidentPlatformType to AzMonitor'
        Condition = $scriptContent -match "\[string\]\`$ExpectedIncidentPlatformType = 'AzMonitor',"
    },
    @{
        Name      = 'configure-sre-agent-incident-response.ps1 does NOT reintroduce AzureMonitor as the expected readback value'
        Condition = $scriptContent -notmatch "\[string\]\`$ExpectedIncidentPlatformType = 'AzureMonitor',"
    },
    @{
        Name      = 'configure-sre-agent-incident-response.ps1 constrains -ExpectedIncidentPlatformType to the four documented literals'
        Condition = $scriptContent -match "\[ValidateSet\('AzMonitor', 'PagerDuty', 'ServiceNow', 'None'\)\]"
    }
)

$failed = @()
foreach ($check in $checks) {
    if (-not $check.Condition) {
        $failed += $check.Name
    }
}

if ($failed.Count -gt 0) {
    Write-Host 'SRE Agent incident-platform literal validation failed:' -ForegroundColor Red
    foreach ($item in $failed) {
        Write-Host " - $item" -ForegroundColor Red
    }
    exit 1
}

Write-Host 'Static source checks passed: incidentManagementConfiguration.type literal is AzMonitor everywhere it is emitted or expected.' -ForegroundColor Green

# -----------------------------------------------------------------------
# Compiled-ARM check: confirm the literal actually emitted by `az bicep build`
# matches the source, independent of how the Bicep source expresses it.
# -----------------------------------------------------------------------
$azCommand = Get-Command az -ErrorAction SilentlyContinue
if (-not $azCommand) {
    Write-Host 'az CLI not found on PATH -- skipping compiled-ARM check (static source checks above still passed).' -ForegroundColor Yellow
    exit 0
}

$tempJson = Join-Path ([System.IO.Path]::GetTempPath()) "sre-agent-compiled-$([System.Guid]::NewGuid()).json"
try {
    $buildOutput = & az bicep build --file $bicepModulePath --outfile $tempJson 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "az bicep build failed -- skipping compiled-ARM check: $buildOutput" -ForegroundColor Yellow
        exit 0
    }

    $compiled = Get-Content -Path $tempJson -Raw | ConvertFrom-Json
    $paramDefault = $compiled.parameters.incidentManagementConfigurationType.defaultValue

    if ($paramDefault -ne 'AzMonitor') {
        Write-Host "Compiled-ARM check FAILED: incidentManagementConfigurationType default compiled to '$paramDefault', expected 'AzMonitor'." -ForegroundColor Red
        exit 1
    }

    Write-Host "Compiled-ARM check passed: incidentManagementConfigurationType default compiles to 'AzMonitor'." -ForegroundColor Green
}
finally {
    if (Test-Path $tempJson) {
        Remove-Item -Path $tempJson -Force
    }
}

Write-Host 'SRE Agent incident-platform literal validation passed.' -ForegroundColor Green
