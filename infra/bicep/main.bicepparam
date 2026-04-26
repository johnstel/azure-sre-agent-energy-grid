// =============================================================================
// Bicep Parameters File - Energy Grid SRE Agent Sandbox
// =============================================================================
// Deploy with: az deployment sub create --location eastus2 --template-file main.bicep
// =============================================================================

using 'main.bicep'

// Core parameters are passed by scripts/deploy.ps1 via --parameters

// Observability stack (Grafana + Prometheus)
param deployObservability = true

// Baseline alert rules (Wave 1: enabled for demo)
param deployAlerts = true

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
// New clusters use higher maxPods than AKS's Azure CNI default (30) to leave room for Defender/Retina/monitoring DaemonSets.
// Existing node pools keep their immutable maxPods via scripts/deploy.ps1.
param systemMaxPods = 50
param userMaxPods = 50

// Tags
param tags = {
  workload: 'energy-grid-demo'
  environment: 'sandbox'
  managedBy: 'bicep'
  purpose: 'energy-sre-demo'
  costCenter: 'energy-demo-lab'
}
