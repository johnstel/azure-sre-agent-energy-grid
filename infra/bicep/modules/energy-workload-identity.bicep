// =============================================================================
// Azure Workload Identity for the energy namespace
// =============================================================================
// Creates a dedicated user-assigned managed identity and federated credential for
// a single Kubernetes service account in the energy namespace. The identity is
// intentionally restricted to read-only Key Vault access for secret consumption.
// =============================================================================

@description('Name of the user-assigned managed identity')
param identityName string

@description('Azure region for the managed identity')
param location string

@description('Tags to apply to the identity resource')
param tags object

@description('OIDC issuer URL from the AKS cluster used for the federated credential')
param aksOidcIssuerUrl string

@description('Resource ID of the target Key Vault for workload secret reads')
param keyVaultResourceId string

@description('Namespace hosting the federated Kubernetes service account')
param serviceAccountNamespace string = 'energy'

@description('Service account name bound to the Azure federated credential')
param serviceAccountName string = 'meter-service'

var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var federatedSubject = 'system:serviceaccount:${serviceAccountNamespace}:${serviceAccountName}'

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: identityName
  location: location
  tags: tags
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: last(split(keyVaultResourceId, '/'))
}

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource federatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = {
  parent: managedIdentity
  name: 'fed-${serviceAccountName}'
  properties: {
    issuer: aksOidcIssuerUrl
    subject: federatedSubject
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

output identityName string = managedIdentity.name
output resourceId string = managedIdentity.id
output clientId string = managedIdentity.properties.clientId
output principalId string = managedIdentity.properties.principalId
output federatedCredentialName string = federatedCredential.name
output federatedSubject string = federatedCredential.properties.subject
output serviceAccountNamespace string = serviceAccountNamespace
output serviceAccountName string = serviceAccountName
