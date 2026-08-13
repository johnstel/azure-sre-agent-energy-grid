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

@description('Enable Azure Key Vault purge protection. Defaults to true. Set to false only before deployment for a disposable demo lab where name reuse is intentionally accepted. When false, the generated vault omits the property entirely because Azure rejects an explicit false value; once a vault is created with purge protection enabled, Azure does not permit turning it off and deleted vault names remain reserved for the retention period.')
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

var keyVaultProperties = {
  sku: {
    family: 'A'
    name: skuName
  }
  tenantId: subscription().tenantId
  enableRbacAuthorization: enableRbacAuthorization
  enableSoftDelete: true
  softDeleteRetentionInDays: 7
  publicNetworkAccess: 'Enabled'
  networkAcls: {
    bypass: 'AzureServices'
    defaultAction: 'Allow'
  }
}

var purgeProtectionProperties = enablePurgeProtection ? {
  enablePurgeProtection: true
} : {}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: name
  location: location
  tags: tags
  properties: union(keyVaultProperties, purgeProtectionProperties)
}

// =============================================================================
// OUTPUTS
// =============================================================================

output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output vaultUri string = keyVault.properties.vaultUri
output keyVaultPurgeProtectionEnabled bool = keyVault.properties.enablePurgeProtection ?? false
output keyVaultPurgeProtectionStatus string = (keyVault.properties.enablePurgeProtection ?? false) ? 'enabled' : 'disabled-demo-only'
