<template>
  <section class="wallboard" aria-label="Mission Control wallboard">
    <div class="wallboard__status-strip">
      <div class="status-tile" :class="`status-tile--${overallSeverity}`">
        <span class="status-tile__label">Health heartbeat</span>
        <strong>{{ heartbeatLabel }}</strong>
      </div>
      <div class="status-tile">
        <span class="status-tile__label">Inventory</span>
        <strong>{{ inventory.length }} resources</strong>
      </div>
      <div class="status-tile">
        <span class="status-tile__label">Pods</span>
        <strong>{{ readyPodCount }}/{{ pods.length }} ready</strong>
      </div>
      <div class="status-tile" :class="activeScenarios > 0 ? 'status-tile--warning' : 'status-tile--healthy'">
        <span class="status-tile__label">Scenarios</span>
        <strong>{{ activeScenarios }} active</strong>
      </div>
      <div class="wallboard__actions" aria-label="Operational controls">
        <button
          class="command-button command-button--neutral"
          :class="{ 'is-pressed': controlPanelOpen }"
          type="button"
          aria-controls="wallboard-control-dock portal-validation"
          :aria-expanded="controlPanelOpen"
          @click="controlPanelOpen = !controlPanelOpen"
        >
          {{ controlPanelOpen ? 'Controls Open' : 'Controls' }}
        </button>
        <button
          class="command-button command-button--primary"
          :class="{ 'is-refreshing': inventoryLoading }"
          type="button"
          :aria-label="inventoryLoading ? 'Refreshing Mission Control data' : 'Refresh Mission Control data'"
          :aria-busy="inventoryLoading"
          :disabled="inventoryLoading"
          :title="inventoryLoading ? 'Refreshing Mission Control data' : 'Refresh Mission Control data'"
          @click="refreshAll"
        >
          Refresh
        </button>
      </div>
    </div>

    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ statusLiveSummary }}
    </div>

    <div v-if="controlPanelOpen" id="wallboard-control-dock" class="control-dock" aria-label="Preserved deployment and scenario controls">
      <div class="control-dock__card">
        <div class="control-dock__heading">
          <strong>Preflight</strong>
          <span class="badge" :class="preflightBadgeClass">{{ preflightLabel }}</span>
        </div>
        <button class="command-button command-button--primary" type="button" :disabled="preflightLoading" @click="runPreflight">
          {{ preflightLoading ? 'Checking…' : 'Run Preflight' }}
        </button>
        <ul class="compact-list" aria-label="Preflight check results">
          <li v-for="check in preflightChecks" :key="check.name">
            <span class="preflight-indicator" :aria-label="preflightStatusLabel(check.status)">
              <span class="dot" :class="check.status === 'pass' ? 'dot-green' : check.status === 'warn' ? 'dot-amber' : 'dot-red'" aria-hidden="true"></span>
              <span aria-hidden="true">{{ preflightStatusSymbol(check.status) }}</span>
            </span>
            <span>{{ check.name }} — {{ check.message }}</span>
          </li>
        </ul>
      </div>

      <div class="control-dock__card">
        <div class="control-dock__heading">
          <strong>Deploy</strong>
          <span class="badge" :class="deployJobBadgeClass">{{ deployJobStatusLabel }}</span>
        </div>
        <div class="control-row">
          <label>
            <span>Location</span>
            <select v-model="deployLocation" class="field-control">
              <option value="eastus2">East US 2</option>
              <option value="swedencentral">Sweden Central</option>
              <option value="australiaeast">Australia East</option>
            </select>
          </label>
          <label>
            <span>Workload</span>
            <input v-model="deployWorkload" class="field-control" type="text" />
          </label>
          <label class="control-check">
            <input v-model="deploySkipRbac" type="checkbox" />
            Skip RBAC
          </label>
          <label class="control-check">
            <input v-model="deploySkipSreAgent" type="checkbox" />
            Skip SRE Agent
          </label>
        </div>
        <button class="command-button command-button--primary" type="button" :disabled="deployRunning" @click="startDeploy">
          {{ deployRunning ? 'Deploying…' : 'Deploy' }}
        </button>
      </div>

      <div class="control-dock__card control-dock__card--danger">
        <div class="control-dock__heading">
          <strong>Destroy</strong>
          <span class="badge" :class="destroyCanArm ? 'badge-offline' : 'badge-neutral'">{{ destroyCanArm ? 'Armed' : 'Locked' }}</span>
        </div>
        <div class="control-row">
          <label>
            <span>Resource group</span>
            <input v-model="destroyResourceGroup" class="field-control" type="text" />
          </label>
          <label>
            <span>Type DELETE</span>
            <input v-model="destroyConfirmation" class="field-control" type="text" />
          </label>
        </div>
        <p class="destroy-gate-copy">
          Second gate required after typing DELETE. Arm opens a final non-destructive confirmation.
        </p>
        <button class="danger-button" type="button" :disabled="!destroyCanArm" @click="openDestroyConfirm">
          {{ destroyRunning ? 'Destroying…' : 'Arm destroy' }}
        </button>
      </div>

      <div class="control-dock__card">
        <div class="control-dock__heading">
          <strong>Scenarios</strong>
          <span class="badge" :class="activeScenarios > 0 ? 'badge-warning' : 'badge-online'">{{ activeScenarios }} active</span>
        </div>
        <button class="command-button command-button--success" type="button" :disabled="fixingAll" @click="repairAllScenarios">
          {{ fixingAll ? 'Repairing…' : 'Repair All' }}
        </button>
        <div class="scenario-buttons">
          <button
            v-for="scenario in scenarios"
            :key="scenario.name"
            class="command-button"
            :class="scenario.enabled ? 'command-button--success' : 'command-button--warning'"
            type="button"
            :disabled="togglingScenario === scenario.name"
            @click="toggleScenario(scenario)"
          >
            {{ scenario.enabled ? 'Repair' : 'Inject' }} {{ formatScenarioName(scenario.name) }}
          </button>
        </div>
      </div>
    </div>

    <PortalValidation v-if="controlPanelOpen" />

    <div class="wallboard__main">
      <section class="inventory-panel" aria-labelledby="inventory-heading">
        <div class="wallboard-panel__heading">
          <div>
            <p class="wallboard-kicker">Expected vs actual</p>
            <h2 id="inventory-heading">Inventory Matrix</h2>
          </div>
          <div class="wallboard-panel__meta">
            <span class="badge" :class="inventoryError ? 'badge-warning' : 'badge-info'">{{ inventorySourceLabel }}</span>
            <span class="badge" :class="mismatchCount > 0 ? 'badge-offline' : 'badge-online'">{{ mismatchCount }} mismatches</span>
          </div>
        </div>

        <div v-if="inventoryError" class="wallboard-alert wallboard-alert--warning" role="status">
          {{ inventoryError }}
        </div>
        <div v-if="inventoryLoading && inventory.length === 0" class="wallboard-empty">Loading inventory…</div>
        <div v-else-if="inventory.length === 0" class="wallboard-empty">No inventory available. Backend `/api/inventory` has not returned resources yet.</div>

        <div v-else class="inventory-table" role="table" aria-label="Inventory resource health matrix">
          <div class="inventory-table__row inventory-table__head" role="row">
            <span role="columnheader">Service / deployment</span>
            <span role="columnheader">Replicas</span>
            <span role="columnheader">Live state</span>
            <span role="columnheader">Health</span>
            <span role="columnheader">Reason</span>
            <span role="columnheader">Signal</span>
          </div>
          <div
            v-for="item in inventory"
            :key="inventoryKey(item)"
            class="inventory-table__row inventory-table__body"
            :class="[`inventory-table__body--${item.severity}`, { 'is-selected': selected?.id === inventoryKey(item) }]"
            role="row"
            tabindex="0"
            :aria-selected="selected?.id === inventoryKey(item)"
            @click="selectInventoryItem(item)"
            @keydown.enter.prevent="selectInventoryItem(item)"
            @keydown.space.prevent="selectInventoryItem(item)"
          >
            <span role="cell" class="inventory-name">
              <strong>{{ displayName(item) }}</strong>
              <small>{{ item.namespace ?? 'energy' }}</small>
            </span>
            <span role="cell" class="replica-summary">{{ replicaSummary(item) }}</span>
            <span role="cell" class="live-state">{{ inventoryLiveState(item) }}</span>
            <span role="cell" class="health-cell">
              <span class="severity-badge" :class="`severity-badge--${item.severity}`">{{ item.severity }}</span>
            </span>
            <span role="cell">{{ healthReason(item) }}</span>
            <span role="cell" class="signal-cell" :class="{ 'restart-warning': item.restarts > 0 }">{{ inventorySignal(item) }}</span>
          </div>
        </div>
      </section>

      <aside class="ops-panel" aria-label="Active incidents and pod board">
        <section class="wallboard-card">
          <div class="wallboard-panel__heading">
            <div>
              <p class="wallboard-kicker">Top severity</p>
              <h2>Active Incidents</h2>
            </div>
            <span class="badge" :class="incidents.length > 0 ? 'badge-offline' : 'badge-online'">{{ incidents.length }} open</span>
          </div>
          <div v-if="incidents.length === 0" class="wallboard-empty">No active inventory mismatches.</div>
          <div
            v-for="incident in incidents"
            :key="inventoryKey(incident)"
            class="incident-row"
            :class="[`incident-row--${incident.severity}`, { 'is-selected': selected?.id === inventoryKey(incident) }]"
            role="button"
            tabindex="0"
            :aria-selected="selected?.id === inventoryKey(incident)"
            @click="selectInventoryItem(incident)"
            @keydown.enter.prevent="selectInventoryItem(incident)"
            @keydown.space.prevent="selectInventoryItem(incident)"
          >
            <strong>{{ displayName(incident) }}</strong>
            <span>{{ incident.reason || incident.actualState }}</span>
          </div>
        </section>

        <section class="wallboard-card pod-board">
          <div class="wallboard-panel__heading">
            <div>
              <p class="wallboard-kicker">Pod / process board</p>
              <h2>Runtime State</h2>
            </div>
            <span class="badge badge-info">5s polling</span>
          </div>
          <div v-if="podError" class="wallboard-alert wallboard-alert--warning">{{ podError }}</div>
          <div
            v-for="pod in pods"
            :key="pod.name"
            class="pod-row"
            :class="[
              pod.ready && pod.status === 'Running' ? 'pod-row--healthy' : 'pod-row--warning',
              { 'is-selected': selected?.id === `pod:${pod.name}` }
            ]"
            role="button"
            tabindex="0"
            :aria-selected="selected?.id === `pod:${pod.name}`"
            @click="selectPod(pod.name)"
            @keydown.enter.prevent="selectPod(pod.name)"
            @keydown.space.prevent="selectPod(pod.name)"
          >
            <span>
              <strong>{{ pod.name }}</strong>
              <small>{{ pod.namespace }} · {{ pod.age }}</small>
            </span>
            <span class="pod-row__state">{{ pod.status }} · {{ pod.restarts }} restarts</span>
          </div>
          <div v-if="pods.length === 0 && !podError" class="wallboard-empty">No pods reported.</div>
        </section>
      </aside>
    </div>

    <aside
      v-if="analystOpen"
      id="local-analyst-drawer"
      ref="analystDrawerRef"
      class="analyst-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="local-analyst-title"
      aria-describedby="local-analyst-description"
      @keydown="handleAnalystDrawerKeydown"
    >
      <div class="analyst-drawer__header">
        <div>
          <p class="wallboard-kicker">Local analyst</p>
          <h2 id="local-analyst-title">Explain This State</h2>
          <p id="local-analyst-description">
            Read-only assistant for Mission Control snapshots. It can explain and suggest safe inspection steps, but it does not deploy, repair, or change resources.
          </p>
        </div>
        <button
          class="command-button command-button--neutral"
          type="button"
          aria-label="Close Local Analyst chat assistant"
          @click="closeAnalyst"
        >
          Close
        </button>
      </div>

      <div class="analyst-drawer__status">
        <span class="badge badge-info">Read-only</span>
        <span class="badge" :class="analystLoading ? 'badge-warning' : analystTranscript.length > 0 ? 'badge-online' : 'badge-neutral'">
          {{ analystLoading ? 'Explaining' : analystTranscriptStatus }}
        </span>
      </div>

      <div
        ref="analystTranscriptRef"
        class="analyst-transcript"
        role="log"
        aria-label="Local Analyst conversation transcript"
        tabindex="0"
      >
        <div v-if="analystTranscript.length === 0" class="analyst-empty">
          Ask about pod health, active scenarios, preflight blockers, or which incident to inspect first.
        </div>
        <article
          v-for="message in analystTranscript"
          :key="message.id"
          class="analyst-message"
          :class="`analyst-message--${message.role}`"
        >
          <div class="analyst-message__meta">
            <strong>{{ message.role === 'user' ? 'You' : 'Local Analyst' }}</strong>
            <time :datetime="message.createdAt">{{ formatAnalystTime(message.createdAt) }}</time>
          </div>
          <p>{{ message.content }}</p>
          <div v-if="message.metadata" class="analyst-message__sources">
            Snapshot {{ formatAnalystTime(message.metadata.stateSnapshotTimestamp) }} ·
            Sources: {{ message.metadata.sources.length ? message.metadata.sources.join(', ') : 'none reported' }}
          </div>
          <div v-if="message.metadata?.limitations.length" class="analyst-message__sources">
            Limits: {{ message.metadata.limitations.join(' · ') }}
          </div>
        </article>
        <div v-if="analystLoading" class="analyst-message analyst-message--assistant">
          <div class="analyst-message__meta">
            <strong>Local Analyst</strong>
            <span>working</span>
          </div>
          <p>Inspecting the current Mission Control state…</p>
        </div>
      </div>

      <div v-if="analystError" class="wallboard-alert wallboard-alert--warning" role="alert">
        {{ analystError }}
      </div>

      <form class="analyst-composer" aria-label="Ask Local Analyst" @submit.prevent="askAnalyst">
        <label class="wallboard-kicker" for="analyst-question">Question</label>
        <textarea
          id="analyst-question"
          ref="analystInputRef"
          v-model="analystQuestion"
          class="analyst-input"
          rows="4"
          maxlength="1000"
          :disabled="analystLoading"
          placeholder="Ask what changed or which incident to inspect first…"
          @keydown.meta.enter.prevent="askAnalyst"
          @keydown.ctrl.enter.prevent="askAnalyst"
        ></textarea>
        <div class="analyst-composer__footer">
          <span>{{ analystQuestion.length }}/1000</span>
          <button
            class="command-button command-button--primary"
            type="submit"
            :disabled="analystLoading || analystQuestion.trim().length === 0"
            :aria-label="analystLoading ? 'Local Analyst is explaining the current state' : 'Send question to Local Analyst'"
          >
            {{ analystLoading ? 'Explaining…' : 'Ask Analyst' }}
          </button>
        </div>
      </form>
    </aside>

    <section id="diagnostics-drawer" class="diagnostics-drawer" :class="{ 'is-collapsed': drawerCollapsed }" aria-labelledby="diagnostics-heading">
      <div class="diagnostics-drawer__header">
        <div>
          <p class="wallboard-kicker">Click-through diagnostics</p>
          <h2 id="diagnostics-heading">{{ selectedLabel }}</h2>
        </div>
        <div class="diagnostics-drawer__actions">
          <span class="badge" :class="diagnosticsError ? 'badge-warning' : 'badge-info'">{{ diagnosticsStatus }}</span>
          <button
            class="command-button command-button--neutral"
            type="button"
            aria-controls="diagnostics-drawer"
            :aria-expanded="!drawerCollapsed"
            @click="drawerCollapsed = !drawerCollapsed"
          >
            {{ drawerCollapsed ? 'Show logs' : 'Collapse' }}
          </button>
        </div>
      </div>
      <div v-if="!drawerCollapsed" class="diagnostics-drawer__body">
        <div class="log-stream" aria-label="Selected pod logs">
          <div class="log-stream__title">Logs</div>
          <div v-if="diagnosticsLoading" class="wallboard-empty">Loading selected diagnostics…</div>
          <div v-else-if="diagnosticsError" class="wallboard-alert wallboard-alert--warning">{{ diagnosticsError }}</div>
          <div v-else-if="selectedLogs.length === 0" class="wallboard-empty">Select a row to load logs. Empty means the backend returned no log lines.</div>
          <pre v-else>{{ selectedLogs.join('\n') }}</pre>
        </div>
        <div class="log-stream" aria-label="Selected events and endpoints">
          <div class="log-stream__title">Events / endpoints</div>
          <ul v-if="selectedEndpoints.length > 0" class="endpoint-list">
            <li v-for="endpoint in selectedEndpoints" :key="`${endpoint.ip}-${endpoint.podName}`">
              {{ endpoint.podName || endpoint.targetRef || endpoint.ip || 'endpoint' }} · {{ endpoint.ready === false ? 'not ready' : 'ready' }} · {{ endpoint.ports || 'ports unknown' }}
            </li>
          </ul>
          <div v-if="selectedEvents.length === 0 && selectedEndpoints.length === 0" class="wallboard-empty">No matching events or endpoints for the selected row.</div>
          <div v-for="(event, index) in selectedEvents" :key="`${event.timestamp}-${index}`" class="event-row" :class="event.type === 'Warning' ? 'event-row--warning' : 'event-row--normal'">
            <strong>{{ event.reason }}</strong>
            <span>{{ formatEventTime(event.timestamp) }} · {{ event.message }}</span>
          </div>
        </div>
      </div>
    </section>

    <div v-if="destroyConfirmOpen" class="confirm-backdrop" role="presentation" @click.self="closeDestroyConfirm">
      <section
        class="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="destroy-confirm-title"
        aria-describedby="destroy-confirm-description"
      >
        <div class="confirm-modal__heading">
          <div>
            <p class="wallboard-kicker">Second confirmation gate</p>
            <h2 id="destroy-confirm-title">Confirm destroy</h2>
          </div>
          <span class="badge badge-offline">Destructive</span>
        </div>
        <p id="destroy-confirm-description">
          This will request destruction of <strong>{{ destroyResourceGroup }}</strong>. Type DELETE stays required;
          this final gate is intentionally off by default.
        </p>
        <label class="confirm-check">
          <input v-model="destroyFinalConfirmed" type="checkbox" />
          I understand this starts the destroy job for this resource group.
        </label>
        <div class="confirm-modal__actions">
          <button class="command-button command-button--neutral" type="button" @click="closeDestroyConfirm">
            Cancel
          </button>
          <button class="danger-button" type="button" :disabled="!destroyCanConfirm" @click="startDestroy">
            {{ destroyCountdown > 0 ? `Confirm in ${destroyCountdown}s` : 'Confirm destroy' }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useApi } from '@/composables/useApi';
