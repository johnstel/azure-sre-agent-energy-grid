import type {
  AssistantAskRequest,
  AssistantAskResponse,
  AssistantClientContext,
  AssistantConversationMessage,
  Deployment,
  DestroyParams,
  DeployParams,
  InventoryResponse,
  Job,
  KubeEvent,
  Pod,
  PodLogResponse,
  PreflightCheck,
  Scenario,
  Service,
  ServiceEndpointsResponse,
} from '../types/api';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      message = parsed.error ?? body;
    } catch {
      // Keep the raw response text for non-JSON API errors.
    }
    throw new Error(`API ${response.status}: ${message}`);
  }

  return response.json() as Promise<T>;
}

export function useApi() {
  return {
    getHealth: () => api<{ status: string }>('/api/health'),
    getPreflight: () => api<{ checks: PreflightCheck[] }>('/api/preflight'),
    getPods: () => api<{ pods: Pod[] }>('/api/pods'),
    getServices: () => api<{ services: Service[] }>('/api/services'),
    getDeployments: () => api<{ deployments: Deployment[] }>('/api/deployments'),
    getInventory: () => api<InventoryResponse>('/api/inventory'),
    getEvents: () => api<{ events: KubeEvent[] }>('/api/events'),
    getPodLogs: (name: string) => api<PodLogResponse>(`/api/pods/${encodeURIComponent(name)}/logs`),
    getServiceEndpoints: (name: string) => api<ServiceEndpointsResponse>(`/api/services/${encodeURIComponent(name)}/endpoints`),
    getScenarios: () => api<{ scenarios: Scenario[] }>('/api/scenarios'),
    askAssistant: (question: string, history?: AssistantConversationMessage[], clientContext?: AssistantClientContext) => api<AssistantAskResponse>('/api/assistant/ask', {
      method: 'POST',
      body: JSON.stringify({
        question,
        ...(history !== undefined ? { history } satisfies Pick<AssistantAskRequest, 'history'> : {}),
        ...(clientContext !== undefined ? { clientContext } satisfies Pick<AssistantAskRequest, 'clientContext'> : {}),
      } satisfies AssistantAskRequest),
    }),
    deploy: (params: DeployParams) => api<Job>('/api/deploy', { method: 'POST', body: JSON.stringify(params) }),
    destroy: (params: DestroyParams) => api<Job>('/api/destroy', { method: 'POST', body: JSON.stringify(params) }),
    enableScenario: (name: string) => api<{ ok: boolean }>(`/api/scenarios/${name}/enable`, { method: 'POST' }),
    disableScenario: (name: string) => api<{ ok: boolean }>(`/api/scenarios/${name}/disable`, { method: 'POST' }),
    fixAll: () => api<{ ok: boolean }>('/api/scenarios/fix-all', { method: 'POST' }),
  };
}
