<#
.SYNOPSIS
    Configures RBAC permissions for Azure SRE Agent and related services.

.DESCRIPTION
    This script assigns necessary RBAC roles that cannot be reliably assigned
    through Bicep due to subscription policy restrictions.
    
    Includes:
    - SRE Agent roles (when SRE Agent is created)
    - Contributor access for managed identities (High access level only)
    - Key Vault access roles

.PARAMETER ResourceGroupName
    The resource group containing the deployed resources

.PARAMETER SreAgentPrincipalId
    Object ID of the SRE Agent managed identity (if already created)

.PARAMETER CurrentUserPrincipalId
    Object ID of the current user for admin access

.PARAMETER SreAgentAccessLevel
    Access level for SRE Agent role assignments.
    'Low'  (default) — Reader + Log Analytics Reader only. Diagnosis-only; safe for external/customer-facing demos.
    'High' — adds Contributor at RG scope + AKS admin roles. Required for remediation demos.
    Must match the accessLevel used in Bicep (main.bicepparam: sreAgentAccessLevel).

.EXAMPLE
    # External/diagnosis-only demo (default):
    .\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>"

.EXAMPLE
    # Internal remediation demo:
    .\configure-rbac.ps1 -ResourceGroupName "rg-srelab-eastus2" -SreAgentPrincipalId "<id>" -SreAgentAccessLevel High

.NOTES
    This script is idempotent - safe to run multiple times.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter()]
    [string]$SreAgentPrincipalId,

    [Parameter()]
    [string]$CurrentUserPrincipalId,

    [Parameter()]
    [ValidateSet('High', 'Low')]
    [string]$SreAgentAccessLevel = 'Low'
)

$ErrorActionPreference = 'Stop'

Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                    Azure RBAC Configuration Script                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

# Get current user if not provided
if (-not $CurrentUserPrincipalId) {
    Write-Host "🔍 Getting current user principal ID..." -ForegroundColor Yellow
    $account = az ad signed-in-user show --output json 2>$null | ConvertFrom-Json
    if ($account) {
        $CurrentUserPrincipalId = $account.id
        Write-Host "  ✅ Current user: $($account.displayName) ($CurrentUserPrincipalId)" -ForegroundColor Green
    }
    else {
        Write-Host "  ⚠️  Could not determine current user. Some role assignments may be skipped." -ForegroundColor Yellow
    }
}

# Get resource group info
Write-Host "`n🔍 Getting resource group information..." -ForegroundColor Yellow
$rg = az group show --name $ResourceGroupName --output json 2>$null | ConvertFrom-Json

if (-not $rg) {
    Write-Error "Resource group '$ResourceGroupName' not found"
    exit 1
}

Write-Host "  ✅ Resource Group: $ResourceGroupName" -ForegroundColor Green
Write-Host "  📍 Location: $($rg.location)" -ForegroundColor Gray

# Get subscription ID
$subscriptionId = (az account show --output json | ConvertFrom-Json).id