import { useWebSocket } from '@/composables/useWebSocket';
import PortalValidation from './PortalValidation.vue';
import type {
  Deployment,
  AssistantAskResponse,
  AssistantClientContext,
  AssistantConversationMessage,
  InventoryItem,
  InventorySeverity,
  Job,
  KubeEvent,
  Pod,
  PreflightCheck,
  Scenario,
  Service,
  ServiceEndpoint,
  ServiceEndpointSummary,
  ServiceEndpointsResponse,
} from '@/types/api';

interface AnalystMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: AssistantAskResponse['metadata'];
}

const props = withDefaults(defineProps<{
  analystOpenRequest?: number;
}>(), {
  analystOpenRequest: 0,
});

const emit = defineEmits<{
  'analyst-open-change': [open: boolean];
}>();

const {
  askAssistant,
  deploy,
  destroy,
  disableScenario,
  enableScenario,
  fixAll,
  getDeployments,
  getEvents,
  getInventory,
  getPodLogs,
  getPods,
  getPreflight,
  getScenarios,
  getServiceEndpoints,
  getServices,
} = useApi();

const inventory = ref<InventoryItem[]>([]);
const deployments = ref<Deployment[]>([]);
const pods = ref<Pod[]>([]);
const services = ref<Service[]>([]);
const events = ref<KubeEvent[]>([]);
const scenarios = ref<Scenario[]>([]);
const preflightChecks = ref<PreflightCheck[]>([]);

