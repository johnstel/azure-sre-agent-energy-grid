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

function ConvertFrom-KeyVaultDateValue {
    [CmdletBinding()]
    param(
        [Parameter()]
        $Value
    )

    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [datetime]) {
        return [datetime]$Value
    }

    if ($Value -is [datetimeoffset]) {
        return [datetime]$Value
    }

    if ($Value -is [string]) {
        $trimmed = $Value.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            return $null
        }

        foreach ($format in @(
                'yyyy-MM-ddTHH:mm:ss.fffffffK',
                'yyyy-MM-ddTHH:mm:ss.fffK',
                'yyyy-MM-ddTHH:mm:ssK',
                'yyyy-MM-ddTHH:mm:ssZ',
                'yyyy-MM-ddTHH:mm:ss.fffffffzzz',
                'yyyy-MM-ddTHH:mm:ss.fffzzz',
                'yyyy-MM-ddTHH:mm:sszzz',
                'yyyy-MM-ddTHH:mm:ss',
                'yyyy-MM-dd'
            )) {
            try {
                return [datetime]::ParseExact($trimmed, $format, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
            }
            catch {
            }
        }

        try {
            return [datetime]::Parse($trimmed, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
        }
        catch {
            return $null
        }
    }

    return $null
}

function Get-KeyVaultRetainedUntilValue {
    [CmdletBinding()]
    param(
        [Parameter()]
        $Record
    )

    if ($null -eq $Record) {
        return $null
    }

    $candidates = @(
        $Record.scheduledPurgeDate,
        $Record.properties.scheduledPurgeDate,
        $Record.scheduledPurgeDateUtc,
        $Record.properties.scheduledPurgeDateUtc,
        $Record.purgeDate,
        $Record.properties.purgeDate
    )

    foreach ($candidate in $candidates) {
        $parsedDate = ConvertFrom-KeyVaultDateValue -Value $candidate
        if ($null -ne $parsedDate) {
            return $parsedDate
        }
    }

    return $null
}

