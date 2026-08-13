<#
.SYNOPSIS
    Bootstraps RabbitMQ credentials into Azure Key Vault.

.DESCRIPTION
    Creates or preserves Key Vault secrets needed by the RabbitMQ deployment.
    Secret values are generated at deployment time and never written to tracked
    files or normal console output.

.PARAMETER VaultName
    Name of the Azure Key Vault instance.

.PARAMETER Rotate
    Explicitly rotate every RabbitMQ secret version, creating new versions even
    when the original secret already exists.

.PARAMETER KubernetesNamespace
    Namespace used for the generated RabbitMQ Kubernetes Secret.

.PARAMETER KubernetesSecretName
    Name of the Kubernetes Secret that mirrors the Key Vault values.

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
    [switch]$Rotate,

    [Parameter()]
    [string]$KubernetesNamespace = 'energy',

    [Parameter()]
    [string]$KubernetesSecretName = 'rabbitmq-credentials'
)

$ErrorActionPreference = 'Stop'

$script:RabbitMqKeyVaultSecretNames = [ordered]@{
    username = 'rabbitmq-username'
    password = 'rabbitmq-password'
    amqpUri  = 'rabbitmq-amqp-uri'
}

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

function Get-KeyVaultSecretValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter(Mandatory)]
        [string]$SecretName
    )

    $value = az keyvault secret show --vault-name $VaultName --name $SecretName --query 'value' --output tsv 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
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

    $rawMetadata = az keyvault secret show --vault-name $VaultName --name $SecretName --query '{ name:name, version:properties.version, id:id }' --output json 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rawMetadata)) {
        return $null
    }

    try {
        $metadata = $rawMetadata | ConvertFrom-Json
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

function Invoke-RabbitMqKeyVaultBootstrap {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$VaultName,

        [Parameter()]
        [switch]$Rotate
    )

    $username = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $script:RabbitMqKeyVaultSecretNames.username
    if ([string]::IsNullOrWhiteSpace($username)) {
        $username = 'energy-grid-mq'
    }

    $password = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $script:RabbitMqKeyVaultSecretNames.password
    if ([string]::IsNullOrWhiteSpace($password) -or $Rotate) {
        $password = New-RabbitMqPassword
    }

    $amqpUri = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $script:RabbitMqKeyVaultSecretNames.amqpUri
    if ([string]::IsNullOrWhiteSpace($amqpUri) -or $Rotate) {
        $amqpUri = New-RabbitMqAmqpUri -Username $username -Password $password
    }

    $results = [System.Collections.Generic.List[object]]::new()

    foreach ($secretName in @(
            $script:RabbitMqKeyVaultSecretNames.username,
            $script:RabbitMqKeyVaultSecretNames.password,
            $script:RabbitMqKeyVaultSecretNames.amqpUri
        )) {

        $existingValue = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $secretName
        $desiredValue = switch ($secretName) {
            $script:RabbitMqKeyVaultSecretNames.username { $username }
            $script:RabbitMqKeyVaultSecretNames.password { $password }
            $script:RabbitMqKeyVaultSecretNames.amqpUri { $amqpUri }
            default { $null }
        }

        if (-not $Rotate -and -not [string]::IsNullOrWhiteSpace($existingValue)) {
            $metadata = Get-KeyVaultSecretMetadata -VaultName $VaultName -SecretName $secretName
            [void]$results.Add([pscustomobject]@{
                    Name    = $secretName
                    Status  = 'preserved'
                    Version = if ($metadata) { $metadata.Version } else { $null }
                    Id      = if ($metadata) { $metadata.Id } else { $null }
                })
            continue
        }

        $null = & az keyvault secret set --vault-name $VaultName --name $secretName --value $desiredValue --output none 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to configure RabbitMQ Key Vault secret '$secretName' in vault '$VaultName'."
        }

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

function Set-KubernetesRabbitMqSecret {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Namespace,

        [Parameter(Mandatory)]
        [string]$SecretName,

        [Parameter(Mandatory)]
        [string]$Username,

        [Parameter(Mandatory)]
        [string]$Password,

        [Parameter(Mandatory)]
        [string]$AmqpUri
    )

    $secretYaml = & kubectl create secret generic $SecretName --namespace $Namespace `
        --from-literal "rabbitmq-username=$Username" `
        --from-literal "rabbitmq-password=$Password" `
        --from-literal "rabbitmq-amqp-uri=$AmqpUri" `
        --dry-run=client -o yaml 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to render the RabbitMQ Kubernetes Secret '$SecretName' in namespace '$Namespace'."
    }

    $secretYaml | kubectl apply -f - 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to apply the RabbitMQ Kubernetes Secret '$SecretName' in namespace '$Namespace'."
    }

    return [pscustomobject]@{
        Name      = $SecretName
        Namespace = $Namespace
        Status    = 'applied'
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $bootstrapResults = Invoke-RabbitMqKeyVaultBootstrap -VaultName $VaultName -Rotate:$Rotate
    foreach ($item in $bootstrapResults) {
        Write-Host "  • $($item.Name): $($item.Status)$(if ($item.Version) { " (version: $($item.Version))" })" -ForegroundColor Green
    }

    $username = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $script:RabbitMqKeyVaultSecretNames.username
    if ([string]::IsNullOrWhiteSpace($username)) {
        $username = 'energy-grid-mq'
    }

    $password = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $script:RabbitMqKeyVaultSecretNames.password
    if ([string]::IsNullOrWhiteSpace($password) -or $Rotate) {
        $password = New-RabbitMqPassword
    }

    $amqpUri = Get-KeyVaultSecretValue -VaultName $VaultName -SecretName $script:RabbitMqKeyVaultSecretNames.amqpUri
    if ([string]::IsNullOrWhiteSpace($amqpUri) -or $Rotate) {
        $amqpUri = New-RabbitMqAmqpUri -Username $username -Password $password
    }

    $kubernetesResult = Set-KubernetesRabbitMqSecret -Namespace $KubernetesNamespace -SecretName $KubernetesSecretName -Username $username -Password $password -AmqpUri $amqpUri
    Write-Host "  • $($kubernetesResult.Name): $($kubernetesResult.Status)" -ForegroundColor Green
}