const inventoryLoading = ref(false);
const inventoryError = ref('');
const inventorySource = ref<'inventory-api' | 'legacy-derived' | 'unavailable'>('unavailable');
const podError = ref('');
const selected = ref<{ id: string; type: 'inventory' | 'pod'; name: string; item?: InventoryItem } | null>(null);
const selectedLogs = ref<string[]>([]);
const selectedEndpoints = ref<ServiceEndpoint[]>([]);
const diagnosticsError = ref('');
const diagnosticsLoading = ref(false);
const drawerCollapsed = ref(false);
const controlPanelOpen = ref(false);

const preflightLoading = ref(false);
const deployLocation = ref('eastus2');
const deployWorkload = ref('srelab');
const deploySkipRbac = ref(false);
const deploySkipSreAgent = ref(false);
const deployRunning = ref(false);
const deployJobStatus = ref<string | null>(null);
const deployRequestId = ref<string | null>(null);

const destroyResourceGroup = ref('rg-srelab-eastus2');
const destroyConfirmation = ref('');
const destroyRunning = ref(false);
const destroyJobStatus = ref<string | null>(null);
const destroyRequestId = ref<string | null>(null);
const destroyConfirmOpen = ref(false);
const destroyFinalConfirmed = ref(false);
const destroyCountdown = ref(0);
const jobLines = ref<string[]>([]);

const fixingAll = ref(false);
const togglingScenario = ref<string | null>(null);
const analystOpen = ref(false);
const analystQuestion = ref('');
const analystTranscript = ref<AnalystMessage[]>([]);
const analystError = ref('');
const analystLoading = ref(false);
const analystInputRef = ref<HTMLTextAreaElement | null>(null);
const analystDrawerRef = ref<HTMLElement | null>(null);
const analystTranscriptRef = ref<HTMLElement | null>(null);
let analystMessageId = 0;
let analystOpener: HTMLElement | null = null;

const MAX_ANALYST_HISTORY_MESSAGES = 10;
const MAX_ANALYST_HISTORY_CONTENT_LENGTH = 1_200;
const MAX_CONTEXT_INCIDENTS = 5;
const MAX_CONTEXT_RESOURCES = 6;
const MAX_CONTEXT_ENDPOINTS = 6;
const MAX_CONTEXT_PUBLIC_LINKS = 4;

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let destroyCountdownTimer: ReturnType<typeof setInterval> | null = null;

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const { data: wsData, connect } = useWebSocket(`${wsProtocol}//${window.location.host}/ws`);
connect();

watch(wsData, (msg: unknown) => {
  if (!msg || typeof msg !== 'object') return;
  const m = msg as Record<string, unknown>;
  const eventJobId = typeof m.jobId === 'string'
    ? m.jobId
    : typeof m.job === 'object' && m.job !== null
      ? (m.job as Job).requestId
      : undefined;
  if (!eventJobId) return;

  if (m.type === 'job:stdout' || m.type === 'job:stderr') {
    jobLines.value.push(String(m.data ?? ''));
  }
  if (m.type === 'job:complete') {
    const job = m.job as Job | undefined;
    if (eventJobId === deployRequestId.value) {
      deployJobStatus.value = job?.status ?? 'failed';
      deployRunning.value = false;
    }
    if (eventJobId === destroyRequestId.value) {
      destroyJobStatus.value = job?.status ?? 'failed';
      destroyRunning.value = false;
    }
  }
});

const readyPodCount = computed(() => pods.value.filter(pod => pod.ready && pod.status === 'Running').length);
const activeScenarios = computed(() => scenarios.value.filter(scenario => scenario.enabled).length);
const mismatchCount = computed(() => inventory.value.filter(item => item.severity === 'critical' || item.severity === 'warning').length);
const incidents = computed(() => inventory.value
  .filter(item => item.severity === 'critical' || item.severity === 'warning')
  .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  .slice(0, 5));
const overallSeverity = computed<InventorySeverity>(() => {
  if (inventory.value.some(item => item.severity === 'critical')) return 'critical';
  if (inventory.value.some(item => item.severity === 'warning') || activeScenarios.value > 0) return 'warning';
  if (inventory.value.length > 0 && readyPodCount.value === pods.value.length) return 'healthy';
  return 'unknown';
});
const heartbeatLabel = computed(() => {
  if (overallSeverity.value === 'critical') return 'Action required';
  if (overallSeverity.value === 'warning') return 'Degraded';
  if (overallSeverity.value === 'healthy') return 'Nominal';
  return 'Unknown';
});
const inventorySourceLabel = computed(() => {
  if (inventorySource.value === 'inventory-api') return '/api/inventory';
  if (inventorySource.value === 'legacy-derived') return 'derived fallback';
  return 'unavailable';
});
const selectedLabel = computed(() => {
  if (!selected.value) return 'Select inventory, service, or pod row';
  return `${selected.value.type === 'pod' ? 'Pod' : 'Resource'} · ${selected.value.name}`;
});
const diagnosticsStatus = computed(() => {
  if (diagnosticsLoading.value) return 'loading';
  if (diagnosticsError.value) return 'error';
  if (!selected.value) return 'idle';
  return 'loaded';
});
const selectedEvents = computed(() => {
  if (!selected.value) return events.value.slice(0, 8);
  const name = selected.value.name.toLowerCase();
  const podNames = selected.value.item?.pods?.map(pod => pod.name.toLowerCase()) ?? [];
  return events.value.filter(event => {
    const haystack = `${event.reason} ${event.message} ${event.source} ${event.involvedObject?.name ?? ''}`.toLowerCase();
    return haystack.includes(name) || podNames.some(podName => haystack.includes(podName));
  }).slice(0, 12);
});
const destroyCanArm = computed(() => destroyConfirmation.value === 'DELETE' && !destroyRunning.value);
const destroyCanConfirm = computed(() => destroyCanArm.value && destroyFinalConfirmed.value && destroyCountdown.value === 0);
const deployJobStatusLabel = computed(() => deployRunning.value ? 'running' : deployJobStatus.value ?? 'ready');
const deployJobBadgeClass = computed(() => badgeForJob(deployJobStatusLabel.value));
const preflightLabel = computed(() => {
  if (preflightLoading.value) return 'checking';
  if (preflightChecks.value.length === 0) return 'not run';
  return preflightChecks.value.every(check => check.status === 'pass') ? 'ready' : 'blocked';
});
const preflightBadgeClass = computed(() => {
  if (preflightChecks.value.length === 0) return 'badge-neutral';
  return preflightChecks.value.every(check => check.status === 'pass') ? 'badge-online' : 'badge-offline';
});
const statusLiveSummary = computed(() => `Mission status ${heartbeatLabel.value}. Inventory ${inventory.value.length} resources with ${mismatchCount.value} mismatches. Pods ${readyPodCount.value} of ${pods.value.length} ready. Scenarios ${activeScenarios.value} active.`);
const analystTranscriptStatus = computed(() => {
  if (analystTranscript.value.length === 0) return 'Local only';
  const answerCount = analystTranscript.value.filter(message => message.role === 'assistant').length;
  return `${answerCount} answer${answerCount === 1 ? '' : 's'}`;
});

