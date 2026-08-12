import type {
  AdvanceRehearsalRunRequest,
  AssistantAskRequest,
  AssistantAskResponse,
  AssistantClientContext,
  AssistantConversationMessage,
  CustomerImpactResponse,
  CreateRehearsalRunRequest,
  Deployment,
  DestroyParams,
  DeployParams,
  IncidentHandoffListResponse,
  IncidentHandoffMutationResponse,
  IncidentHandoffReconcileResponse,
  InterruptRehearsalRunRequest,
  InventoryResponse,
  Job,
  KubeEvent,
  Pod,
  PodLogResponse,
  PreflightCheck,
  RehearsalRun,
  RehearsalScenarioName,
  RehearsalState,
  ResumeRehearsalRunRequest,
  Scenario,
  Service,
  ServiceEndpointsResponse,
  SreAgentDiscoveryResponse,
  SreAgentInvestigation,
  SreAgentPortalHandoff,
  SreAgentPreflightResult,
  SreAgentScenarioPrompt,
  SreAgentTargetSummary,
  UpdateRehearsalEvidenceRequest,
} from '../types/api';

/** Configuration snapshot for the Azure SRE Agent MCP path. */
export interface SreAgentConfigResponse {
  configured: boolean;
  enabled: boolean;
  configurationIssues: string[];
  target: SreAgentTargetSummary;
  portalHandoff: SreAgentPortalHandoff;
  scenarioPrompts: SreAgentScenarioPrompt[];
}

/** Error that preserves the structured API error body (used for SRE Agent failures). */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: buildHeaders(options),
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(body) as { error?: string };
      message = (parsedBody as { error?: string }).error ?? body;
    } catch {
      // Keep the raw response text for non-JSON API errors.
    }
    throw new ApiError(response.status, `API ${response.status}: ${message}`, parsedBody);
  }

  return response.json() as Promise<T>;
}

