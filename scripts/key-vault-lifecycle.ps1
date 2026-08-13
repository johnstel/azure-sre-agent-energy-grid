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

function Test-KeyVaultNotFoundResponse {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowEmptyString()]
        [string]$ResponseText
    )

    if ([string]::IsNullOrWhiteSpace($ResponseText)) {
        return $false
    }

    $normalized = $ResponseText.Trim()
    return $normalized -match '(?i)(DeletedVaultNotFound|No deleted vault|vault.*not found|not found.*vault|resource.*not found|does not exist)'
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
    $rawText = if ($null -eq $deletedRaw) { '' } else { [string]$deletedRaw }

    if ($exitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($rawText)) {
        try {
            $deleted = $rawText | ConvertFrom-Json
        }
        catch {
            return [pscustomobject]@{
                Status                     = 'Unknown'
                Found                      = $false
                Name                       = $VaultName
                Location                   = $Location
                PurgeProtectionEnabled     = $false
                RedeployImmediatelyAvailable = $false
                Message                    = "Azure CLI returned an unexpected deleted-vault payload for '$VaultName' in '$Location'; same-name redeploy remains unavailable until the state is confirmed."
                Raw                        = $rawText
            }
        }

        if (-not $deleted) {
            return [pscustomobject]@{
                Status                     = 'NotFound'
                Found                      = $false
                Name                       = $VaultName
                Location                   = $Location
                PurgeProtectionEnabled     = $false
                RedeployImmediatelyAvailable = $true
                Message                    = "Deleted Key Vault '$VaultName' is already absent from Azure's deleted-vault cache; same-name redeploy is available."
                Raw                        = $rawText
            }
        }

        $properties = if ($null -ne $deleted.properties) { $deleted.properties } else { $null }
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
            "Deleted Key Vault '$VaultName' is retained by purge protection. Same-name redeploy is unavailable until the retention window expires."
        }
        else {
            "Deleted Key Vault '$VaultName' is disposable. Same-name redeploy becomes available once the purge completes."
        }

        return [pscustomobject]@{
            Status                     = 'Found'
            Found                      = $true
            Name                       = $VaultName
            Location                   = $Location
            PurgeProtectionEnabled     = $purgeEnabled
            RedeployImmediatelyAvailable = (-not $purgeEnabled)
            Message                    = $message
            Raw                        = $deleted
        }
    }

    if (Test-KeyVaultNotFoundResponse -ResponseText $rawText) {
        return [pscustomobject]@{
            Status                     = 'NotFound'
            Found                      = $false
            Name                       = $VaultName
            Location                   = $Location
            PurgeProtectionEnabled     = $false
            RedeployImmediatelyAvailable = $true
            Message                    = "Deleted Key Vault '$VaultName' is not present in Azure's deleted-vault cache; same-name redeploy is available."
            Raw                        = $rawText
        }
    }

    return [pscustomobject]@{
        Status                     = 'Unknown'
        Found                      = $false
        Name                       = $VaultName
        Location                   = $Location
        PurgeProtectionEnabled     = $false
        RedeployImmediatelyAvailable = $false
        Message                    = "Azure CLI could not verify the deleted-vault state for '$VaultName' in '$Location' (exit $exitCode). Same-name redeploy remains unavailable until the state is confirmed. Output: $($rawText.Trim())"
        Raw                        = $rawText
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
    if ($deletedState.Status -eq 'NotFound') {
        return [pscustomobject]@{
            Resolved                    = $true
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $true
            Message                     = "No deleted Key Vault record remains for '$VaultName'; same-name redeploy is available."
        }
    }

    if ($deletedState.Status -eq 'Unknown') {
        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $false
            Message                     = $deletedState.Message
            Raw                        = $deletedState.Raw
        }
    }

    if ($deletedState.PurgeProtectionEnabled) {
        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $true
            RedeployImmediatelyAvailable = $false
            Message                     = "Deleted Key Vault '$VaultName' is purge-protected; no purge attempt was made and same-name redeploy is unavailable until retention expires."
            Raw                        = $deletedState.Raw
        }
    }

    $purgeOutput = & az keyvault purge --name $VaultName --location $Location 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $afterState = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
        if ($afterState.Status -eq 'NotFound') {
            return [pscustomobject]@{
                Resolved                    = $true
                PurgeProtectionEnabled      = $false
                RedeployImmediatelyAvailable = $true
                Message                     = "The purge request for '$VaultName' completed and the deleted record is no longer present; same-name redeploy is available."
                Raw                        = $purgeOutput
            }
        }

        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $false
            Message                     = "Azure rejected the purge request for '$VaultName'; same-name redeploy remains unavailable until the state is confirmed. Output: $($purgeOutput.Trim())"
            Raw                        = $purgeOutput
        }
    }

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    do {
        Start-Sleep -Seconds $PollingIntervalSeconds
        $afterState = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
        if ($afterState.Status -eq 'NotFound') {
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
