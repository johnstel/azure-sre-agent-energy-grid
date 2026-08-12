// =============================================================================
// Azure SRE Agent Module
// =============================================================================
// Deploys an Azure SRE Agent with managed identity and role assignments.
// Based on: https://github.com/microsoft/sre-agent/tree/main/samples/bicep-deployment
// Resource type: Microsoft.App/agents@2026-01-01
// =============================================================================

@description('Name of the SRE Agent')
param agentName string

@description('Azure region for deployment')
param location string

@description('Tags to apply to resources')
param tags object

@description('The access level for the SRE Agent (High = Reader + Contributor + Log Analytics Reader, Low = Reader + Log Analytics Reader)')
@allowed(['High', 'Low'])
param accessLevel string = 'High'

@description('Application Insights App ID')
param appInsightsAppId string

@description('Application Insights connection string')
param appInsightsConnectionString string

@description('Unique suffix for resource naming')
param uniqueSuffix string

@description('Connect Azure Monitor as the agent incident platform via the documented Microsoft.App/agents incidentManagementConfiguration ARM property (issue #76). This is this repo\'s own selector name -- see incidentManagementConfigurationType for the literal ARM value it maps to. Set to "None" to leave the agent unconnected to any incident platform (the repo Action Group -> Mission Control webhook fallback keeps working either way).')
@allowed(['AzureMonitor', 'None'])
param incidentPlatform string = 'AzureMonitor'

@description('Value written to incidentManagementConfiguration.type when incidentPlatform is "AzureMonitor". The Azure SRE Agent API reference (https://learn.microsoft.com/azure/sre-agent/api-reference#agent-properties) documents this field as an enum: PagerDuty, AzMonitor, ServiceNow, or None. Azure Monitor\'s literal is "AzMonitor", not "AzureMonitor" -- do not change this default without updating that reference.')
@allowed(['AzMonitor', 'PagerDuty', 'ServiceNow', 'None'])
param incidentManagementConfigurationType string = 'AzMonitor'

// =============================================================================
// VARIABLES
// =============================================================================

var identityName = '${agentName}-${uniqueSuffix}'

// Role definition IDs by access level
var roleDefinitions = {
  Low: [
    '92aaf0da-9dab-42b6-94a3-d43ce8d16293' // Log Analytics Reader
    'acdd72a7-3385-48ef-bd42-f606fba81ae7' // Reader
  ]
  High: [
    '92aaf0da-9dab-42b6-94a3-d43ce8d16293' // Log Analytics Reader
    'acdd72a7-3385-48ef-bd42-f606fba81ae7' // Reader
    'b24988ac-6180-42a0-ab88-20f7382dd24c' // Contributor
  ]
}

// Monitoring Contributor is required in addition to the accessLevel matrix above so the agent's
// managed identity can see and acknowledge Azure Monitor alerts once incidentPlatform = 'AzureMonitor'.
// Docs: https://learn.microsoft.com/azure/sre-agent/azure-monitor-alerts ("the agent's managed identity
// has the Monitoring Contributor role on the subscription"). Scoped to this resource group (not the
// subscription) to match the existing least-privilege pattern used by the roleDefinitions map above;
// broaden to subscription scope only if the agent must scan alerts outside this resource group.
var monitoringContributorRoleId = '749f88d5-cbae-40b8-bcfc-e573ddc772fa'

// =============================================================================
// RESOURCES
// =============================================================================

// User-Assigned Managed Identity for SRE Agent
#disable-next-line BCP073
resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityName
  location: location
  tags: tags
  properties: {
    isolationScope: 'Regional'
  }
}

// Role assignments for the managed identity on this resource group
resource roleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (roleId, index) in roleDefinitions[accessLevel]: {
  name: guid(resourceGroup().id, managedIdentity.id, roleId)
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', roleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}]

// Monitoring Contributor so the agent's managed identity can see and acknowledge Azure Monitor
// alerts once connected as the incident platform (issue #76). Only assigned when incidentPlatform
// is enabled, and additive to the accessLevel matrix above regardless of Low/High.
resource monitoringContributorRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (incidentPlatform == 'AzureMonitor') {
  name: guid(resourceGroup().id, managedIdentity.id, monitoringContributorRoleId)
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', monitoringContributorRoleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Base agent properties, always present.
var baseAgentProperties = {
  knowledgeGraphConfiguration: {
    identity: managedIdentity.id
    managedResources: []
  }
  actionConfiguration: {
    accessLevel: accessLevel
    identity: managedIdentity.id
    mode: 'Review'
  }
  logConfiguration: {
    applicationInsightsConfiguration: {
      appId: appInsightsAppId
      connectionString: appInsightsConnectionString
    }
  }
  upgradeChannel: 'Stable'
}

// incidentManagementConfiguration is a documented Microsoft.App/agents ARM property
// (https://learn.microsoft.com/azure/templates/microsoft.app/agents). Azure Monitor does not need
// connectionKey/connectionUrl/oboUser (unlike PagerDuty/ServiceNow connectors) because it
// authenticates with the agent's own managed identity, so only `type` is set here.
var incidentManagementProperties = incidentPlatform == 'AzureMonitor' ? {
  incidentManagementConfiguration: {
    type: incidentManagementConfigurationType
  }
} : {}

// SRE Agent
resource sreAgent 'Microsoft.App/agents@2026-01-01' = {
  name: agentName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned, UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: union(baseAgentProperties, incidentManagementProperties)
  dependsOn: [
    roleAssignments
    monitoringContributorRoleAssignment
  ]
}

// Assign SRE Agent Administrator role to the deployer
// This allows the deploying user to manage the agent in the portal
resource sreAgentAdminRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(sreAgent.id, deployer().objectId, 'e79298df-d852-4c6d-84f9-5d13249d1e55')
  scope: sreAgent
  properties: {
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', 'e79298df-d852-4c6d-84f9-5d13249d1e55') // SRE Agent Administrator
    principalId: deployer().objectId
    principalType: 'User'
  }
}

// =============================================================================
// OUTPUTS
// =============================================================================

output agentName string = sreAgent.name
output agentId string = sreAgent.id
output agentPortalUrl string = 'https://portal.azure.com/#view/Microsoft_Azure_PaasServerless/AgentFrameBlade.ReactView/id/${replace(sreAgent.id, '/', '%2F')}'
output managedIdentityId string = managedIdentity.id
output managedIdentityPrincipalId string = managedIdentity.properties.principalId
output incidentPlatformType string = incidentPlatform
output incidentPlatformConfigured bool = incidentPlatform == 'AzureMonitor'