function Test-KeyVaultDeletedVaultNotFoundResponse {
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
    if ($normalized -match '(?i)(^|\s)DeletedVaultNotFound($|\s)') {
        return $true
    }

    if ($normalized.StartsWith('{') -or $normalized.StartsWith('[')) {
        try {
            $parsed = $normalized | ConvertFrom-Json
        }
        catch {
            return $false
        }

        foreach ($candidate in @($parsed.error, $parsed)) {
            $code = $null
            if ($null -ne $candidate) {
                if ($candidate.PSObject.Properties.Name -contains 'code') {
                    $code = [string]$candidate.code
                }
                elseif ($candidate.PSObject.Properties.Name -contains 'errorCode') {
                    $code = [string]$candidate.errorCode
                }
            }

            if (-not [string]::IsNullOrWhiteSpace($code) -and $code -match '(?i)^DeletedVaultNotFound$') {
                return $true
            }
        }
    }

    return $false
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
                Status                       = 'Unknown'
                Found                        = $false
                Name                         = $VaultName
                Location                     = $Location
                PurgeProtectionEnabled       = $false
                RedeployImmediatelyAvailable = $false
                RetainedUntil                = $null
                Message                      = "Azure CLI returned an unexpected deleted-vault payload for '$VaultName' in '$Location'; same-name redeploy remains unavailable until the state is confirmed."
                Raw                          = $rawText
            }
        }

        if ($null -eq $deleted) {
            return [pscustomobject]@{
                Status                       = 'Unknown'
                Found                        = $false
                Name                         = $VaultName
                Location                     = $Location
                PurgeProtectionEnabled       = $false
                RedeployImmediatelyAvailable = $false
                RetainedUntil                = $null
                Message                      = "Azure CLI returned an empty deleted-vault response for '$VaultName' in '$Location'; same-name redeploy remains unavailable until the state is confirmed."
                Raw                          = $rawText
            }
        }

        $properties = if ($null -ne $deleted.properties) { $deleted.properties } else { [pscustomobject]@{} }
        $candidateNames = @(
            $deleted.name,
            $deleted.vaultName,
            $properties.name,
            $properties.vaultName
        )
        $actualName = $null
        foreach ($candidate in $candidateNames) {
            if (-not [string]::IsNullOrWhiteSpace($candidate)) {
                $actualName = [string]$candidate
                break
            }
        }

        if ([string]::IsNullOrWhiteSpace($actualName)) {
            return [pscustomobject]@{
                Status                       = 'Unknown'
                Found                        = $false
                Name                         = $VaultName
                Location                     = $Location
                PurgeProtectionEnabled       = $false
                RedeployImmediatelyAvailable = $false
                RetainedUntil                = $null
                Message                      = "Azure CLI reported a deleted-vault payload for '$VaultName' in '$Location' without a verifiable vault identity; same-name redeploy remains unavailable until the state is confirmed."
                Raw                          = $rawText
            }
        }

        if ($actualName -ne $VaultName) {
            return [pscustomobject]@{
                Status                       = 'Unknown'
                Found                        = $false
                Name                         = $VaultName
                Location                     = $Location
                PurgeProtectionEnabled       = $false
                RedeployImmediatelyAvailable = $false
                RetainedUntil                = $null
                Message                      = "Azure CLI returned a deleted-vault record for '$actualName' instead of '$VaultName' in '$Location'; same-name redeploy remains unavailable until the target state is confirmed."
                Raw                          = $rawText
            }
        }

        $purgeEnabled = $false
        $candidateValues = @(
            $deleted.enablePurgeProtection,
            $deleted.purgeProtectionEnabled,
            $properties.enablePurgeProtection,
            $properties.purgeProtectionEnabled,
            $properties.enablePurgeProtection
        )

        foreach ($candidate in $candidateValues) {
            if ($null -ne $candidate) {
                $purgeEnabled = Get-KeyVaultPurgeProtectionValue -Value $candidate
                break
            }
        }

        $retainedUntil = Get-KeyVaultRetainedUntilValue -Record $deleted
        $message = if ($purgeEnabled) {
            if ($null -ne $retainedUntil) {
                "Deleted Key Vault '$VaultName' is retained by purge protection until $($retainedUntil.ToString('yyyy-MM-ddTHH:mm:ssK')). Same-name redeploy remains unavailable until the retention window expires."
            }
            else {
                "Deleted Key Vault '$VaultName' is retained by purge protection. Azure did not report a scheduled purge date, so same-name redeploy remains unavailable until the retention window is authoritatively confirmed."
            }
        }
        else {
            "Deleted Key Vault '$VaultName' is present in the deleted-vault cache and is not purge-protected. Same-name redeploy becomes available only after the purge is completed and the deleted record is gone."
        }

        return [pscustomobject]@{
            Status                       = 'Found'
            Found                        = $true
            Name                         = $VaultName
            Location                     = $Location
            PurgeProtectionEnabled       = $purgeEnabled
            RedeployImmediatelyAvailable = (-not $purgeEnabled)
            RetainedUntil                = $retainedUntil
            Message                      = $message
            Raw                          = $deleted
        }
    }

    if (Test-KeyVaultDeletedVaultNotFoundResponse -ResponseText $rawText) {
        return [pscustomobject]@{
            Status                       = 'NotFound'
            Found                        = $false
            Name                         = $VaultName
            Location                     = $Location
            PurgeProtectionEnabled       = $false
            RedeployImmediatelyAvailable = $true
            RetainedUntil                = $null
            Message                      = "Deleted Key Vault '$VaultName' is not present in Azure's deleted-vault cache; same-name redeploy is available after the deleted-vault state is verified."
            Raw                          = $rawText
        }
    }

    return [pscustomobject]@{
        Status                       = 'Unknown'
        Found                        = $false
        Name                         = $VaultName
        Location                     = $Location
        PurgeProtectionEnabled       = $false
        RedeployImmediatelyAvailable = $false
        RetainedUntil                = $null
        Message                      = "Azure CLI could not verify the deleted-vault state for '$VaultName' in '$Location' (exit $exitCode). Same-name redeploy remains unavailable until the state is confirmed. Output: $($rawText.Trim())"
        Raw                          = $rawText
    }
}

