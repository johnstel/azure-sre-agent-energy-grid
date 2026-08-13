<#
.SYNOPSIS
    Bootstraps RabbitMQ credentials into Azure Key Vault.

.DESCRIPTION
    Creates or preserves the RabbitMQ Key Vault secrets used by the deployment.
    The default behavior is fail-safe: preserve a complete, trusted secret set;
    reject partial or inconsistent secret state instead of writing broken pairs;
    and require explicit rotation for replacement.

    This helper intentionally does not create or mutate the Kubernetes Secret
    resource. Kubernetes consumption remains a separate follow-up scope.

.PARAMETER VaultName
    Name of the Azure Key Vault instance.

.PARAMETER Rotate
    Explicitly rotate the RabbitMQ password and AMQP URI while preserving the
    stable username if it already exists.

.EXAMPLE
    .\configure-key-vault-secrets.ps1 -VaultName "kv-srelab-abc123"

.EXAMPLE
    .\configure-key-vault-secrets.ps1 -VaultName "kv-srelab-abc123" -Rotate
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$VaultName,

    [Parameter()]
    [switch]$Rotate
)

$ErrorActionPreference = 'Stop'

$script:RabbitMqKeyVaultSecretNames = [ordered]@{
    username = 'rabbitmq-username'
    password = 'rabbitmq-password'
    amqpUri  = 'rabbitmq-amqp-uri'
}

$script:RabbitMqDefaultUsername = 'energy-grid-mq'
$script:RabbitMqDefaultContentType = 'text/plain'
$script:RabbitMqTagSet = @(
    'app=energy-grid-demo'
    'purpose=rabbitmq'
    'source=keyvault-bootstrap'
    'managed-by=deploy.ps1'
)

function New-RabbitMqPassword {
    [CmdletBinding()]
    param(
        [Parameter()]
        [int]$Length = 40
    )

    if ($Length -lt 24) {
        throw 'RabbitMQ password length must be at least 24 characters.'
    }

    $buffer = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    $password = [Convert]::ToBase64String($buffer)
    return ($password.TrimEnd('=') -replace '\+', '-' -replace '/', '_')
}

function New-RabbitMqAmqpUri {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Username,

        [Parameter(Mandatory)]
        [string]$Password
    )

    $escapedUsername = [System.Uri]::EscapeDataString($Username)
    $escapedPassword = [System.Uri]::EscapeDataString($Password)
    return "amqp://${escapedUsername}:${escapedPassword}@rabbitmq:5672/"
}

function Test-KeyVaultSecretNotFound {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowNull()]
        [string]$Output
    )

    if ([string]::IsNullOrWhiteSpace($Output)) {
        return $false
    }

    $normalized = $Output.ToLowerInvariant()
    return ($normalized.Contains('not found') -or
        $normalized.Contains('secretnotfound') -or
        $normalized.Contains('does not exist') -or
        $normalized.Contains('resource not found') -or
        $normalized.Contains('404'))
}

function Test-RabbitMqSecretSetConsistency {
    [CmdletBinding()]
    param(
        [Parameter()]
        [AllowEmptyString()]
        [string]$Username,

        [Parameter()]
        [AllowEmptyString()]
        [string]$Password,

        [Parameter()]
        [AllowEmptyString()]
        [string]$AmqpUri
    )

    if ([string]::IsNullOrWhiteSpace($Username) -or
        [string]::IsNullOrWhiteSpace($Password) -or
        [string]::IsNullOrWhiteSpace($AmqpUri)) {
        return $false
    }

    $expectedAmqpUri = New-RabbitMqAmqpUri -Username $Username -Password $Password
    return ($AmqpUri.Trim() -eq $expectedAmqpUri)
}

function New-RabbitMqSecretFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$SecretName,

        [Parameter(Mandatory)]
        [string]$Value
    )

    $secretDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("rabbitmq-keyvault-bootstrap-{0}" -f [System.Guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $secretDirectory -Force -ErrorAction Stop

    $secretPath = Join-Path $secretDirectory ("{0}.secret" -f $SecretName)
    $stream = [System.IO.File]::Open($secretPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)

    try {
        $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
        $writer.Write($Value)
        $writer.Flush()
    }
    finally {
        if ($null -ne $writer) {
            $writer.Dispose()
        }
        $stream.Dispose()
    }

    try {
        & chmod 700 $secretDirectory 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to secure the secret bootstrap directory '$secretDirectory'."
        }

        & chmod 600 $secretPath 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to secure the secret bootstrap file '$secretPath'."
        }
    }
    catch {
        if (Test-Path -LiteralPath $secretDirectory) {
            Remove-Item -LiteralPath $secretDirectory -Recurse -Force -ErrorAction SilentlyContinue
        }
        throw
    }

    return [pscustomobject]@{
        Path      = $secretPath
        Directory = $secretDirectory
    }
}

