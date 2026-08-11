<#
.SYNOPSIS
    Validates the alert query shapes used by the Bicep alert module.

.DESCRIPTION
    Performs lightweight static checks on infra/bicep/modules/alerts.bicep so
    regressions in the HTTP 5xx and dependency alert KQL are caught before deployment.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$alertsPath = Join-Path $PSScriptRoot '..' 'infra/bicep/modules/alerts.bicep'
if (-not (Test-Path $alertsPath)) {
    throw "Alerts file not found: $alertsPath"
}

$content = Get-Content -Path $alertsPath -Raw
$checks = @(
    @{
        Name = 'HTTP 5xx alert uses a total-count aggregation over raw 5xx rows'
        Condition = $content -match "AppRequests .*summarize Errors = count\(\)" -and
            $content -match "timeAggregation: 'Total'" -and
            $content -match "metricMeasureColumn: 'Errors'" -and
            $content -match "operator: 'GreaterThanOrEqual'"
    },
    @{
        Name = 'Dependency alert uses DependencyType and total-count aggregation'
        Condition = $content -match "DependencyType" -and
            $content -match 'dependencyType in~ \("RabbitMQ", "MongoDB"\)' -and
            $content -match "summarize Failures = count\(\)" -and
            $content -match "timeAggregation: 'Total'" -and
            $content -match "metricMeasureColumn: 'Failures'"
    }
)

$failed = @()
foreach ($check in $checks) {
    if (-not $check.Condition) {
        $failed += $check.Name
    }
}

if ($failed.Count -gt 0) {
    Write-Host 'Alert query validation failed:' -ForegroundColor Red
    foreach ($item in $failed) {
        Write-Host " - $item" -ForegroundColor Red
    }
    exit 1
}

Write-Host 'Alert query validation passed.' -ForegroundColor Green