async function refreshAll() {
  inventoryLoading.value = true;
  await Promise.all([loadInventory(), loadRuntime(), loadScenarios()]);
  inventoryLoading.value = false;
}

async function loadInventory() {
  inventoryError.value = '';
  try {
    const response = await getInventory();
    inventory.value = normalizeInventory(inventoryItemsFromResponse(response), response.namespace);
    if (Array.isArray(response.services)) services.value = response.services;
    if (Array.isArray(response.events)) events.value = response.events;
    inventorySource.value = 'inventory-api';
    return;
  } catch (error) {
    inventoryError.value = `Inventory API unavailable: ${error instanceof Error ? error.message : String(error)}. Showing explicit fallback from older endpoints if available.`;
  }

  const legacy = await Promise.allSettled([getDeployments(), getPods(), getServices()]);
  const deploymentResult = legacy[0];
  const podResult = legacy[1];
  const serviceResult = legacy[2];
  deployments.value = deploymentResult.status === 'fulfilled' ? deploymentResult.value.deployments : [];
  pods.value = podResult.status === 'fulfilled' ? podResult.value.pods : pods.value;
  services.value = serviceResult.status === 'fulfilled' ? serviceResult.value.services : [];

  if (deployments.value.length > 0 || services.value.length > 0) {
    inventory.value = deriveInventory(deployments.value, pods.value, services.value);
    inventorySource.value = 'legacy-derived';
  } else {
    inventory.value = [];
    inventorySource.value = 'unavailable';
  }
}

async function loadRuntime() {
  podError.value = '';
  const runtime = await Promise.allSettled([getPods(), getServices(), getEvents()]);
  if (runtime[0].status === 'fulfilled') pods.value = runtime[0].value.pods;
  else podError.value = `Pods unavailable: ${runtime[0].reason instanceof Error ? runtime[0].reason.message : String(runtime[0].reason)}`;
  if (runtime[1].status === 'fulfilled') services.value = runtime[1].value.services;
  if (runtime[2].status === 'fulfilled') events.value = runtime[2].value.events;
}

async function loadScenarios() {
  try {
    const response = await getScenarios();
    scenarios.value = response.scenarios;
  } catch {
    scenarios.value = [];
  }
}

async function runPreflight() {
  preflightLoading.value = true;
  try {
    const response = await getPreflight();
    preflightChecks.value = response.checks;
  } finally {
    preflightLoading.value = false;
  }
}

async function selectInventoryItem(item: InventoryItem) {
  selected.value = { id: inventoryKey(item), type: 'inventory', name: displayName(item), item };
  drawerCollapsed.value = false;
  await loadDiagnosticsFor(item);
}

async function selectPod(name: string) {
  selected.value = { id: `pod:${name}`, type: 'pod', name };
  drawerCollapsed.value = false;
  await loadDiagnosticsForPod(name);
}

async function loadDiagnosticsFor(item: InventoryItem) {
  diagnosticsLoading.value = true;
  diagnosticsError.value = '';
  selectedLogs.value = [];
  selectedEndpoints.value = flattenEndpointSummaries(item.endpointReadiness ?? []);
  const podName = item.pods?.[0]?.name;
  const serviceNames = diagnosticServiceNames(item);
  try {
    const requests: Promise<unknown>[] = [];
    if (podName) requests.push(getPodLogs(podName));
    requests.push(...serviceNames.map(serviceName => getServiceEndpoints(serviceName)));
    const results = await Promise.allSettled(requests);
    for (const result of results) {
      if (result.status !== 'fulfilled') throw result.reason;
      const value = result.value as Partial<ServiceEndpointsResponse> & { logs?: string[] | string };
      if (value.logs !== undefined) selectedLogs.value = normalizeLogLines(value.logs);
      if (value.endpoints !== undefined) selectedEndpoints.value = mergeEndpoints(selectedEndpoints.value, normalizeEndpointResponse(value as ServiceEndpointsResponse));
    }
  } catch (error) {
    diagnosticsError.value = `Diagnostics endpoint unavailable or empty: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    diagnosticsLoading.value = false;
  }
}

async function loadDiagnosticsForPod(name: string) {
  diagnosticsLoading.value = true;
  diagnosticsError.value = '';
  selectedLogs.value = [];
  selectedEndpoints.value = [];
  try {
    const response = await getPodLogs(name);
    selectedLogs.value = normalizeLogLines(response.logs);
  } catch (error) {
    diagnosticsError.value = `Pod logs unavailable: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    diagnosticsLoading.value = false;
  }
}

async function startDeploy() {
  deployRunning.value = true;
  deployJobStatus.value = 'pending';
  deployRequestId.value = null;
  jobLines.value = [`[Mission Control] Deploy requested for ${deployWorkload.value || 'srelab'} in ${deployLocation.value}.`];
  try {
    const response = await deploy({
      location: deployLocation.value,
      workloadName: deployWorkload.value || 'srelab',
      skipRbac: deploySkipRbac.value,
      skipSreAgent: deploySkipSreAgent.value,
      skipConfirmation: true,
    });
    deployRequestId.value = response.requestId;
    deployJobStatus.value = response.status;
    jobLines.value.push(...response.logs);
  } catch (error) {
    deployRunning.value = false;
    deployJobStatus.value = 'failed';
    diagnosticsError.value = `Deploy failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function startDestroy() {
  if (!destroyCanConfirm.value) return;
  closeDestroyConfirm();
  destroyRunning.value = true;
  destroyJobStatus.value = 'pending';
  destroyRequestId.value = null;
  jobLines.value = [`[Mission Control] Destroy requested for ${destroyResourceGroup.value}.`];
  try {
    const response = await destroy({
      resourceGroupName: destroyResourceGroup.value,
      confirmation: 'DELETE',
      skipConfirmation: true,
    });
    destroyRequestId.value = response.requestId;
    destroyJobStatus.value = response.status;
    jobLines.value.push(...response.logs);
  } catch (error) {
    destroyRunning.value = false;
    destroyJobStatus.value = 'failed';
    diagnosticsError.value = `Destroy failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    destroyConfirmation.value = '';
  }
}

function openDestroyConfirm() {
  if (!destroyCanArm.value) return;
  destroyConfirmOpen.value = true;
  destroyFinalConfirmed.value = false;
  startDestroyCountdown();
}

function closeDestroyConfirm() {
  destroyConfirmOpen.value = false;
  destroyFinalConfirmed.value = false;
  clearDestroyCountdown();
}

function startDestroyCountdown() {
  clearDestroyCountdown();
  destroyCountdown.value = 3;
  destroyCountdownTimer = setInterval(() => {
    destroyCountdown.value = Math.max(0, destroyCountdown.value - 1);
    if (destroyCountdown.value === 0) clearDestroyCountdown(false);
  }, 1000);
}

function clearDestroyCountdown(reset = true) {
  if (destroyCountdownTimer) {
    clearInterval(destroyCountdownTimer);
    destroyCountdownTimer = null;
  }
  if (reset) destroyCountdown.value = 0;
}

