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
    description: 'Triggers when telemetry-backed 5xx responses are observed from the repo-owned meter/asset/dispatch services in the energy namespace.'
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
          query: 'AppRequests | where TimeGenerated > ago(10m) | extend namespace = tostring(customDimensions["sre.namespace"]), service = tostring(customDimensions["sre.service"]) | where namespace == "${appNamespace}" | where service in ("meter-service", "asset-service", "dispatch-service") | where toint(ResultCode) >= 500 | summarize Errors = count()'
          timeAggregation: 'Total'
          metricMeasureColumn: 'Errors'
          operator: 'GreaterThanOrEqual'
          threshold: 3
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

resource dependencyFailureAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-dependency-failures'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid - dependency failures'
    description: 'Triggers when repo-owned services report failed MongoDB or RabbitMQ dependencies via Application Insights telemetry.'
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
          query: 'AppDependencies | where TimeGenerated > ago(10m) | extend namespace = tostring(customDimensions["sre.namespace"]), service = tostring(customDimensions["sre.service"]), dependencyType = tostring(DependencyType) | where namespace == "${appNamespace}" | where service in ("meter-service", "asset-service", "dispatch-service") | where dependencyType in~ ("RabbitMQ", "MongoDB") | where Success == false | summarize Failures = count()'
          timeAggregation: 'Total'
          metricMeasureColumn: 'Failures'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'sre.root-cause-category': 'dependency'
        'alert.scenarios': 'mongodb-down,service-mismatch'
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

// =============================================================================
// DEMO-ONLY SLO METER INGEST ALERTS
// =============================================================================
// These rules intentionally use workspace-based Application Insights AppRequests
// rather than AppMetrics histograms. AppRequests preserves one raw SERVER span per
// synthetic transaction, allowing arg_max by correlation ID to calculate raw-run
// success, p95, and freshness without retry/duplicate skew. They are demo signals,
// not production SLA commitments or alert-to-agent automation.

// SLO degradation: the demo target is 95% success in ten minutes. BurnRate is
// failure ratio / 0.05, so a value of 1 means the full error budget is consumed.
resource sloMeterIngestBurnAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-slo-meter-ingest-burn'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid demo - meter ingest SLO burn'
    description: 'Demo-only synthetic meter-ingest degradation: unique AppRequests runs are below the 95% target over 10 minutes. This is not a production SLA claim.'
    enabled: true
    severity: 2
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
          query: '''
            AppRequests
            | where TimeGenerated > ago(10m)
            | where Name == 'slo.meter-ingest.transaction'
            | extend SyntheticName = tostring(Properties['synthetic.name']), SyntheticMode = tostring(Properties['synthetic.mode']), CorrelationId = tostring(Properties['synthetic.correlation_id']), FailureStage = tostring(Properties['synthetic.failure_stage'])
            | where SyntheticName == 'slo-meter-ingest' and SyntheticMode == 'demo'
            | where isnotempty(CorrelationId)
            | summarize arg_max(TimeGenerated, Success, DurationMs, FailureStage) by CorrelationId
            | summarize RunCount = count(), FailedRunCount = countif(Success == false)
            | extend FailureRatio = iff(RunCount > 0, todouble(FailedRunCount) / todouble(RunCount), real(null))
            | extend BurnRate = iff(RunCount > 0, FailureRatio / 0.05, real(null))
            | where RunCount > 0
            | project RunCount, FailedRunCount, FailureRatio, BurnRate
          '''
          timeAggregation: 'Maximum'
          metricMeasureColumn: 'BurnRate'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'alert.contract': 'slo-meter-ingest'
        'alert.scenarios': 'customer-impact'
        'alert.demo-only': 'true'
      })
    })
  }
}

