<#
.SYNOPSIS
    Validates that the Azure SRE Agent Energy Grid Demo Lab deployment is healthy.

.DESCRIPTION
    This script checks:
    - Azure resources are provisioned and healthy
    - AKS cluster is reachable
    - All pods in the demo application are running
    - Services have endpoints assigned
    - Basic connectivity tests pass

.PARAMETER ResourceGroupName
    Name of the resource group containing the deployment

.PARAMETER Detailed
    Show detailed output for each check

.EXAMPLE
    .\validate-deployment.ps1 -ResourceGroupName "rg-srelab-eastus2"

.EXAMPLE
    .\validate-deployment.ps1 -ResourceGroupName "rg-srelab-eastus2" -Detailed
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroupName,

    [Parameter()]
    [switch]$Detailed
)

$ErrorActionPreference = 'Continue'

# Colors and formatting
function Write-Check {
    param([string]$Name, [bool]$Passed, [string]$Message = "")
    if ($Passed) {
        Write-Host "  ✅ $Name" -ForegroundColor Green
        if ($Message -and $Detailed) { Write-Host "     $Message" -ForegroundColor Gray }
    }
    else {
        Write-Host "  ❌ $Name" -ForegroundColor Red
        if ($Message) { Write-Host "     $Message" -ForegroundColor Yellow }
    }
    return $Passed
}

