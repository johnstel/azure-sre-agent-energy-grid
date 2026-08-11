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

export type ScenarioNarrationPromptStage = 'open-ended' | 'direct' | 'specific' | 'remediation';
export type ScenarioNarrationDemoTier = 'core' | 'extended';

export interface ScenarioNarrationPrompt {
  stage: ScenarioNarrationPromptStage;
  text: string;
  source: string;
}

export interface ScenarioNarrationRestorePath {
  label: string;
  command?: string;
  missionControlAction?: 'repair-scenario' | 'repair-all';
}

export interface ScenarioNarrationSourceRef {
  label: string;
  path: string;
  section?: string;
}

export interface ScenarioNarration {
  scenarioName: string;
  title: string;
  demoTier: ScenarioNarrationDemoTier;
  order?: number;
  hook: string[];
  observe: string[];
  suggestedPrompt: ScenarioNarrationPrompt;
  restorePath: ScenarioNarrationRestorePath;
  sourceRefs: ScenarioNarrationSourceRef[];
  safetyNotes: string[];
}

export interface ScenarioNarrationCatalog {
  schemaVersion: number;
  contentContract: {
    purpose: string;
    agentResponseContent: string;
    safeLanguageSource: string;
    promptStageTaxonomy?: Record<ScenarioNarrationPromptStage, string>;
    catalogRules?: string[];
    forbiddenPhrases?: string[];
  };
  scenarios: ScenarioNarration[];
}

export interface Scenario {
  name: string;
  file: string;
  description: string;
  enabled: boolean;
  narration?: ScenarioNarration;
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

export type IncidentHandoffStatus = 'open' | 'acknowledged' | 'resolved';
export type IncidentHandoffSeverity = 'critical' | 'warning' | 'unknown';
export type IncidentHandoffSource = 'action-group' | 'dashboard' | 'manual';

export interface IncidentHandoff {
  id: string;
  key: string;
  status: IncidentHandoffStatus;
  title: string;
  summary: string;
  severity: IncidentHandoffSeverity;
  source: IncidentHandoffSource;
  scenarioName?: string;
  createdAt: string;
  updatedAt: string;
  evidence: string[];
  operatorGuidance: string[];
  notes?: string[];
}

export interface IncidentHandoffMutationResponse {
  incident: IncidentHandoff;
  deduped: boolean;
}

export interface IncidentHandoffListResponse {
  incidents: IncidentHandoff[];
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

export interface PortalValidationPromptMetadata {
  scenarioName: PortalValidationScenarioName;
  prompt: string;
  description: string;
}

export type RehearsalScenarioName = PortalValidationScenarioName;
export type RehearsalPhase = 'preflight' | 'baseline' | 'injection' | 'detection' | 'prompt_gate' | 'diagnosis_gate' | 'restore' | 'recovery_verification' | 'evidence_package' | 'completed';
export type RehearsalStatus = 'pending' | 'in_progress' | 'interrupted' | 'completed' | 'reset';
export type RehearsalGateStatus = 'PASS_WITH_PENDING_HUMAN_PORTAL' | 'PASS' | 'REDACTION_BLOCKED';

export interface CreateRehearsalRunRequest {
  scenarioName: RehearsalScenarioName;
  prompt?: string;
  diagnosisSummary?: string;
  dryRun?: boolean;
}

export interface AdvanceRehearsalRunRequest {
  notes?: string;
  dryRun?: boolean;
}

export interface InterruptRehearsalRunRequest {
  scenarioName: RehearsalScenarioName;
  reason?: string;
}

export interface ResumeRehearsalRunRequest {
  scenarioName: RehearsalScenarioName;
}

export interface UpdateRehearsalEvidenceRequest {
  scenarioName: RehearsalScenarioName;
  evidencePath?: string;
  manifestPath?: string;
  configDiffPath?: string;
  inventoryPath?: string;
  eventsPath?: string;
  logsPath?: string;
  alertHistoryPath?: string;
  kqlExportPath?: string;
  recoveryCheckPath?: string;
  summaryPath?: string;
  artifactDirectory?: string;
  attachmentChecksums?: Record<string, string>;
  redactionFindings?: string[];
  sensitivePatterns?: string[];
  complete?: boolean;
  notes?: string;
}

export interface RehearsalTimestamps {
  t0?: string;
  t1?: string;
  t2?: string;
  t3?: string;
  t4?: string;
  t5?: string;
}

export interface RehearsalEvidencePackage {
  evidencePath?: string;
  manifestPath?: string;
  configDiffPath?: string;
  inventoryPath?: string;
  eventsPath?: string;
  logsPath?: string;
  alertHistoryPath?: string;
  kqlExportPath?: string;
  recoveryCheckPath?: string;
  summaryPath?: string;
  artifactDirectory?: string;
  attachmentChecksums: Record<string, string>;
  redactionFindings: string[];
  sensitivePatterns: string[];
  complete: boolean;
}

export interface RehearsalRun {
  scenarioName: RehearsalScenarioName;
  phase: RehearsalPhase;
  status: RehearsalStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  interruptedAt?: string;
  completedAt?: string;
  prompt: string;
  diagnosisSummary?: string;
  timestamps: RehearsalTimestamps;
  automatedScenarioDurationMs?: number;
  humanTimingMs?: number;
  sreAgentAssistedTimingMs?: number;
  evidencePackage: RehearsalEvidencePackage;
  customerReady: boolean;
  gateStatus: RehearsalGateStatus;
  runManifest: {
    scenarioName: RehearsalScenarioName;
    generatedAt: string;
    phases: RehearsalPhase[];
    evidencePaths: string[];
  };
  incidentHandoffId?: string;
  notes?: string;
}

export interface RehearsalReplayStep {
  phase: RehearsalPhase;
  status: RehearsalStatus;
  gateStatus: RehearsalGateStatus;
  timestamps: RehearsalTimestamps;
  notes?: string;
}

export interface RehearsalReplayResponse {
  scenarioName: RehearsalScenarioName;
  generatedAt: string;
  steps: RehearsalReplayStep[];
}

export interface RehearsalState {
  runs: RehearsalRun[];
  updatedAt: string;
}
