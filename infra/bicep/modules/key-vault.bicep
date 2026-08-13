// =============================================================================
// Azure Key Vault Module
// =============================================================================
// Provides secure secrets management. SRE Agent can help diagnose
// Key Vault access issues and configuration problems.
// =============================================================================

@description('Name of the Key Vault')
param name string

@description('Azure region for deployment')
param location string

@description('Tags to apply to resources')
param tags object

@description('Enable RBAC authorization (recommended)')
param enableRbacAuthorization bool = true

@description('Enable Azure Key Vault purge protection. Defaults to true. Set to false only before deployment for a disposable demo lab where name reuse is intentionally accepted. This is a pre-deployment opt-out; once a vault is created with purge protection enabled, Azure does not permit turning it off and deleted vault names remain reserved for the retention period.')
param enablePurgeProtection bool = true

@description('SKU for Key Vault')
@allowed([
  'standard'
  'premium'
])
param skuName string = 'standard'

// =============================================================================
// RESOURCES
// =============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: skuName
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: enableRbacAuthorization
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: enablePurgeProtection
    // Purge protection can only be disabled before enablement; once enabled it cannot be turned off and deleted vault names remain reserved.
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// =============================================================================
// OUTPUTS
// =============================================================================

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output vaultUri string = keyVault.properties.vaultUri
output keyVaultPurgeProtectionEnabled bool = keyVault.properties.enablePurgeProtection
output keyVaultPurgeProtectionStatus string = keyVault.properties.enablePurgeProtection ? 'enabled' : 'disabled-demo-only'
