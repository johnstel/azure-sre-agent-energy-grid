export type KubeSeverity = 'healthy' | 'warning' | 'critical' | 'unknown';

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
  annotations?: Record<string, string>;
  selectorLabels?: Record<string, string>;
  age?: string;
  updatedAt?: string;
}

export interface InventoryPodSummary {
  name: string;
  phase: string;
  ready: boolean;
  status: string;
  reason?: string;
  restarts: number;
  age: string;
  podIP?: string;
  nodeName?: string;
  labels: Record<string, string>;
  containers: ContainerSummary[];
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

export interface ServiceEndpointResolution {
  service: Service;
  endpoints: ServiceEndpointSummary;
  pods: InventoryPodSummary[];
  endpointSlices: ServiceEndpointSummary[];
  updatedAt: string;
}

export interface DeploymentInventoryItem {
  name: string;
  namespace: string;
  desiredReplicas: number;
  readyPods: number;
  runningPods: number;
  replicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  severity: KubeSeverity;
  status: KubeSeverity;
  reason: string;
  restarts: number;
  age: string;
  updatedAt: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  selectorLabels: Record<string, string>;
  pods: InventoryPodSummary[];
  services: Service[];
  endpointReadiness: ServiceEndpointSummary[];
  recentEvents: KubeEvent[];
}

export interface InventoryResponse {
  namespace: 'energy';
  updatedAt: string;
  deployments: DeploymentInventoryItem[];
  orphanPods: InventoryPodSummary[];
  services: Service[];
  events: KubeEvent[];
}

export interface PodLogsResponse {
  namespace: 'energy';
  pod: string;
  lines: number;
  logs: string;
  updatedAt: string;
}

export type AnalystConfidence = 'high' | 'medium' | 'low' | 'none';
export type AnalystQueryStatus = 'complete' | 'partial' | 'unavailable' | 'denied';

export interface AnalystEvidenceMetadata {
  source: string;
  collectedAt: string;
  limitations: string[];
  confidence: AnalystConfidence;
  status: AnalystQueryStatus;
}

export type AnalystAksQueryName =
  | 'pod-resources'
  | 'node-capacity'
  | 'deployment-replicas'
  | 'namespace-events'
  | 'service-endpoints-health';

export interface KubernetesResourceList {
  cpuMillicores?: number;
  memoryBytes?: number;
}

export interface AnalystPodContainerResources {
  name: string;
  ready: boolean;
  restartCount: number;
  state: string;
  reason?: string;
  requests: KubernetesResourceList;
  limits: KubernetesResourceList;
}

export interface AnalystPodResourceState {
  name: string;
  namespace: 'energy';
  phase: string;
  status: string;
  ready: boolean;
  nodeName?: string;
  startTime?: string;
  labels: Record<string, string>;
  requests: KubernetesResourceList;
  limits: KubernetesResourceList;
  containers: AnalystPodContainerResources[];
}

export interface AnalystNodeAllocationSummary {
  name: string;
  capacity: KubernetesResourceList;
  allocatable: KubernetesResourceList;
  requested: KubernetesResourceList;
  limited: KubernetesResourceList;
  podCount: number;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    lastTransitionTime?: string;
  }>;
}

export interface AnalystDeploymentReplicaState {
  name: string;
  namespace: 'energy';
  desiredReplicas: number;
  readyReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  observedGeneration?: number;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
    lastUpdateTime?: string;
    lastTransitionTime?: string;
  }>;
}

export interface AnalystServiceEndpointsHealth {
  serviceName: string;
  namespace: 'energy';
  type: string;
  selector: Record<string, string>;
  readyEndpoints: number;
  notReadyEndpoints: number;
  totalEndpoints: number;
  matchingPods: number;
  ports: ServicePort[];
}

export interface AnalystAksQueryResponse {
  queryName: AnalystAksQueryName;
  namespace: 'energy';
  metadata: AnalystEvidenceMetadata & {
    allowedVerb: 'get';
    allowlist: AnalystAksQueryName[];
  };
  data:
    | AnalystPodResourceState[]
    | AnalystNodeAllocationSummary[]
    | AnalystDeploymentReplicaState[]
    | KubeEvent[]
    | AnalystServiceEndpointsHealth[];
}

export type LogAnalyticsTemplateName =
  | 'pod-restarts-lifecycle'
  | 'service-log-excerpts'
  | 'application-exceptions-errors';

export interface LogAnalyticsQueryRequest {
  templateName: LogAnalyticsTemplateName;
  minutes: number;
  limit: number;
  service?: string;
  pod?: string;
  namespace: 'energy';
  timeoutMs: number;
}

export interface LogAnalyticsQueryResponse {
  templateName: LogAnalyticsTemplateName;
  workspace: string;
  timeRange: {
    from: string;
    to: string;
    minutes: number;
  };
  rowCount: number;
  rows: Record<string, unknown>[];
  metadata: AnalystEvidenceMetadata & {
    partial: boolean;
    timeoutMs: number;
    partialBehavior: string;
  };
}

// =============================================================================
// Native Azure Monitor incident-platform evidence (issue #76)
// =============================================================================
// Documented Application Insights `customEvents` names emitted by Azure SRE Agent.
// Source: https://learn.microsoft.com/azure/sre-agent/audit-agent-actions
export type SreAgentEvidenceTemplateName =
  | 'incident-activity-snapshot'
  | 'agent-execution-lifecycle'
  | 'agent-tool-execution'
  | 'approval-decisions'
  | 'incident-thread-timeline';