async function toggleScenario(scenario: Scenario) {
  togglingScenario.value = scenario.name;
  try {
    if (scenario.enabled) await disableScenario(scenario.name);
    else await enableScenario(scenario.name);
    await loadScenarios();
  } finally {
    togglingScenario.value = null;
  }
}

async function repairAllScenarios() {
  fixingAll.value = true;
  try {
    await fixAll();
    await loadScenarios();
  } finally {
    fixingAll.value = false;
  }
}

async function askAnalyst() {
  const question = analystQuestion.value.trim();
  if (!question) return;
  const history = buildAnalystHistory();
  analystLoading.value = true;
  analystError.value = '';
  analystOpen.value = true;
  const shouldFollowTranscript = isAnalystTranscriptNearBottom();
  analystTranscript.value.push({
    id: ++analystMessageId,
    role: 'user',
    content: question,
    createdAt: new Date().toISOString(),
  });
  scrollAnalystTranscriptToLatest(shouldFollowTranscript);
  analystQuestion.value = '';
  try {
    const response = await askAssistant(question, history, buildAnalystClientContext());
    analystTranscript.value.push({
      id: ++analystMessageId,
      role: 'assistant',
      content: response.answer,
      createdAt: response.metadata.timestamp,
      metadata: response.metadata,
    });
    scrollAnalystTranscriptToLatest(shouldFollowTranscript);
  } catch (error) {
    analystError.value = `Explain This State unavailable: ${error instanceof Error ? error.message : String(error)}`;
    analystTranscript.value.push({
      id: ++analystMessageId,
      role: 'assistant',
      content: analystError.value,
      createdAt: new Date().toISOString(),
    });
    scrollAnalystTranscriptToLatest(shouldFollowTranscript);
  } finally {
    analystLoading.value = false;
    // Re-check after the loading placeholder unmounts so the final scroll height is accurate.
    scrollAnalystTranscriptToLatest(shouldFollowTranscript);
  }
}

function isAnalystTranscriptNearBottom() {
  const transcript = analystTranscriptRef.value;
  if (!transcript) return true;
  const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
  return distanceFromBottom <= 96;
}

function scrollAnalystTranscriptToLatest(shouldScroll = isAnalystTranscriptNearBottom()) {
  void nextTick(() => {
    const transcript = analystTranscriptRef.value;
    if (!transcript || !shouldScroll) return;
    transcript.scrollTop = transcript.scrollHeight;
  });
}

async function openAnalyst(event?: MouseEvent) {
  const opener = event?.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  analystOpener = opener;
  analystOpen.value = true;
  await nextTick();
  focusFirstAnalystControl();
}

function closeAnalyst() {
  analystOpen.value = false;
  const opener = analystOpener;
  analystOpener = null;
  void nextTick(() => {
    if (opener && document.contains(opener)) {
      opener.focus();
    }
  });
}

function buildAnalystHistory(): AssistantConversationMessage[] {
  return analystTranscript.value
    .map((message): AssistantConversationMessage => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_ANALYST_HISTORY_CONTENT_LENGTH),
    }))
    .filter(message => message.content.length > 0)
    .slice(-MAX_ANALYST_HISTORY_MESSAGES);
}

function buildAnalystClientContext(): AssistantClientContext {
  const severityCounts = inventory.value.reduce<Partial<Record<InventorySeverity, number>>>((counts, item) => {
    counts[item.severity] = (counts[item.severity] ?? 0) + 1;
    return counts;
  }, {});
  return {
    capturedAt: new Date().toISOString(),
    route: window.location.pathname,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    selected: buildSelectedContext(),
    drawers: {
      analystOpen: analystOpen.value,
      diagnosticsCollapsed: drawerCollapsed.value,
      controlPanelOpen: controlPanelOpen.value,
      destroyConfirmOpen: destroyConfirmOpen.value,
    },
    activeControls: {
      deployLocation: deployLocation.value,
      deployWorkload: deployWorkload.value,
      deploySkipRbac: deploySkipRbac.value,
      deploySkipSreAgent: deploySkipSreAgent.value,
      destroyResourceGroupSet: destroyResourceGroup.value.trim().length > 0,
      ...(togglingScenario.value ? { scenarioToggleInProgress: togglingScenario.value } : {}),
      fixingAll: fixingAll.value,
      refreshing: inventoryLoading.value,
    },
    visiblePublicServiceLinks: visiblePublicServiceLinksForContext(),
    inventorySummary: {
      source: inventorySourceLabel.value,
      total: inventory.value.length,
      readyPods: readyPodCount.value,
      totalPods: pods.value.length,
      activeScenarios: activeScenarios.value,
      mismatches: mismatchCount.value,
      severityCounts,
      heartbeat: overallSeverity.value,
      topResources: inventory.value
        .slice(0, MAX_CONTEXT_RESOURCES)
        .map(item => ({
          name: displayName(item),
          namespace: item.namespace,
          severity: item.severity,
          desiredReplicas: item.desiredReplicas,
          readyReplicas: item.readyReplicas,
          reason: healthReason(item),
        })),
    },
    incidents: incidents.value.slice(0, MAX_CONTEXT_INCIDENTS).map(incident => ({
      name: displayName(incident),
      reason: healthReason(incident),
      severity: incident.severity,
      actualState: incident.actualState,
      podNames: incident.pods?.map(pod => pod.name).filter(Boolean).slice(0, 4),
    })),
    diagnostics: {
      status: diagnosticsStatus.value,
      selectedLogLineCount: selectedLogs.value.length,
      selectedEndpointCount: selectedEndpoints.value.length,
      selectedEventCount: selectedEvents.value.length,
      endpointSummaries: selectedEndpoints.value.slice(0, MAX_CONTEXT_ENDPOINTS).map(endpoint => `${endpoint.podName || endpoint.targetRef || endpoint.ip || 'endpoint'}:${endpoint.ready === false ? 'not ready' : 'ready'}`),
      ...(diagnosticsError.value ? { error: diagnosticsError.value } : {}),
    },
    wallboardSections: {
      inventory: inventorySectionState(),
      activeIncidents: incidents.value.length > 0 ? 'ready' : 'empty',
      runtime: `${readyPodCount.value}/${pods.value.length} pods ready`,
      diagnosticsDrawer: `${drawerCollapsed.value ? 'collapsed' : 'open'}; logs ${selectedLogs.value.length > 0 ? 'loaded' : 'not loaded'}; endpoints ${selectedEndpoints.value.length > 0 ? 'loaded' : 'not loaded'}`,
      controls: controlPanelOpen.value ? 'open' : 'closed',
      analyst: 'Local Analyst drawer open and preserving conversation history',
    },
  };
}

function buildSelectedContext(): AssistantClientContext['selected'] {
  if (!selected.value) return undefined;
  if (selected.value.type === 'pod') {
    const pod = pods.value.find(candidate => candidate.name === selected.value?.name);
    return {
      type: 'pod',
      id: selected.value.id,
      name: selected.value.name,
      namespace: pod?.namespace,
    };
  }

  const item = selected.value.item;
  return {
    type: 'inventory',
    id: selected.value.id,
    name: selected.value.name,
    namespace: item?.namespace,
    deploymentName: item?.deploymentName,
    serviceName: item?.serviceName,
    podNames: item?.pods?.map(pod => pod.name).filter(Boolean).slice(0, 6),
  };
}

function inventorySectionState(): string {
  if (inventoryLoading.value) return 'loading';
  if (inventoryError.value) return 'error';
  if (inventory.value.length === 0) return 'empty';
  return 'ready';
}

function visiblePublicServiceLinksForContext(): NonNullable<AssistantClientContext['visiblePublicServiceLinks']> {
  return services.value
    .flatMap(serviceToPublicLinksForContext)
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .slice(0, MAX_CONTEXT_PUBLIC_LINKS)
    .map(({ name, url, address }) => ({ name, url, address }));
}

function serviceToPublicLinksForContext(service: Service): Array<{ name: string; url: string; address: string; priority: number }> {
  if (isHttpUrl(service.publicUrl)) {
    return [{
      name: compactServiceNameForContext(service.name),
      url: service.publicUrl,
      address: service.externalHostname ?? service.externalIP ?? service.publicUrl,
      priority: servicePriorityForContext(service),
    }];
  }

  const addresses = [
    ...(service.loadBalancerIngress ?? []).map(ingress => ingress.hostname ?? ingress.ip).filter(isNonEmptyString),
    service.externalHostname,
    service.externalIP,
    ...(service.externalIPs ?? []).filter(isNonEmptyString),
  ].filter(isNonEmptyString);

  return Array.from(new Set(addresses)).map(address => {
    const port = selectServicePortForContext(service);
    return {
      name: compactServiceNameForContext(service.name),
      url: buildServiceUrlForContext(address, port),
      address,
      priority: servicePriorityForContext(service),
    };
  });
}

