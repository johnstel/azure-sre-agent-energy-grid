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

// Optional AKS API server CIDR allowlist for external demos.
// Leave empty to preserve current behavior (public endpoint without IP filtering).
// Example:
// param aksApiServerAuthorizedIpRanges = [
//   '203.0.113.10/32'
//   '198.51.100.0/24'
// ]
param aksApiServerAuthorizedIpRanges = []

// ACR admin account is disabled by default; use role-based auth for pull/push.
param acrAdminUserEnabled = false

// SRE Agent access level for internal remediation demos.
// 'High' = Reader + Log Analytics Reader + Contributor at RG scope (write access for remediation).
// 'Low'  = Reader + Log Analytics Reader only (diagnosis-only; default for external/unknown contexts).
// H-3: 'High' is intentional for the internal demo to allow SRE Agent remediation actions.
// For external/customer-facing demos, omit this parameter or set to 'Low'.
param sreAgentAccessLevel = 'High'

// Tags
param tags = {
  workload: 'energy-grid-demo'
  environment: 'sandbox'
  managedBy: 'bicep'
  purpose: 'energy-sre-demo'
  costCenter: 'energy-demo-lab'
}
