<#
.SYNOPSIS
    Validates the repo-managed Grafana incident dashboard definition.

.DESCRIPTION
    Checks that the dashboard JSON file exists, is valid JSON, contains the required
    templated variables, and uses the repo-owned incident dashboard title.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$DefinitionPath = (Join-Path $PSScriptRoot '..' 'infra/grafana/energy-grid-incident-dashboard.json')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $DefinitionPath)) {
    throw "Dashboard definition not found at '$DefinitionPath'."
}

$resolvedDefinitionPath = (Resolve-Path $DefinitionPath).Path
try {
    $dashboardDefinition = Get-Content -Path $resolvedDefinitionPath -Raw | ConvertFrom-Json
}
catch {
    throw "Dashboard definition is not valid JSON: $_"
}

if (-not $dashboardDefinition.title -or $dashboardDefinition.title -ne 'Energy Grid — Incident Overview') {
    throw "Dashboard definition must target the 'Energy Grid — Incident Overview' dashboard."
}

$requiredVariables = @('environment', 'namespace', 'service', 'scenario')
foreach ($requiredVariable in $requiredVariables) {
    $matchingVariables = @($dashboardDefinition.templating.list | Where-Object { $_.name -eq $requiredVariable })
    if ($matchingVariables.Count -eq 0) {
        throw "Dashboard definition is missing the '$requiredVariable' variable."
    }
}

$panels = @($dashboardDefinition.panels)
if ($panels.Count -lt 6) {
    throw "Dashboard definition must include at least 6 panels."
}

$requiredPanelTitles = @(
    'Incident handoff and safe links',
    'Namespace health (Running / Pending / Failed)',
    'Requests and errors (App Insights telemetry pending)',
    'Dependency failures (App Insights telemetry pending)',
    'Scenario timeline and annotations'
)

foreach ($requiredPanelTitle in $requiredPanelTitles) {
    $panel = @($panels | Where-Object { $_.title -eq $requiredPanelTitle }) | Select-Object -First 1
    if (-not $panel) {
        throw "Dashboard definition is missing the '$requiredPanelTitle' panel."
    }
}

$namespacePanel = @($panels | Where-Object { $_.title -eq 'Namespace health (Running / Pending / Failed)' }) | Select-Object -First 1
if ($namespacePanel -and $namespacePanel.targets[0].expr -notmatch 'pod=~"\^\(\$service\)\(\-|\$\)"') {
    throw "Namespace health panel must use the prefix-based pod filter for the selected service."
}

$requestPanel = @($panels | Where-Object { $_.title -eq 'Requests and errors (App Insights telemetry pending)' }) | Select-Object -First 1
if ($requestPanel -and $requestPanel.targets[0].expr -ne 'vector(0)') {
    throw "Requests and errors panel must remain an honest no-data panel until App Insights telemetry is available."
}

$dependencyPanel = @($panels | Where-Object { $_.title -eq 'Dependency failures (App Insights telemetry pending)' }) | Select-Object -First 1
if ($dependencyPanel -and $dependencyPanel.targets[0].expr -ne 'vector(0)') {
    throw "Dependency failures panel must remain an honest no-data panel until App Insights telemetry is available."
}

Write-Host "✅ Dashboard definition validated: $resolvedDefinitionPath" -ForegroundColor Green
