<#
.SYNOPSIS
    Tears down the Azure SRE Agent Demo Lab infrastructure.

.DESCRIPTION
    This script removes all Azure resources created by the deployment script.
    Use with caution - this action is irreversible!

.PARAMETER ResourceGroupName
    The resource group to delete. Default: rg-srelab-eastus2

.PARAMETER Force
    Skip confirmation prompt

.EXAMPLE
    .\destroy.ps1 -ResourceGroupName "rg-srelab-eastus2"

.EXAMPLE
    .\destroy.ps1 -Force
#>

[CmdletBinding()]
param(
    [Parameter()]
    [string]$ResourceGroupName = "rg-srelab-eastus2",

    [Parameter()]
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot/key-vault-lifecycle.ps1"

$destroyExitCode = 0

Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                    Azure Energy Grid SRE Demo Lab - DESTROY                  ║
║                                                                              ║
║                         ⚠️  WARNING ⚠️                                        ║
║                                                                              ║
║  This will PERMANENTLY DELETE all resources in the resource group!           ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Red

# Check if resource group exists
$rgShowOutput = az group show --name $ResourceGroupName --output json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    if ($rgShowOutput -match '(?i)(ResourceGroupNotFound|resource group.*not found|could not be found)') {
        Write-Host "ℹ️  Resource group '$ResourceGroupName' is already absent. Nothing remains to clean up." -ForegroundColor Green
        exit 0
    }

    Write-Host "❌ Azure CLI could not verify whether resource group '$ResourceGroupName' exists; cleanup safety is unknown." -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($rgShowOutput)) {
        Write-Host "   $($rgShowOutput.Trim())" -ForegroundColor Gray
    }
    exit 1
}

if ([string]::IsNullOrWhiteSpace($rgShowOutput)) {
    Write-Host "❌ Azure CLI returned an empty response while checking '$ResourceGroupName'; cleanup safety is unknown." -ForegroundColor Red
    exit 1
}

try {
    $rg = $rgShowOutput | ConvertFrom-Json
}
catch {
    Write-Host "❌ Azure CLI returned an unexpected resource-group payload for '$ResourceGroupName'; cleanup safety is unknown." -ForegroundColor Red
    exit 1
}

Write-Host "📋 Resource Group: $ResourceGroupName" -ForegroundColor White
Write-Host "📍 Location: $($rg.location)" -ForegroundColor White

# List resources
Write-Host "`n📦 Resources to be deleted:" -ForegroundColor Yellow
$resourcesOutput = az resource list --resource-group $ResourceGroupName --output json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($resourcesOutput)) {
    Write-Host "❌ Unable to list resources under '$ResourceGroupName'; aborting destroy because cleanup safety is unknown." -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($resourcesOutput)) {
        Write-Host "   $($resourcesOutput.Trim())" -ForegroundColor Gray
    }
    exit 1
}

try {
    $resources = $resourcesOutput | ConvertFrom-Json
}
catch {
    Write-Host "❌ Azure CLI returned an unexpected resource list for '$ResourceGroupName'; aborting destroy because cleanup safety is unknown." -ForegroundColor Red
    exit 1
}

foreach ($resource in $resources) {
    Write-Host "   • $($resource.type) - $($resource.name)" -ForegroundColor Gray
}

$keyVaultNames = @($resources | Where-Object { $_.type -eq 'Microsoft.KeyVault/vaults' } | ForEach-Object { $_.name })
$preDeleteKeyVaultStates = @{}
foreach ($keyVaultName in $keyVaultNames) {
    $preDeleteKeyVaultStates[$keyVaultName] = Get-KeyVaultActiveVaultState -VaultName $keyVaultName -ResourceGroupName $ResourceGroupName
}

Write-Host "`n  Total: $($resources.Count) resources" -ForegroundColor White

# Confirmation
if (-not $Force) {
    Write-Host "`n⚠️  This action cannot be undone!" -ForegroundColor Red
    $confirm = Read-Host "Type 'DELETE' to confirm"

    if ($confirm -ne 'DELETE') {
        Write-Host "`nDestroy cancelled." -ForegroundColor Green
        exit 0
    }
}

# Delete resource group
Write-Host "`n🗑️  Deleting resource group '$ResourceGroupName'..." -ForegroundColor Yellow
Write-Host "   This may take several minutes..." -ForegroundColor Gray

$deleteOutput = az group delete --name $ResourceGroupName --yes --no-wait 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`n❌ Failed to submit resource-group deletion for '$ResourceGroupName'." -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($deleteOutput)) {
        Write-Host "   $($deleteOutput.Trim())" -ForegroundColor Gray
    }
    exit 1
}

Write-Host "`n✅ Resource group deletion initiated." -ForegroundColor Green
Write-Host "   The deletion is running in the background." -ForegroundColor Gray
Write-Host "   Check Azure Portal for status." -ForegroundColor Gray

