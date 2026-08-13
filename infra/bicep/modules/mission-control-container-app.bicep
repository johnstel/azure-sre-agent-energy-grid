targetScope = 'resourceGroup'

@description('Mission Control Container App name')
param appName string = 'mission-control'

@description('The Container Apps environment resource ID. This deployment requires the runtime environment to already exist.')
param containerAppEnvironmentId string

@description('Azure region for the container app')
param location string = resourceGroup().location

@description('Whether Mission Control is exposed through public ingress.')
param externalIngress bool = false

@description('Whether Mission Control EasyAuth is enabled for public ingress.')
param authEnabled bool = false

@description('Allowed Entra principal IDs for hosted Mission Control access.')
param allowedPrincipals array = []

@description('Allowed Entra group IDs for hosted Mission Control access.')
param allowedGroups array = []

@description('Microsoft Entra tenant ID for Mission Control auth.')
param authTenantId string = ''

@description('Microsoft Entra application client ID for Mission Control auth.')
param authClientId string = ''

@secure()
@description('Microsoft Entra application client secret for Mission Control auth.')
param authClientSecret string = ''

@description('Container image to deploy for Mission Control')
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

var authSecretName = 'microsoft-provider-authentication-secret'
var publicIngressRequiresAuth = externalIngress && (!authEnabled || ((empty(allowedPrincipals) && empty(allowedGroups)) || contains(allowedPrincipals, '') || contains(allowedGroups, '')))

assert missionControlPublicIngressGuard = !publicIngressRequiresAuth

resource missionControl 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvironmentId
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: authEnabled
        ? [
            {
              name: authSecretName
              value: authClientSecret
            }
          ]
        : []
      ingress: {
        external: externalIngress
        targetPort: 3333
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'mission-control'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            {
              name: 'MISSION_CONTROL_PUBLIC_INGRESS'
              value: string(externalIngress)
            }
            {
              name: 'MISSION_CONTROL_AUTH_ENABLED'
              value: string(authEnabled)
            }
            {
              name: 'MISSION_CONTROL_ALLOWED_PRINCIPALS'
              value: empty(allowedPrincipals) ? '' : join(allowedPrincipals, ',')
            }
            {
              name: 'MISSION_CONTROL_ALLOWED_GROUPS'
              value: empty(allowedGroups) ? '' : join(allowedGroups, ',')
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

resource authConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (authEnabled) {
  parent: missionControl
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureActiveDirectory'
      excludedPaths: [
        '/api/health'
      ]
    }
    httpSettings: {
      requireHttps: true
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: authClientId
          clientSecretSettingName: authSecretName
          openIdIssuer: '${environment().authentication.loginEndpoint}${authTenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            authClientId
            'api://${authClientId}'
          ]
        }
      }
    }
    login: {
      tokenStore: {
        enabled: false
      }
    }
  }
}

output containerAppName string = missionControl.name