function Write-Section {
    param([string]$Title)
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

# Returns the first non-empty DaemonSet list found for the given label selectors (kube-system).
function Get-KubeSystemDaemonSet {
    param([string[]]$LabelSelectors)
    foreach ($selector in $LabelSelectors) {
        $result = kubectl get daemonset -n kube-system -l $selector -o json 2>$null | ConvertFrom-Json
        if ($result -and $result.items.Count -gt 0) {
            return $result
        }
    }
    return $null
}

# Banner
Write-Host @"

╔══════════════════════════════════════════════════════════════════════════════╗
║                   Azure Energy Grid SRE Demo Lab - Validation                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Checking deployment health and readiness...                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$totalChecks = 0
$passedChecks = 0
$maxPodsDriftWarnings = 0

# =============================================================================
# AZURE RESOURCE CHECKS
# =============================================================================
Write-Section "Azure Resources"

# Check resource group exists
$rg = az group show --name $ResourceGroupName --output json 2>$null | ConvertFrom-Json
$totalChecks++
if (Write-Check "Resource Group exists" ($null -ne $rg) "Location: $($rg.location)") {
    $passedChecks++
}

# Get all resources in RG
$resources = az resource list --resource-group $ResourceGroupName --output json 2>$null | ConvertFrom-Json

# Check AKS
$aks = $resources | Where-Object { $_.type -eq "Microsoft.ContainerService/managedClusters" }
$totalChecks++
if (Write-Check "AKS Cluster exists" ($null -ne $aks) $aks.name) {
    $passedChecks++
    
    # Get AKS details
    $aksDetails = az aks show --resource-group $ResourceGroupName --name $aks.name --output json 2>$null | ConvertFrom-Json
    
    $totalChecks++
    if (Write-Check "AKS Cluster is running" ($aksDetails.provisioningState -eq "Succeeded" -and $aksDetails.powerState.code -eq "Running") "State: $($aksDetails.powerState.code)") {
        $passedChecks++
    }
    
    # Check AKS is NOT private (required for SRE Agent)
    $totalChecks++
    $isPublic = -not $aksDetails.apiServerAccessProfile.enablePrivateCluster
    if (Write-Check "AKS API is public (required for SRE Agent)" $isPublic) {
        $passedChecks++
    }
    
    # Store AKS name for later
    $aksName = $aks.name
}

# Check Container Registry
$acr = $resources | Where-Object { $_.type -eq "Microsoft.ContainerRegistry/registries" }
$totalChecks++
if (Write-Check "Container Registry exists" ($null -ne $acr) $acr.name) {
    $passedChecks++
}

# Check Log Analytics
$la = $resources | Where-Object { $_.type -eq "Microsoft.OperationalInsights/workspaces" }
$totalChecks++
if (Write-Check "Log Analytics Workspace exists" ($null -ne $la) $la.name) {
    $passedChecks++
}

# Check App Insights
$ai = $resources | Where-Object { $_.type -eq "Microsoft.Insights/components" }
$totalChecks++
if (Write-Check "Application Insights exists" ($null -ne $ai) $ai.name) {
    $passedChecks++
}

# Check Key Vault
$kv = $resources | Where-Object { $_.type -eq "Microsoft.KeyVault/vaults" }
$totalChecks++
if (Write-Check "Key Vault exists" ($null -ne $kv) $kv.name) {
    $passedChecks++
}

# Check Grafana (optional)
$grafana = $resources | Where-Object { $_.type -eq "Microsoft.Dashboard/grafana" }
if ($grafana) {
    $totalChecks++
    if (Write-Check "Managed Grafana exists" $true $grafana.name) {
        $passedChecks++
    }
}

# =============================================================================
# KUBERNETES CONNECTIVITY
# =============================================================================
Write-Section "Kubernetes Connectivity"

# Get AKS credentials if needed
if ($aksName) {
    Write-Host "  Connecting to AKS cluster..." -ForegroundColor Gray
    az aks get-credentials --resource-group $ResourceGroupName --name $aksName --overwrite-existing 2>$null
}

# Test kubectl connectivity
$null = kubectl cluster-info 2>&1
$totalChecks++
if (Write-Check "kubectl can connect to cluster" ($LASTEXITCODE -eq 0)) {
    $passedChecks++
}

# Check node status
$nodes = kubectl get nodes -o json 2>$null | ConvertFrom-Json
$totalChecks++
$healthyNodes = ($nodes.items | Where-Object { 
        ($_.status.conditions | Where-Object { $_.type -eq "Ready" }).status -eq "True" 
    }).Count
$totalNodes = $nodes.items.Count
if (Write-Check "All nodes are Ready" ($healthyNodes -eq $totalNodes) "$healthyNodes/$totalNodes nodes ready") {
    $passedChecks++
}

# =============================================================================
# NODE POOL MAXPODS CHECK
# =============================================================================
Write-Section "Node Pool maxPods Configuration"

if ($aksName) {
    $nodePools = az aks nodepool list --resource-group $ResourceGroupName --cluster-name $aksName --output json 2>$null | ConvertFrom-Json
    if ($nodePools -and $nodePools.Count -gt 0) {
        Write-Host "`n  Node Pool maxPods (target: 50 after maintenance window):" -ForegroundColor White
        $allAtTarget = $true
        foreach ($pool in $nodePools) {
            $poolName = $pool.name
            $poolMode = $pool.mode
            $poolMaxPods = $pool.maxPods
            $atTarget = $poolMaxPods -ge 50
            $icon = if ($atTarget) { "✅" } else { "⚠️ " }
            $color = if ($atTarget) { "Green" } else { "Yellow" }
            Write-Host "    $icon $poolName  mode=$poolMode  maxPods=$poolMaxPods" -ForegroundColor $color
            if (-not $atTarget) {
                $allAtTarget = $false
                $maxPodsDriftWarnings++
            }
        }

        $totalChecks++
        if ($allAtTarget) {
            if (Write-Check "All node pools maxPods >= 50" $true) {
                $passedChecks++
            }
        }
        else {
            # Warning-only: drift is expected on clusters not yet through the maintenance window.
            # $maxPodsDriftWarnings tracks how many pools need remediation; overall validation still passes.
            Write-Host "  ⚠️  One or more node pools still have maxPods < 50." -ForegroundColor Yellow
            Write-Host "     Run the maintenance-window procedure in docs/AKS-MAXPODS-MAINTENANCE-RUNBOOK.md" -ForegroundColor Gray
            $passedChecks++ # non-blocking: drift warning does not count as a failed check
        }
    }
    else {
        Write-Host "  ℹ️  Could not retrieve node pool list" -ForegroundColor Gray
    }
}
else {
    Write-Host "  ℹ️  Skipped (AKS cluster not found)" -ForegroundColor Gray
}

# =============================================================================
# APPLICATION HEALTH
# =============================================================================
Write-Section "Energy Grid Application (energy namespace)"

# Check if namespace exists
$namespace = kubectl get namespace energy -o json 2>$null | ConvertFrom-Json
$totalChecks++
if (Write-Check "Namespace 'energy' exists" ($null -ne $namespace)) {
    $passedChecks++
}
else {
    Write-Host "  ⚠️  Run: kubectl apply -f k8s/base/application.yaml" -ForegroundColor Yellow
}

# Check pods
if ($namespace) {
    $pods = kubectl get pods -n energy -o json 2>$null | ConvertFrom-Json
    
    if ($pods.items.Count -gt 0) {
        Write-Host "`n  Pod Status:" -ForegroundColor White
        
        foreach ($pod in $pods.items) {
            $podName = $pod.metadata.name
            $phase = $pod.status.phase
            $ready = ($pod.status.containerStatuses | Where-Object { $_.ready -eq $true }).Count
            $total = $pod.status.containerStatuses.Count
            
            $totalChecks++
            $isHealthy = ($phase -eq "Running") -and ($ready -eq $total)
            
            $statusIcon = if ($isHealthy) { "✅" } else { "❌" }
            $statusColor = if ($isHealthy) { "Green" } else { "Red" }
            
            if ($Detailed -or -not $isHealthy) {
                Write-Host "    $statusIcon $podName - $phase ($ready/$total ready)" -ForegroundColor $statusColor
            }
            
            if ($isHealthy) { $passedChecks++ }
        }
        
        # Summary
        $runningPods = ($pods.items | Where-Object { $_.status.phase -eq "Running" }).Count
        Write-Host "`n  Summary: $runningPods/$($pods.items.Count) pods running" -ForegroundColor $(if ($runningPods -eq $pods.items.Count) { "Green" } else { "Yellow" })
    }
    else {
        Write-Host "  ⚠️  No pods found in 'energy' namespace" -ForegroundColor Yellow
        Write-Host "     Run: kubectl apply -f k8s/base/application.yaml" -ForegroundColor Gray
    }
}

# Check services
Write-Host "`n  Services:" -ForegroundColor White
$services = kubectl get svc -n energy -o json 2>$null | ConvertFrom-Json

foreach ($svc in $services.items) {
    $svcName = $svc.metadata.name
    $svcType = $svc.spec.type
    $hasEndpoint = $false
    
    if ($svcType -eq "LoadBalancer") {
        $externalIP = $null
        if ($svc.status.loadBalancer.ingress -and $svc.status.loadBalancer.ingress.Count -gt 0) {
            $externalIP = $svc.status.loadBalancer.ingress[0].ip
        }
        $hasEndpoint = $null -ne $externalIP
        $endpoint = if ($hasEndpoint) { $externalIP } else { "Pending" }
    }
    elseif ($svcType -eq "ClusterIP") {
        $hasEndpoint = $true
        $endpoint = $svc.spec.clusterIP
    }
    else {
        $hasEndpoint = $true
        $endpoint = $svcType
    }
    
    $totalChecks++
    if (Write-Check "$svcName ($svcType)" $hasEndpoint $endpoint) {
        $passedChecks++
    }
}

# Check for grid-dashboard LoadBalancer specifically
$storeFrontSvc = $services.items | Where-Object { $_.metadata.name -eq "grid-dashboard" }
if ($storeFrontSvc -and $storeFrontSvc.spec.type -eq "LoadBalancer") {
    $externalIP = $null
    if ($storeFrontSvc.status.loadBalancer.ingress -and $storeFrontSvc.status.loadBalancer.ingress.Count -gt 0) {
        $externalIP = $storeFrontSvc.status.loadBalancer.ingress[0].ip
    }
    if ($externalIP) {
        Write-Host "`n  🌐 Grid Dashboard URL: http://$externalIP" -ForegroundColor Cyan
    }
}

# =============================================================================
# OBSERVABILITY
# =============================================================================
Write-Section "Observability"

# Check Container Insights
$ciDaemonset = kubectl get daemonset -n kube-system -l component=oms-agent -o json 2>$null | ConvertFrom-Json
if ($ciDaemonset.items.Count -gt 0) {
    $totalChecks++
    $desired = $ciDaemonset.items[0].status.desiredNumberScheduled
    $ready = $ciDaemonset.items[0].status.numberReady
    if (Write-Check "Container Insights agent running" ($ready -eq $desired) "$ready/$desired pods") {
        $passedChecks++
    }
}
else {
    # Azure Monitor Agent (newer)
    $amaDeployment = kubectl get pods -n kube-system -l app=ama-logs -o json 2>$null | ConvertFrom-Json
    if ($amaDeployment.items.Count -gt 0) {
        $totalChecks++
        $running = ($amaDeployment.items | Where-Object { $_.status.phase -eq "Running" }).Count
        if (Write-Check "Azure Monitor Agent running" ($running -gt 0) "$running pods") {
            $passedChecks++
        }
    }
    else {
        Write-Host "  ℹ️  No Container Insights agent detected" -ForegroundColor Gray
    }
}

# =============================================================================
# SECURITY AND OBSERVABILITY ADD-ONS (kube-system)
# =============================================================================
Write-Section "Security and Observability Add-ons (kube-system)"
Write-Host "  Note: All add-ons must be Ready before any node pool maintenance begins." -ForegroundColor Gray

# Microsoft Defender
$defenderDs = Get-KubeSystemDaemonSet @("app=microsoft-defender-collector-ds", "app=microsoft-defender-publisher-ds")
if ($defenderDs) {
    foreach ($ds in $defenderDs.items) {
        $desired = $ds.status.desiredNumberScheduled
        $ready = $ds.status.numberReady
        $totalChecks++
        if (Write-Check "Defender DaemonSet '$($ds.metadata.name)' Ready" ($ready -eq $desired) "$ready/$desired pods") {
            $passedChecks++
        }
    }
}
else {
    Write-Host "  ℹ️  Microsoft Defender not detected (may not be installed)" -ForegroundColor Gray
}

# Retina
$retinaDs = Get-KubeSystemDaemonSet @("k8s-app=retina", "app=retina")
if ($retinaDs) {
    foreach ($ds in $retinaDs.items) {
        $desired = $ds.status.desiredNumberScheduled
        $ready = $ds.status.numberReady
        $totalChecks++
        if (Write-Check "Retina DaemonSet '$($ds.metadata.name)' Ready" ($ready -eq $desired) "$ready/$desired pods") {
            $passedChecks++
        }
    }
}
else {
    Write-Host "  ℹ️  Retina not detected (may not be installed)" -ForegroundColor Gray
}

# Azure Monitor Agent (DaemonSet)
$amaDs = Get-KubeSystemDaemonSet @("app=ama-logs", "component=oms-agent")
if ($amaDs) {
    foreach ($ds in $amaDs.items) {
        $desired = $ds.status.desiredNumberScheduled
        $ready = $ds.status.numberReady
        $totalChecks++
        if (Write-Check "Azure Monitor Agent DaemonSet '$($ds.metadata.name)' Ready" ($ready -eq $desired) "$ready/$desired pods") {
            $passedChecks++
        }
    }
}
else {
    Write-Host "  ℹ️  Azure Monitor Agent DaemonSet not detected (may not be installed)" -ForegroundColor Gray
}

# =============================================================================
# SUMMARY
# =============================================================================
Write-Host "`n"
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor $(if ($passedChecks -eq $totalChecks) { "Green" } else { "Yellow" })
Write-Host "  VALIDATION SUMMARY: $passedChecks/$totalChecks checks passed" -ForegroundColor $(if ($passedChecks -eq $totalChecks) { "Green" } else { "Yellow" })
if ($maxPodsDriftWarnings -gt 0) {
    Write-Host "  ⚠️  maxPods drift warnings: $maxPodsDriftWarnings pool(s) still at maxPods < 50" -ForegroundColor Yellow
    Write-Host "     See docs/AKS-MAXPODS-MAINTENANCE-RUNBOOK.md to schedule remediation." -ForegroundColor Gray
}
Write-Host "══════════════════════════════════════════════════════════════" -ForegroundColor $(if ($passedChecks -eq $totalChecks) { "Green" } else { "Yellow" })

if ($passedChecks -eq $totalChecks) {
    Write-Host @"

✅ All checks passed! Your deployment is healthy.

Next steps:
1. Open SRE Agent: https://aka.ms/sreagent/portal
2. Break something: kubectl apply -f k8s/scenarios/oom-killed.yaml
3. Ask SRE Agent to diagnose!

"@ -ForegroundColor Green
}
else {
    $failedChecks = $totalChecks - $passedChecks
    Write-Host @"

⚠️  $failedChecks check(s) failed. Review the issues above.

Common fixes:
- Deploy application: kubectl apply -f k8s/base/application.yaml
- Wait for pods: kubectl get pods -n energy -w
- Check events: kubectl get events -n energy --sort-by='.lastTimestamp'

"@ -ForegroundColor Yellow
}

# Return exit code
if ($passedChecks -ne $totalChecks) {
    exit 1
}
