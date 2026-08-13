<template>
  <!--
    Azure SRE Agent panel.

    Deliberately distinct from the Local Analyst panel (AssistantPanel.vue):
    different eyebrow, title, accent colour, icon and copy, so an audience can never
    confuse a real Azure SRE Agent response with the local read-only explainer.
    This panel only ever renders output that carries a real agent resource and thread ID.
  -->
  <section id="sre-agent" class="mission-panel sre-agent-panel">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow sre-agent-eyebrow">
          <span class="sre-agent-mark" aria-hidden="true">A</span>
          Azure SRE Agent · cloud agent
        </span>
        <h2 class="panel-title">Investigate with Azure SRE Agent</h2>
        <p class="panel-description">
          Runs a <strong>real</strong> Azure SRE Agent investigation over the supported Azure MCP Server path, using your
          host Azure sign-in. This is not the Local Analyst: responses below come from the Azure SRE Agent resource named
          in the identity strip, and every answer carries a live thread ID.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge sre-agent-badge">Real agent</span>
        <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
      </div>
    </div>

    <!-- Not configured: fail honestly, never silently fall back. -->
    <div v-if="config && !config.configured" class="wallboard-alert wallboard-alert--warning" role="status">
      <strong>Azure SRE Agent is not configured.</strong>
      <ul class="compact-list">
        <li v-for="issue in config.configurationIssues" :key="issue">{{ issue }}</li>
      </ul>
      <a class="command-button command-button--neutral sre-agent-portal-link" :href="config.portalHandoff.href" target="_blank" rel="noreferrer noopener">
        {{ config.portalHandoff.label }}
      </a>
    </div>

    <div v-if="config?.configured" class="sre-agent-layout">
      <!-- Identity strip: proves which agent and thread produced the answer. -->
      <div class="card card--status sre-agent-identity" aria-label="Agent and thread identity">
        <div class="field-label">Agent &amp; thread identity</div>
        <dl class="sre-agent-identity__grid">
          <div>
            <dt>Agent</dt>
            <dd>{{ investigation?.agent.name ?? config.target.agentName ?? 'Not resolved' }}</dd>
          </div>
          <div>
            <dt>ARM resource</dt>
            <dd class="sre-agent-mono">{{ investigation?.agent.armIdMasked ?? 'Resolved on first investigation' }}</dd>
          </div>
          <div>
            <dt>Subscription</dt>
            <dd class="sre-agent-mono">{{ investigation?.agent.subscriptionIdMasked ?? config.target.subscriptionIdMasked ?? '—' }}</dd>
          </div>
          <div>
            <dt>Thread ID</dt>
            <dd class="sre-agent-mono">{{ investigation?.thread.id ?? 'No thread yet' }}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{{ investigation ? formatTime(investigation.metadata.startedAt) : '—' }}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{{ elapsedLabel }}</dd>
          </div>
        </dl>
        <p class="sre-agent-note">
          Subscription and tenant identifiers are masked here and in the response text below.
          Auto-approval tools (<code>investigate_yolo</code>) are blocked in code and absent from the MCP server surface.
        </p>
      </div>

      <!-- Scenario starters + follow-up -->
      <div class="card card--control sre-agent-card">
        <div class="field-label">Approved scenario starters</div>
        <div class="sre-agent-prompts">
          <button
            v-for="scenario in config.scenarioPrompts"
            :key="scenario.scenarioName"
            class="command-button command-button--neutral sre-agent-prompt"
            type="button"
            :disabled="busy"
            :title="scenario.prompt"
            @click="startFromScenario(scenario.scenarioName)"
          >
            {{ scenario.scenarioName }}
          </button>
        </div>

        <label class="field-label" for="sre-agent-prompt">
          {{ investigation ? 'Follow-up in this thread' : 'Or write an investigation prompt' }}
        </label>
        <textarea
          id="sre-agent-prompt"
          v-model="prompt"
          class="field-control sre-agent-input"
          maxlength="4000"
          rows="3"
          :disabled="busy"
          :placeholder="investigation ? 'Ask a follow-up; it continues the same thread…' : 'Describe the incident to investigate…'"
          @keydown.meta.enter.prevent="submitPrompt"
          @keydown.ctrl.enter.prevent="submitPrompt"
        ></textarea>

        <div class="sre-agent-footer">
          <span>{{ prompt.length }}/4000</span>
          <div class="sre-agent-actions">
            <button
              v-if="busy"
              class="command-button command-button--warning px-4 py-2 text-xs"
              type="button"
              @click="cancel"
            >
              Stop
            </button>
            <button
              class="command-button sre-agent-run px-4 py-2 text-xs"
              type="button"
              :disabled="busy || prompt.trim().length === 0"
              :style="{ opacity: busy || prompt.trim().length === 0 ? 0.5 : 1 }"
              @click="submitPrompt"
            >
              {{ busy ? 'Investigating…' : investigation ? 'Send follow-up' : 'Investigate with SRE Agent' }}
            </button>
          </div>
        </div>
        <p v-if="busy" class="sre-agent-note" role="status">
          Standard mode: the agent pauses at approval gates and Mission Control never auto-approves.
        </p>
      </div>

      <!-- Honest failure + portal handoff. Never a Local Analyst answer. -->
      <div v-if="failure" class="card card--status sre-agent-failure" role="alert">
        <div class="field-label">Azure SRE Agent unavailable</div>
        <p class="sre-agent-failure__message">{{ failure.error }}</p>
        <p class="sre-agent-failure__remediation">{{ failure.remediation }}</p>
        <p class="sre-agent-note">
          Mission Control did not substitute Local Analyst output for this request. No SRE Agent result is shown above.
        </p>
        <a
          class="command-button command-button--neutral sre-agent-portal-link"
          :href="failure.portalHandoff.href"
          target="_blank"
          rel="noreferrer noopener"
        >
          {{ failure.portalHandoff.label }}
        </a>
        <details v-if="failure.portalHandoff.prompt" class="sre-agent-details">
          <summary>Prompt to run manually in the portal</summary>
          <pre class="sre-agent-pre">{{ failure.portalHandoff.prompt }}</pre>
        </details>
      </div>

      <!-- Approval gate -->
      <div v-if="investigation?.approval.required" class="card card--status sre-agent-approval" role="status">
        <div class="field-label">Approval gate — operator action required</div>
        <p>{{ investigation.approval.detail ?? 'The agent paused and is waiting for human approval before continuing.' }}</p>
        <p class="sre-agent-note">
          Mission Control cannot approve this. Review and approve in the Azure SRE Agent portal.
        </p>
        <a class="command-button command-button--neutral sre-agent-portal-link" :href="portalUrl" target="_blank" rel="noreferrer noopener">
          Approve in Azure SRE Agent portal
        </a>
      </div>

      <!-- Response -->
      <div v-if="investigation" class="card card--status sre-agent-response">
        <div class="field-label">
          Azure SRE Agent response
          <span class="sre-agent-provenance">from agent {{ investigation.agent.name }} · thread {{ shortThread }}</span>
        </div>
        <pre class="sre-agent-pre">{{ investigation.response }}</pre>
        <p v-if="investigation.metadata.truncated" class="sre-agent-note">
          Response truncated by Mission Control output limits.
        </p>

        <div class="field-label">Citations</div>
        <ul v-if="investigation.citationsPresent" class="compact-list">
          <li v-for="(citation, index) in investigation.citations" :key="`${citation.label}-${index}`">
            <a v-if="citation.url" :href="citation.url" target="_blank" rel="noreferrer noopener">{{ citation.label }}</a>
            <span v-else>{{ citation.label }}</span>
            <span v-if="citation.source" class="badge badge-info sre-agent-citation-source">{{ citation.source }}</span>
          </li>
        </ul>
        <p v-else class="sre-agent-note">
          The agent returned no citations for this response. Mission Control does not invent citations.
          Citation links open the cited Azure resource and may contain a resource path.
        </p>

        <details class="sre-agent-details">
          <summary>Provenance and limitations</summary>
          <ul class="compact-list">
            <li>Operation: <code>{{ investigation.metadata.operation }}</code> via <code>{{ investigation.metadata.tool }}</code></li>
            <li>Azure MCP Server: <code>{{ investigation.metadata.serverPackage }}</code></li>
            <li>Correlation ID: <code>{{ investigation.metadata.correlationId }}</code></li>
            <li>Response shape confidence: {{ investigation.metadata.schemaConfidence }}</li>
            <li v-for="limitation in investigation.metadata.limitations" :key="limitation">{{ limitation }}</li>
          </ul>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError, useApi, type SreAgentConfigResponse } from '../composables/useApi';
