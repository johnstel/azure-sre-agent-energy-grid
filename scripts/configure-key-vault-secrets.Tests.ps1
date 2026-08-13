BeforeAll {
    . (Join-Path $PSScriptRoot 'configure-key-vault-secrets.ps1') -VaultName 'demo-kv'
}

Describe 'RabbitMQ Key Vault bootstrap' {
    Context 'when no secrets exist' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue { $null }
            Mock Get-KeyVaultSecretMetadata { $null }
            Mock az {
                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'creates all required RabbitMQ secrets' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv'

            $result.Count | Should -Be 3
            @($result.Name) | Should -Be @('rabbitmq-username', 'rabbitmq-password', 'rabbitmq-amqp-uri')
            @($result.Status) | Should -Be @('created', 'created', 'created')
        }

        It 'uses strong generated credentials' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv'
            $passwordSecret = $result | Where-Object Name -eq 'rabbitmq-password'
            $amqpSecret = $result | Where-Object Name -eq 'rabbitmq-amqp-uri'

            $passwordSecret | Should -Not -BeNullOrEmpty
            $amqpSecret | Should -Not -BeNullOrEmpty
        }
    }

    Context 'when all secrets already exist' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return 'existing-password' }
                    'rabbitmq-amqp-uri' { return 'amqp://existing-user:existing-password@rabbitmq:5672/' }
                    default { return $null }
                }
            }
            Mock Get-KeyVaultSecretMetadata {
                return [pscustomobject]@{
                    Name    = 'rabbitmq-username'
                    Version = 'abc123'
                    Id      = 'https://demo-kv.vault.azure.net/secrets/rabbitmq-username/abc123'
                }
            }
            Mock az {
                throw 'Unexpected Key Vault write when the secret should be preserved.'
            }
        }

        It 'preserves existing values and versions without rotating' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv'

            $result.Count | Should -Be 3
            @($result.Status) | Should -Be @('preserved', 'preserved', 'preserved')
        }
    }

    Context 'when rotation is explicitly requested' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return 'old-password' }
                    'rabbitmq-amqp-uri' { return 'amqp://old-user:old-password@rabbitmq:5672/' }
                    default { return $null }
                }
            }
            Mock Get-KeyVaultSecretMetadata {
                return [pscustomobject]@{
                    Name    = 'rabbitmq-password'
                    Version = 'rotated-version'
                    Id      = 'https://demo-kv.vault.azure.net/secrets/rabbitmq-password/rotated-version'
                }
            }
            Mock az {
                $global:LASTEXITCODE = 0
                return ''
            }
            Mock New-RabbitMqPassword { 'rotated-password-1234567890' }
            Mock New-RabbitMqAmqpUri { 'amqp://rotated-user:rotated-password-1234567890@rabbitmq:5672/' }
        }

        It 'creates a new Key Vault version for each secret' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' -Rotate

            $result.Count | Should -Be 3
            @($result.Status) | Should -Be @('rotated', 'rotated', 'rotated')
        }
    }

    Context 'when Key Vault write fails' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue { $null }
            Mock Get-KeyVaultSecretMetadata { $null }
            Mock az {
                $global:LASTEXITCODE = 1
                return ''
            }
        }

        It 'throws a clear error' {
            { Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' } | Should -Throw -ExpectedMessage '*Failed to configure RabbitMQ Key Vault secret*'
        }
    }
}
