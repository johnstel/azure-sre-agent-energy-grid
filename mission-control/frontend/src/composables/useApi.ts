import type { PreflightCheck, Pod, Service, KubeEvent, Scenario, DeployParams, DestroyParams } from '../types/api';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export function useApi() {
  return {
    getHealth: () => api<{ status: string }>('/api/health'),
    getPreflight: () => api<{ checks: PreflightCheck[] }>('/api/preflight'),
    getPods: () => api<{ pods: Pod[] }>('/api/pods'),
    getServices: () => api<{ services: Service[] }>('/api/services'),
    getEvents: () => api<{ events: KubeEvent[] }>('/api/events'),
    getScenarios: () => api<{ scenarios: Scenario[] }>('/api/scenarios'),
    deploy: (params: DeployParams) => api<{ requestId: string }>('/api/deploy', { method: 'POST', body: JSON.stringify(params) }),
    destroy: (params: DestroyParams) => api<{ requestId: string }>('/api/destroy', { method: 'POST', body: JSON.stringify(params) }),
    enableScenario: (name: string) => api<{ ok: boolean }>(`/api/scenarios/${name}/enable`, { method: 'POST' }),
    disableScenario: (name: string) => api<{ ok: boolean }>(`/api/scenarios/${name}/disable`, { method: 'POST' }),
    fixAll: () => api<{ ok: boolean }>('/api/scenarios/fix-all', { method: 'POST' }),
  };
}
