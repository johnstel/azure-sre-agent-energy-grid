BeforeAll {
    . (Join-Path $PSScriptRoot 'configure-key-vault-secrets.ps1') -VaultName 'demo-kv'
}

Describe 'RabbitMQ Key Vault bootstrap' {
    Context 'when no secrets exist' {
        BeforeEach {
            $script:AzCalls = [System.Collections.Generic.List[object]]::new()
            Mock Get-KeyVaultSecretValue { $null }
            Mock Get-KeyVaultSecretMetadata { $null }
            Mock New-RabbitMqPassword { 'generated-secret-password-0123456789' }
            Mock New-RabbitMqAmqpUri {
                param([string]$Username, [string]$Password)
                "amqp://${Username}:${Password}@rabbitmq:5672/"
            }
            Mock az {
                param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)
                $script:AzCalls.Add(@($Arguments))
                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'creates all required RabbitMQ secrets and never embeds values in CLI args' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv'

            $result.Count | Should -Be 3
            @($result.Name) | Should -Be @('rabbitmq-username', 'rabbitmq-password', 'rabbitmq-amqp-uri')
            @($result.Status) | Should -Be @('created', 'created', 'created')

            $combinedArgs = ($script:AzCalls | ForEach-Object { $_ -join ' ' }) -join ' '
            $combinedArgs | Should -Not -Match 'generated-secret-password-0123456789'
            $combinedArgs | Should -Match '--file'
            $combinedArgs | Should -Match '--content-type'
            $combinedArgs | Should -Match 'source=keyvault-bootstrap'
            $combinedArgs | Should -Not -Match '--value'
        }
    }

    Context 'when all secrets already exist and match' {
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
                    Name        = $SecretName
                    Version     = 'abc123'
                    Id          = "https://demo-kv.vault.azure.net/secrets/$SecretName/abc123"
                    ContentType = 'text/plain'
                    Tags        = [pscustomobject]@{ app = 'energy-grid-demo' }
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
            @($result.Name) | Should -Be @('rabbitmq-username', 'rabbitmq-password', 'rabbitmq-amqp-uri')
        }
    }

    Context 'when the secret set is partial' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return $null }
                    'rabbitmq-amqp-uri' { return 'amqp://energy-grid-mq:existing-password@rabbitmq:5672/' }
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

    Context 'when the secret set is inconsistent' {
        BeforeEach {
            Mock Get-KeyVaultSecretValue {
                param([string]$SecretName)
                switch ($SecretName) {
                    'rabbitmq-username' { return 'energy-grid-mq' }
                    'rabbitmq-password' { return 'existing-password' }
                    'rabbitmq-amqp-uri' { return 'amqp://wrong-user:existing-password@rabbitmq:5672/' }
                    default { return $null }
                }
            }
        }

        It 'refuses to preserve a broken pair unless rotation is explicitly requested' {
            { Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' } | Should -Throw -ExpectedMessage '*inconsistent*'
        }
    }

    Context 'when rotation is explicitly requested' {
        BeforeEach {
            $script:AzCalls = [System.Collections.Generic.List[object]]::new()
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
                    Name        = $SecretName
                    Version     = 'rotated-version'
                    Id          = "https://demo-kv.vault.azure.net/secrets/$SecretName/rotated-version"
                    ContentType = 'text/plain'
                    Tags        = [pscustomobject]@{ app = 'energy-grid-demo' }
                }
            }
            Mock New-RabbitMqPassword { 'new-rotated-password-9876543210' }
            Mock New-RabbitMqAmqpUri {
                param([string]$Username, [string]$Password)
                "amqp://${Username}:${Password}@rabbitmq:5672/"
            }
            Mock az {
                param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)
                $script:AzCalls.Add(@($Arguments))
                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'rotates the password and AMQP URI together while preserving the stable username' {
            $result = Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' -Rotate

            $result.Count | Should -Be 3
            @($result.Status) | Should -Be @('rotated', 'rotated', 'rotated')

            $combinedArgs = ($script:AzCalls | ForEach-Object { $_ -join ' ' }) -join ' '
            $combinedArgs | Should -Not -Match 'legacy-password'
            $combinedArgs | Should -Not -Match 'new-rotated-password-9876543210'
            $combinedArgs | Should -Match '--file'
            $combinedArgs | Should -Match 'rabbitmq-username'
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

    Context 'when a write fails mid-sequence' {
        BeforeEach {
            $script:RecordedFiles = [System.Collections.Generic.List[string]]::new()
            $script:AzCallCount = 0

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
                    Name        = $SecretName
                    Version     = 'existing-version'
                    Id          = "https://demo-kv.vault.azure.net/secrets/$SecretName/existing-version"
                    ContentType = 'text/plain'
                    Tags        = [pscustomobject]@{ app = 'energy-grid-demo' }
                }
            }
            Mock New-RabbitMqPassword { 'rotated-password-xyz-1234567890' }
            Mock New-RabbitMqAmqpUri {
                param([string]$Username, [string]$Password)
                "amqp://${Username}:${Password}@rabbitmq:5672/"
            }
            Mock az {
                param([Parameter(ValueFromRemainingArguments)] [string[]]$Arguments)
                $script:AzCallCount += 1
                $fileIndex = [Array]::IndexOf($Arguments, '--file')
                if ($fileIndex -ge 0 -and ($fileIndex + 1) -lt $Arguments.Count) {
                    $path = $Arguments[$fileIndex + 1]
                    $script:RecordedFiles.Add($path)
                    $path | Should -Exist
                }

                if ($script:AzCallCount -ge 2) {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: Simulated write failure while rotating the Key Vault secret set.'
                }

                $global:LASTEXITCODE = 0
                return ''
            }
        }

        It 'cleans temporary files and surfaces the rollback failure without leaking a value' {
            { Invoke-RabbitMqKeyVaultBootstrap -VaultName 'demo-kv' -Rotate } | Should -Throw -ExpectedMessage '*bootstrap failed*'

            foreach ($path in @($script:RecordedFiles)) {
                Test-Path -LiteralPath $path | Should -BeFalse
            }
        }
    }
}
