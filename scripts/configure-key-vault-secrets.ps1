<#
.SYNOPSIS
    Bootstraps RabbitMQ credentials into Azure Key Vault.

.DESCRIPTION
    Creates or preserves the RabbitMQ Key Vault secrets used by the deployment.
    The default behavior is fail-safe: preserve a complete secret set; reject
    partial state instead of writing inconsistent pairs; and require explicit
    rotation for replacement.

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

function New-RabbitMqSecretFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$SecretName,

        [Parameter(Mandatory)]
        [string]$Value
    )

    $secretDirectory = Join-Path $PSScriptRoot '.bootstrap-secrets'
    $null = New-Item -ItemType Directory -Path $secretDirectory -Force -ErrorAction Stop
    $secretPath = Join-Path $secretDirectory ("{0}.secret" -f $SecretName)

    [System.IO.File]::WriteAllText($secretPath, $Value, [System.Text.UTF8Encoding]::new($false))
    return $secretPath
}

function Remove-RabbitMqSecretFile {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return
    }

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
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

    $rawMetadata = & az keyvault secret show --vault-name $VaultName --name $SecretName --query '{ name:name, version:properties.version, id:id }' --output json 2>&1
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
        Name    = [string]$metadata.name
        Version = [string]$metadata.version
        Id      = [string]$metadata.id
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

    $secretPath = New-RabbitMqSecretFile -SecretName $SecretName -Value $Value
    try {
        $azArgs = @(
            'keyvault', 'secret', 'set',
            '--vault-name', $VaultName,
            '--name', $SecretName,
            '--file', $secretPath,
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
        Remove-RabbitMqSecretFile -Path $secretPath
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
        AmqpUri = $null
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

    return [pscustomobject]@{
        Username = $state['username']
        Password = $state['password']
        AmqpUri = $state['amqpUri']
        Present = $presentNames
        Missing = $missingNames
        Status = $status
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

    $desiredUsername = $secretState.Username
    if ([string]::IsNullOrWhiteSpace($desiredUsername)) {
        $desiredUsername = $script:RabbitMqDefaultUsername
    }

    if ($Rotate) {
        $desiredPassword = New-RabbitMqPassword
        $desiredAmqpUri = New-RabbitMqAmqpUri -Username $desiredUsername -Password $desiredPassword
    }
    elseif ($secretState.Status -eq 'complete') {
        $desiredPassword = $secretState.Password
        $desiredAmqpUri = $secretState.AmqpUri
    }
    else {
        $desiredPassword = New-RabbitMqPassword
        $desiredAmqpUri = New-RabbitMqAmqpUri -Username $desiredUsername -Password $desiredPassword
    }

    $results = [System.Collections.Generic.List[object]]::new()

    foreach ($secretName in @(
            $script:RabbitMqKeyVaultSecretNames.username,
            $script:RabbitMqKeyVaultSecretNames.password,
            $script:RabbitMqKeyVaultSecretNames.amqpUri
        )) {

        $existingValue = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $secretName
        $desiredValue = switch ($secretName) {
            $script:RabbitMqKeyVaultSecretNames.username { $desiredUsername }
            $script:RabbitMqKeyVaultSecretNames.password { $desiredPassword }
            $script:RabbitMqKeyVaultSecretNames.amqpUri { $desiredAmqpUri }
            default { $null }
        }

        if (-not $Rotate -and -not [string]::IsNullOrWhiteSpace($existingValue) -and $secretState.Status -eq 'complete') {
            $metadata = Get-KeyVaultSecretMetadata -VaultName $VaultName -SecretName $secretName
            [void]$results.Add([pscustomobject]@{
                    Name    = $secretName
                    Status  = 'preserved'
                    Version = if ($metadata) { $metadata.Version } else { $null }
                    Id      = if ($metadata) { $metadata.Id } else { $null }
                })
            continue
        }

        Set-KeyVaultSecretValue -VaultName $VaultName -SecretName $secretName -Value $desiredValue

        $metadata = Get-KeyVaultSecretMetadata -VaultName $VaultName -SecretName $secretName
        [void]$results.Add([pscustomobject]@{
                Name    = $secretName
                Status  = if ([string]::IsNullOrWhiteSpace($existingValue)) { 'created' } else { 'rotated' }
                Version = if ($metadata) { $metadata.Version } else { $null }
                Id      = if ($metadata) { $metadata.Id } else { $null }
            })
    }

    return @($results)
}

if ($MyInvocation.InvocationName -ne '.') {
    $bootstrapResults = Invoke-RabbitMqKeyVaultBootstrap -VaultName $VaultName -Rotate:$Rotate
    foreach ($item in $bootstrapResults) {
        Write-Host "  • $($item.Name): $($item.Status)$(if ($item.Version) { " (version: $($item.Version))" })" -ForegroundColor Green
    }
}
