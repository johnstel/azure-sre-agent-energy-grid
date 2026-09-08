$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'key-vault-lifecycle.ps1')

$script:scenario = $null
$script:showDeletedCalls = 0
$script:purgeCalls = 0
$script:showDeletedSequence = @()

function New-KeyVaultDeletedRecord {
    param(
        [Parameter()]
        [bool]$PurgeProtectionEnabled = $false,

        [Parameter()]
        [string]$ScheduledPurgeDate = ''
    )

    $record = [pscustomobject]@{
        name = 'test-vault'
        location = 'eastus2'
        properties = [pscustomobject]@{
            purgeProtectionEnabled = $PurgeProtectionEnabled
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($ScheduledPurgeDate)) {
        $record.properties | Add-Member -NotePropertyName 'scheduledPurgeDate' -NotePropertyValue $ScheduledPurgeDate
    }

    return $record
}

function Configure-AzScenario {
    param(
        [Parameter(Mandatory)]
        [hashtable]$Scenario
    )

    $script:scenario = $Scenario
    $script:showDeletedCalls = 0
    $script:purgeCalls = 0
    $script:showDeletedSequence = @()

    if ($Scenario.ContainsKey('showDeletedResponses')) {
        $script:showDeletedSequence = @($Scenario.showDeletedResponses)
    }

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

                if ($script:showDeletedSequence.Count -gt 0) {
                    $response = $script:showDeletedSequence[0]
                    $script:showDeletedSequence = @($script:showDeletedSequence | Select-Object -Skip 1)
                    $global:LASTEXITCODE = [int]$response.ExitCode
                    return [string]$response.Text
                }

                $mode = $script:scenario.mode
                if ($mode -eq 'protected') {
                    $global:LASTEXITCODE = 0
                    return ((New-KeyVaultDeletedRecord -PurgeProtectionEnabled $true -ScheduledPurgeDate '2037-01-01T00:00:00Z') | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'protected-race') {
                    if ($script:showDeletedCalls -eq 1) {
                        $global:LASTEXITCODE = 1
                        return 'ERROR: DeletedVaultNotFound'
                    }

                    $global:LASTEXITCODE = 0
                    return ((New-KeyVaultDeletedRecord -PurgeProtectionEnabled $true -ScheduledPurgeDate '2037-01-01T00:00:00Z') | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'disposable') {
                    if ($script:purgeCalls -gt 0) {
                        $global:LASTEXITCODE = 1
                        return 'ERROR: DeletedVaultNotFound'
                    }

                    $global:LASTEXITCODE = 0
                    return ((New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false) | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'timeout') {
                    $global:LASTEXITCODE = 0
                    return ((New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false) | ConvertTo-Json -Depth 20)
                }

                if ($mode -eq 'not-found') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: DeletedVaultNotFound'
                }

                if ($mode -eq 'ambiguous-not-found') {
                    $global:LASTEXITCODE = 1
                    return 'ERROR: The network resource does not exist.'
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
                    $global:LASTEXITCODE = 0
                    return ''
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

Configure-AzScenario -Scenario @{ mode = 'protected' }
$protectedState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($protectedState.Status -eq 'Found' -and $protectedState.PurgeProtectionEnabled -and $protectedState.RetainedUntil -ne $null) -Message 'Protected vault should report purge protection and an authoritative retained-until date.'
$protectedResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $protectedResolution.Resolved -and $protectedResolution.PurgeProtectionEnabled -and -not $protectedResolution.RedeployImmediatelyAvailable) -Message 'Protected vault should not purge and should reject immediate redeploy.'
Assert-True -Condition ($script:purgeCalls -eq 0) -Message 'Protected vault should skip the purge call entirely.'
$results.Add([pscustomobject]@{ Name = 'protected'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'disposable' }
$disposableResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition ($disposableResolution.Resolved -and $disposableResolution.RedeployImmediatelyAvailable -and $script:purgeCalls -ge 1) -Message 'Disposable vault should purge and report immediate redeploy availability.'
$results.Add([pscustomobject]@{ Name = 'disposable'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'timeout' }
$timeoutResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $timeoutResolution.Resolved -and -not $timeoutResolution.RedeployImmediatelyAvailable) -Message 'Timeout should fail closed and keep redeploy unavailable.'
$results.Add([pscustomobject]@{ Name = 'timeout'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'not-found' }
$notFoundState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($notFoundState.Status -eq 'NotFound' -and $notFoundState.RedeployImmediatelyAvailable) -Message 'Not-found deleted vault should report immediate redeploy availability.'
$results.Add([pscustomobject]@{ Name = 'not-found'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'ambiguous-not-found' }
$ambiguousState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($ambiguousState.Status -eq 'Unknown' -and -not $ambiguousState.RedeployImmediatelyAvailable) -Message 'Ambiguous not-found text should classify as unknown and fail closed.'
$results.Add([pscustomobject]@{ Name = 'ambiguous-not-found'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'auth-error' }
$authErrorState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($authErrorState.Status -eq 'Unknown' -and -not $authErrorState.RedeployImmediatelyAvailable) -Message 'Auth failures should classify as unknown and fail closed.'
$authErrorResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $authErrorResolution.Resolved -and -not $authErrorResolution.RedeployImmediatelyAvailable) -Message 'Auth failures should not claim immediate redeploy.'
$results.Add([pscustomobject]@{ Name = 'auth-error'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'network-error' }
$networkErrorState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($networkErrorState.Status -eq 'Unknown' -and -not $networkErrorState.RedeployImmediatelyAvailable) -Message 'Network errors should classify as unknown and fail closed.'
$results.Add([pscustomobject]@{ Name = 'network-error'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'malformed-json' }
$malformedJsonState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition ($malformedJsonState.Status -eq 'Unknown' -and -not $malformedJsonState.RedeployImmediatelyAvailable) -Message 'Malformed Azure payloads should fail closed instead of claiming immediate reuse.'
$results.Add([pscustomobject]@{ Name = 'malformed-json'; Passed = $true })

Configure-AzScenario -Scenario @{ mode = 'protected-race' }
$raceState = Wait-ForKeyVaultDeletedState -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition ($raceState.Status -eq 'Found' -and $raceState.PurgeProtectionEnabled -and $raceState.RetainedUntil -ne $null) -Message 'Protected race should not be resolved as not-found when the deleted record appears later.'
$results.Add([pscustomobject]@{ Name = 'protected-race'; Passed = $true })

Write-Host "Key Vault lifecycle validation passed for $($results.Count) scenarios." -ForegroundColor Green
foreach ($result in $results) {
    Write-Host "  - $($result.Name): ok" -ForegroundColor Green
}
