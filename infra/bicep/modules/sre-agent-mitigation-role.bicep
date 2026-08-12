// =============================================================================
// SRE Agent — Energy Grid Mitigation Operator custom role (issue #80)
// =============================================================================
// Replaces broad Contributor for the Review-mode mitigation path documented in
// docs/REVIEW-MODE-MITIGATION.md §3 (Layer 3).
//
// The agent needs exactly two control-plane operations to run the one allowlisted
// kubectl action: read the cluster, and obtain a cluster-user kubeconfig. Nothing else.
// Scoped to the AKS resource, NOT the resource group.
//
// The optional dataActions block (Layer 2) is only meaningful when the cluster has
// managed Entra integration with Azure RBAC enabled. Azure RBAC for Kubernetes cannot
// filter by resource name, so the namespace-scoped assignment is the narrowest boundary
// Azure supports here.
// Docs: https://learn.microsoft.com/azure/aks/manage-azure-rbac
// =============================================================================

targetScope = 'resourceGroup'

@description('Name of the AKS cluster the agent may obtain credentials for.')
param aksClusterName string

@description('Principal ID of the SRE Agent user-assigned managed identity.')
param principalId string

@description('Unique suffix used to keep the custom role definition name unique per deployment.')
param uniqueSuffix string

@description('When true, also grant namespace-scoped Kubernetes dataActions. Requires the cluster to have managed Entra integration with Azure RBAC enabled.')
param enableKubernetesDataActions bool = false

@description('Kubernetes namespace the agent may act within when enableKubernetesDataActions is true.')
param namespaceName string = 'energy'

resource aks 'Microsoft.ContainerService/managedClusters@2024-02-01' existing = {
  name: aksClusterName
}

// -----------------------------------------------------------------------------
// Control-plane custom role: read + cluster-user credential ONLY.
// Deliberately excludes listClusterAdminCredential, runCommand, write, and delete.
// -----------------------------------------------------------------------------
resource mitigationRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(aks.id, 'sre-agent-mitigation-operator', uniqueSuffix)
  properties: {
    roleName: 'SRE Agent Energy Grid Mitigation Operator (${uniqueSuffix})'
    description: 'Least-privilege role for the Energy Grid Review-mode mitigation path (issue #80): read the AKS cluster and obtain a cluster-user kubeconfig. Grants no write, no admin credential, and no runCommand.'
    type: 'CustomRole'
    permissions: [
      {
        actions: [
          'Microsoft.ContainerService/managedClusters/read'
          'Microsoft.ContainerService/managedClusters/listClusterUserCredential/action'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
    assignableScopes: [
      aks.id
    ]
  }
}

resource mitigationRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aks.id, principalId, mitigationRole.id)
  scope: aks
  properties: {
    roleDefinitionId: mitigationRole.id
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// Layer 2 (opt-in): namespace-scoped Kubernetes dataActions enforced by the API server.
// -----------------------------------------------------------------------------
resource namespaceRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = if (enableKubernetesDataActions) {
  name: guid(aks.id, 'sre-agent-mitigation-k8s', uniqueSuffix)
  properties: {
    roleName: 'SRE Agent Energy Grid Deployment Scaler (${uniqueSuffix})'
    description: 'Namespace-scoped Kubernetes dataActions permitting the agent to read and scale Deployments in a single namespace. Grants no pod exec, no secret access, and no delete.'
    type: 'CustomRole'
    permissions: [
      {
        actions: []
        notActions: []
        dataActions: [
          'Microsoft.ContainerService/managedClusters/apps/deployments/read'
          'Microsoft.ContainerService/managedClusters/apps/deployments/write'
          'Microsoft.ContainerService/managedClusters/pods/read'
          'Microsoft.ContainerService/managedClusters/services/read'
          'Microsoft.ContainerService/managedClusters/events/read'
        ]
        notDataActions: [
          'Microsoft.ContainerService/managedClusters/secrets/read'
          'Microsoft.ContainerService/managedClusters/pods/exec/action'
        ]
      }
    ]
    assignableScopes: [
      aks.id
    ]
  }
}

resource namespaceRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableKubernetesDataActions) {
  name: guid(aks.id, principalId, 'sre-agent-mitigation-k8s', namespaceName)
  scope: aks
  properties: {
    // Namespace scoping is expressed via the assignment scope path documented for Azure RBAC
    // for Kubernetes Authorization. The deployment script narrows this to
    // <aksResourceId>/namespaces/<namespaceName>; see configure-sre-agent-mitigation-guardrails.ps1.
    roleDefinitionId: namespaceRole!.id
    principalId: principalId
    principalType: 'ServicePrincipal'
    description: 'Namespace-scoped to ${namespaceName} by scripts/configure-sre-agent-mitigation-guardrails.ps1.'
  }
}

// =============================================================================
// OUTPUTS
// =============================================================================

output mitigationRoleDefinitionId string = mitigationRole.id
output mitigationRoleName string = mitigationRole.properties.roleName
output kubernetesDataActionsEnabled bool = enableKubernetesDataActions
output namespaceRoleDefinitionId string = enableKubernetesDataActions ? namespaceRole!.id : ''
