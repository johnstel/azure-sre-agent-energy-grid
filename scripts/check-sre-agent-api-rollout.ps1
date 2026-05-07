<#
.SYNOPSIS
    Checks whether Microsoft.App/agents is ready to move to a target ARM API version.

.DESCRIPTION
    Issue #51 gate script. It first checks live Microsoft.App provider metadata for
    the target agents API version. If the version is exposed, it builds a temporary
    candidate copy of the SRE Agent Bicep module using that API version, then runs
    deployment validation and what-if without modifying the checked-in Bicep files.

    Exit codes:
    - 0: all requested gates passed
    - 1: validation, what-if, or script execution failed
    - 2: provider metadata does not expose the target API version yet

.PARAMETER ResourceGroupName
    Resource group containing the existing demo deployment.

.PARAMETER TargetApiVersion
    Microsoft.App/agents API version to validate.

.PARAMETER AgentName
    Existing or intended SRE Agent resource name.

.PARAMETER Location
    Azure region used for validation.

.PARAMETER AccessLevel
    SRE Agent access level to validate with the module.

.PARAMETER MetadataOnly
    Only check provider metadata and skip deployment validate/what-if gates.

.EXAMPLE
    .\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2

.EXAMPLE
    .\scripts\check-sre-agent-api-rollout.ps1 -ResourceGroupName rg-srelab-eastus2 -MetadataOnly
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter()]
    [string]$TargetApiVersion = '2026-01-01',

    [Parameter()]
    [string]$AgentName = 'sre-srelab',

    [Parameter()]
    [string]$Location = 'eastus2',

    [Parameter()]
    [ValidateSet('High', 'Low')]
    [string]$AccessLevel = 'Low',

    [Parameter()]
    [switch]$MetadataOnly
)

$ErrorActionPreference = 'Stop'

function Write-Status {
    param(
        [string]$Message,
        [string]$Color = 'White'
    )

    Write-Host $Message -ForegroundColor $Color
}

function Invoke-AzJson {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,

        [Parameter()]
        [switch]$AllowNull
    )

    $output = & az @Arguments 2>&1
    $text = ($output | Out-String).Trim()

    if ($LASTEXITCODE -ne 0) {
        throw "az $($Arguments -join ' ') failed: $text"
    }

    if ([string]::IsNullOrWhiteSpace($text) -or $text -eq 'null') {
        if ($AllowNull) {
            return $null
        }
        throw "az $($Arguments -join ' ') returned no JSON output."
    }

    return $text | ConvertFrom-Json
}

function Get-ExistingSreAgentContext {
    param(
        [string]$GroupName,
        [string]$Name
    )

    try {
        $agent = Invoke-AzJson -Arguments @(
            'resource', 'show',
            '--resource-group', $GroupName,
            '--name', $Name,
            '--resource-type', 'Microsoft.App/agents',
            '--output', 'json'
        ) -AllowNull
    }
    catch {
        return [pscustomobject]@{
            Exists       = $false
            UniqueSuffix = 'rolloutcheck'
        }
    }

    $uniqueSuffix = 'rolloutcheck'
    $identityIds = @()
    if ($agent.identity -and $agent.identity.userAssignedIdentities) {
        $identityIds = @($agent.identity.userAssignedIdentities.PSObject.Properties.Name)
    }

    if ($identityIds.Count -gt 0) {
        $identityName = Split-Path -Leaf $identityIds[0]
        $prefix = "$Name-"
        if ($identityName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            $uniqueSuffix = $identityName.Substring($prefix.Length)
        }
    }

    return [pscustomobject]@{
        Exists       = $true
        UniqueSuffix = $uniqueSuffix
    }
}

function Get-AppInsightsConfig {
    param([string]$GroupName)

    $component = Invoke-AzJson -Arguments @(
        'resource', 'list',
        '--resource-group', $GroupName,
        '--resource-type', 'Microsoft.Insights/components',
        '--query', '[0]',
        '--output', 'json'
    ) -AllowNull

    if (-not $component) {
        return [pscustomobject]@{
            AppId            = ''
            ConnectionString = ''
        }
    }

    return [pscustomobject]@{
        AppId            = if ($component.properties.AppId) { $component.properties.AppId } else { '' }
        ConnectionString = if ($component.properties.ConnectionString) { $component.properties.ConnectionString } else { '' }
    }
}

