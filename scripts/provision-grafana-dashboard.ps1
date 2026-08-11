<#
.SYNOPSIS
    Imports the repo-managed Energy Grid incident dashboard into Azure Managed Grafana.

.DESCRIPTION
    Imports docs/grafana/energy-grid-incident-dashboard.json into the Managed Grafana
    instance in the target resource group. The import is best-effort so deployment
    can continue even if the dashboard definition is invalid or the Grafana resource
    is not yet ready.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter()]
    [string]$GrafanaName,

    [Parameter()]
    [string]$DefinitionPath = (Join-Path $PSScriptRoot '..\docs\grafana\energy-grid-incident-dashboard.json'),

    [Parameter()]
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $DefinitionPath)) {
    throw "Dashboard definition was not found at $DefinitionPath"
}

$resolvedDefinitionPath = (Resolve-Path $DefinitionPath).Path

if (-not $GrafanaName) {
    $grafanaResources = az resource list --resource-group $ResourceGroupName --resource-type Microsoft.Dashboard/grafana --output json 2>$null | ConvertFrom-Json
    if (-not $grafanaResources -or $grafanaResources.Count -eq 0) {
        throw "No Managed Grafana resource was found in resource group $ResourceGroupName"
    }

    $GrafanaName = $grafanaResources[0].name
}

Write-Host "📊 Provisioning Grafana dashboard into $GrafanaName..." -ForegroundColor Yellow

if ($WhatIf) {
    Write-Host "  Would import $resolvedDefinitionPath" -ForegroundColor Gray
    return
}

$importOutput = az grafana dashboard import `
    --resource-group $ResourceGroupName `
    --name $GrafanaName `
    --definition "@$resolvedDefinitionPath" `
    --overwrite `
    --output json 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
    throw "Grafana dashboard import failed: $importOutput"
}

$importResult = $importOutput | ConvertFrom-Json
$dashboardUid = if ($importResult.uid) { $importResult.uid } else { '<unknown>' }
Write-Host "  ✅ Dashboard import completed (uid: $dashboardUid)" -ForegroundColor Green

$dashboards = az grafana dashboard list `
    --resource-group $ResourceGroupName `
    --name $GrafanaName `
    --output json 2>$null | ConvertFrom-Json

if ($dashboards -and ($dashboards | Where-Object { $_.title -eq 'Energy Grid Incident Dashboard' }).Count -gt 0) {
    Write-Host "  ✅ Dashboard verified in Grafana instance" -ForegroundColor Green
}
else {
    Write-Host "  ⚠️  Dashboard import returned no matching dashboard title; manual verification is still recommended." -ForegroundColor Yellow
}