$groupDeleted = $false
if ($keyVaultNames.Count -gt 0) {
    Write-Host "`n🔐 Waiting for resource group deletion so Key Vault names can be checked..." -ForegroundColor Yellow
    $deadline = (Get-Date).AddMinutes(20)

    do {
        $groupExists = az group exists --name $ResourceGroupName --output tsv 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0 -and $groupExists.Trim() -eq 'false') {
            $groupDeleted = $true
            break
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "   ⚠️  Azure CLI could not confirm whether '$ResourceGroupName' has finished deleting. Cleanup safety remains unknown." -ForegroundColor Yellow
            $destroyExitCode = 1
            break
        }

        Start-Sleep -Seconds 10
    } while ((Get-Date) -lt $deadline)

    if ($groupDeleted) {
        Write-Host "  ✅ Resource group deleted" -ForegroundColor Green
        Write-Host "`n🧹 Evaluating deleted Key Vault records for purge-protection and same-name reuse status..." -ForegroundColor Yellow

        $sameNameRedeployAvailable = $true
        foreach ($keyVaultName in $keyVaultNames) {
            $preDeleteState = if ($preDeleteKeyVaultStates.ContainsKey($keyVaultName)) { $preDeleteKeyVaultStates[$keyVaultName] } else { [pscustomobject]@{ Status = 'Unknown'; PurgeProtectionEnabled = $false } }
            $deletedState = Wait-ForKeyVaultDeletedState -VaultName $keyVaultName -Location $($rg.location) -WaitSeconds 120 -PollingIntervalSeconds 5

            if ($deletedState.Status -eq 'Unknown') {
                $sameNameRedeployAvailable = $false
                $destroyExitCode = 1
                Write-Host "   ⚠️  $($deletedState.Message)" -ForegroundColor Yellow
                continue
            }

            if ($deletedState.Status -eq 'NotFound') {
                if ($preDeleteState.Status -eq 'Found' -and $preDeleteState.PurgeProtectionEnabled) {
                    $sameNameRedeployAvailable = $false
                    $destroyExitCode = 1
                    Write-Host "   ⚠️  $keyVaultName had purge protection enabled before deletion, but Azure did not confirm a retained deleted-vault record after the delete. Same-name redeploy remains unavailable until the retained state is authoritatively confirmed." -ForegroundColor Yellow
                    continue
                }

                Write-Host "   ✅ $keyVaultName is already cleared from the deleted-vault cache. Same-name redeploy is available." -ForegroundColor Green
                continue
            }

            if ($deletedState.PurgeProtectionEnabled) {
                $sameNameRedeployAvailable = $false
                $destroyExitCode = 1
                if ($null -ne $deletedState.RetainedUntil) {
                    Write-Host "   🛡️  $keyVaultName is retained by purge protection until $($deletedState.RetainedUntil.ToString('yyyy-MM-ddTHH:mm:ssK')). Same-name redeploy is unavailable until retention expires." -ForegroundColor Yellow
                }
                else {
                    Write-Host "   🛡️  $keyVaultName is retained by purge protection. Azure did not report a scheduled purge date, so same-name redeploy remains unavailable until the retention window is authoritatively confirmed." -ForegroundColor Yellow
                }
                continue
            }

            $purgeResult = Resolve-KeyVaultPurgeForReuse -VaultName $keyVaultName -Location $($rg.location) -WaitSeconds 120 -PollingIntervalSeconds 5
            if ($purgeResult.Resolved) {
                Write-Host "   ✅ Purged $keyVaultName. Same-name redeploy is available." -ForegroundColor Green
            }
            else {
                $sameNameRedeployAvailable = $false
                $destroyExitCode = 1
                Write-Host "   ⚠️  $($purgeResult.Message)" -ForegroundColor Yellow
            }
        }

        if ($sameNameRedeployAvailable) {
            Write-Host "`n🔐 Key Vault name reuse status: same-name redeploy is available immediately." -ForegroundColor Green
        }
        else {
            Write-Host "`n🔐 Key Vault name reuse status: same-name redeploy remains unavailable because at least one deleted vault is retained by purge protection or could not be verified safe for reuse." -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "  ⚠️  Resource group deletion is still in progress or not verified complete. Key Vault safety checks were not completed; cleanup is incomplete." -ForegroundColor Yellow
        $destroyExitCode = 1
    }
}

# Clean up local files
Write-Host "`n🧹 Cleaning up local files..." -ForegroundColor Yellow

$outputsFile = Join-Path $PSScriptRoot "deployment-outputs.json"
if (Test-Path $outputsFile) {
    Remove-Item $outputsFile -Force
    Write-Host "   ✅ Removed deployment-outputs.json" -ForegroundColor Green
}

# Remove kubectl context
Write-Host "`n🔑 Cleaning up kubectl context..." -ForegroundColor Yellow
$aksName = "aks-*"  # Match any AKS cluster name pattern
kubectl config delete-context $aksName 2>$null
Write-Host "   ✅ kubectl context cleaned up" -ForegroundColor Green

if ($destroyExitCode -ne 0) {
    Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                    Cleanup failed or is incomplete. ⚠️                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  At least one Key Vault record remains retained or could not be verified safe  ║
║  for same-name reuse. Resolve the Azure-side retention state before retrying. ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Red
    exit $destroyExitCode
}

Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                        Cleanup Complete! 🧹                                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  The resource group deletion has been submitted.                             ║
║  Monitor progress in Azure Portal or run:                                    ║
║                                                                              ║
║    az group show --name $($ResourceGroupName.PadRight(39))║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan
exit 0
