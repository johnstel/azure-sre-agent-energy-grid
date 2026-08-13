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
$rawDefinitionContent = Get-Content -Path $resolvedDefinitionPath -Raw
try {
    $dashboardDefinition = $rawDefinitionContent | ConvertFrom-Json
}
catch {
    throw "Dashboard definition is not valid JSON: $_"
}

if (-not $dashboardDefinition.title -or $dashboardDefinition.title -ne 'Energy Grid — Incident Overview') {
    throw "Dashboard definition must target the 'Energy Grid — Incident Overview' dashboard."
}

if ($rawDefinitionContent -match 'vector\(0\)') {
    throw 'Dashboard definition must not use vector(0) or other phantom metric placeholders.'
}

if ($rawDefinitionContent -match 'app_requests_total|app_errors_total|app_dependency_failures_total') {
    throw 'Dashboard definition must not reference phantom Prometheus metrics for requests/errors/dependencies.'
}

$requiredVariables = @('environment', 'namespace', 'service', 'scenario')
foreach ($requiredVariable in $requiredVariables) {
    $matchingVariables = @($dashboardDefinition.templating.list | Where-Object { $_.name -eq $requiredVariable })
    if ($matchingVariables.Count -eq 0) {
        throw "Dashboard definition is missing the '$requiredVariable' variable."
    }
}

$environmentVariable = @($dashboardDefinition.templating.list | Where-Object { $_.name -eq 'environment' }) | Select-Object -First 1
if ($environmentVariable -and $environmentVariable.hide -ne 2) {
    throw 'The environment variable must remain non-interactive context (hide = 2).' 
}

$scenarioVariable = @($dashboardDefinition.templating.list | Where-Object { $_.name -eq 'scenario' }) | Select-Object -First 1
if ($scenarioVariable -and $scenarioVariable.current.value -eq $null) {
    throw 'The scenario variable must have a current selection.'
}
if ($scenarioVariable -and (($scenarioVariable.options | ForEach-Object { $_.value }) -contains 'baseline')) {
    throw 'The scenario variable must not expose the baseline option unless the telemetry contract emits it.'
}

$serviceVariable = @($dashboardDefinition.templating.list | Where-Object { $_.name -eq 'service' }) | Select-Object -First 1
if ($serviceVariable -and $serviceVariable.multi -eq $true) {
    throw 'The service variable must remain single-select so the prefix filter semantics are unambiguous.'
}

$builtInAnnotations = @($dashboardDefinition.annotations.list | Where-Object { $_.builtIn -eq 1 })
if ($builtInAnnotations.Count -eq 0) {
    throw 'Dashboard definition must include a built-in annotation entry.'
}
$primaryAnnotationName = ($builtInAnnotations | Select-Object -First 1).name
if ($primaryAnnotationName -eq 'Injection') {
    throw 'The dashboard built-in annotation label must not use the ambiguous "Injection" name.'
}
if ($primaryAnnotationName -ne 'Annotations & Alerts') {
    throw 'The dashboard built-in annotation label must be "Annotations & Alerts" unless it truly represents fault-injection events.'
}

$panels = @($dashboardDefinition.panels)
if ($panels.Count -lt 6) {
    throw 'Dashboard definition must include at least 6 panels.'
}

$requiredPanelTitles = @(
    'Incident handoff and safe links',
    'Namespace health (Running / Pending / Failed)',
    'Requests and errors',
    'Dependency failures',
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
    throw 'Namespace health panel must use the prefix-based pod filter for the selected service.'
}