// Customer-impact recovery signal: no Kubernetes readiness proxy is used. The
// AppRequests raw runs determine whether every recent transaction failed or a
// successful transaction is older than the five-minute demo freshness horizon.
resource sloMeterIngestCustomerImpactAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-slo-meter-ingest-customer-impact'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid demo - meter ingest customer impact'
    description: 'Demo-only customer-impact/recovery signal: all recent synthetic meter-ingest runs failed or no successful transaction exists within five minutes. This is not a production SLA claim.'
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
          query: '''
            AppRequests
            | where TimeGenerated > ago(10m)
            | where Name == 'slo.meter-ingest.transaction'
            | extend SyntheticName = tostring(Properties['synthetic.name']), SyntheticMode = tostring(Properties['synthetic.mode']), CorrelationId = tostring(Properties['synthetic.correlation_id']), FailureStage = tostring(Properties['synthetic.failure_stage'])
            | where SyntheticName == 'slo-meter-ingest' and SyntheticMode == 'demo'
            | where isnotempty(CorrelationId)
            | summarize arg_max(TimeGenerated, Success, DurationMs, FailureStage) by CorrelationId
            | summarize RunCount = count(), SuccessfulRunCount = countif(Success == true), LastSuccessfulTransaction = maxif(TimeGenerated, Success == true), LatestCriticalFailure = maxif(TimeGenerated, Success == false and FailureStage in ('persistence_timeout', 'ingress'))
            | extend FreshnessMinutes = iff(isnull(LastSuccessfulTransaction), 9999.0, todouble(datetime_diff('second', now(), LastSuccessfulTransaction)) / 60.0)
            | extend CustomerImpactSignal = iff(RunCount > 0 and (SuccessfulRunCount == 0 or FreshnessMinutes > 5.0 or (not(isnull(LatestCriticalFailure)) and (isnull(LastSuccessfulTransaction) or LastSuccessfulTransaction <= LatestCriticalFailure))), 1, 0)
            | where CustomerImpactSignal == 1
            | project RunCount, SuccessfulRunCount, FreshnessMinutes, LatestCriticalFailure, CustomerImpactSignal
          '''
          timeAggregation: 'Maximum'
          metricMeasureColumn: 'CustomerImpactSignal'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'alert.contract': 'slo-meter-ingest'
        'alert.scenarios': 'customer-impact'
        'alert.demo-only': 'true'
      })
    })
  }
}

// MongoDBDown mapping: raw AppRequests is retained so the synthetic transaction
// p95 remains derivable per unique run; this rule selects persistence-stage failures.
// It does not auto-resolve because no later telemetry must not be called recovery.
resource sloMeterIngestMongoPersistenceAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-slo-meter-ingest-mongodb-down'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid demo - meter ingest MongoDBDown impact'
    description: 'Demo-only synthetic meter-ingest persistence failures mapped to the MongoDBDown scenario from AppRequests failure_stage=persistence_timeout. Verify a post-failure successful transaction before closing this evidence signal. This is not a production SLA claim.'
    enabled: true
    severity: 1
    scopes: [
      logAnalyticsWorkspaceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    autoMitigate: false
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: '''
            AppRequests
            | where TimeGenerated > ago(10m)
            | where Name == 'slo.meter-ingest.transaction'
            | extend SyntheticName = tostring(Properties['synthetic.name']), SyntheticMode = tostring(Properties['synthetic.mode']), CorrelationId = tostring(Properties['synthetic.correlation_id']), FailureStage = tostring(Properties['synthetic.failure_stage'])
            | where SyntheticName == 'slo-meter-ingest' and SyntheticMode == 'demo'
            | where isnotempty(CorrelationId)
            | summarize arg_max(TimeGenerated, Success, DurationMs, FailureStage) by CorrelationId
            | where Success == false and FailureStage == 'persistence_timeout'
            | summarize MongoDBDownFailureRunCount = count()
            | project MongoDBDownFailureRunCount
          '''
          timeAggregation: 'Total'
          metricMeasureColumn: 'MongoDBDownFailureRunCount'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'alert.contract': 'slo-meter-ingest'
        'alert.scenarios': 'MongoDBDown'
        'alert.demo-only': 'true'
      })
    })
  }
}