# Function to assign role with error handling
function Set-RoleAssignment {
    param(
        [string]$Scope,
        [string]$RoleDefinition,
        [string]$PrincipalId,
        [string]$PrincipalType = "ServicePrincipal",
        [string]$Description
    )
    
    if (-not $PrincipalId) {
        Write-Host "    ⏭️  Skipping: No principal ID provided" -ForegroundColor Gray
        return
    }
    
    Write-Host "    📋 $Description" -ForegroundColor White
    
    # Check if assignment already exists
    $existing = az role assignment list `
        --scope $Scope `
        --role $RoleDefinition `
        --assignee $PrincipalId `
        --output json 2>$null | ConvertFrom-Json

    if ($existing -and $existing.Count -gt 0) {
        Write-Host "       ✅ Already assigned" -ForegroundColor Green
        return
    }

    try {
        az role assignment create `
            --scope $Scope `
            --role $RoleDefinition `
            --assignee-object-id $PrincipalId `
            --assignee-principal-type $PrincipalType `
            --output none 2>$null
        
        Write-Host "       ✅ Assigned successfully" -ForegroundColor Green
    }
    catch {
        Write-Host "       ⚠️  Failed to assign: $_" -ForegroundColor Yellow
        Write-Host "          This may be due to subscription policies." -ForegroundColor Gray
    }
}

# Get AKS cluster info
Write-Host "`n🔍 Getting AKS cluster information..." -ForegroundColor Yellow
$aksCluster = az aks list --resource-group $ResourceGroupName --output json 2>$null | ConvertFrom-Json | Select-Object -First 1

if ($aksCluster) {
    $aksIdentityPrincipalId = $aksCluster.identityProfile.kubeletidentity.objectId
    $aksControlPlaneIdentity = $aksCluster.identity.principalId
    
    Write-Host "  ✅ AKS Cluster: $($aksCluster.name)" -ForegroundColor Green
    Write-Host "     Kubelet Identity: $aksIdentityPrincipalId" -ForegroundColor Gray
    Write-Host "     Control Plane Identity: $aksControlPlaneIdentity" -ForegroundColor Gray
}

# Assign roles
Write-Host "`n🔐 Assigning RBAC roles..." -ForegroundColor Yellow

# 1. AKS Cluster Admin for current user
if ($CurrentUserPrincipalId) {
    Write-Host "`n  📌 AKS Cluster Access:" -ForegroundColor Cyan
    Set-RoleAssignment `
        -Scope "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroupName" `
        -RoleDefinition "Azure Kubernetes Service Cluster Admin Role" `
        -PrincipalId $CurrentUserPrincipalId `
        -PrincipalType "User" `
        -Description "AKS Cluster Admin Role for current user"
    
    Set-RoleAssignment `
        -Scope "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroupName" `
        -RoleDefinition "Azure Kubernetes Service RBAC Cluster Admin" `
        -PrincipalId $CurrentUserPrincipalId `
        -PrincipalType "User" `
        -Description "AKS RBAC Cluster Admin for current user"
}

# 2. Key Vault roles
$keyVault = az keyvault list --resource-group $ResourceGroupName --output json 2>$null | ConvertFrom-Json | Select-Object -First 1

if ($keyVault -and $CurrentUserPrincipalId) {
    Write-Host "`n  📌 Key Vault Access:" -ForegroundColor Cyan
    Set-RoleAssignment `
        -Scope $keyVault.id `
        -RoleDefinition "Key Vault Administrator" `
        -PrincipalId $CurrentUserPrincipalId `
        -PrincipalType "User" `
        -Description "Key Vault Administrator for current user"
}

# 3. SRE Agent roles (if SRE Agent is already created)
if ($SreAgentPrincipalId) {
    Write-Host "`n  📌 SRE Agent Access:" -ForegroundColor Cyan
    
    # SRE Agent needs Contributor on the resource group to diagnose AND remediate issues.
    # H-3 (issue #57): Contributor at RG scope is gated behind SreAgentAccessLevel = 'High'.
    # For diagnosis-only / external demos, use SreAgentAccessLevel = 'Low' — the Bicep module
    # will assign Reader + Log Analytics Reader only, and this script skips all write grants.
    if ($SreAgentAccessLevel -eq 'High') {
        Set-RoleAssignment `
            -Scope "/subscriptions/$subscriptionId/resourceGroups/$ResourceGroupName" `
            -RoleDefinition "Contributor" `
            -PrincipalId $SreAgentPrincipalId `
            -PrincipalType "ServicePrincipal" `
            -Description "Contributor for SRE Agent (High access: read/write for remediation demos)"
    }
    else {
        Write-Host "    ℹ️  Contributor grant skipped (SreAgentAccessLevel = Low; diagnosis-only profile)" -ForegroundColor Gray
    }
    
    # Reader on subscription for broader context
    Set-RoleAssignment `
        -Scope "/subscriptions/$subscriptionId" `
        -RoleDefinition "Reader" `
        -PrincipalId $SreAgentPrincipalId `
        -PrincipalType "ServicePrincipal" `
        -Description "Reader for SRE Agent at subscription level"
    
    # AKS-specific roles for Kubernetes operations (restart pods, scale, etc.)
    if ($aksCluster) {
        if ($SreAgentAccessLevel -eq 'High') {
            Write-Host "`n  📌 SRE Agent AKS Access (High):" -ForegroundColor Cyan
            
            # Azure Kubernetes Service Cluster Admin - allows kubectl access
            Set-RoleAssignment `
                -Scope $aksCluster.id `
                -RoleDefinition "Azure Kubernetes Service Cluster Admin Role" `
                -PrincipalId $SreAgentPrincipalId `
                -PrincipalType "ServicePrincipal" `
                -Description "AKS Cluster Admin for SRE Agent (kubectl access)"
            
            # Azure Kubernetes Service RBAC Cluster Admin - full K8s RBAC permissions
            Set-RoleAssignment `
                -Scope $aksCluster.id `
                -RoleDefinition "Azure Kubernetes Service RBAC Cluster Admin" `
                -PrincipalId $SreAgentPrincipalId `
                -PrincipalType "ServicePrincipal" `
                -Description "AKS RBAC Cluster Admin for SRE Agent (full K8s permissions)"
            
            # Azure Kubernetes Service Contributor - manage AKS resource itself
            Set-RoleAssignment `
                -Scope $aksCluster.id `
                -RoleDefinition "Azure Kubernetes Service Contributor Role" `
                -PrincipalId $SreAgentPrincipalId `
                -PrincipalType "ServicePrincipal" `
                -Description "AKS Contributor for SRE Agent (scale nodes, update config)"
        }
        else {
            Write-Host "`n  📌 SRE Agent AKS Access (Low — read-only):" -ForegroundColor Cyan
            Write-Host "    ℹ️  AKS write roles skipped (SreAgentAccessLevel = Low; diagnosis-only profile)" -ForegroundColor Gray
            Write-Host "    ℹ️  SRE Agent can still query cluster metadata via Reader role from Bicep." -ForegroundColor Gray
        }
    }
    
    # Log Analytics access for querying logs
    $logAnalytics = az monitor log-analytics workspace list --resource-group $ResourceGroupName --output json 2>$null | ConvertFrom-Json | Select-Object -First 1
    if ($logAnalytics) {
        Set-RoleAssignment `
            -Scope $logAnalytics.id `
            -RoleDefinition "Log Analytics Reader" `
            -PrincipalId $SreAgentPrincipalId `
            -PrincipalType "ServicePrincipal" `
            -Description "Log Analytics Reader for SRE Agent (query logs)"
    }

    # Application Insights read access for telemetry correlation
    $appInsights = az resource list --resource-group $ResourceGroupName --resource-type "Microsoft.Insights/components" --output json 2>$null | ConvertFrom-Json | Select-Object -First 1
    if ($appInsights) {
        Set-RoleAssignment `
            -Scope $appInsights.id `
            -RoleDefinition "Monitoring Reader" `
            -PrincipalId $SreAgentPrincipalId `
            -PrincipalType "ServicePrincipal" `
            -Description "Monitoring Reader for SRE Agent on Application Insights"
    }

    # Azure Monitor Workspace access for managed Prometheus metrics
    $azureMonitorWorkspace = az resource list --resource-group $ResourceGroupName --resource-type "Microsoft.Monitor/accounts" --output json 2>$null | ConvertFrom-Json | Select-Object -First 1
    if ($azureMonitorWorkspace) {
        Set-RoleAssignment `
            -Scope $azureMonitorWorkspace.id `
            -RoleDefinition "Monitoring Reader" `
            -PrincipalId $SreAgentPrincipalId `
            -PrincipalType "ServicePrincipal" `
            -Description "Monitoring Reader for SRE Agent on Azure Monitor Workspace"
    }
    
    # Key Vault access for secrets management
    # M-8: Downgraded from Key Vault Secrets Officer to Key Vault Secrets User.
    # Secrets User (read-only: get/list) is sufficient for SRE Agent to surface
    # configuration issues during diagnosis. If a demo flow requires SRE Agent to
    # rotate or set secrets as part of a remediation action, temporarily grant
    # Key Vault Secrets Officer manually for that session and revoke afterwards.
    if ($keyVault) {
        Set-RoleAssignment `
            -Scope $keyVault.id `
            -RoleDefinition "Key Vault Secrets User" `
            -PrincipalId $SreAgentPrincipalId `
            -PrincipalType "ServicePrincipal" `
            -Description "Key Vault Secrets User for SRE Agent (read secrets; least-privilege)"
    }
    
    # Container Registry access
    $acr = az acr list --resource-group $ResourceGroupName --output json 2>$null | ConvertFrom-Json | Select-Object -First 1
    if ($acr) {
        Set-RoleAssignment `
            -Scope $acr.id `
            -RoleDefinition "AcrPull" `
            -PrincipalId $SreAgentPrincipalId `
            -PrincipalType "ServicePrincipal" `
            -Description "ACR Pull for SRE Agent (pull images)"
    }
}

# 4. Grafana roles (if Grafana is deployed)
$grafanaJson = az grafana list --resource-group $ResourceGroupName --output json 2>$null
$grafana = $null
if ($grafanaJson -and $grafanaJson -match '^\s*\[') {
    try {
        $grafana = $grafanaJson | ConvertFrom-Json | Select-Object -First 1
    }
    catch {
        # Ignore JSON parsing errors - Grafana likely not deployed
    }
}

if ($grafana) {
    Write-Host "`n  📌 Grafana Access:" -ForegroundColor Cyan
    $grafanaPrincipalId = $grafana.identity.principalId
    
    Set-RoleAssignment `
        -Scope "/subscriptions/$subscriptionId" `
        -RoleDefinition "Monitoring Reader" `
        -PrincipalId $grafanaPrincipalId `
        -PrincipalType "ServicePrincipal" `
        -Description "Monitoring Reader for Grafana"
    
    if ($CurrentUserPrincipalId) {
        Set-RoleAssignment `
            -Scope $grafana.id `
            -RoleDefinition "Grafana Admin" `
            -PrincipalId $CurrentUserPrincipalId `
            -PrincipalType "User" `
            -Description "Grafana Admin for current user"
    }
}

# Final summary
if ($SreAgentPrincipalId) {
    Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                      RBAC Configuration Complete ✅                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  SRE Agent managed identity roles were configured in this run.              ║
║                                                                              ║
║  SRE Agent RBAC Roles (assigned via Azure Portal):                           ║
║  • SRE Agent Admin - Full access to create/manage agent                     ║
║  • SRE Agent Standard User - Chat and diagnose capabilities                 ║
║  • SRE Agent Reader - View-only access                                      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan
}
else {
    Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                      RBAC Configuration Complete ✅                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  To configure SRE Agent resource roles in a standalone run:                 ║
║                                                                              ║
║  1. Get the SRE Agent managed identity Object ID                            ║
║  2. Re-run this script with -SreAgentPrincipalId                            ║
║                                                                              ║
║     .\configure-rbac.ps1 -ResourceGroupName "$ResourceGroupName" ``
║         -SreAgentPrincipalId "<object-id>"                                   ║
║                                                                              ║
║  SRE Agent RBAC Roles (assigned via Azure Portal):                           ║
║  • SRE Agent Admin - Full access to create/manage agent                     ║
║  • SRE Agent Standard User - Chat and diagnose capabilities                 ║
║  • SRE Agent Reader - View-only access                                      ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan
}
