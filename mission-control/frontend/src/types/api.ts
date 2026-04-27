export type KubeSeverity = 'healthy' | 'warning' | 'critical' | 'unknown';
export type InventorySeverity = KubeSeverity;

export interface KubeObjectRef {
  kind: string;
  name: string;
  namespace?: string;
  fieldPath?: string;
  apiVersion?: string;
}

export interface ContainerSummary {
  name: string;
  ready: boolean;
  restartCount: number;
  state: string;
  reason?: string;
}

export interface Pod {
  name: string;
  namespace: string;
  status: string;
  ready: boolean;
  restarts: number;
  age: string;
  labels?: Record<string, string>;
  reason?: string;
  phase?: string;
  podIP?: string;
  nodeName?: string;
  startTime?: string;
  containers?: ContainerSummary[];
}

export interface ServicePort {
  name?: string;
  port: number;
  targetPort?: string | number;
  nodePort?: number;
  protocol: string;
  appProtocol?: string;
}

export interface LoadBalancerIngress {
  ip?: string;
  hostname?: string;
}

export interface Service {
  name: string;
  namespace: string;
  type: string;
  clusterIP: string;
  ports: string;
  selector?: Record<string, string>;
  portDetails?: ServicePort[];
  externalIPs?: string[];
  loadBalancerIngress?: LoadBalancerIngress[];
  externalIP?: string;
  externalHostname?: string;
  publicUrl?: string;
}