try {
    Write-Status "Checking Azure account context..." 'Cyan'
    $account = Invoke-AzJson -Arguments @('account', 'show', '--output', 'json')
    Write-Status "Account: $($account.name)" 'Gray'

    Write-Status "Checking Microsoft.App/agents provider metadata for $TargetApiVersion..." 'Cyan'
    $provider = Invoke-AzJson -Arguments @('provider', 'show', '--namespace', 'Microsoft.App', '--output', 'json')
    $agentsResource = $provider.resourceTypes | Where-Object { $_.resourceType -eq 'agents' } | Select-Object -First 1
    $apiVersions = if ($agentsResource -and $agentsResource.apiVersions) { @($agentsResource.apiVersions) } else { @() }

    if ($apiVersions.Count -eq 0) {
        Write-Status "BLOCKED: Microsoft.App provider metadata does not list resource type 'agents'." 'Yellow'
        exit 2
    }

    Write-Status "Available agents API versions: $($apiVersions -join ', ')" 'Gray'

    if ($apiVersions -notcontains $TargetApiVersion) {
        Write-Status "BLOCKED: Microsoft.App/agents@$TargetApiVersion is not exposed in this subscription yet." 'Yellow'
        Write-Status "Do not deploy the legacy preview API. Wait for provider metadata to expose Microsoft.App/agents@$TargetApiVersion in this subscription." 'Yellow'
        exit 2
    }

    Write-Status "Provider metadata gate passed." 'Green'

    if ($MetadataOnly) {
        Write-Status "MetadataOnly requested; skipping deployment validation and what-if gates." 'Green'
        exit 0
    }

    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
    $moduleSource = Join-Path $repoRoot 'infra/bicep/modules/sre-agent.bicep'
    if (-not (Test-Path $moduleSource)) {
        throw "Could not find SRE Agent Bicep module at $moduleSource"
    }

    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sre-agent-api-rollout-$([System.Guid]::NewGuid())"
    New-Item -ItemType Directory -Path $tempRoot | Out-Null
    $candidateModule = Join-Path $tempRoot 'sre-agent.bicep'
    Copy-Item -Path $moduleSource -Destination $candidateModule

    $candidateContent = Get-Content -Raw -Path $candidateModule
    $candidateContent = $candidateContent -replace 'Microsoft\.App/agents@[^''\s]+', "Microsoft.App/agents@$TargetApiVersion"
    Set-Content -Path $candidateModule -Value $candidateContent -NoNewline

    $agentContext = Get-ExistingSreAgentContext -GroupName $ResourceGroupName -Name $AgentName
    $appInsightsConfig = Get-AppInsightsConfig -GroupName $ResourceGroupName
    $parametersPath = Join-Path $tempRoot 'sre-agent.parameters.json'
    $parameters = @{
        '$schema'       = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
        contentVersion = '1.0.0.0'
        parameters     = @{
            agentName                    = @{ value = $AgentName }
            location                     = @{ value = $Location }
            tags                         = @{ value = @{
                    workload  = 'energy-grid-demo'
                    purpose   = 'sre-agent-api-rollout-check'
                    issue     = '51'
                    managedBy = 'bicep'
                } }
            accessLevel                  = @{ value = $AccessLevel }
            appInsightsAppId             = @{ value = $appInsightsConfig.AppId }
            appInsightsConnectionString  = @{ value = $appInsightsConfig.ConnectionString }
            uniqueSuffix                 = @{ value = $agentContext.UniqueSuffix }
        }
    }
    $parameters | ConvertTo-Json -Depth 10 | Set-Content -Path $parametersPath

    Write-Status "Running group deployment validate against temporary $TargetApiVersion candidate..." 'Cyan'
    $null = Invoke-AzJson -Arguments @(
        'deployment', 'group', 'validate',
        '--resource-group', $ResourceGroupName,
        '--template-file', $candidateModule,
        '--parameters', "@$parametersPath",
        '--only-show-errors',
        '--output', 'json'
    )
    Write-Status "Deployment validate gate passed." 'Green'

    Write-Status "Running group deployment what-if against temporary $TargetApiVersion candidate..." 'Cyan'
    $whatIf = Invoke-AzJson -Arguments @(
        'deployment', 'group', 'what-if',
        '--resource-group', $ResourceGroupName,
        '--template-file', $candidateModule,
        '--parameters', "@$parametersPath",
        '--result-format', 'FullResourcePayloads',
        '--no-pretty-print',
        '--only-show-errors',
        '--output', 'json'
    )

    $unsafeAgentChanges = @($whatIf.changes | Where-Object {
            ($_.changeType -in @('Delete', 'Replace')) -and (
                $_.resourceId -like "*/providers/Microsoft.App/agents/$AgentName" -or
                ($_.before -and $_.before.type -eq 'Microsoft.App/agents') -or
                ($_.after -and $_.after.type -eq 'Microsoft.App/agents')
            )
        })

    if ($unsafeAgentChanges.Count -gt 0) {
        $unsafeSummary = $unsafeAgentChanges | Select-Object changeType, resourceId | ConvertTo-Json -Depth 5
        throw "What-if found unsafe SRE Agent replacement/delete changes: $unsafeSummary"
    }

    Write-Status "What-if gate passed: no SRE Agent replacement/delete changes detected." 'Green'
    Write-Status "All gates passed. It is now safe to prepare the checked-in Bicep API version update for review." 'Green'
    exit 0
}
catch {
    Write-Status "FAILED: $($_.Exception.Message)" 'Red'
    exit 1
}
finally {
    if ($tempRoot -and (Test-Path $tempRoot)) {
        Remove-Item -Recurse -Force -Path $tempRoot
    }
}