function Remove-RabbitMqSecretFile {
    [CmdletBinding()]
    param(
        [Parameter()]
        $SecretFile
    )

    if ($null -eq $SecretFile) {
        return
    }

    $filePath = $SecretFile.Path
    $directoryPath = $SecretFile.Directory

    if ($filePath -and (Test-Path -LiteralPath $filePath)) {
        Remove-Item -LiteralPath $filePath -Force -ErrorAction Stop
        if (Test-Path -LiteralPath $filePath) {
            throw "Failed to confirm cleanup for RabbitMQ secret temp file '$filePath'."
        }
    }

    if ($directoryPath -and (Test-Path -LiteralPath $directoryPath)) {
        Remove-Item -LiteralPath $directoryPath -Recurse -Force -ErrorAction Stop
        if (Test-Path -LiteralPath $directoryPath) {
            throw "Failed to confirm cleanup for RabbitMQ secret temp directory '$directoryPath'."
        }
    }
}

function Get-KeyVaultSecretValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$SecretName
    )

    $commandResult = & az keyvault secret show --vault-name $VaultName --name $SecretName --query 'value' --output tsv 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $diagnostic = ($commandResult | Out-String).Trim()
        if (Test-KeyVaultSecretNotFound -Output $diagnostic) {
            return $null
        }

        throw "Failed to read RabbitMQ Key Vault secret '$SecretName' in vault '$VaultName': $diagnostic"
    }

    $value = ($commandResult | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $null
    }

    return $value
}

function Get-KeyVaultSecretMetadata {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$SecretName
    )

    $rawMetadata = & az keyvault secret show --vault-name $VaultName --name $SecretName --query '{ name:name, version:properties.version, id:id, contentType:properties.contentType, tags:tags }' --output json 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $diagnostic = ($rawMetadata | Out-String).Trim()
        if (Test-KeyVaultSecretNotFound -Output $diagnostic) {
            return $null
        }

        throw "Failed to read metadata for RabbitMQ Key Vault secret '$SecretName' in vault '$VaultName': $diagnostic"
    }

    $jsonText = ($rawMetadata | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($jsonText)) {
        return $null
    }

    try {
        $metadata = $jsonText | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        return $null
    }

    return [pscustomobject]@{
        Name        = [string]$metadata.name
        Version     = [string]$metadata.version
        Id          = [string]$metadata.id
        ContentType = [string]$metadata.contentType
        Tags        = $metadata.tags
    }
}

function Remove-KeyVaultSecret {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$SecretName
    )

    $stderr = & az keyvault secret delete --vault-name $VaultName --name $SecretName --output none 2>&1
    if ($LASTEXITCODE -ne 0) {
        $diagnostic = ($stderr | Out-String).Trim()
        throw "Failed to delete RabbitMQ Key Vault secret '$SecretName' in vault '$VaultName': $diagnostic"
    }
}

function Set-KeyVaultSecretValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$SecretName,

        [Parameter(Mandatory)]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "RabbitMQ Key Vault secret '$SecretName' cannot be written with an empty value."
    }

    $secretFile = New-RabbitMqSecretFile -SecretName $SecretName -Value $Value
    try {
        $azArgs = @(
            'keyvault', 'secret', 'set',
            '--vault-name', $VaultName,
            '--name', $SecretName,
            '--file', $secretFile.Path,
            '--encoding', 'utf-8',
            '--content-type', $script:RabbitMqDefaultContentType,
            '--tags'
        )

        $azArgs += $script:RabbitMqTagSet
        $azArgs += @('--output', 'none')

        $stderr = & az @azArgs 2>&1
        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0) {
            $diagnostic = ($stderr | Out-String).Trim()
            throw "Failed to configure RabbitMQ Key Vault secret '$SecretName' in vault '$VaultName'. $diagnostic"
        }
    }
    finally {
        Remove-RabbitMqSecretFile -SecretFile $secretFile
    }
}

function Get-RabbitMqSecretState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName
    )

    $state = [ordered]@{
        Username = $null
        Password = $null
        AmqpUri  = $null
    }

    foreach ($entry in $script:RabbitMqKeyVaultSecretNames.GetEnumerator()) {
        $key = $entry.Name
        $secretName = $entry.Value
        $state[$key] = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $secretName
    }

    $presentNames = @($state.Keys | Where-Object { -not [string]::IsNullOrWhiteSpace($state[$_]) })
    $missingNames = @($state.Keys | Where-Object { [string]::IsNullOrWhiteSpace($state[$_]) })

    $status = 'missing'
    if ($presentNames.Count -eq 3) {
        $status = 'complete'
    }
    elseif ($presentNames.Count -gt 0) {
        $status = 'partial'
    }

    $isConsistent = $false
    if ($presentNames.Count -eq 3) {
        $isConsistent = Test-RabbitMqSecretSetConsistency -Username $state['username'] -Password $state['password'] -AmqpUri $state['amqpUri']
        if (-not $isConsistent) {
            $status = 'inconsistent'
        }
    }

    return [pscustomobject]@{
        Username    = $state['username']
        Password    = $state['password']
        AmqpUri     = $state['amqpUri']
        Present     = $presentNames
        Missing     = $missingNames
        Status      = $status
        IsConsistent = $isConsistent
    }
}

