<template>
  <section id="assistant" class="mission-panel">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow">Local analyst</span>
        <h2 class="panel-title">Explain This State</h2>
        <p class="panel-description">
          Ask the local analyst to explain a point-in-time Mission Control snapshot. It can triage and recommend safe next actions, but it does not deploy or repair.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge badge-info">Read-only</span>
        <span class="badge" :class="answer ? 'badge-online' : 'badge-neutral'">
          {{ answer ? 'Answer ready' : 'Local only' }}
        </span>
      </div>
    </div>

    <div class="assistant-layout">
      <div class="card card--control assistant-card">
        <label class="field-label" for="assistant-question">Question</label>
        <textarea
          id="assistant-question"
          v-model="question"
          class="field-control assistant-input"
          maxlength="1000"
          rows="4"
          :disabled="loading"
          placeholder="Ask about pod health, scenario status, preflight blockers…"
          @keydown.meta.enter.prevent="ask"
          @keydown.ctrl.enter.prevent="ask"
        ></textarea>
        <div class="assistant-footer">
          <span>{{ question.length }}/1000</span>
          <button
            class="command-button command-button--primary px-4 py-2 text-xs"
            :disabled="loading || !canAsk"
            :style="{ opacity: loading || !canAsk ? 0.5 : 1 }"
            @click="ask"
          >
            {{ loading ? 'Explaining…' : 'Explain This State' }}
          </button>
        </div>
      </div>

      <div class="card card--status assistant-card">
        <div class="field-label">Examples and limits</div>
        <div class="assistant-prompts">
          <button
            v-for="prompt in examplePrompts"
            :key="prompt"
            class="command-button command-button--neutral assistant-prompt"
            type="button"
            :disabled="loading"
            @click="question = prompt"
          >
            {{ prompt }}
          </button>
        </div>
        <p class="assistant-limitations">
          Sources: preflight, energy namespace pods/services/deployments/events, scenarios, and job status. Excludes raw logs, secrets, kubeconfig, env, arbitrary files, and shell access.
        </p>
      </div>
    </div>

    <div v-if="loading" class="card card--status loading text-sm text-center mt-4" role="status" aria-live="polite">
      Inspecting Mission Control state…
    </div>

    <div v-if="error" class="card assistant-error mt-4 text-sm" role="alert">
      <strong>Local Analyst unavailable.</strong>
      <p>{{ error }}</p>
      <p class="assistant-error__limit">
        No confidence: Local Analyst cannot safely infer an answer without the read-only Mission Control snapshot. Refresh Mission Control, verify preflight checks, and retry.
      </p>
    </div>

    <div
      v-if="answer"
      class="card card--output assistant-answer mt-4"
      role="region"
      aria-labelledby="assistant-answer-heading"
      aria-live="polite"
    >
      <div class="assistant-answer__heading">
        <span id="assistant-answer-heading" class="status-strip__title">
          <span class="dot" :class="answerDotClass" aria-hidden="true"></span>
          Local analyst answer
        </span>
        <div class="assistant-answer__badges" aria-label="Analyst response state">
          <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
          <span class="badge" :class="confidenceBadgeClass">{{ confidenceLabel }}</span>
          <span class="badge badge-info">{{ sourceCountLabel }}</span>
        </div>
      </div>
      <div
        ref="answerScrollRef"
        class="assistant-answer__scroll"
        tabindex="0"
        role="document"
        aria-label="Local Analyst response history, sources, limitations, and portal handoff. Long content scrolls inside this region."
      >
        <div class="assistant-answer__text">{{ answer }}</div>
        <details class="assistant-details">
          <summary>Sources, confidence, and limitations</summary>
          <div class="assistant-details__grid">
            <div>
              <span class="assistant-details__label">Snapshot</span>
              <p>{{ snapshotLabel }}</p>
            </div>
            <div>
              <span class="assistant-details__label">Tools</span>
              <p>{{ toolsLabel }}</p>
            </div>
            <div>
              <span class="assistant-details__label">Confidence</span>
              <p>{{ confidenceLabel }} — Local Analyst observes the Mission Control snapshot only.</p>
            </div>
          </div>
          <div v-if="citations.length" class="assistant-citations" aria-label="Local Analyst sources and citations">
            <h3>Citations</h3>
            <ul>
              <li v-for="citation in citations" :key="`${citation.label}-${citation.timestamp ?? ''}`">
                <strong>{{ citation.label }}</strong>
                <span v-if="citation.timestamp"> — {{ formatTimestamp(citation.timestamp) }}</span>
                <span v-if="citation.detail">: {{ citation.detail }}</span>
              </li>
            </ul>
          </div>
          <div v-if="metadata?.limitations.length" class="assistant-limitations assistant-limitations--answer">
            <strong>Limitations:</strong> {{ metadata.limitations.join(' · ') }}
          </div>
        </details>
        <div v-if="escalationLinks.length" class="assistant-escalation" aria-label="Azure SRE Agent and portal handoff">
          <div>
            <span class="panel-eyebrow">Portal handoff</span>
            <p>
              Local Analyst observed this local snapshot only. It did not invoke Azure SRE Agent. Open the portal for diagnosis/remediation recommendations and capture portal evidence before making Azure SRE Agent claims.
            </p>
            <p class="assistant-escalation__unavailable">
              Resource-specific deep links are unavailable unless a safe portal URL is configured.
            </p>
          </div>
          <div class="assistant-escalation__actions">
            <a
              v-for="link in escalationLinks"
              :key="`${link.kind}-${link.href}`"
              class="command-button command-button--neutral assistant-escalation__link"
              :href="link.href"
              target="_blank"
              rel="noreferrer"
            >
              {{ link.label }}
            </a>
            <button class="command-button command-button--neutral assistant-escalation__link" type="button" @click="copyHandoffPrompt">
              {{ copyLabel }}
            </button>
          </div>
        </div>
      </div>
      <div class="sr-only" aria-live="polite" aria-atomic="true">{{ copyStatus }}</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type {
  AssistantAskResponse,
  AssistantCitation,
  AssistantConfidence,
  AssistantEscalationLink,
  AssistantResponseStatus,
} from '@/types/api';
import { visibleEscalationLinks } from '@/utils/portalLinks';