export interface KubeEvent {
  type: string;
  reason: string;
  message: string;
  source: string;
  timestamp: string;
  involvedObject?: KubeObjectRef;
  count?: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

export interface Deployment {
  name: string;
  namespace: string;
  desiredReplicas: number;
  readyReplicas: number;
  replicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  labels?: Record<string, string>;
  selectorLabels?: Record<string, string>;
  age?: string;
  updatedAt?: string;
}

export interface InventoryPodSummary {
  name: string;
  namespace?: string;
  phase?: string;
  ready: boolean;
  status: string;
  reason?: string;
  restarts: number;
  age?: string;
  podIP?: string;
  nodeName?: string;
  labels?: Record<string, string>;
  containers?: ContainerSummary[];
}

export interface EndpointAddressSummary {
  ip: string;
  ready: boolean;
  nodeName?: string;
  targetRef?: KubeObjectRef;
  ports?: ServicePort[];
}

export interface ServiceEndpointSummary {
  serviceName: string;
  ready: number;
  notReady: number;
  total: number;
  addresses: EndpointAddressSummary[];
}

export interface ServiceEndpoint {
  ip?: string;
  podName?: string;
  ready?: boolean;
  targetRef?: string;
  ports?: string;
}

export interface ServiceEndpointsResponse {
  service?: Service;
  endpoints: ServiceEndpointSummary | ServiceEndpoint[];
  pods?: InventoryPodSummary[];
  endpointSlices?: ServiceEndpointSummary[];
  updatedAt?: string;
}

export interface InventoryItem {
  id?: string;
  name: string;
  namespace?: string;
  deploymentName?: string;
  serviceName?: string;
  desiredReplicas: number;
  runningReplicas: number;
  readyReplicas: number;
  expectedState?: string;
  actualState?: string;
  severity: InventorySeverity;
  status?: InventorySeverity;
  reason: string;
  restarts: number;
  pods: InventoryPodSummary[];
  services?: Service[];
  endpointReadiness?: ServiceEndpointSummary[];
  recentEvents?: KubeEvent[];
  replicas?: number;
  readyPods?: number;
  runningPods?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  age?: string;
  updatedAt?: string;
  labels?: Record<string, string>;
  selectorLabels?: Record<string, string>;
}

export interface InventoryResponse {
  namespace: 'energy';
  updatedAt?: string;
  inventory?: InventoryItem[];
  deployments: InventoryItem[];
  orphanPods: InventoryPodSummary[];
  services: Service[];
  events: KubeEvent[];
}

export interface PodLogResponse {
  namespace: 'energy';
  pod: string;
  lines: number;
  logs: string;
  updatedAt: string;
}

export interface Scenario {
  name: string;
  file: string;
  description: string;
  enabled: boolean;
}

export interface Job {
  requestId: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  exitCode?: number;
  logs: string[];
}

export interface ToolStatus {
  name: string;
  available: boolean;
  version?: string;
  path?: string;
}

export interface PreflightCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface DeployParams {
  location: string;
  workloadName?: string;
  skipRbac?: boolean;
  skipSreAgent?: boolean;
  skipConfirmation?: boolean;
}

export interface DestroyParams {
  resourceGroupName: string;
  confirmation?: string;
  skipConfirmation?: boolean;
}

export interface PreflightResult {
  ready: boolean;
  checks: PreflightCheck[];
  tools: ToolStatus[];
}

export interface MissionState {
  collectedAt: string;
  preflight: PreflightResult;
  cluster: {
    namespace: string;
    pods: Pod[];
    services: Service[];
    deployments: Deployment[];
    events: KubeEvent[];
    errors?: string[];
  };
  scenarios: Scenario[];
  operations: {
    activeJob?: Omit<Job, 'logs'>;
    recentJobs: Omit<Job, 'logs'>[];
  };
}

export type AssistantConversationRole = 'user' | 'assistant';

export interface AssistantConversationMessage {
  role: AssistantConversationRole;
  content: string;
}

export interface AssistantClientContext {
  capturedAt?: string;
  route?: string;
  viewport?: {
    width?: number;
    height?: number;
  };
  selected?: {
    type?: 'inventory' | 'pod' | 'service' | 'deployment';
    id?: string;
    name?: string;
    namespace?: string;
    deploymentName?: string;
    serviceName?: string;
    podNames?: string[];
  };
  drawers?: {
    analystOpen?: boolean;
    diagnosticsCollapsed?: boolean;
    controlPanelOpen?: boolean;
    destroyConfirmOpen?: boolean;
  };
  activeControls?: {
    deployLocation?: string;
    deployWorkload?: string;
    deploySkipRbac?: boolean;
    deploySkipSreAgent?: boolean;
    destroyResourceGroupSet?: boolean;
    scenarioToggleInProgress?: string;
    fixingAll?: boolean;
    refreshing?: boolean;
  };
  visiblePublicServiceLinks?: Array<{
    name: string;
    url: string;
    address?: string;
  }>;
  inventorySummary?: {
    source?: string;
    total?: number;
    readyPods?: number;
    totalPods?: number;
    activeScenarios?: number;
    mismatches?: number;
    severityCounts?: Partial<Record<KubeSeverity, number>>;
    heartbeat?: KubeSeverity;
    topResources?: Array<{
      name: string;
      namespace?: string;
      severity?: KubeSeverity;
      desiredReplicas?: number;
      readyReplicas?: number;
      reason?: string;
    }>;
  };
  incidents?: Array<{
    name: string;
    severity?: KubeSeverity;
    reason?: string;
    actualState?: string;
    podNames?: string[];
  }>;
  diagnostics?: {
    status?: string;
    error?: string;
    selectedLogLineCount?: number;
    selectedEventCount?: number;
    selectedEndpointCount?: number;
    endpointSummaries?: string[];
  };
  wallboardSections?: {
    inventory?: string;
    activeIncidents?: string;
    runtime?: string;
    diagnosticsDrawer?: string;
    controls?: string;
    analyst?: string;
  };
}

export interface AssistantAskRequest {
  question: string;
  history?: AssistantConversationMessage[];
  clientContext?: AssistantClientContext;
  screenContext?: AssistantClientContext;
}

export type AssistantResponseStatus = 'ok' | 'partial' | 'error' | 'timeout' | 'escalation';
export type AssistantConfidence = 'high' | 'medium' | 'low' | 'none';

export interface AssistantCitation {
  label: string;
  detail?: string;
  timestamp?: string;
}

export interface AssistantEscalationLink {
  label: string;
  href: string;
  kind: 'sre-agent' | 'azure-portal' | 'log-analytics' | 'app-insights' | 'grafana';
  description: string;
}

export interface AssistantAskResponse {
  answer: string;
  metadata: {
    model: string;
    status: AssistantResponseStatus;
    uiState?: AssistantResponseStatus;
    confidence?: AssistantConfidence;
    toolsUsed: string[];
    stateSnapshotTimestamp: string;
    sources: string[];
    citations?: AssistantCitation[];
    limitations: string[];
    escalationLinks?: AssistantEscalationLink[];
    timestamp: string;
  };
}

export type PortalValidationScenarioName = 'OOMKilled' | 'MongoDBDown' | 'ServiceMismatch';
export type PortalValidationStatus = 'awaiting' | 'confirmed';
export type PortalValidationAccuracy = 'PASS' | 'FAIL' | 'PARTIAL';

export interface PortalValidation {
  scenarioName: PortalValidationScenarioName;
  status: PortalValidationStatus;
  evidenceCaptured: boolean;
  timestamp: string;
  operatorInitials: string;
  evidencePath: string;
  notes: string;
  accuracy?: PortalValidationAccuracy;
}

export interface PortalValidationState {
  validations: PortalValidation[];
  confirmedCount: number;
  updatedAt: string;
}
