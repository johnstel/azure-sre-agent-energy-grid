[CmdletBinding()]
param(
    [Parameter()]
    [switch]$PublicIngress,

    [Parameter()]
    [switch]$AuthEnabled,

    [Parameter()]
    [string[]]$AllowedPrincipals = @(),

    [Parameter()]
    [string[]]$AllowedGroups = @(),

    [Parameter()]
    [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$strictPrincipals = @($AllowedPrincipals | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })
$strictGroups = @($AllowedGroups | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { $_.Trim() })

if (-not $PublicIngress) {
    Write-Host 'Mission Control is local-only; auth is not required for loopback development.'
    return
}

if (-not $AuthEnabled) {
    throw 'Mission Control public ingress requires EasyAuth to be enabled before deployment.'
}

if ($strictPrincipals.Count -eq 0 -and $strictGroups.Count -eq 0) {
    throw 'Mission Control public ingress requires at least one allowed principal or group.'
}

$config = [ordered]@{
    MISSION_CONTROL_PUBLIC_INGRESS = 'true'
    MISSION_CONTROL_AUTH_ENABLED = 'true'
    MISSION_CONTROL_ALLOWED_PRINCIPALS = ($strictPrincipals -join ',')
    MISSION_CONTROL_ALLOWED_GROUPS = ($strictGroups -join ',')
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    $directory = Split-Path -Parent $OutputPath
    if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path -Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $config.GetEnumerator() | ForEach-Object {
        "{0}={1}" -f $_.Key, $_.Value
    } | Set-Content -Path $OutputPath
}

Write-Host 'Mission Control auth configuration is valid.'
Write-Host ('Allowed principals: {0}' -f ($strictPrincipals -join ', '))
Write-Host ('Allowed groups: {0}' -f ($strictGroups -join ', '))