function buildHeaders(options?: RequestInit): HeadersInit | undefined {
  const hasBody = options?.body !== undefined && options.body !== null;
  const hasHeaders = options?.headers !== undefined;
  if (!hasBody && !hasHeaders) return undefined;

  const headers = new Headers(options?.headers);
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export function useApi() {
  return {
    getHealth: () => api<{ status: string }>('/api/health'),
    getCustomerImpact: () => api<CustomerImpactResponse>('/api/customer-impact'),
    getPreflight: () => api<{ checks: PreflightCheck[] }>('/api/preflight'),
    getPods: () => api<{ pods: Pod[] }>('/api/pods'),
    getServices: () => api<{ services: Service[] }>('/api/services'),
    getDeployments: () => api<{ deployments: Deployment[] }>('/api/deployments'),
    getInventory: () => api<InventoryResponse>('/api/inventory'),
    getEvents: () => api<{ events: KubeEvent[] }>('/api/events'),
    getPodLogs: (name: string) => api<PodLogResponse>(`/api/pods/${encodeURIComponent(name)}/logs`),
    getServiceEndpoints: (name: string) => api<ServiceEndpointsResponse>(`/api/services/${encodeURIComponent(name)}/endpoints`),
    getScenarios: () => api<{ scenarios: Scenario[] }>('/api/scenarios'),
    getIncidentHandoffs: () => api<IncidentHandoffListResponse>('/api/incidents'),
    acknowledgeIncident: (id: string) => api<IncidentHandoffMutationResponse>(`/api/incidents/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),
    resolveIncident: (id: string) => api<IncidentHandoffMutationResponse>(`/api/incidents/${encodeURIComponent(id)}/resolve`, { method: 'POST' }),
    reconcileNativeEvidence: (id: string) => api<IncidentHandoffReconcileResponse>(`/api/incidents/${encodeURIComponent(id)}/reconcile-native-evidence`, { method: 'POST', body: JSON.stringify({}) }),
    getRehearsalState: () => api<RehearsalState>('/api/rehearsals'),
    getRehearsalScenarios: () => api<{ scenarios: RehearsalScenarioName[] }>('/api/rehearsals/scenarios'),
    createRehearsalRun: (request: CreateRehearsalRunRequest) => api<{ run: RehearsalRun }>('/api/rehearsals', { method: 'POST', body: JSON.stringify(request) }),
    advanceRehearsalRun: (scenarioName: RehearsalScenarioName, request?: AdvanceRehearsalRunRequest) => api<{ run: RehearsalRun }>(`/api/rehearsals/${encodeURIComponent(scenarioName)}/advance`, { method: 'POST', body: JSON.stringify(request ?? {}) }),
    interruptRehearsalRun: (request: InterruptRehearsalRunRequest) => api<{ run: RehearsalRun }>('/api/rehearsals/interrupt', { method: 'POST', body: JSON.stringify(request) }),
    resumeRehearsalRun: (request: ResumeRehearsalRunRequest) => api<{ run: RehearsalRun }>('/api/rehearsals/resume', { method: 'POST', body: JSON.stringify(request) }),
    resetRehearsalRun: (scenarioName: RehearsalScenarioName) => api<{ run: RehearsalRun }>(`/api/rehearsals/${encodeURIComponent(scenarioName)}/reset`, { method: 'POST' }),
    updateRehearsalEvidence: (request: UpdateRehearsalEvidenceRequest) => api<{ run: RehearsalRun }>('/api/rehearsals/evidence', { method: 'PATCH', body: JSON.stringify(request) }),
    askAssistant: (question: string, history?: AssistantConversationMessage[], clientContext?: AssistantClientContext) => api<AssistantAskResponse>('/api/assistant/ask', {
      method: 'POST',
      body: JSON.stringify({
        question,
        ...(history !== undefined ? { history } satisfies Pick<AssistantAskRequest, 'history'> : {}),
        ...(clientContext !== undefined ? { clientContext } satisfies Pick<AssistantAskRequest, 'clientContext'> : {}),
      } satisfies AssistantAskRequest),
    }),
    deploy: (params: DeployParams) => api<Job>('/api/deploy', { method: 'POST', body: JSON.stringify(params) }),

    // --- Azure SRE Agent (real agent via supported MCP path) ---------------
    // These call the real Azure SRE Agent. They are deliberately separate from
    // askAssistant (Local Analyst) and must never be used as a fallback for it.
    getSreAgentConfig: () => api<SreAgentConfigResponse>('/api/sre-agent/config'),
    getSreAgentPreflight: (skipMcpProbe = false) =>
      api<SreAgentPreflightResult>(`/api/sre-agent/preflight${skipMcpProbe ? '?skipMcpProbe=true' : ''}`),
    getSreAgents: () => api<SreAgentDiscoveryResponse>('/api/sre-agent/agents'),
    startSreAgentInvestigation: (body: { scenarioName?: string; prompt?: string; correlationId?: string }) =>
      api<SreAgentInvestigation>('/api/sre-agent/investigations', { method: 'POST', body: JSON.stringify(body) }),
    continueSreAgentInvestigation: (body: { threadId: string; prompt: string; correlationId?: string }) =>
      api<SreAgentInvestigation>('/api/sre-agent/investigations/continue', { method: 'POST', body: JSON.stringify(body) }),
    getSreAgentThreadStatus: (threadId: string) =>
      api<SreAgentInvestigation>(`/api/sre-agent/investigations/${encodeURIComponent(threadId)}`),
    cancelSreAgentInvestigation: (correlationId: string) =>
      api<{ cancelled: boolean; message: string; limitation: string }>('/api/sre-agent/investigations/cancel', {
        method: 'POST',
        body: JSON.stringify({ correlationId }),
      }),

    destroy: (params: DestroyParams) => api<Job>('/api/destroy', { method: 'POST', body: JSON.stringify(params) }),
    enableScenario: (name: string) => api<{ ok: boolean }>(`/api/scenarios/${name}/enable`, { method: 'POST' }),
    disableScenario: (name: string) => api<{ ok: boolean }>(`/api/scenarios/${name}/disable`, { method: 'POST' }),
    fixAll: () => api<{ ok: boolean }>('/api/scenarios/fix-all', { method: 'POST' }),
  };
}
