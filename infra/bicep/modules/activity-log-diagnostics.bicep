// =============================================================================
// Activity Log Diagnostics Module
// =============================================================================
// Exports subscription-level Activity Log to Log Analytics for SRE Agent
// audit trail and ARM operation visibility.
//
// Wave 1 requirement: Enable full Activity Log export for observable foundation
// See: docs/CAPABILITY-CONTRACTS.md §11
// =============================================================================

targetScope = 'subscription'

@description('Name of the diagnostic setting')
param diagnosticSettingName string = 'activity-log-to-la'

@description('Log Analytics workspace resource ID (full ARM ID)')
param logAnalyticsWorkspaceId string

// =============================================================================
// RESOURCES
// =============================================================================

resource activityLogDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: diagnosticSettingName
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'Administrative'
        enabled: true
      }
      {
        category: 'Security'
        enabled: true
      }
      {
        category: 'ServiceHealth'
        enabled: true
      }
      {
        category: 'Alert'
        enabled: true
      }
      {
        category: 'Recommendation'
        enabled: true
      }
      {
        category: 'Policy'
        enabled: true
      }
      {
        category: 'Autoscale'
        enabled: true
      }
      {
        category: 'ResourceHealth'
        enabled: true
      }
    ]
  }
}

// =============================================================================
// OUTPUTS
// =============================================================================

output diagnosticSettingName string = activityLogDiagnostics.name
output diagnosticSettingId string = activityLogDiagnostics.id