function selectServicePortForContext(service: Service): NonNullable<Service['portDetails']>[number] | undefined {
  const ports = service.portDetails ?? [];
  return ports.find(port => port.port === 443)
    ?? ports.find(port => port.port === 80)
    ?? ports.find(port => port.name?.toLowerCase().includes('http'))
    ?? ports[0];
}

function buildServiceUrlForContext(address: string, port?: NonNullable<Service['portDetails']>[number]): string {
  const portNumber = port?.port;
  const portName = port?.name?.toLowerCase() ?? '';
  const appProtocol = port?.appProtocol?.toLowerCase() ?? '';
  const secure = portNumber === 443 || portName.includes('https') || appProtocol.includes('https');
  const protocol = secure ? 'https' : 'http';
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  const portSuffix = portNumber && !((secure && portNumber === 443) || (!secure && portNumber === 80))
    ? `:${portNumber}`
    : '';
  return `${protocol}://${host}${portSuffix}`;
}

function servicePriorityForContext(service: Service): number {
  const name = service.name.toLowerCase();
  if (name.includes('grid-dashboard')) return 0;
  if (name.includes('ops-console')) return 1;
  if (name.includes('dashboard')) return 2;
  if (service.type === 'LoadBalancer') return 3;
  return 4;
}

function compactServiceNameForContext(name: string): string {
  return name
    .replace(/^energy-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function handleAnalystDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAnalyst();
  }
}

function getAnalystFocusableElements(): HTMLElement[] {
  const drawer = analystDrawerRef.value;
  if (!drawer) return [];
  return Array.from(drawer.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.hasAttribute('disabled') && style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
  });
}

function focusFirstAnalystControl() {
  const focusable = getAnalystFocusableElements();
  const target = analystInputRef.value && !analystInputRef.value.disabled
    ? analystInputRef.value
    : focusable[0] ?? analystDrawerRef.value;
  target?.focus();
}

function handleAnalystDocumentKeydown(event: KeyboardEvent) {
  if (!analystOpen.value || event.key !== 'Escape') return;
  event.preventDefault();
  closeAnalyst();
}

function formatAnalystTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return timestamp;
  }
}

function inventoryItemsFromResponse(response: {
  namespace?: string;
  inventory?: InventoryItem[];
  deployments?: InventoryItem[];
  orphanPods?: InventoryItem['pods'];
}): InventoryItem[] {
  if (Array.isArray(response.inventory) && response.inventory.length > 0) {
    return response.inventory;
  }

  const deploymentItems = Array.isArray(response.deployments)
    ? response.deployments.map(item => ({
      ...item,
      deploymentName: item.deploymentName ?? item.name,
      serviceName: item.serviceName ?? item.services?.[0]?.name,
    }))
    : [];

  const orphanItems = (response.orphanPods ?? []).map(pod => ({
    id: `pod:${pod.name}`,
    name: pod.name,
    namespace: pod.namespace ?? response.namespace ?? 'energy',
    desiredReplicas: 0,
    runningReplicas: pod.phase === 'Running' || pod.status === 'Running' ? 1 : 0,
    readyReplicas: pod.ready ? 1 : 0,
    expectedState: 'Claimed by a deployment',
    actualState: pod.reason || pod.status || pod.phase || 'Unknown',
    severity: pod.ready ? 'unknown' : 'warning',
    reason: pod.ready ? 'Orphan pod' : (pod.reason || 'Orphan pod not ready'),
    restarts: Number(pod.restarts ?? 0),
    pods: [pod],
  } satisfies InventoryItem));

  return [...deploymentItems, ...orphanItems];
}

function normalizeInventory(items: InventoryItem[], fallbackNamespace = 'energy'): InventoryItem[] {
  return items.map(item => ({
    ...item,
    namespace: item.namespace ?? fallbackNamespace,
    serviceName: item.serviceName ?? item.services?.[0]?.name,
    deploymentName: item.deploymentName ?? item.name,
    desiredReplicas: Number(item.desiredReplicas ?? item.replicas ?? 0),
    runningReplicas: Number(item.runningReplicas ?? item.runningPods ?? 0),
    readyReplicas: Number(item.readyReplicas ?? item.readyPods ?? 0),
    restarts: Number(item.restarts ?? 0),
    expectedState: item.expectedState || `${Number(item.desiredReplicas ?? item.replicas ?? 0)} replicas ready`,
    actualState: item.actualState || `${Number(item.readyReplicas ?? item.readyPods ?? 0)}/${Number(item.desiredReplicas ?? item.replicas ?? 0)} ready`,
    severity: normalizeSeverity(item.severity ?? item.status),
  }));
}

function deriveInventory(deploymentsInput: Deployment[], podsInput: Pod[], servicesInput: Service[]): InventoryItem[] {
  const deploymentItems = deploymentsInput.map(deployment => {
    const relatedPods = podsInput.filter(pod => pod.name.startsWith(deployment.name));
    const runningReplicas = relatedPods.filter(pod => pod.status === 'Running').length;
    const readyReplicas = relatedPods.filter(pod => pod.ready).length || deployment.readyReplicas;
    const restarts = relatedPods.reduce((total, pod) => total + pod.restarts, 0);
    const desiredReplicas = deployment.desiredReplicas ?? deployment.replicas;
    const severity = deriveSeverity(desiredReplicas, runningReplicas, readyReplicas, restarts, relatedPods);
    return {
      name: deployment.name,
      deploymentName: deployment.name,
      namespace: deployment.namespace,
      desiredReplicas,
      runningReplicas,
      readyReplicas,
      expectedState: `${desiredReplicas} replicas ready`,
      actualState: `${readyReplicas}/${desiredReplicas} ready`,
      severity,
      reason: deriveReason(desiredReplicas, runningReplicas, readyReplicas, restarts, relatedPods),
      restarts,
      pods: relatedPods.map(pod => ({
        name: pod.name,
        namespace: pod.namespace,
        status: pod.status,
        ready: pod.ready,
        restarts: pod.restarts,
      })),
    } satisfies InventoryItem;
  });

  const serviceItems = servicesInput
    .filter(service => !deploymentItems.some(item => item.name === service.name))
    .map(service => ({
      name: service.name,
      serviceName: service.name,
      namespace: service.namespace,
      desiredReplicas: 0,
      runningReplicas: 0,
      readyReplicas: 0,
      expectedState: 'Endpoints ready',
      actualState: service.clusterIP ? `ClusterIP ${service.clusterIP}` : 'Unknown endpoints',
      severity: 'unknown' as InventorySeverity,
      reason: 'Endpoint resolver pending',
      restarts: 0,
      pods: [],
    }));

  return [...deploymentItems, ...serviceItems];
}

function deriveSeverity(desired: number, running: number, ready: number, restarts: number, relatedPods: Pod[]): InventorySeverity {
  if (relatedPods.some(pod => ['CrashLoopBackOff', 'Error', 'Failed', 'OOMKilled'].includes(pod.status))) return 'critical';
  if (desired > 0 && (running < desired || ready < desired)) return 'critical';
  if (restarts > 0 || relatedPods.some(pod => pod.status !== 'Running')) return 'warning';
  return 'healthy';
}

function deriveReason(desired: number, running: number, ready: number, restarts: number, relatedPods: Pod[]): string {
  const failedPod = relatedPods.find(pod => ['CrashLoopBackOff', 'Error', 'Failed', 'OOMKilled'].includes(pod.status));
  if (failedPod) return failedPod.status;
  if (desired > 0 && running < desired) return `${desired - running} unavailable`;
  if (desired > 0 && ready < desired) return `${desired - ready} not ready`;
  if (restarts > 0) return `${restarts} restarts`;
  return 'Matches expected state';
}

function replicaSummary(item: InventoryItem): string {
  const desired = Number(item.desiredReplicas ?? 0);
  const ready = Number(item.readyReplicas ?? 0);
  if (desired <= 0) {
    return item.serviceName ? 'Endpoint target' : 'No replica target';
  }
  return `${ready}/${desired}`;
}

function inventoryLiveState(item: InventoryItem): string {
  if (item.severity === 'healthy') return item.readyReplicas > 0 ? 'Ready' : 'Available';
  if (item.severity === 'critical') return 'Action required';
  if (item.severity === 'warning') return 'Degraded';
  return nonReplicaActualState(item) || 'Unknown';
}

function healthReason(item: InventoryItem): string {
  const reason = item.reason?.trim();
  if (reason) return reason;
  if (item.severity === 'healthy') return 'Matches expected state';
  return nonReplicaActualState(item) || 'No reason reported';
}

