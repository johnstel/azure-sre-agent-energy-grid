// =============================================================================
// Alerts Module
// =============================================================================
// Deploys baseline Azure Monitor scheduled query alerts for the Energy Grid
// platform. These alerts can be connected to action groups for paging/incident
// workflows.
// =============================================================================

@description('Prefix used for alert names')
param namePrefix string

@description('Azure region for deployment')
param location string

@description('Tags to apply to resources')
param tags object

@description('Log Analytics workspace resource ID')
param logAnalyticsWorkspaceId string

@description('Application namespace to monitor')
param appNamespace string = 'energy'

@description('Optional action group resource IDs for alert notifications')
param actionGroupIds array = []

// =============================================================================
// Custom Properties (§1 Telemetry Dimensions from CAPABILITY-CONTRACTS)
// =============================================================================
// All alerts include sre.* custom properties for correlation with scenarios,
// runbooks, and KQL queries. See docs/CAPABILITY-CONTRACTS.md §1.

var baseCustomProperties = {
  source: 'azure-sre-agent-sandbox'
  workload: 'energy-grid'
  'sre.namespace': appNamespace
  'sre.version': '2026-04-25'
}

var alertActions = {
  actionGroups: actionGroupIds
  customProperties: baseCustomProperties
}

// =============================================================================
// ALERT 1: Pod Restart Spike (General Signal)
// =============================================================================
// Broad signal for restart activity. Can correlate with multiple scenarios:
// - oom-killed (OOMKilled → restarts)
// - crash-loop (CrashLoopBackOff → restarts)
// - probe-failure (probe failures → restarts)
//
// Severity: Sev 2 (Warning) - Could be transient or benign restarts

resource podRestartAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-pod-restarts'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid - Pod restart spike'
    description: 'Triggers when restart activity is detected in the energy grid namespace. May correlate with OOMKilled, CrashLoop, or probe failure scenarios.'
    enabled: true
    severity: 2
    scopes: [
      logAnalyticsWorkspaceId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT1M'
    autoMitigate: true
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: 'KubePodInventory | where TimeGenerated > ago(2m) | where Namespace == "${appNamespace}" | where ContainerRestartCount > 0'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'sre.root-cause-category': 'resource-exhaustion,configuration,health-probe'
        'alert.scenarios': 'oom-killed,crash-loop,probe-failure'
      })
    })
  }
}

// =============================================================================
// ALERT 2: HTTP 5xx Spike (Application-Level Signal)
// =============================================================================
// Application error signal - can correlate with multiple scenarios when they
// cause service degradation. Requires App Insights instrumentation.
//
// Severity: Sev 1 (Error) - Application errors affecting users
// May correlate with: mongodb-down, crash-loop, oom-killed

resource http5xxAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-http-5xx'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid - HTTP 5xx spike'
    description: 'Triggers when 5xx request count increases in energy grid App Insights logs. May indicate cascading failures from backend dependencies.'
    enabled: true
    severity: 1
    scopes: [
      logAnalyticsWorkspaceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    autoMitigate: true
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: 'AppRequests | where TimeGenerated > ago(10m) | where toint(ResultCode) >= 500'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 20
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'sre.root-cause-category': 'dependency,configuration,resource-exhaustion'
        'alert.scenarios': 'mongodb-down,crash-loop,oom-killed'
      })
    })
  }
}

// =============================================================================
// ALERT 3: Failed or Pending Pods (Scheduling/Image Issues)
// =============================================================================
// Broad signal for pod scheduling or startup failures. Can correlate with:
// - pending-pods (Scenario 5): insufficient resources, FailedScheduling
// - image-pull-backoff (Scenario 3): ImagePullBackOff
// - missing-config (Scenario 8): CreateContainerConfigError
//
// Severity: Sev 2 (Warning) - Pods not starting but cluster may be functional

resource podFailureAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-pod-failures'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid - Failed or pending pods'
    description: 'Triggers when failed or pending pods are detected. May indicate scheduling issues, image pull failures, or missing configuration.'
    enabled: true
    severity: 2
    scopes: [
      logAnalyticsWorkspaceId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT1M'
    autoMitigate: true
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: 'KubePodInventory | where TimeGenerated > ago(2m) | where Namespace == "${appNamespace}" | where PodStatus in ("Failed", "Pending")'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'sre.root-cause-category': 'scheduling,image,configuration'
        'alert.scenarios': 'pending-pods,image-pull-backoff,missing-config'
      })
    })
  }
}

// =============================================================================
// ALERT 4: CrashLoop/OOM Detected (Scenario-Specific)
// =============================================================================
// Maps to:
// - Scenario 1 (oom-killed): OOMKilled events → meter-service
// - Scenario 2 (crash-loop): CrashLoopBackOff → asset-service
//
// Severity: Sev 1 (Error) - Critical resource/config issue preventing pod startup
// Expected signals: OOMKilled, CrashLoopBackOff, BackOff
// Alert name (manifest): meter-service-oom, asset-service-crash

resource crashLoopOomAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-crashloop-oom'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid - CrashLoop/OOM detected'
    description: 'Triggers when CrashLoopBackOff or OOM-related Kubernetes events are detected. Maps to oom-killed (Scenario 1) and crash-loop (Scenario 2) scenarios.'
    enabled: true
    severity: 1
    scopes: [
      logAnalyticsWorkspaceId
    ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT1M'
    autoMitigate: true
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: 'KubeEvents | where TimeGenerated > ago(2m) | where Namespace == "${appNamespace}" | where Reason in ("BackOff", "OOMKilled", "CrashLoopBackOff")'
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: 0
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'sre.root-cause-category': 'resource-exhaustion,configuration'
        'alert.scenarios': 'oom-killed,crash-loop'
      })
    })
  }
}

output podRestartAlertId string = podRestartAlert.id
output http5xxAlertId string = http5xxAlert.id
output podFailureAlertId string = podFailureAlert.id
output crashLoopOomAlertId string = crashLoopOomAlert.id
