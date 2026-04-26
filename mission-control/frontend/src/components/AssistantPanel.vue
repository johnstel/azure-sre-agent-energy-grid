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

    <div v-if="loading" class="card card--status loading text-sm text-center mt-4">
      Inspecting Mission Control state…
    </div>

    <div v-if="error" class="card mt-4 text-sm" style="border-color: var(--red); color: var(--red);">
      {{ error }}
    </div>

    <div v-if="answer" class="card card--output assistant-answer mt-4">
      <div class="assistant-answer__heading">
        <span class="status-strip__title">
          <span class="dot dot-green"></span>
          Local analyst answer
        </span>
        <span class="badge badge-info">{{ modelLabel }}</span>
      </div>
      <div class="assistant-metadata">
        <span>Snapshot: {{ snapshotLabel }}</span>
        <span>Tools: {{ toolsLabel }}</span>
        <span>Sources: {{ sourcesLabel }}</span>
      </div>
      <p>{{ answer }}</p>
      <div v-if="metadata?.limitations.length" class="assistant-limitations assistant-limitations--answer">
        Limits: {{ metadata.limitations.join(' · ') }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { AssistantAskResponse } from '@/types/api';

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
const metadata = ref<AssistantAskResponse['metadata'] | null>(null);

const canAsk = computed(() => question.value.trim().length > 0);
const modelLabel = computed(() => {
  if (!metadata.value) return 'No metadata';
  return metadata.value.model;
});
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
  return new Date(metadata.value.stateSnapshotTimestamp).toLocaleString();
});

async function ask() {
  const prompt = question.value.trim();
  if (!prompt) return;

  loading.value = true;
  answer.value = '';
  error.value = '';
  metadata.value = null;

  try {
    const response = await askAssistant(prompt);
    answer.value = response.answer;
    metadata.value = response.metadata;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}
</script>