function inventorySignal(item: InventoryItem): string {
  const restarts = Number(item.restarts ?? 0);
  if (restarts > 0) return `${restarts} restart${restarts === 1 ? '' : 's'}`;
  if (item.severity === 'critical') return 'Inspect now';
  if (item.severity === 'warning') return 'Watch';
  if (item.severity === 'healthy') return 'Stable';
  return 'Review';
}

function nonReplicaActualState(item: InventoryItem): string {
  const actual = item.actualState?.trim() ?? '';
  if (!actual || /^\d+\s*\/\s*\d+\s+ready$/i.test(actual)) return '';
  return actual;
}

function normalizeSeverity(severity?: string): InventorySeverity {
  if (severity === 'critical' || severity === 'warning' || severity === 'healthy' || severity === 'unknown') return severity;
  return 'unknown';
}

function normalizeLogLines(logs: string[] | string): string[] {
  if (Array.isArray(logs)) return logs;
  return logs.split(/\r?\n/).filter(line => line.length > 0);
}

function diagnosticServiceNames(item: InventoryItem): string[] {
  const names = [
    item.serviceName,
    ...(item.services?.map(service => service.name) ?? []),
  ].filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

function normalizeEndpointResponse(response: ServiceEndpointsResponse): ServiceEndpoint[] {
  return normalizeEndpointValue(response.endpoints);
}

function flattenEndpointSummaries(summaries: ServiceEndpointSummary[]): ServiceEndpoint[] {
  return summaries.flatMap(summary => normalizeEndpointValue(summary));
}

function normalizeEndpointValue(value: ServiceEndpointsResponse['endpoints']): ServiceEndpoint[] {
  if (Array.isArray(value)) return value;
  return (value.addresses ?? []).map(address => ({
    ip: address.ip,
    podName: address.targetRef?.name,
    ready: address.ready,
    targetRef: address.targetRef?.name ?? address.targetRef?.kind,
    ports: formatEndpointPorts(address.ports),
  }));
}

function mergeEndpoints(existing: ServiceEndpoint[], incoming: ServiceEndpoint[]): ServiceEndpoint[] {
  const seen = new Set(existing.map(endpointKey));
  const merged = [...existing];
  for (const endpoint of incoming) {
    const key = endpointKey(endpoint);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(endpoint);
    }
  }
  return merged;
}

function endpointKey(endpoint: ServiceEndpoint): string {
  return `${endpoint.ip ?? ''}:${endpoint.podName ?? ''}:${endpoint.targetRef ?? ''}:${endpoint.ports ?? ''}`;
}

function formatEndpointPorts(ports: ServiceEndpointSummary['addresses'][number]['ports']): string {
  if (!ports || ports.length === 0) return 'ports unknown';
  return ports.map(port => `${port.port}/${port.protocol}`).join(', ');
}

function displayName(item: InventoryItem): string {
  return item.serviceName || item.deploymentName || item.name;
}

function inventoryKey(item: InventoryItem): string {
  return item.id || `${item.namespace ?? 'energy'}:${displayName(item)}`;
}

function severityRank(severity: InventorySeverity): number {
  if (severity === 'critical') return 4;
  if (severity === 'warning') return 3;
  if (severity === 'healthy') return 2;
  return 1;
}

function badgeForJob(status: string): string {
  if (status === 'completed') return 'badge-online';
  if (status === 'failed') return 'badge-offline';
  if (status === 'running' || status === 'pending') return 'badge-warning';
  return 'badge-neutral';
}

function preflightStatusSymbol(status: PreflightCheck['status']): string {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '⚠';
  return '✗';
}

function preflightStatusLabel(status: PreflightCheck['status']): string {
  if (status === 'pass') return 'Pass';
  if (status === 'warn') return 'Warning';
  return 'Fail';
}

function formatScenarioName(name: string): string {
  return name.replace(/[-_]/g, ' ');
}

function formatEventTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

onMounted(() => {
  refreshAll();
  runPreflight();
  refreshTimer = setInterval(refreshAll, 5000);
  document.addEventListener('keydown', handleAnalystDocumentKeydown);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  clearDestroyCountdown();
  document.removeEventListener('keydown', handleAnalystDocumentKeydown);
});

watch(analystOpen, (open) => {
  emit('analyst-open-change', open);
});

watch(destroyCanArm, (canArm) => {
  if (!canArm && destroyConfirmOpen.value) closeDestroyConfirm();
});

watch(() => props.analystOpenRequest, (request, previousRequest) => {
  if (request > 0 && request !== previousRequest) {
    void openAnalyst();
  }
});

defineExpose({
  openAnalyst,
});
</script>

<style scoped>
.wallboard {
  display: grid;
  grid-template-rows: auto auto auto auto;
  gap: 0.75rem;
  min-height: calc(100vh - 80px);
  padding: 0.75rem;
  padding-bottom: 2rem;
  overflow: visible;
}

.wallboard__status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 0.75rem;
}

.status-tile,
.wallboard-card,
.inventory-panel,
.diagnostics-drawer,
.control-dock__card {
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: rgb(15 23 42 / 0.84);
  box-shadow: var(--shadow-tight);
}

.status-tile {
  padding: 0.65rem 0.8rem;
}

.status-tile__label,
.wallboard-kicker,
.control-row label span,
.log-stream__title {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-tile strong {
  display: block;
  margin-top: 0.2rem;
  color: var(--text);
  font-size: 1.45rem;
  line-height: 1.1;
}

.status-tile--critical {
  border-color: rgb(239 68 68 / 0.72);
  background: linear-gradient(180deg, rgb(127 29 29 / 0.35), rgb(15 23 42 / 0.82));
}

.status-tile--warning {
  border-color: rgb(245 158 11 / 0.72);
  background: linear-gradient(180deg, rgb(120 53 15 / 0.3), rgb(15 23 42 / 0.82));
}

.status-tile--healthy {
  border-color: rgb(16 185 129 / 0.58);
  background: linear-gradient(180deg, rgb(6 78 59 / 0.25), rgb(15 23 42 / 0.82));
}

.status-tile--unknown {
  border-color: rgb(107 114 128 / 0.72);
  background: linear-gradient(180deg, rgb(55 65 81 / 0.24), rgb(15 23 42 / 0.82));
}

.wallboard__actions {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.wallboard .command-button,
.wallboard .danger-button {
  padding: 0.55rem 0.8rem;
  font-size: 0.95rem;
}

.control-dock {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.control-dock__card {
  padding: 0.8rem;
}

.control-dock__card--danger {
  border-color: var(--danger-border);
}

.destroy-gate-copy {
  margin: 0.4rem 0 0.55rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.35;
}

.control-dock__heading,
.wallboard-panel__heading,
.diagnostics-drawer__header,
.analyst-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.control-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin: 0.65rem 0;
}

.control-row .field-control {
  width: 100%;
  border: 1px solid var(--control-border);
  border-radius: 0.65rem;
  background: var(--control-bg);
  color: var(--text);
  padding: 0.45rem 0.55rem;
  font-size: 0.9rem;
}

.compact-list,
.endpoint-list {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.65rem;
  color: var(--muted);
  font-size: 0.82rem;
  list-style: none;
}

.compact-list li {
  display: flex;
  gap: 0.45rem;
}

.preflight-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 1.7rem;
  color: var(--text);
  font-weight: 900;
}

.scenario-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.65rem;
}

.wallboard__main {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(420px, 2fr);
  gap: 0.75rem;
}

.inventory-panel,
.ops-panel {
  /* Natural height */
}

.inventory-panel {
  display: flex;
  flex-direction: column;
  padding: 0.9rem;
}

.ops-panel {
  display: grid;
  grid-template-rows: auto auto;
  gap: 0.75rem;
}

.wallboard-card {
  padding: 0.85rem;
}

.wallboard-panel__heading {
  margin-bottom: 0.75rem;
}

.wallboard-panel__heading h2,
.diagnostics-drawer__header h2 {
  color: var(--text);
  font-size: 1.45rem;
  font-weight: 900;
  line-height: 1.1;
}

.wallboard-panel__meta,
.diagnostics-drawer__actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.wallboard-alert,
.wallboard-empty {
  border: 1px solid rgb(148 163 184 / 0.2);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.4;
}

.wallboard-alert--warning {
  border-color: rgb(245 158 11 / 0.45);
  color: #fcd34d;
}

.inventory-table {
  border: 1px solid rgb(51 65 85 / 0.72);
  border-radius: var(--radius-sm);
}

.inventory-table__row {
  display: grid;
  grid-template-columns: minmax(240px, 1.6fr) minmax(170px, 1fr) minmax(130px, 0.75fr) minmax(110px, 0.7fr) minmax(190px, 1.2fr) minmax(110px, 0.7fr);
  gap: 0.65rem;
  align-items: stretch;
  width: 100%;
  text-align: left;
}