function Get-KeyVaultActiveVaultState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$ResourceGroupName
    )

    $vaultRaw = & az keyvault show --name $VaultName --resource-group $ResourceGroupName --output json 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    $rawText = if ($null -eq $vaultRaw) { '' } else { [string]$vaultRaw }

    if ($exitCode -ne 0) {
        return [pscustomobject]@{
            Status                       = 'Unknown'
            Found                        = $false
            Name                         = $VaultName
            ResourceGroupName            = $ResourceGroupName
            PurgeProtectionEnabled       = $false
            RetainedUntil                = $null
            Message                      = "Azure CLI could not confirm the active Key Vault state for '$VaultName' in '$ResourceGroupName' (exit $exitCode). Same-name redeploy remains unavailable until the active state is confirmed. Output: $($rawText.Trim())"
            Raw                          = $rawText
        }
    }

    if ([string]::IsNullOrWhiteSpace($rawText)) {
        return [pscustomobject]@{
            Status                       = 'Unknown'
            Found                        = $false
            Name                         = $VaultName
            ResourceGroupName            = $ResourceGroupName
            PurgeProtectionEnabled       = $false
            RetainedUntil                = $null
            Message                      = "Azure CLI returned no active Key Vault payload for '$VaultName' in '$ResourceGroupName'; same-name redeploy remains unavailable until the state is confirmed."
            Raw                          = $rawText
        }
    }

    try {
        $vault = $rawText | ConvertFrom-Json
    }
    catch {
        return [pscustomobject]@{
            Status                       = 'Unknown'
            Found                        = $false
            Name                         = $VaultName
            ResourceGroupName            = $ResourceGroupName
            PurgeProtectionEnabled       = $false
            RetainedUntil                = $null
            Message                      = "Azure CLI returned an unexpected active Key Vault payload for '$VaultName' in '$ResourceGroupName'; same-name redeploy remains unavailable until the state is confirmed."
            Raw                          = $rawText
        }
    }

    if ($null -eq $vault) {
        return [pscustomobject]@{
            Status                       = 'Unknown'
            Found                        = $false
            Name                         = $VaultName
            ResourceGroupName            = $ResourceGroupName
            PurgeProtectionEnabled       = $false
            RetainedUntil                = $null
            Message                      = "Azure CLI returned an empty active Key Vault payload for '$VaultName' in '$ResourceGroupName'; same-name redeploy remains unavailable until the state is confirmed."
            Raw                          = $rawText
        }
    }

    $properties = if ($null -ne $vault.properties) { $vault.properties } else { [pscustomobject]@{} }
    $purgeEnabled = $false
    $candidateValues = @(
        $vault.enablePurgeProtection,
        $vault.purgeProtectionEnabled,
        $properties.enablePurgeProtection,
        $properties.purgeProtectionEnabled
    )

    foreach ($candidate in $candidateValues) {
        if ($null -ne $candidate) {
            $purgeEnabled = Get-KeyVaultPurgeProtectionValue -Value $candidate
            break
        }
    }

    return [pscustomobject]@{
        Status                       = 'Found'
        Found                        = $true
        Name                         = $VaultName
        ResourceGroupName            = $ResourceGroupName
        PurgeProtectionEnabled       = $purgeEnabled
        RetainedUntil                = $null
        Message                      = if ($purgeEnabled) { "Active Key Vault '$VaultName' has purge protection enabled." } else { "Active Key Vault '$VaultName' does not have purge protection enabled." }
        Raw                          = $vault
    }
}

