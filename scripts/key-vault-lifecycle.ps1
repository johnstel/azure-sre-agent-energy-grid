function Get-KeyVaultPurgeProtectionValue {
    [CmdletBinding()]
    param(
        [Parameter()]
        $Value
    )

    if ($null -eq $Value) {
        return $false
    }

    if ($Value -is [bool]) {
        return [bool]$Value
    }

    if ($Value -is [string]) {
        return ($Value.Trim() -match '^(?i)(true|1|yes|enabled)$')
    }

    try {
        return [bool]$Value
    }
    catch {
        return $false
    }
}

function Get-KeyVaultDeletedVaultState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$Location
    )

    $deletedRaw = & az keyvault show-deleted --name $VaultName --location $Location --output json 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0 -or [string]::IsNullOrWhiteSpace($deletedRaw)) {
        return [pscustomobject]@{
            Found                       = $false
            Name                       = $VaultName
            Location                   = $Location
            PurgeProtectionEnabled     = $false
            RedeployImmediatelyAvailable = $true
            Message                    = "Deleted Key Vault '$VaultName' is not present in Azure's deleted-vault cache; same-name redeploy is available."
            Raw                        = $deletedRaw
        }
    }

    try {
        $deleted = $deletedRaw | ConvertFrom-Json
    }
    catch {
        return [pscustomobject]@{
            Found                       = $false
            Name                       = $VaultName
            Location                   = $Location
            PurgeProtectionEnabled     = $false
            RedeployImmediatelyAvailable = $true
            Message                    = "Azure returned an unexpected deleted-vault payload for '$VaultName'; same-name redeploy should be available after the record clears."
            Raw                        = $deletedRaw
        }
    }

    if (-not $deleted) {
        return [pscustomobject]@{
            Found                       = $false
            Name                       = $VaultName
            Location                   = $Location
            PurgeProtectionEnabled     = $false
            RedeployImmediatelyAvailable = $true
            Message                    = "Deleted Key Vault '$VaultName' is not present; same-name redeploy is available."
            Raw                        = $deletedRaw
        }
    }

    $properties = $deleted.properties
    $purgeEnabled = $false
    $candidateValues = @(
        $deleted.enablePurgeProtection,
        $deleted.purgeProtectionEnabled,
        $properties.enablePurgeProtection,
        $properties.purgeProtectionEnabled
    )

    foreach ($candidate in $candidateValues) {
        if ($null -ne $candidate) {
            $purgeEnabled = Get-KeyVaultPurgeProtectionValue -Value $candidate
            break
        }
    }

    $message = if ($purgeEnabled) {
        "Deleted Key Vault '$VaultName' is protected by purge retention. Same-name redeploy is unavailable until the retention window ends."
    }
    else {
        "Deleted Key Vault '$VaultName' is disposable. Same-name redeploy becomes available once the purge completes."
    }

    return [pscustomobject]@{
        Found                       = $true
        Name                       = $VaultName
        Location                   = $Location
        PurgeProtectionEnabled     = $purgeEnabled
        RedeployImmediatelyAvailable = (-not $purgeEnabled)
        Message                    = $message
        Raw                        = $deleted
    }
}

function Resolve-KeyVaultPurgeForReuse {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$Location,

        [Parameter()]
        [int]$WaitSeconds = 120,

        [Parameter()]
        [int]$PollingIntervalSeconds = 5
    )

    $deletedState = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
    if (-not $deletedState.Found) {
        return [pscustomobject]@{
            Resolved                    = $true
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $true
            Message                     = "No deleted Key Vault record remains for '$VaultName'; same-name redeploy is available."
        }
    }

    if ($deletedState.PurgeProtectionEnabled) {
        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $true
            RedeployImmediatelyAvailable = $false
            Message                     = "Deleted Key Vault '$VaultName' is purge-protected; no purge attempt was made and same-name redeploy is unavailable until retention expires."
        }
    }

    $purgeOutput = & az keyvault purge --name $VaultName --location $Location 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $afterState = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
        if (-not $afterState.Found) {
            return [pscustomobject]@{
                Resolved                    = $true
                PurgeProtectionEnabled      = $false
                RedeployImmediatelyAvailable = $true
                Message                     = "The purge request for '$VaultName' completed and the deleted record is already gone; same-name redeploy is available."
            }
        }

        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $false
            Message                     = "Azure rejected the purge request for '$VaultName'; same-name redeploy remains unavailable. Output: $($purgeOutput.Trim())"
            Raw                        = $purgeOutput
        }
    }

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    do {
        Start-Sleep -Seconds $PollingIntervalSeconds
        $afterState = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
        if (-not $afterState.Found) {
            return [pscustomobject]@{
                Resolved                    = $true
                PurgeProtectionEnabled      = $false
                RedeployImmediatelyAvailable = $true
                Message                     = "Purged '$VaultName' successfully; same-name redeploy is available."
            }
        }
    } while ((Get-Date) -lt $deadline)

    return [pscustomobject]@{
        Resolved                    = $false
        PurgeProtectionEnabled      = $false
        RedeployImmediatelyAvailable = $false
        Message                     = "The purge request for '$VaultName' completed, but Azure has not released the name within $WaitSeconds seconds; same-name redeploy is still unavailable."
    }
}