// ServiceMismatch mapping: raw AppRequests keeps per-run p95 meaningful while
// this rule identifies the ingress failure stage after correlation-ID deduplication.
// It does not auto-resolve because no later telemetry must not be called recovery.
resource sloMeterIngestIngressAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-slo-meter-ingest-service-mismatch'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid demo - meter ingest ServiceMismatch impact'
    description: 'Demo-only synthetic meter-ingest ingress failures mapped to the ServiceMismatch scenario from AppRequests failure_stage=ingress. Verify a post-failure successful transaction before closing this evidence signal. This is not a production SLA claim.'
    enabled: true
    severity: 1
    scopes: [
      logAnalyticsWorkspaceId
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    autoMitigate: false
    skipQueryValidation: true
    criteria: {
      allOf: [
        {
          query: '''
            AppRequests
            | where TimeGenerated > ago(10m)
            | where Name == 'slo.meter-ingest.transaction'
            | extend SyntheticName = tostring(Properties['synthetic.name']), SyntheticMode = tostring(Properties['synthetic.mode']), CorrelationId = tostring(Properties['synthetic.correlation_id']), FailureStage = tostring(Properties['synthetic.failure_stage'])
            | where SyntheticName == 'slo-meter-ingest' and SyntheticMode == 'demo'
            | where isnotempty(CorrelationId)
            | summarize arg_max(TimeGenerated, Success, DurationMs, FailureStage) by CorrelationId
            | where Success == false and FailureStage == 'ingress'
            | summarize ServiceMismatchFailureRunCount = count()
            | project ServiceMismatchFailureRunCount
          '''
          timeAggregation: 'Total'
          metricMeasureColumn: 'ServiceMismatchFailureRunCount'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'alert.contract': 'slo-meter-ingest'
        'alert.scenarios': 'ServiceMismatch'
        'alert.demo-only': 'true'
      })
    })
  }
}

// Telemetry absence is deliberately a warning/unknown visibility signal, never a
// healthy zero. AppRequests raw runs are the p95 authority when telemetry resumes.
resource sloMeterIngestNoDataAlert 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = {
  name: '${namePrefix}-slo-meter-ingest-no-data'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Energy Grid demo - meter ingest telemetry no data'
    description: 'Demo-only warning/unknown signal: no unique synthetic meter-ingest AppRequests transaction was observed in 10 minutes. No data is not reported as healthy.'
    enabled: true
    severity: 2
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
          query: '''
            AppRequests
            | where TimeGenerated > ago(10m)
            | where Name == 'slo.meter-ingest.transaction'
            | extend SyntheticName = tostring(Properties['synthetic.name']), SyntheticMode = tostring(Properties['synthetic.mode']), CorrelationId = tostring(Properties['synthetic.correlation_id'])
            | where SyntheticName == 'slo-meter-ingest' and SyntheticMode == 'demo'
            | where isnotempty(CorrelationId)
            | summarize arg_max(TimeGenerated, Success, DurationMs) by CorrelationId
            | summarize SloTransactionRunCount = count()
            | extend NoDataSignal = iff(SloTransactionRunCount == 0, 1, 0)
            | project SloTransactionRunCount, NoDataSignal
          '''
          timeAggregation: 'Maximum'
          metricMeasureColumn: 'NoDataSignal'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: union(alertActions, {
      customProperties: union(baseCustomProperties, {
        'alert.contract': 'slo-meter-ingest'
        'alert.signal-state': 'warning-unknown-no-data'
        'alert.demo-only': 'true'
      })
    })
  }
}

output podRestartAlertId string = podRestartAlert.id
output http5xxAlertId string = http5xxAlert.id
output dependencyFailureAlertId string = dependencyFailureAlert.id
output podFailureAlertId string = podFailureAlert.id
output crashLoopOomAlertId string = crashLoopOomAlert.id
output sloMeterIngestBurnAlertId string = sloMeterIngestBurnAlert.id
output sloMeterIngestCustomerImpactAlertId string = sloMeterIngestCustomerImpactAlert.id
output sloMeterIngestMongoPersistenceAlertId string = sloMeterIngestMongoPersistenceAlert.id
output sloMeterIngestIngressAlertId string = sloMeterIngestIngressAlert.id
output sloMeterIngestNoDataAlertId string = sloMeterIngestNoDataAlert.id
