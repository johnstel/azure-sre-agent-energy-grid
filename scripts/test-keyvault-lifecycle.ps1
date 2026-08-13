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
                $afterPurgeExists = $script:scenario.afterPurgeExists
                if ($script:scenario.mode -eq 'protected') {
                    $global:LASTEXITCODE = 0
                    return ($script:scenario.deletedRecord | ConvertTo-Json -Depth 20)
                }

                if ($script:scenario.mode -eq 'disposable') {
                    if ($script:purgeCalls -gt 0 -and $afterPurgeExists -eq $false) {
                        $global:LASTEXITCODE = 1
                        return "ERROR: DeletedVaultNotFound"
                    }

                    $global:LASTEXITCODE = 0
                    return ($script:scenario.deletedRecord | ConvertTo-Json -Depth 20)
                }

                if ($script:scenario.mode -eq 'timeout') {
                    $global:LASTEXITCODE = 0
                    return ($script:scenario.deletedRecord | ConvertTo-Json -Depth 20)
                }

                if ($script:scenario.mode -eq 'not-found') {
                    $global:LASTEXITCODE = 1
                    return "ERROR: DeletedVaultNotFound"
                }
            }

            if ($operation -eq 'purge') {
                $script:purgeCalls++
                if ($script:scenario.mode -eq 'disposable') {
                    $script:scenario.afterPurgeExists = $false
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
Assert-True -Condition ($protectedState.Found -and $protectedState.PurgeProtectionEnabled -and -not $protectedState.RedeployImmediatelyAvailable) -Message 'Protected vault should report purge protection and no immediate redeploy.'
$protectedResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $protectedResolution.Resolved -and $protectedResolution.PurgeProtectionEnabled -and -not $protectedResolution.RedeployImmediatelyAvailable) -Message 'Protected vault should not purge and should reject immediate redeploy.'
$results.Add([pscustomobject]@{ Name = 'protected'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'disposable'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false)
    afterPurgeExists = $true
}
$disposableResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition ($disposableResolution.Resolved -and $disposableResolution.RedeployImmediatelyAvailable) -Message 'Disposable vault should purge and report immediate redeploy availability.'
$results.Add([pscustomobject]@{ Name = 'disposable'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'timeout'
    deletedRecord = (New-KeyVaultDeletedRecord -PurgeProtectionEnabled $false)
    afterPurgeExists = $true
}
$timeoutResolution = Resolve-KeyVaultPurgeForReuse -VaultName 'test-vault' -Location 'eastus2' -WaitSeconds 1 -PollingIntervalSeconds 0
Assert-True -Condition (-not $timeoutResolution.Resolved -and -not $timeoutResolution.RedeployImmediatelyAvailable) -Message 'Observable timeout should fail closed and keep redeploy unavailable.'
$results.Add([pscustomobject]@{ Name = 'timeout'; Passed = $true })

Configure-AzScenario -Scenario @{
    mode = 'not-found'
    deletedRecord = $null
    afterPurgeExists = $false
}
$notFoundState = Get-KeyVaultDeletedVaultState -VaultName 'test-vault' -Location 'eastus2'
Assert-True -Condition (-not $notFoundState.Found -and $notFoundState.RedeployImmediatelyAvailable) -Message 'Not-found deleted vault should report immediate redeploy availability.'
$results.Add([pscustomobject]@{ Name = 'not-found'; Passed = $true })

Write-Host "Key Vault lifecycle validation passed for $($results.Count) scenarios." -ForegroundColor Green
foreach ($result in $results) {
    Write-Host "  - $($result.Name): ok" -ForegroundColor Green
}