function Invoke-RabbitMqKeyVaultBootstrap {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter()]
        [switch]$Rotate
    )

    $secretState = Get-RabbitMqSecretState -VaultName $VaultName

    if (-not $Rotate -and $secretState.Status -eq 'partial') {
        throw "RabbitMQ Key Vault bootstrap is incomplete: existing values are present for '$($secretState.Present -join ', ')', but missing '$($secretState.Missing -join ', ')'. Refuse to preserve a partial secret set. Delete the incomplete pair or rerun with -Rotate."
    }

    if (-not $Rotate -and $secretState.Status -eq 'inconsistent') {
        throw "RabbitMQ Key Vault secret set is inconsistent. The stored AMQP URI does not match the stored username/password. Re-run with -Rotate to replace the broken pair."
    }

    $desiredUsername = $secretState.Username
    if ([string]::IsNullOrWhiteSpace($desiredUsername)) {
        $desiredUsername = $script:RabbitMqDefaultUsername
    }

    if ($Rotate -or $secretState.Status -eq 'missing') {
        $desiredPassword = New-RabbitMqPassword
        $desiredAmqpUri = New-RabbitMqAmqpUri -Username $desiredUsername -Password $desiredPassword
    }
    elseif ($secretState.Status -eq 'complete') {
        $desiredPassword = $secretState.Password
        $desiredAmqpUri = $secretState.AmqpUri
    }
    else {
        throw "Unsupported RabbitMQ Key Vault state '$($secretState.Status)' for vault '$VaultName'."
    }

    $results = [System.Collections.Generic.List[object]]::new()
    $rollbackValues = [ordered]@{}
    $writtenSecrets = [System.Collections.Generic.List[string]]::new()

    foreach ($secretEntry in $script:RabbitMqKeyVaultSecretNames.GetEnumerator()) {
        $secretName = $secretEntry.Value
        $desiredValue = switch ($secretEntry.Name) {
            'username' { $desiredUsername }
            'password' { $desiredPassword }
            'amqpUri' { $desiredAmqpUri }
            default { $null }
        }

        $existingValue = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $secretName
        $shouldPreserve = (-not $Rotate) -and ($secretState.Status -eq 'complete') -and (-not [string]::IsNullOrWhiteSpace($existingValue)) -and ($existingValue -eq $desiredValue)

        if ($shouldPreserve) {
            $metadata = Get-KeyVaultSecretMetadata -VaultName $VaultName -SecretName $secretName
            [void]$results.Add([pscustomobject]@{
                    Name        = $secretName
                    Status      = 'preserved'
                    Version     = if ($metadata) { $metadata.Version } else { $null }
                    Id          = if ($metadata) { $metadata.Id } else { $null }
                    ContentType = if ($metadata) { $metadata.ContentType } else { $null }
                })
            continue
        }

        $rollbackValues[$secretName] = $existingValue

        try {
            Set-KeyVaultSecretValue -VaultName $VaultName -SecretName $secretName -Value $desiredValue
            [void]$writtenSecrets.Add($secretName)

            $metadata = Get-KeyVaultSecretMetadata -VaultName $VaultName -SecretName $secretName
            [void]$results.Add([pscustomobject]@{
                    Name        = $secretName
                    Status      = if ([string]::IsNullOrWhiteSpace($existingValue)) { 'created' } else { 'rotated' }
                    Version     = if ($metadata) { $metadata.Version } else { $null }
                    Id          = if ($metadata) { $metadata.Id } else { $null }
                    ContentType = if ($metadata) { $metadata.ContentType } else { $null }
                })
        }
        catch {
            $rollbackErrors = @()
            foreach ($writtenSecret in @($writtenSecrets)) {
                try {
                    $previousValue = $rollbackValues[$writtenSecret]
                    if ($null -eq $previousValue) {
                        Remove-KeyVaultSecret -VaultName $VaultName -SecretName $writtenSecret
                        continue
                    }

                    Set-KeyVaultSecretValue -VaultName $VaultName -SecretName $writtenSecret -Value $previousValue
                }
                catch {
                    $rollbackErrors += "'$writtenSecret': $($_.Exception.Message)"
                }
            }

            $failureMessage = $_.Exception.Message
            if ($rollbackErrors.Count -gt 0) {
                throw "RabbitMQ Key Vault bootstrap failed while updating '$secretName'; rollback attempted but could not restore the prior values: $($rollbackErrors -join '; '). Original failure: $failureMessage"
            }

            throw "RabbitMQ Key Vault bootstrap failed while updating '$secretName': $failureMessage"
        }
    }

    return @($results)
}

if ($MyInvocation.InvocationName -ne '.') {
    $bootstrapResults = Invoke-RabbitMqKeyVaultBootstrap -VaultName $VaultName -Rotate:$Rotate
    foreach ($item in $bootstrapResults) {
        Write-Host "  • $($item.Name): $($item.Status)$(if ($item.Version) { " (version: $($item.Version))" })" -ForegroundColor Green
    }
}
