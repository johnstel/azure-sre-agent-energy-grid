#!/usr/bin/env pwsh
#Requires -Version 7.0

<#
.SYNOPSIS
Query Azure Resource Graph for alert firing history.

.DESCRIPTION
Retrieves alert firing events from Azure Resource Graph AlertsManagementResources
provider. Used for Wave 2 evidence capture to prove alerts actually fire during
scenario deployments.

.PARAMETER Hours
Number of hours to look back (default: 24)

.PARAMETER OutputPath
Optional path to save JSON output (default: stdout)

.PARAMETER ResourceGroup
Optional resource group filter

.EXAMPLE
.\scripts\get-alert-firing-history.ps1 -Hours 2

.EXAMPLE
.\scripts\get-alert-firing-history.ps1 -Hours 2 -OutputPath docs/evidence/wave2-live/alert-firing-history.json

.EXAMPLE
.\scripts\get-alert-firing-history.ps1 -ResourceGroup rg-srelab-eastus2 -Hours 1
#>

param(
    [Parameter()]
    [int]$Hours = 24,

    [Parameter()]
    [string]$OutputPath = "",

    [Parameter()]
    [string]$ResourceGroup = ""
)

$ErrorActionPreference = "Stop"

# Build query with optional resource group filter
$query = @"
alertsmanagementresources
| where type == 'microsoft.alertsmanagement/alerts'
| where properties.essentials.startDateTime >= ago(${Hours}h)
"@

if ($ResourceGroup) {
    $query += "`n| where resourceGroup =~ '$ResourceGroup'"
}

$query += @"
| extend
    FiredTime = todatetime(properties.essentials.startDateTime),
    AlertName = tostring(properties.essentials.alertRule),
    Severity = tostring(properties.essentials.severity),
    State = tostring(properties.essentials.monitorCondition),
    Description = tostring(properties.essentials.description),
    TargetResource = tostring(properties.essentials.targetResourceName),
    TargetResourceType = tostring(properties.essentials.targetResourceType)
| project FiredTime, AlertName, Severity, State, Description, TargetResource, TargetResourceType, resourceGroup
| order by FiredTime desc
"@

Write-Host "Querying alert firing history..." -ForegroundColor Cyan
Write-Host "  Time window: Last $Hours hour$(if ($Hours -ne 1) { 's' })" -ForegroundColor Gray
if ($ResourceGroup) {
    Write-Host "  Resource group: $ResourceGroup" -ForegroundColor Gray
}

try {
    if ($OutputPath) {
        # Save to file
        az graph query -q $query --output json | Out-File -FilePath $OutputPath -Encoding utf8 -Force

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✓ Alert firing history saved to: $OutputPath" -ForegroundColor Green

            # Show summary
            $results = Get-Content $OutputPath | ConvertFrom-Json
            $count = if ($results.data) { $results.data.Count } else { 0 }
            Write-Host "  Found $count alert$(if ($count -ne 1) { 's' })" -ForegroundColor Gray

            if ($count -gt 0) {
                Write-Host ""
                Write-Host "Recent alerts:" -ForegroundColor Cyan
                $results.data | Select-Object -First 5 | ForEach-Object {
                    $firedTime = [datetime]$_.FiredTime
                    $timeAgo = (Get-Date) - $firedTime
                    $timeAgoStr = if ($timeAgo.TotalMinutes -lt 60) {
                        "{0:N0} min ago" -f $timeAgo.TotalMinutes
                    } else {
                        "{0:N1} hr ago" -f $timeAgo.TotalHours
                    }
                    Write-Host "  [$($_.Severity)] $($_.AlertName) — $timeAgoStr" -ForegroundColor Gray
                }
            }
        } else {
            Write-Error "Failed to query Azure Resource Graph (exit code: $LASTEXITCODE)"
        }
    } else {
        # Output to console as table
        az graph query -q $query --output table

        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to query Azure Resource Graph (exit code: $LASTEXITCODE)"
        }
    }
} catch {
    Write-Error "Error querying Azure Resource Graph: $_"
    exit 1
}