.inventory-table__head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgb(2 6 23 / 0.96);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.inventory-table__head span,
.inventory-table__body span {
  padding: 0.75rem 0.45rem;
}

.inventory-table__body {
  border: 0;
  border-top: 1px solid rgb(148 163 184 / 0.1);
  background: rgb(15 23 42 / 0.56);
  color: var(--text);
  cursor: pointer;
  font-size: 1.15rem;
}

.inventory-table__body:hover,
.inventory-table__body.is-selected {
  box-shadow: inset 0 0 0 2px rgb(34 211 238 / 0.38);
}

.inventory-table__body:focus-visible,
.incident-row:focus-visible,
.pod-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.inventory-table__body--critical { background: linear-gradient(90deg, rgb(127 29 29 / 0.5), rgb(15 23 42 / 0.62)); }
.inventory-table__body--warning { background: linear-gradient(90deg, rgb(120 53 15 / 0.46), rgb(15 23 42 / 0.62)); }
.inventory-table__body--healthy { background: linear-gradient(90deg, rgb(6 78 59 / 0.34), rgb(15 23 42 / 0.62)); }

.inventory-name strong {
  display: block;
  font-size: 1.25rem;
}

.inventory-name small,
.pod-row small {
  display: block;
  margin-top: 0.18rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.live-state,
.restart-warning {
  color: #fcd34d;
  font-weight: 900;
}

.replica-summary {
  color: var(--text);
  font-weight: 800;
}

.signal-cell {
  color: var(--text);
  font-weight: 800;
}

.health-cell {
  display: flex;
  align-items: center;
}

.severity-badge {
  display: inline-flex;
  border-radius: 999px;
  padding: 0.22rem 0.56rem;
  font-size: 0.84rem;
  font-weight: 900;
  text-transform: uppercase;
}

.severity-badge--critical { background: #7f1d1d; color: #fecaca; border: 1px solid rgb(239 68 68 / 0.38); }
.severity-badge--warning { background: #78350f; color: #fde68a; border: 1px solid rgb(245 158 11 / 0.38); }
.severity-badge--healthy { background: #064e3b; color: #a7f3d0; border: 1px solid rgb(16 185 129 / 0.32); }
.severity-badge--unknown { background: #374151; color: #d1d5db; border: 1px solid rgb(107 114 128 / 0.38); }

.incident-row,
.pod-row {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  width: 100%;
  margin-bottom: 0.5rem;
  border: 1px solid rgb(148 163 184 / 0.14);
  border-radius: var(--radius-sm);
  background: rgb(2 6 23 / 0.34);
  color: var(--text);
  cursor: pointer;
  padding: 0.7rem;
  text-align: left;
  transition: box-shadow 160ms ease, opacity 160ms ease;
}

.incident-row:hover,
.pod-row:hover {
  box-shadow: inset 0 0 0 2px rgb(34 211 238 / 0.2);
}

.incident-row:active,
.pod-row:active {
  opacity: 0.85;
}

.incident-row.is-selected,
.pod-row.is-selected {
  box-shadow: inset 0 0 0 2px rgb(34 211 238 / 0.38);
}

.incident-row span,
.pod-row__state {
  color: var(--muted);
  font-size: 0.9rem;
}

.incident-row--critical { border-color: rgb(239 68 68 / 0.56); }
.incident-row--warning,
.pod-row--warning { border-color: rgb(245 158 11 / 0.44); }
.pod-row--healthy { border-color: rgb(16 185 129 / 0.24); }

.analyst-input {
  width: 100%;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-sm);
  background: var(--control-bg);
  color: var(--text);
  padding: 0.75rem;
  resize: none;
}

.analyst-drawer {
  position: fixed;
  top: 80px;
  right: 0;
  bottom: 0;
  z-index: 35;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 0.8rem;
  min-height: 0;
  width: clamp(360px, 25vw, 520px);
  max-width: calc(100vw - 1rem);
  overflow: hidden;
  border-left: 1px solid rgb(34 211 238 / 0.32);
  background:
    linear-gradient(180deg, rgb(15 23 42 / 0.98), rgb(2 6 23 / 0.98)),
    var(--bg-deep);
  box-shadow: -28px 0 70px rgb(2 6 23 / 0.5);
  padding: 1rem;
}

.analyst-drawer__header,
.analyst-drawer__status,
.analyst-composer__footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.analyst-drawer__header h2 {
  color: var(--text);
  font-size: 1.55rem;
  font-weight: 900;
  line-height: 1.1;
}

.analyst-drawer__header p {
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}

.analyst-drawer__status {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.analyst-transcript {
  min-width: 0;
  min-height: 0;
  border: 1px solid rgb(51 65 85 / 0.76);
  border-radius: var(--radius-sm);
  background: rgb(2 6 23 / 0.5);
  padding: 0.75rem;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.analyst-transcript:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.analyst-empty {
  border: 1px dashed rgb(148 163 184 / 0.28);
  border-radius: var(--radius-sm);
  color: var(--muted);
  padding: 0.85rem;
  line-height: 1.45;
}

.analyst-message {
  display: grid;
  gap: 0.38rem;
  min-width: 0;
  margin-bottom: 0.75rem;
  border: 1px solid rgb(148 163 184 / 0.16);
  border-radius: var(--radius-sm);
  padding: 0.75rem;
  color: var(--text);
  overflow-wrap: anywhere;
}

.analyst-message--user {
  border-color: rgb(34 211 238 / 0.28);
  background: rgb(8 47 73 / 0.28);
}

.analyst-message--assistant {
  border-color: rgb(167 139 250 / 0.26);
  background: rgb(30 27 75 / 0.24);
}

.analyst-message__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
  color: var(--muted);
  font-size: 0.82rem;
}

.analyst-message__meta strong {
  color: var(--text);
}

.analyst-message p {
  min-width: 0;
  margin: 0;
  color: var(--text);
  font-size: 0.98rem;
  line-height: 1.48;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.analyst-message__sources {
  min-width: 0;
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.analyst-composer {
  display: grid;
  gap: 0.55rem;
  border-top: 1px solid rgb(148 163 184 / 0.12);
  padding-top: 0.75rem;
}

.analyst-composer__footer {
  align-items: center;
  color: var(--muted);
  font-size: 0.85rem;
}

.diagnostics-drawer {
  display: grid;
  grid-template-rows: auto auto;
  padding: 0.8rem;
}

.diagnostics-drawer.is-collapsed {
  min-height: 72px;
  max-height: 72px;
}

.diagnostics-drawer__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem;
}

.log-stream {
  border: 1px solid rgb(51 65 85 / 0.76);
  border-radius: var(--radius-sm);
  background: rgb(2 6 23 / 0.55);
  padding: 0.75rem;
}

.log-stream pre {
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(2 6 23 / 0.74);
  backdrop-filter: blur(8px);
}

.confirm-modal {
  width: min(520px, 100%);
  border: 1px solid rgb(239 68 68 / 0.52);
  border-radius: var(--radius-md);
  background:
    linear-gradient(180deg, rgb(127 29 29 / 0.24), rgb(15 23 42 / 0.96)),
    var(--bg-deep);
  box-shadow: 0 28px 80px rgb(2 6 23 / 0.56);
  padding: 1rem;
}

.confirm-modal__heading,
.confirm-modal__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.confirm-modal h2 {
  color: var(--text);
  font-size: 1.55rem;
  line-height: 1.1;
}

.confirm-modal p {
  margin-top: 0.8rem;
  color: var(--text);
  line-height: 1.45;
}

.confirm-check {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  margin: 1rem 0;
  color: var(--text);
  font-size: 1rem;
  line-height: 1.35;
}

.confirm-check input {
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.1rem;
  accent-color: var(--red);
}

.event-row {
  display: grid;
  gap: 0.2rem;
  border-bottom: 1px solid rgb(148 163 184 / 0.1);
  padding: 0.45rem 0;
  color: var(--text);
}

.event-row span {
  color: var(--muted);
  font-size: 0.86rem;
}

.event-row--warning strong {
  color: var(--amber);
}

@media (max-width: 1100px) {
  .wallboard {
    /* Already auto-height; no overrides needed */
  }

  .wallboard__status-strip,
  .control-dock,
  .wallboard__main,
  .diagnostics-drawer__body {
    grid-template-columns: 1fr;
  }

  .ops-panel {
    grid-template-rows: auto;
  }

  .analyst-drawer {
    top: 0;
    width: min(100vw, 420px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .incident-row:active,
  .pod-row:active {
    opacity: 1;
  }
}
</style>