const { askAssistant } = useApi();

const examplePrompts = [
  'Are any energy namespace pods unhealthy right now?',
  'What preflight blockers would stop a clean demo?',
  'Which breakable scenarios are active and what should I repair first?',
];

const question = ref('');
const loading = ref(false);
const answer = ref('');
const error = ref('');
const copyStatus = ref('');
const copySucceeded = ref(false);
const metadata = ref<AssistantAskResponse['metadata'] | null>(null);
const answerScrollRef = ref<HTMLElement | null>(null);

const canAsk = computed(() => question.value.trim().length > 0);
const toolsLabel = computed(() => {
  if (!metadata.value || metadata.value.toolsUsed.length === 0) return 'none reported';
  return metadata.value.toolsUsed.join(', ');
});
const sourcesLabel = computed(() => {
  if (!metadata.value || metadata.value.sources.length === 0) return 'none reported';
  return metadata.value.sources.join(', ');
});
const snapshotLabel = computed(() => {
  if (!metadata.value) return 'not collected';
  return formatTimestamp(metadata.value.stateSnapshotTimestamp);
});
const sourceCountLabel = computed(() => {
  const count = metadata.value?.sources.length ?? citations.value.length;
  return `${count} source${count === 1 ? '' : 's'}`;
});
const responseStatus = computed<AssistantResponseStatus>(() => metadata.value?.uiState ?? metadata.value?.status ?? 'ok');
const responseConfidence = computed<AssistantConfidence>(() => metadata.value?.confidence ?? 'medium');
const statusLabel = computed(() => {
  switch (responseStatus.value) {
    case 'partial':
      return 'Partial evidence';
    case 'error':
      return 'Error';
    case 'timeout':
      return 'Timed out';
    case 'escalation':
      return 'Portal handoff';
    default:
      return 'Success';
  }
});
const confidenceLabel = computed(() => `${responseConfidence.value === 'none' ? 'No' : responseConfidence.value} confidence`);
const statusBadgeClass = computed(() => {
  switch (responseStatus.value) {
    case 'partial':
    case 'timeout':
    case 'escalation':
      return 'badge-warning';
    case 'error':
      return 'badge-offline';
    default:
      return 'badge-online';
  }
});
const confidenceBadgeClass = computed(() => {
  switch (responseConfidence.value) {
    case 'high':
      return 'badge-online';
    case 'medium':
      return 'badge-info';
    case 'low':
      return 'badge-warning';
    default:
      return 'badge-neutral';
  }
});
const answerDotClass = computed(() => {
  switch (responseStatus.value) {
    case 'partial':
    case 'timeout':
    case 'escalation':
      return 'dot-amber';
    case 'error':
      return 'dot-red';
    default:
      return 'dot-green';
  }
});
const citations = computed<AssistantCitation[]>(() => {
  if (metadata.value?.citations?.length) return metadata.value.citations;
  if (!metadata.value) return [];

  return [
    {
      label: 'Mission Control state snapshot',
      detail: `Included data sources: ${sourcesLabel.value}.`,
      timestamp: metadata.value.stateSnapshotTimestamp,
    },
  ];
});
const escalationLinks = computed<AssistantEscalationLink[]>(() => visibleEscalationLinks(metadata.value?.escalationLinks));
const handoffPrompt = computed(() => {
  const snapshot = metadata.value?.stateSnapshotTimestamp ? formatTimestamp(metadata.value.stateSnapshotTimestamp) : 'the current Mission Control snapshot';
  return [
    'Please investigate this Azure SRE Agent Energy Grid demo state.',
    `Local Analyst observed a read-only Mission Control snapshot collected at ${snapshot}.`,
    `User question: ${question.value.trim()}`,
    `Local Analyst observation: ${answer.value}`,
    'Use Azure SRE Agent portal evidence for diagnosis/remediation recommendations; Local Analyst did not invoke Azure SRE Agent.',
  ].join('\n\n');
});
const copyLabel = computed(() => copySucceeded.value ? 'Prompt copied' : 'Copy prompt');

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

async function copyHandoffPrompt() {
  copyStatus.value = '';
  copySucceeded.value = false;
  try {
    await navigator.clipboard.writeText(handoffPrompt.value);
    copySucceeded.value = true;
    copyStatus.value = 'Azure SRE Agent portal handoff prompt copied.';
  } catch {
    copyStatus.value = 'Copy failed. Select the Local Analyst answer and copy it manually.';
  }
}

async function ask() {
  const prompt = question.value.trim();
  if (!prompt) return;

  loading.value = true;
  answer.value = '';
  error.value = '';
  copyStatus.value = '';
  copySucceeded.value = false;
  metadata.value = null;

  try {
    const response = await askAssistant(prompt);
    answer.value = response.answer;
    metadata.value = response.metadata;
    await nextTick();
    answerScrollRef.value?.focus({ preventScroll: true });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
</script>