function Wait-ForKeyVaultDeletedState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$Location,

        [Parameter()]
        [int]$WaitSeconds = 120,

        [Parameter()]
        [int]$PollingIntervalSeconds = 5,

        [Parameter()]
        [int]$MinimumNotFoundChecks = 2
    )

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    $lastState = $null
    $notFoundChecks = 0

    while ((Get-Date) -lt $deadline) {
        $state = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
        $lastState = $state

        if ($state.Status -eq 'Found') {
            return $state
        }

        if ($state.Status -eq 'Unknown') {
            return $state
        }

        if ($state.Status -eq 'NotFound') {
            $notFoundChecks++
            if ($notFoundChecks -ge $MinimumNotFoundChecks) {
                return $state
            }
        }
        else {
            $notFoundChecks = 0
        }

        if ($PollingIntervalSeconds -gt 0) {
            Start-Sleep -Seconds $PollingIntervalSeconds
        }
    }

    if ($null -ne $lastState) {
        return $lastState
    }

    return [pscustomobject]@{
        Status                       = 'Unknown'
        Found                        = $false
        Name                         = $VaultName
        Location                     = $Location
        PurgeProtectionEnabled       = $false
        RedeployImmediatelyAvailable = $false
        RetainedUntil                = $null
        Message                      = "Azure did not reach a confirmed terminal deleted-vault state for '$VaultName' in '$Location' within $WaitSeconds seconds. Same-name redeploy remains unavailable until the state is confirmed."
        Raw                          = $null
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

    $deletedState = Wait-ForKeyVaultDeletedState -VaultName $VaultName -Location $Location -WaitSeconds ([Math]::Min($WaitSeconds, 30)) -PollingIntervalSeconds $PollingIntervalSeconds -MinimumNotFoundChecks 2
    if ($deletedState.Status -eq 'NotFound') {
        return [pscustomobject]@{
            Resolved                    = $true
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $true
            RetainedUntil               = $null
            Message                     = "No deleted Key Vault record remains for '$VaultName'; same-name redeploy is available after the deleted-vault state was confirmed."
            Raw                         = $deletedState.Raw
        }
    }

    if ($deletedState.Status -eq 'Unknown') {
        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $false
            RetainedUntil               = $null
            Message                     = $deletedState.Message
            Raw                         = $deletedState.Raw
        }
    }

    if ($deletedState.PurgeProtectionEnabled) {
        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $true
            RedeployImmediatelyAvailable = $false
            RetainedUntil               = $deletedState.RetainedUntil
            Message                     = if ($null -ne $deletedState.RetainedUntil) { "Deleted Key Vault '$VaultName' is purge-protected until $($deletedState.RetainedUntil.ToString('yyyy-MM-ddTHH:mm:ssK')); no purge attempt was made and same-name redeploy is unavailable until retention expires." } else { "Deleted Key Vault '$VaultName' is purge-protected; no purge attempt was made and same-name redeploy is unavailable until the retention window is authoritatively confirmed." }
            Raw                         = $deletedState.Raw
        }
    }

    $purgeOutput = & az keyvault purge --name $VaultName --location $Location 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $afterState = Wait-ForKeyVaultDeletedState -VaultName $VaultName -Location $Location -WaitSeconds ([Math]::Min($WaitSeconds, 30)) -PollingIntervalSeconds $PollingIntervalSeconds -MinimumNotFoundChecks 2
        if ($afterState.Status -eq 'NotFound') {
            return [pscustomobject]@{
                Resolved                    = $true
                PurgeProtectionEnabled      = $false
                RedeployImmediatelyAvailable = $true
                RetainedUntil               = $null
                Message                     = "The purge request for '$VaultName' completed and the deleted record is no longer present; same-name redeploy is available."
                Raw                         = $purgeOutput
            }
        }

        return [pscustomobject]@{
            Resolved                    = $false
            PurgeProtectionEnabled      = $false
            RedeployImmediatelyAvailable = $false
            RetainedUntil               = $null
            Message                     = "Azure rejected the purge request for '$VaultName'; same-name redeploy remains unavailable until the state is confirmed. Output: $($purgeOutput.Trim())"
            Raw                         = $purgeOutput
        }
    }

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    do {
        if ($PollingIntervalSeconds -gt 0) {
            Start-Sleep -Seconds $PollingIntervalSeconds
        }

        $afterState = Get-KeyVaultDeletedVaultState -VaultName $VaultName -Location $Location
        if ($afterState.Status -eq 'NotFound') {
            return [pscustomobject]@{
                Resolved                    = $true
                PurgeProtectionEnabled      = $false
                RedeployImmediatelyAvailable = $true
                RetainedUntil               = $null
                Message                     = "Purged '$VaultName' successfully; same-name redeploy is available."
                Raw                         = $afterState.Raw
            }
        }

        if ($afterState.Status -eq 'Unknown') {
            return [pscustomobject]@{
                Resolved                    = $false
                PurgeProtectionEnabled      = $false
                RedeployImmediatelyAvailable = $false
                RetainedUntil               = $null
                Message                     = $afterState.Message
                Raw                         = $afterState.Raw
            }
        }

        if ($afterState.PurgeProtectionEnabled) {
            return [pscustomobject]@{
                Resolved                    = $false
                PurgeProtectionEnabled      = $true
                RedeployImmediatelyAvailable = $false
                RetainedUntil               = $afterState.RetainedUntil
                Message                     = if ($null -ne $afterState.RetainedUntil) { "Deleted Key Vault '$VaultName' became purge-protected until $($afterState.RetainedUntil.ToString('yyyy-MM-ddTHH:mm:ssK')); same-name redeploy remains unavailable until retention expires." } else { "Deleted Key Vault '$VaultName' became purge-protected during cleanup; same-name redeploy remains unavailable until retention is confirmed." }
                Raw                         = $afterState.Raw
            }
        }
    } while ((Get-Date) -lt $deadline)

    return [pscustomobject]@{
        Resolved                    = $false
        PurgeProtectionEnabled      = $false
        RedeployImmediatelyAvailable = $false
        RetainedUntil               = $null
        Message                     = "The purge request for '$VaultName' completed, but Azure has not released the name within $WaitSeconds seconds; same-name redeploy remains unavailable."
    }
}
