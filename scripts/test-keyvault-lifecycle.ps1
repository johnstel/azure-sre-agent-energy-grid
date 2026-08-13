$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'key-vault-lifecycle.ps1')

$script:scenario = $null
$script:showDeletedCalls = 0
$script:purgeCalls = 0

function New-KeyVaultDeletedRecord {
    param(
        [Parameter()]
        [bool]$PurgeProtectionEnabled = $false
    )

    return [pscustomobject]@{
        name = 'test-vault'
        location = 'eastus2'
        properties = [pscustomobject]@{
            purgeProtectionEnabled = $PurgeProtectionEnabled
        }
    }
}

function Configure-AzScenario {
    param(
        [Parameter(Mandatory)]
        [hashtable]$Scenario
    )

    $script:scenario = $Scenario
    $script:showDeletedCalls = 0
    $script:purgeCalls = 0

    if (Test-Path Function:az) {
        Remove-Item -Path Function:az -Force -ErrorAction SilentlyContinue
    }

    function global:az {
        param(
            [Parameter(ValueFromRemainingArguments = $true)]
            [string[]]$Arguments
        )

        $command = if ($Arguments.Count -gt 0) { $Arguments[0] } else { '' }
        $operation = if ($Arguments.Count -gt 1) { $Arguments[1] } else { '' }

        if ($command -eq 'keyvault') {
            if ($operation -eq 'show-deleted') {
                $script:showDeletedCalls++
                $mode = $script:scenario.mode

                if ($mode -eq 'protected') {
                    $global:LASTEXITCODE = 0
                    return ($script:scenario.deletedRecord | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'disposable') {
                    if ($script:purgeCalls -gt 0 -and $script:scenario.afterPurgeExists -eq $false) {
                        $global:LASTEXITCODE = 1
                        return 'ERROR: DeletedVaultNotFound'
                    }

                    $global:LASTEXITCODE = 0
                    return ($script:scenario.deletedRecord | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'timeout') {
                    $global:LASTEXITCODE = 0
                    return ($script:scenario.deletedRecord | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'not-found') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: DeletedVaultNotFound'
                }

                if ($mode -eq 'auth-error') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: Please run az login to setup account.'
                }

                if ($mode -eq 'network-error') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: Connection timed out while contacting the management service.'
                }

                if ($mode -eq 'malformed-json') {
                    $global:LASTEXITCODE = 0
                    return '{not valid json'
                }
            }

            if ($operation -eq 'purge') {
                $script:purgeCalls++
                if ($script:scenario.mode -eq 'disposable') {
                    $script:scenario.afterPurgeExists = $false
                }

                if ($script:scenario.mode -eq 'timeout') {
                    $global:LASTEXITCODE = 0
                    return ''
                }

                if ($script:scenario.mode -eq 'auth-error') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: AuthorizationFailed'
                }

                if ($script:scenario.mode -eq 'network-error') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: The request failed due to a network timeout.'
                }

                $global:LASTEXITCODE = 0
                return ''
            }
        }

        $global:LASTEXITCODE = 1
        return "UNEXPECTED AZ CLI INVOCATION: $($Arguments -join ' ')"
    }
}

function Assert-True {
    param(
        [Parameter(Mandatory)]
        [bool]$Condition,

        [Parameter(Mandatory)]
        [string]$Message
    )

    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

$results = [System.Collections.Generic.List[object]]::new()

Configure-AzScenario -Scenario @{
    mode = 'protected'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $true)
    afterPurgeExists = $true
}
$protectedState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($protectedState.Status -eq 'Found' -and $protectedState.PurgeProtectionEnabled -and -not $protectedState.RedeployImmediatelyAvailable) -Message 'Protected vault should report purge protection and no immediate redeploy.'
$protectedResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $protectedResolution.Resolved -and $protectedResolution.PurgeProtectionEnabled -and -not $protectedResolution.RedeployImmediatelyAvailable) -Message 'Protected vault should not purge and should reject immediate redeploy.'
Assert-True -Condition ($script:purgeCalls -eq 0) -Message 'Protected vault should skip the purge call entirely.'
$results.Add([pscustomobject]@{ Name = 'protected'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'disposable'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false)
    afterPurgeExists = $true
}
$disposableResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition ($disposableResolution.Resolved -and $disposableResolution.RedeployImmediatelyAvailable -and $script:purgeCalls -ge 1) -Message 'Disposable vault should purge and report immediate redeploy availability.'
$results.Add([pscustomobject]@{ Name = 'disposable'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'timeout'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false)
    afterPurgeExists = $true
}
$timeoutResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $timeoutResolution.Resolved -and -not $timeoutResolution.RedeployImmediatelyAvailable) -Message 'Timeout should fail closed and keep redeploy unavailable.'
$results.Add([pscustomobject]@{ Name = 'timeout'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'not-found'
    deletedRecord = $null
    afterPurgeExists = $false
}
$notFoundState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($notFoundState.Status -eq 'NotFound' -and $notFoundState.RedeployImmediatelyAvailable) -Message 'Not-found deleted vault should report immediate redeploy availability.'
$results.Add([pscustomobject]@{ Name = 'not-found'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'auth-error'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false)
    afterPurgeExists = $true
}
$authErrorState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($authErrorState.Status -eq 'Unknown' -and -not $authErrorState.RedeployImmediatelyAvailable) -Message 'Auth failures should classify as unknown and fail closed.'
$authErrorResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $authErrorResolution.Resolved -and -not $authErrorResolution.RedeployImmediatelyAvailable) -Message 'Auth failures should not claim immediate redeploy.'
$results.Add([pscustomobject]@{ Name = 'auth-error'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'network-error'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false)
    afterPurgeExists = $true
}
$networkErrorState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($networkErrorState.Status -eq 'Unknown' -and -not $networkErrorState.RedeployImmediatelyAvailable) -Message 'Network errors should classify as unknown and fail closed.'
$results.Add([pscustomobject]@{ Name = 'network-error'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'malformed-json'
    deletedRecord = $null
    afterPurgeExists = $false
}
$malformedJsonState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($malformedJsonState.Status -eq 'Unknown' -and -not $malformedJsonState.RedeployImmediatelyAvailable) -Message 'Malformed Azure payloads should fail closed instead of claiming immediate reuse.'
$results.Add([pscustomobject]@{ Name = 'malformed-json'; Passed = $true })

Write-Host "Key Vault lifecycle validation passed for $($results.Count) scenarios." -ForegroundColor Green
foreach ($result in $results) {
    Write-Host "  - $($result.Name): ok" -ForegroundColor Green
}
