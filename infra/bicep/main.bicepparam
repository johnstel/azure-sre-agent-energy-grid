// =============================================================================
// Bicep Parameters File - Energy Grid SRE Agent Sandbox
// =============================================================================
// Deploy with: az deployment sub create --location eastus2 --template-file main.bicep
// =============================================================================

using 'main.bicep'

// Core parameters are passed by scripts/deploy.ps1 via --parameters

// Observability stack (Grafana + Prometheus)
param deployObservability = true

// Baseline alert rules
param deployAlerts = false

// Deploy Azure SRE Agent (programmatic deployment now supported)
param deploySreAgent = true

// Default action group for incident routing (add webhook at deploy time)
param deployActionGroup = false

// AKS Configuration - cost-optimized for demo
param kubernetesVersion = '1.32'
param systemNodeVmSize = 'Standard_D2s_v5'
param userNodeVmSize = 'Standard_D2s_v5'
param systemNodeCount = 2
param userNodeCount = 3

// Tags
param tags = {
  workload: 'energy-grid-demo'
  environment: 'sandbox'
  managedBy: 'bicep'
  purpose: 'energy-sre-demo'
  costCenter: 'energy-demo-lab'
}