import type { SreAgentErrorResponse, SreAgentInvestigation } from '../types/api';

const api = useApi();

const config = ref<SreAgentConfigResponse | null>(null);
const investigation = ref<SreAgentInvestigation | null>(null);
const failure = ref<SreAgentErrorResponse | null>(null);
const prompt = ref('');
const busy = ref(false);
const activeCorrelationId = ref<string | null>(null);
const elapsedMs = ref(0);

let elapsedTimer: ReturnType<typeof setInterval> | undefined;

const portalUrl = computed(() => config.value?.portalHandoff.href ?? 'https://sre.azure.com');
const shortThread = computed(() => {
  const id = investigation.value?.thread.id ?? '';
  return id.length > 16 ? `${id.slice(0, 16)}…` : id;
});

const statusLabel = computed(() => {
  if (busy.value) return 'Investigating';
  if (failure.value) return 'Unavailable';
  if (!config.value?.configured) return 'Not configured';
  if (investigation.value?.approval.required) return 'Awaiting approval';
  if (investigation.value) return 'Thread active';
  return 'Ready';
});

const statusBadgeClass = computed(() => {
  if (busy.value) return 'badge-info';
  if (failure.value || !config.value?.configured) return 'badge-offline';
  if (investigation.value?.approval.required) return 'badge-warning';
  if (investigation.value) return 'badge-online';
  return 'badge-neutral';
});

