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
param kubernetesVersion = '1.34'
param systemNodeVmSize = 'Standard_D2s_v6'
param userNodeVmSize = 'Standard_D2s_v6'
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

// SRE Agent access level. Read-only is the secure default for all deployments.
// 'Low' = Reader + Log Analytics Reader only (diagnosis-only; default for external/unknown contexts).
// 'High' = adds Contributor at RG scope + AKS admin roles for internal remediation demos only.
// Keep High explicit by parameter or switch; do not rely on an implicit fallback.
param sreAgentAccessLevel = 'Low'

// Connect Azure Monitor as the SRE Agent incident platform (issue #76).
// This wires the documented Microsoft.App/agents incidentManagementConfiguration ARM property and
// grants the agent's managed identity Monitoring Contributor on this resource group, so Azure Monitor
// alerts on Energy Grid resources become visible to the agent. The response plan itself (severity/title
// filter, Review-mode autonomy, reinvestigation cooldown) is NOT exposed by this ARM resource -- run
// scripts/configure-sre-agent-incident-response.ps1 after deployment, which automates what it can via
// the Azure MCP Server and prints exact portal steps for anything that remains portal-only.
// The existing Action Group -> Mission Control webhook fallback keeps working regardless of this value.
//
// ⚠️ UPGRADING AN EXISTING DEPLOYMENT: redeploying with this parameter set (the default) connects
// Azure Monitor on an agent that previously had no incident platform configured. Microsoft Learn
// documents that connecting a platform auto-creates a "Quickstart" response plan, and that new
// response plans default to Autonomous mode, not Review. Run
// scripts/configure-sre-agent-incident-response.ps1 (or check the portal) IMMEDIATELY after
// redeploying to confirm or delete the Quickstart plan, before any alert can fire. Set this to
// 'None' first if you want to stage the Bicep change without connecting the platform yet.
param sreAgentIncidentPlatform = 'AzureMonitor'

// Tags
param tags = {
  workload: 'energy-grid-demo'
  environment: 'sandbox'
  managedBy: 'bicep'
  purpose: 'energy-sre-demo'
  costCenter: 'energy-demo-lab'
}