$requestPanel = @($panels | Where-Object { $_.title -eq 'Requests and errors' }) | Select-Object -First 1
if (-not $requestPanel) {
    throw 'Requests and errors panel is missing.'
}
if ($requestPanel.datasource.type -ne 'grafana-azure-monitor-datasource') {
    throw 'Requests and errors panel must use the Azure Monitor datasource.'
}
if (-not $requestPanel.targets[0].azureMonitor -or $requestPanel.targets[0].azureMonitor.queryType -ne 'Logs') {
    throw 'Requests and errors panel must include Azure Monitor Logs query configuration.'
}
if ($requestPanel.targets[0].azureMonitor.query -notmatch 'AppRequests' -or $requestPanel.targets[0].azureMonitor.query -notmatch 'sre\.scenario' -or $requestPanel.targets[0].azureMonitor.query -notmatch 'sre\.namespace' -or $requestPanel.targets[0].azureMonitor.query -notmatch 'sre\.service') {
    throw 'Requests and errors panel must query AppRequests and filter on the sre.namespace, sre.service, and sre.scenario dimensions.'
}
if ($requestPanel.targets[0].azureMonitor.query -notmatch 'startswith ''\$service''') {
    throw 'Requests and errors panel must use service-prefix matching for the selected service.'
}
if ($requestPanel.datasource.uid -ne '__AZURE_MONITOR_DATASOURCE_UID__') {
    throw 'Requests and errors panel must reference the Azure Monitor datasource placeholder.'
}
if ($requestPanel.targets[0].azureMonitor.workspaceResourceId -ne '__WORKSPACE_RESOURCE_ID__' -or $requestPanel.targets[0].azureMonitor.resourceGroup -ne '__RESOURCE_GROUP__' -or $requestPanel.targets[0].azureMonitor.subscriptionId -ne '__SUBSCRIPTION_ID__') {
    throw 'Requests and errors panel must bind workspace, resource-group, and subscription identifiers through provisioning placeholders.'
}

$dependencyPanel = @($panels | Where-Object { $_.title -eq 'Dependency failures' }) | Select-Object -First 1
if (-not $dependencyPanel) {
    throw 'Dependency failures panel is missing.'
}
if ($dependencyPanel.datasource.type -ne 'grafana-azure-monitor-datasource') {
    throw 'Dependency failures panel must use the Azure Monitor datasource.'
}
if (-not $dependencyPanel.targets[0].azureMonitor -or $dependencyPanel.targets[0].azureMonitor.queryType -ne 'Logs') {
    throw 'Dependency failures panel must include Azure Monitor Logs query configuration.'
}
if ($dependencyPanel.targets[0].azureMonitor.query -notmatch 'AppDependencies' -or $dependencyPanel.targets[0].azureMonitor.query -notmatch 'sre\.scenario' -or $dependencyPanel.targets[0].azureMonitor.query -notmatch 'sre\.namespace' -or $dependencyPanel.targets[0].azureMonitor.query -notmatch 'sre\.service') {
    throw 'Dependency failures panel must query AppDependencies and filter on the sre.namespace, sre.service, and sre.scenario dimensions.'
}
if ($dependencyPanel.targets[0].azureMonitor.query -notmatch 'startswith ''\$service''') {
    throw 'Dependency failures panel must use service-prefix matching for the selected service.'
}
if ($dependencyPanel.datasource.uid -ne '__AZURE_MONITOR_DATASOURCE_UID__') {
    throw 'Dependency failures panel must reference the Azure Monitor datasource placeholder.'
}
if ($dependencyPanel.targets[0].azureMonitor.workspaceResourceId -ne '__WORKSPACE_RESOURCE_ID__' -or $dependencyPanel.targets[0].azureMonitor.resourceGroup -ne '__RESOURCE_GROUP__' -or $dependencyPanel.targets[0].azureMonitor.subscriptionId -ne '__SUBSCRIPTION_ID__') {
    throw 'Dependency failures panel must bind workspace, resource-group, and subscription identifiers through provisioning placeholders.'
}

$timelinePanel = @($panels | Where-Object { $_.title -eq 'Scenario timeline and annotations' }) | Select-Object -First 1
if (-not $timelinePanel) {
    throw 'Scenario timeline panel is missing.'
}
if ($timelinePanel.datasource.type -ne 'grafana-azure-monitor-datasource') {
    throw 'Scenario timeline panel must use the Azure Monitor datasource.'
}
if ($timelinePanel.targets[0].azureMonitor.query -notmatch 'AppRequests' -or $timelinePanel.targets[0].azureMonitor.query -notmatch 'sre\.scenario' -or $timelinePanel.targets[0].azureMonitor.query -notmatch 'sre\.namespace' -or $timelinePanel.targets[0].azureMonitor.query -notmatch 'sre\.service') {
    throw 'Scenario timeline panel must query AppRequests and filter on the sre.namespace, sre.service, and sre.scenario dimensions.'
}
if ($timelinePanel.targets[0].azureMonitor.query -notmatch 'startswith ''\$service''') {
    throw 'Scenario timeline panel must use service-prefix matching for the selected service.'
}

Write-Host "✅ Dashboard definition validated: $resolvedDefinitionPath" -ForegroundColor Green