const elapsedLabel = computed(() => {
  if (busy.value) return `${Math.round(elapsedMs.value / 1000)}s (running)`;
  if (!investigation.value) return '—';
  return `${(investigation.value.metadata.elapsedMs / 1000).toFixed(1)}s`;
});

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function newCorrelationId(): string {
  return `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Extracts the typed error body so the UI can show remediation + portal handoff. */
function toFailure(error: unknown): SreAgentErrorResponse {
  if (error instanceof ApiError && error.body && typeof error.body === 'object' && 'kind' in error.body) {
    return error.body as SreAgentErrorResponse;
  }

  return {
    error: error instanceof Error ? error.message : String(error),
    kind: 'unknown',
    remediation: 'Verify Azure sign-in, RBAC, and network access, then retry.',
    investigationStarted: false,
    localAnalystSubstituted: false,
    portalHandoff: config.value?.portalHandoff ?? {
      label: 'Open Azure SRE Agent portal',
      href: 'https://sre.azure.com',
      description: 'Run the investigation in the Azure SRE Agent portal.',
    },
    correlationId: 'unknown',
    timestamp: new Date().toISOString(),
  };
}

function startElapsedTimer() {
  const startedAt = Date.now();
  elapsedMs.value = 0;
  elapsedTimer = setInterval(() => {
    elapsedMs.value = Date.now() - startedAt;
  }, 250);
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = undefined;
  }
}

async function run(operation: () => Promise<SreAgentInvestigation>, correlationId: string) {
  busy.value = true;
  failure.value = null;
  activeCorrelationId.value = correlationId;
  startElapsedTimer();

  try {
    investigation.value = await operation();
    prompt.value = '';
  } catch (error) {
    // Never replace a failed SRE Agent call with Local Analyst output.
    failure.value = toFailure(error);
  } finally {
    busy.value = false;
    activeCorrelationId.value = null;
    stopElapsedTimer();
  }
}

function startFromScenario(scenarioName: string) {
  const correlationId = newCorrelationId();
  void run(() => api.startSreAgentInvestigation({ scenarioName, correlationId }), correlationId);
}

function submitPrompt() {
  const text = prompt.value.trim();
  if (!text || busy.value) return;

  const correlationId = newCorrelationId();
  const threadId = investigation.value?.thread.id;

  if (threadId) {
    void run(() => api.continueSreAgentInvestigation({ threadId, prompt: text, correlationId }), correlationId);
    return;
  }

  void run(() => api.startSreAgentInvestigation({ prompt: text, correlationId }), correlationId);
}

async function cancel() {
  const correlationId = activeCorrelationId.value;
  if (!correlationId) return;
  try {
    await api.cancelSreAgentInvestigation(correlationId);
  } catch {
    // Cancellation is best-effort; the request may have already finished.
  }
}

onMounted(async () => {
  try {
    config.value = await api.getSreAgentConfig();
  } catch (error) {
    failure.value = toFailure(error);
  }
});

onBeforeUnmount(stopElapsedTimer);
</script>

<style scoped>
/* Violet accent — intentionally different from the Local Analyst panel, applied as a
   subtle tint/hairline consistent with the wallboard's existing card styling. */
.sre-agent-panel {
  border-left: 1px solid rgb(139 92 246 / 0.34);
}

.sre-agent-eyebrow {
  color: #a78bfa;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  letter-spacing: 0.08em;
}

.sre-agent-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 0.25rem;
  background: #8b5cf6;
  color: #0b1020;
  font-weight: 700;
  font-size: 0.7rem;
}

.sre-agent-badge {
  background: rgba(139, 92, 246, 0.18);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.5);
}

.sre-agent-layout {
  display: grid;
  gap: 0.75rem;
}

.sre-agent-identity__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.5rem 1rem;
  margin: 0.4rem 0;
}

.sre-agent-identity__grid dt {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

.sre-agent-identity__grid dd {
  margin: 0.1rem 0 0;
  font-size: 0.82rem;
  word-break: break-word;
}

.sre-agent-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem !important;
}

.sre-agent-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.sre-agent-prompt {
  font-size: 0.72rem;
  padding: 0.3rem 0.6rem;
}

.sre-agent-input {
  width: 100%;
  resize: vertical;
}

.sre-agent-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.5rem;
  font-size: 0.72rem;
  opacity: 0.8;
}

.sre-agent-actions {
  display: flex;
  gap: 0.4rem;
}

.sre-agent-run {
  background: #8b5cf6;
  color: #0b1020;
  font-weight: 600;
}

.sre-agent-note {
  font-size: 0.72rem;
  opacity: 0.75;
  margin-top: 0.4rem;
}

.sre-agent-failure {
  background: rgb(248 113 113 / 0.08);
  border: 1px solid rgb(248 113 113 / 0.34);
}

.sre-agent-failure__message {
  font-weight: 600;
  margin: 0.3rem 0;
}

.sre-agent-failure__remediation {
  font-size: 0.8rem;
  margin: 0.2rem 0;
}

.sre-agent-approval {
  background: rgb(251 191 36 / 0.08);
  border: 1px solid rgb(251 191 36 / 0.38);
}

.sre-agent-response {
  border: 1px solid rgb(139 92 246 / 0.28);
}

.sre-agent-provenance {
  margin-left: 0.5rem;
  font-size: 0.68rem;
  opacity: 0.75;
  text-transform: none;
  letter-spacing: 0;
}

.sre-agent-pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.8rem;
  line-height: 1.45;
  margin: 0.3rem 0 0.6rem;
  max-height: 26rem;
  overflow-y: auto;
}

.sre-agent-citation-source {
  margin-left: 0.4rem;
}

.sre-agent-details {
  margin-top: 0.5rem;
  font-size: 0.75rem;
}

.sre-agent-details summary {
  cursor: pointer;
  opacity: 0.85;
}

.sre-agent-portal-link {
  display: inline-block;
  margin-top: 0.5rem;
  font-size: 0.72rem;
  text-decoration: none;
}
</style>
