<#
.SYNOPSIS
    Provisions the repo-managed Azure Managed Grafana incident dashboard.

.DESCRIPTION
    Imports the dashboard definition from infra/grafana/energy-grid-incident-dashboard.json
    into the Managed Grafana workspace provisioned by the deployment. The import uses
    --overwrite for idempotency and exits with a non-zero code if the dashboard cannot
    be imported or verified.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter()]
    [string]$GrafanaName = '',

    [Parameter()]
    [string]$DefinitionPath = (Join-Path $PSScriptRoot '..' 'infra/grafana/energy-grid-incident-dashboard.json')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $DefinitionPath)) {
    throw "Dashboard definition not found at '$DefinitionPath'."
}

$resolvedDefinitionPath = (Resolve-Path $DefinitionPath).Path
$dashboardDefinition = Get-Content -Path $resolvedDefinitionPath -Raw | ConvertFrom-Json
if (-not $dashboardDefinition.title -or $dashboardDefinition.title -ne 'Energy Grid — Incident Overview') {
    throw "Dashboard definition must target the 'Energy Grid — Incident Overview' dashboard."
}

$requiredVariables = @('environment', 'namespace', 'service', 'scenario')
foreach ($requiredVariable in $requiredVariables) {
    $foundVariable = @($dashboardDefinition.templating.list | Where-Object { $_.name -eq $requiredVariable })
    if ($foundVariable.Count -eq 0) {
        throw "Dashboard definition is missing the '$requiredVariable' variable."
    }
}

if ([string]::IsNullOrWhiteSpace($GrafanaName)) {
    $GrafanaName = az grafana list --resource-group $ResourceGroupName --query "[0].name" --output tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($GrafanaName)) {
        throw "Unable to determine the Managed Grafana workspace name for resource group '$ResourceGroupName'."
    }
}

$grafana = az grafana show --resource-group $ResourceGroupName --name $GrafanaName --output json 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($grafana)) {
    throw "Managed Grafana workspace '$GrafanaName' could not be found in resource group '$ResourceGroupName'."
}

$subscriptionId = az account show --query id --output tsv 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($subscriptionId)) {
    throw 'Unable to resolve the current Azure subscription ID for Grafana datasource binding.'
}

$workspaceResourceId = az monitor log-analytics workspace list --resource-group $ResourceGroupName --query "[0].id" --output tsv 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($workspaceResourceId)) {
    throw "Unable to resolve a Log Analytics workspace resource ID for resource group '$ResourceGroupName'."
}

$datasourceName = 'Azure Monitor (Energy Grid)'
$datasourceDefinition = @{
    name = $datasourceName
    type = 'grafana-azure-monitor-datasource'
    access = 'proxy'
    jsonData = @{
        azureAuthType = 'msi'
        subscriptionId = $subscriptionId
        cloudName = 'azuremonitor'
    }
} | ConvertTo-Json -Depth 10

$datasourceListJson = az grafana data-source list --resource-group $ResourceGroupName --name $GrafanaName --output json 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($datasourceListJson)) {
    throw "Unable to query Managed Grafana data sources for workspace '$GrafanaName'."
}

$datasourceList = @($datasourceListJson | ConvertFrom-Json)
$existingDatasource = $datasourceList | Where-Object { $_.name -eq $datasourceName } | Select-Object -First 1
if ($existingDatasource) {
    $datasourceOutput = az grafana data-source update --resource-group $ResourceGroupName --name $GrafanaName --data-source $existingDatasource.uid --definition $datasourceDefinition --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = if ($datasourceOutput) { ($datasourceOutput | Out-String).Trim() } else { 'No datasource update output was returned.' }
        throw "Grafana Azure Monitor datasource update failed: $message"
    }
}
else {
    $datasourceOutput = az grafana data-source create --resource-group $ResourceGroupName --name $GrafanaName --definition $datasourceDefinition --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = if ($datasourceOutput) { ($datasourceOutput | Out-String).Trim() } else { 'No datasource create output was returned.' }
        throw "Grafana Azure Monitor datasource create failed: $message"
    }
}

$datasourceListJson = az grafana data-source list --resource-group $ResourceGroupName --name $GrafanaName --output json 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($datasourceListJson)) {
    throw "Unable to re-query Managed Grafana data sources for workspace '$GrafanaName'."
}

$datasourceList = @($datasourceListJson | ConvertFrom-Json)
$datasource = $datasourceList | Where-Object { $_.name -eq $datasourceName } | Select-Object -First 1
if (-not $datasource -or [string]::IsNullOrWhiteSpace($datasource.uid)) {
    throw "Grafana Azure Monitor datasource '$datasourceName' could not be resolved after provisioning."
}

$dashboardJson = Get-Content -Path $resolvedDefinitionPath -Raw
$dashboardJson = $dashboardJson.Replace('__AZURE_MONITOR_DATASOURCE_UID__', $datasource.uid)
$dashboardJson = $dashboardJson.Replace('__RESOURCE_GROUP__', $ResourceGroupName)
$dashboardJson = $dashboardJson.Replace('__SUBSCRIPTION_ID__', $subscriptionId)
$dashboardJson = $dashboardJson.Replace('__WORKSPACE_RESOURCE_ID__', $workspaceResourceId)

$tempDashboardPath = Join-Path ([System.IO.Path]::GetTempPath()) ("energy-grid-incident-dashboard-{0}.json" -f [System.Guid]::NewGuid())
try {
    Set-Content -Path $tempDashboardPath -Value $dashboardJson -Encoding utf8
    Write-Host "📊 Provisioning Grafana dashboard '$($dashboardDefinition.title)' into '$GrafanaName'..." -ForegroundColor Yellow
    $importOutput = az grafana dashboard import --resource-group $ResourceGroupName --name $GrafanaName --definition "@$tempDashboardPath" --overwrite --output json 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = if ($importOutput) { ($importOutput | Out-String).Trim() } else { 'No import output was returned.' }
        throw "Grafana dashboard import failed: $message"
    }
}
finally {
    if (Test-Path $tempDashboardPath) {
        Remove-Item -Path $tempDashboardPath -Force
    }
}

$dashboardList = az grafana dashboard list --resource-group $ResourceGroupName --name $GrafanaName --output json 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dashboardList)) {
    throw 'Grafana dashboard list request failed after import.'
}

$dashboard = @($dashboardList | ConvertFrom-Json | Where-Object { $_.title -eq $dashboardDefinition.title }) | Select-Object -First 1
if (-not $dashboard) {
    throw "Grafana dashboard '$($dashboardDefinition.title)' was not found after import."
}

Write-Host "  ✅ Imported Grafana dashboard '$($dashboardDefinition.title)' (UID: $($dashboard.uid))" -ForegroundColor Green
