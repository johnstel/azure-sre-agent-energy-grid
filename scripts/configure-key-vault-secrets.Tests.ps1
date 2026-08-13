BeforeAll {
    . (Join-Path $PSScriptRoot 'configure-key-vault-secrets.ps1') -VaultName 'demo-kv'
}

Describe 'RabbitMQ Key Vault bootstrap' {
    Context 'when no secrets exist' {
        BeforeEach {
            $script:AzArgs = @()
            Mock Get-KeyVaultSecretValue { $null }
            Mock Get-KeyVaultSecretMetadata { $null }
            Mock New-RabbitMqPassword { 'generated-secret-password-0123456789' }
            Mock New-RabbitMqAmqpUri {
                param([string]$Username, [string]$Password)
                "amqp://${Username}:${Password}@rabbitmq:5672/"
            }
            Mock az {
                param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)
                $script:AzArgs = @($Arguments)
                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'creates all required RabbitMQ secrets and never embeds values in CLI args' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv'

            $result.Count | Should -Be 3
            @($result.Name) | Should -Be @('rabbitmq-username', 'rabbitmq-password', 'rabbitmq-amqp-uri')
            @($result.Status) | Should -Be @('created', 'created', 'created')

            $combinedArgs = ($script:AzArgs -join ' ')
            $combinedArgs | Should -Not -Match 'generated-secret-password-0123456789'
            $combinedArgs | Should -Match '--file'
            $combinedArgs | Should -Match '--content-type'
            $combinedArgs | Should -Not -Match '--value'
        }
    }

    Context 'when all secrets already exist' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return 'existing-password' }
                    'rabbitmq-amqp-uri' { return 'amqp://energy-grid-mq:existing-password@rabbitmq:5672/' }
                    default { return $null }
                }
            }
            Mock Get-KeyVaultSecretMetadata {
                param([string]$SecretName)
                return [pscustomobject]@{
                    Name    = $SecretName
                    Version = 'abc123'
                    Id      = "https://demo-kv.vault.azure.net/secrets/$SecretName/abc123"
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

    Context 'when the secret set is partial' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return $null }
                    'rabbitmq-amqp-uri' { return 'amqp://energy-grid-mq:legacy-password@rabbitmq:5672/' }
                    default { return $null }
                }
            }
            Mock az {
                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'fails closed instead of preserving a mismatched pair' {
            { Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' } | Should -Throw -ExpectedMessage '*incomplete*'
        }
    }

    Context 'when rotation is explicitly requested' {
        BeforeEach {
            $script:AzArgs = @()
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return 'legacy-password' }
                    'rabbitmq-amqp-uri' { return 'amqp://energy-grid-mq:legacy-password@rabbitmq:5672/' }
                    default { return $null }
                }
            }
            Mock Get-KeyVaultSecretMetadata {
                param([string]$SecretName)
                return [pscustomobject]@{
                    Name    = $SecretName
                    Version = 'rotated-version'
                    Id      = "https://demo-kv.vault.azure.net/secrets/$SecretName/rotated-version"
                }
            }
            Mock New-RabbitMqPassword { 'new-rotated-password-9876543210' }
            Mock New-RabbitMqAmqpUri {
                param([string]$Username, [string]$Password)
                "amqp://${Username}:${Password}@rabbitmq:5672/"
            }
            Mock az {
                param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)
                $script:AzArgs = @($Arguments)
                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'rotates the password and AMQP URI together while preserving the stable username' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' -Rotate

            $result.Count | Should -Be 3
            @($result.Status) | Should -Be @('rotated', 'rotated', 'rotated')

            $combinedArgs = ($script:AzArgs -join ' ')
            $combinedArgs | Should -Not -Match 'legacy-password'
            $combinedArgs | Should -Not -Match 'new-rotated-password-9876543210'
            $combinedArgs | Should -Match '--file'
        }
    }

    Context 'when the Key Vault write command fails' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue { $null }
            Mock Get-KeyVaultSecretMetadata { $null }
            Mock New-RabbitMqPassword { 'generated-secret-password-0123456789' }
            Mock New-RabbitMqAmqpUri {
                param([string]$Username, [string]$Password)
                "amqp://${Username}:${Password}@rabbitmq:5672/"
            }
            Mock az {
                $global:LASTEXITCODE = 1
                return 'ERROR: Forbidden: access denied'
            }
        }

        It 'throws a clear error and does not leak the secret value in stderr handling' {
            { Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' } | Should -Throw -ExpectedMessage '*Failed to configure RabbitMQ Key Vault secret*'
        }
    }

    Context 'when secret reads fail with an authorization error' {
        BeforeEach {
            Mock az {
                $global:LASTEXITCODE = 1
                return 'ERROR: Forbidden: insufficient permissions'
            }
        }

        It 'does not treat auth errors as a missing secret' {
            { Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' } | Should -Throw -ExpectedMessage '*Failed to read RabbitMQ Key Vault secret*'
        }
    }
}