export interface SreAgentEvidenceQueryRequest {
  templateName: SreAgentEvidenceTemplateName;
  minutes: number;
  limit: number;
  threadId?: string;
  incidentId?: string;
  impactedService?: string;
  timeoutMs: number;
}

export interface SreAgentEvidenceQueryResponse {
  templateName: SreAgentEvidenceTemplateName;
  workspace: string;
  timeRange: {
    from: string;
    to: string;
    minutes: number;
  };
  rowCount: number;
  rows: Record<string, unknown>[];
  metadata: AnalystEvidenceMetadata & {
    partial: boolean;
    timeoutMs: number;
    partialBehavior: string;
    schemaMismatch: boolean;
  };
}

// Shared correlation fields present on every Azure SRE Agent customEvents row.
// Source: https://learn.microsoft.com/azure/sre-agent/audit-agent-actions#shared-fields-on-all-events
export interface SreAgentSharedEventFields {
  agentResourceId?: string;
  agentName?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  threadId?: string;
  correlationId?: string;
  logTimestamp?: string;
}

// Typed row shape for the documented `IncidentActivitySnapshot` event. Field names mirror
// https://learn.microsoft.com/azure/sre-agent/audit-agent-actions#incident-lifecycle-incidentactivitysnapshot
export interface IncidentActivitySnapshotRow extends SreAgentSharedEventFields {
  timestamp: string;
  incidentId?: string;
  incidentTitle?: string;
  incidentSeverity?: string;
  incidentStatus?: string;
  incidentPlatform?: string;
  incidentMitigatedByAgent?: boolean;
  incidentAssistedByAgent?: boolean;
  agentAutonomyLevel?: string;
  responsePlanId?: string;
  responsePlanCustom?: boolean;
  incidentImpactedService?: string;
  incidentCreatedOn?: string;
  incidentHandledOn?: string;
  incidentMitigatedOn?: string;
}

export type NativeIncidentEvidenceState =
  | 'local-fallback-only'
  | 'native-observed'
  | 'native-approval-required'
  | 'native-mitigated'
  | 'evidence-unavailable';

export type NativeApprovalDecisionState = 'approved' | 'rejected' | 'pending' | 'unknown';

// Reconciled, honest evidence for a single incident. `state` MUST default to
// 'evidence-unavailable' when no observed telemetry exists -- never infer health from absence.
export interface NativeIncidentEvidence {
  state: NativeIncidentEvidenceState;
  stale: boolean;
  schemaMismatch: boolean;
  observedAt?: string;
  freshnessSeconds?: number;
  incidentId?: string;
  incidentTitle?: string;
  responsePlanId?: string;
  responsePlanCustom?: boolean;
  autonomyLevel?: string;
  mitigatedByAgent?: boolean;
  assistedByAgent?: boolean;
  impactedService?: string;
  threadId?: string;
  correlationId?: string;
  createdOn?: string;
  handledOn?: string;
  mitigatedOn?: string;
  approvalDecision?: NativeApprovalDecisionState;
  cooldownHours: number;
  withinCooldown: boolean;
  limitations: string[];
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

// Portal Validation Types
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

export interface UpdatePortalValidationRequest {
  scenarioName: PortalValidationScenarioName;
  evidenceCaptured?: boolean;
  timestamp?: string;
  operatorInitials?: string;
  evidencePath?: string;
  notes?: string;
  accuracy?: PortalValidationAccuracy;
}

export interface ConfirmPortalValidationRequest {
  scenarioName: PortalValidationScenarioName;
  timestamp: string;
  operatorInitials: string;
  accuracy?: PortalValidationAccuracy;
}

export type RehearsalScenarioName = PortalValidationScenarioName;
export type RehearsalPhase = 'preflight' | 'baseline' | 'injection' | 'detection' | 'prompt_gate' | 'diagnosis_gate' | 'restore' | 'recovery_verification' | 'evidence_package' | 'completed';
export type RehearsalStatus = 'pending' | 'in_progress' | 'interrupted' | 'completed' | 'reset';
export type RehearsalGateStatus = 'PASS_WITH_PENDING_HUMAN_PORTAL' | 'PASS' | 'REDACTION_BLOCKED';

export interface RehearsalTimestamps {
  t0?: string;
  t1?: string;
  t2?: string;
  t3?: string;
  t4?: string;
  t5?: string;
}

export interface RehearsalAttachmentChecksum {
  path: string;
  checksum: string;
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
  attachmentChecksums: RehearsalAttachmentChecksum[];
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

export interface RehearsalState {
  runs: RehearsalRun[];
  updatedAt: string;
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
  currentPhase: RehearsalPhase;
  steps: RehearsalReplayStep[];
}

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
  attachmentChecksums?: RehearsalAttachmentChecksum[];
  redactionFindings?: string[];
  sensitivePatterns?: string[];
  complete?: boolean;
  notes?: string;
}

export interface InterruptRehearsalRunRequest {
  scenarioName: RehearsalScenarioName;
  reason?: string;
}

export interface ResumeRehearsalRunRequest {
  scenarioName: RehearsalScenarioName;
}
