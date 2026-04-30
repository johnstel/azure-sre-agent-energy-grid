<template>
  <section
    id="scenario-narration-panel"
    class="scenario-narration"
    :class="{ 'scenario-narration--collapsed': collapsed }"
    aria-labelledby="scenario-narration-title"
    @keydown.esc.stop.prevent="emit('hide')"
  >
    <div class="scenario-narration__header">
      <div>
        <p class="wallboard-kicker">Presenter guidance</p>
        <h2 id="scenario-narration-title">Scenario Narration</h2>
        <p class="scenario-narration__help">
          Read-only notes for live demos. This panel does not inject faults, repair resources, capture evidence, or show expected Azure SRE Agent responses.
        </p>
      </div>
      <div class="scenario-narration__actions">
        <span class="badge badge-info">Read-only</span>
        <button
          class="command-button command-button--neutral"
          type="button"
          aria-controls="scenario-narration-body"
          :aria-expanded="!collapsed"
          @click="emit('toggle-collapsed')"
        >
          {{ collapsed ? 'Expand' : 'Collapse' }}
        </button>
        <button
          class="command-button command-button--neutral"
          type="button"
          aria-label="Hide scenario narration panel"
          @click="emit('hide')"
        >
          Hide
        </button>
      </div>
    </div>

    <div class="scenario-narration__selector-row">
      <label for="scenario-narration-select">
        <span class="wallboard-kicker">Scenario</span>
        <select
          id="scenario-narration-select"
          class="field-control scenario-narration__select"
          :value="selectedScenarioName"
          @change="selectScenario"
        >
          <option v-if="scenarios.length === 0" value="">No scenarios loaded</option>
          <option v-for="scenario in sortedScenarios" :key="scenario.name" :value="scenario.name">
            {{ formatScenarioName(scenario.name) }}{{ scenario.enabled ? ' — active' : '' }}
          </option>
        </select>
      </label>
      <p v-if="activeScenarioNames.length > 1" class="scenario-narration__hint">
        Multiple scenarios are active. Pick one set of presenter notes at a time.
      </p>
    </div>

    <div v-if="collapsed" class="scenario-narration__summary" role="status">
      <strong>{{ selectedNarration?.title ?? fallbackTitle }}</strong>
      <span>{{ selectedNarration?.hook[0] ?? 'Narration unavailable; use docs/DEMO-NARRATIVE.md.' }}</span>
    </div>

    <div v-else id="scenario-narration-body" class="scenario-narration__body">
      <div v-if="!selectedScenario" class="scenario-narration__empty">
        Select a scenario to view presenter notes.
      </div>
      <div v-else-if="!selectedNarration" class="scenario-narration__empty" role="status">
        Narration unavailable; use docs/DEMO-NARRATIVE.md and docs/PROMPTS-GUIDE.md.
      </div>
      <template v-else>
        <div class="scenario-narration__meta">
          <span class="badge" :class="selectedScenario.enabled ? 'badge-warning' : 'badge-neutral'">
            {{ selectedScenario.enabled ? 'Active scenario' : 'Not active' }}
          </span>
          <span class="badge badge-neutral">{{ selectedNarration.demoTier }} demo</span>
        </div>

        <section class="scenario-narration__block" aria-labelledby="scenario-narration-hook">
          <h3 id="scenario-narration-hook">Hook</h3>
          <p v-for="line in selectedNarration.hook" :key="line">{{ line }}</p>
        </section>

        <section class="scenario-narration__block" aria-labelledby="scenario-narration-observe">
          <h3 id="scenario-narration-observe">Observe</h3>
          <ul>
            <li v-for="item in selectedNarration.observe" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="scenario-narration__block scenario-narration__prompt" aria-labelledby="scenario-narration-prompt">
          <div class="scenario-narration__block-heading">
            <h3 id="scenario-narration-prompt">Suggested SRE Agent prompt</h3>
            <span class="badge badge-info">{{ selectedNarration.suggestedPrompt.stage }}</span>
          </div>
          <p class="scenario-narration__prompt-text">{{ selectedNarration.suggestedPrompt.text }}</p>
          <div class="scenario-narration__prompt-actions">
            <button
              class="command-button command-button--primary"
              type="button"
              :aria-label="`Copy suggested prompt for ${selectedNarration.title}`"
              @click="copySuggestedPrompt"
            >
              Copy prompt
            </button>
            <span class="scenario-narration__copy-status" aria-live="polite">{{ copyStatus }}</span>
          </div>
        </section>

        <section class="scenario-narration__block" aria-labelledby="scenario-narration-restore">
          <h3 id="scenario-narration-restore">Restore path</h3>
          <p>{{ selectedNarration.restorePath.label }}</p>
          <code v-if="selectedNarration.restorePath.command">{{ selectedNarration.restorePath.command }}</code>
        </section>

        <section class="scenario-narration__block" aria-labelledby="scenario-narration-safety">
          <h3 id="scenario-narration-safety">Safety notes</h3>
          <ul>
            <li v-for="note in selectedNarration.safetyNotes" :key="note">{{ note }}</li>
          </ul>
        </section>

        <section class="scenario-narration__block" aria-labelledby="scenario-narration-sources">
          <h3 id="scenario-narration-sources">Sources</h3>
          <ul class="scenario-narration__sources">
            <li v-for="source in selectedNarration.sourceRefs" :key="`${source.path}-${source.section ?? source.label}`">
              {{ source.label }} — <code>{{ source.path }}</code><span v-if="source.section"> · {{ source.section }}</span>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Scenario } from '@/types/api';

const props = defineProps<{
  scenarios: Scenario[];
  selectedScenarioName: string;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  hide: [];
  'toggle-collapsed': [];
  'select-scenario': [name: string];
}>();

const copyStatus = ref('');

const activeScenarioNames = computed(() => props.scenarios.filter(scenario => scenario.enabled).map(scenario => scenario.name));
const sortedScenarios = computed(() => [...props.scenarios].sort((a, b) => {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  return (a.narration?.order ?? 999) - (b.narration?.order ?? 999) || a.name.localeCompare(b.name);
}));
const selectedScenario = computed(() => props.scenarios.find(scenario => scenario.name === props.selectedScenarioName) ?? sortedScenarios.value[0]);
const selectedNarration = computed(() => selectedScenario.value?.narration);
const fallbackTitle = computed(() => selectedScenario.value ? formatScenarioName(selectedScenario.value.name) : 'No scenario selected');

watch(() => props.selectedScenarioName, () => {
  copyStatus.value = '';
});

function selectScenario(event: Event) {
  const target = event.target as HTMLSelectElement;
  emit('select-scenario', target.value);
}

async function copySuggestedPrompt() {
  const prompt = selectedNarration.value?.suggestedPrompt.text;
  if (!prompt) return;
  copyStatus.value = '';
  try {
    await navigator.clipboard.writeText(prompt);
    copyStatus.value = 'Copied.';
  } catch {
    copyStatus.value = 'Copy failed. Select the prompt text manually.';
  }
}

function formatScenarioName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
</script>

<style scoped>
.scenario-narration {
  grid-column: 1 / -1;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, rgb(30 41 59 / 0.95), rgb(15 23 42 / 0.95));
  box-shadow: var(--shadow-tight);
  padding: 0.9rem;
}

.scenario-narration__header,
.scenario-narration__block-heading,
.scenario-narration__prompt-actions,
.scenario-narration__meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.scenario-narration__actions,
.scenario-narration__prompt-actions,
.scenario-narration__meta {
  flex-wrap: wrap;
}

.scenario-narration__help,
.scenario-narration__hint,
.scenario-narration__summary,
.scenario-narration__block p,
.scenario-narration__block li,
.scenario-narration__copy-status {
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.scenario-narration__selector-row {
  display: grid;
  grid-template-columns: minmax(220px, 360px) minmax(0, 1fr);
  align-items: end;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.scenario-narration__select {
  width: 100%;
  margin-top: 0.3rem;
  border: 1px solid var(--control-border);
  border-radius: 0.65rem;
  background: var(--control-bg);
  color: var(--text);
  padding: 0.5rem 0.6rem;
}

.scenario-narration__summary {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.7rem;
  padding: 0.65rem;
  border: 1px solid rgb(148 163 184 / 0.22);
  border-radius: 0.75rem;
  background: rgb(15 23 42 / 0.55);
}

.scenario-narration__summary strong,
.scenario-narration h2,
.scenario-narration h3 {
  color: var(--text);
}

.scenario-narration__body {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.scenario-narration__block {
  display: grid;
  gap: 0.4rem;
}

.scenario-narration__block h3 {
  margin: 0;
  font-size: 0.95rem;
}

.scenario-narration__block p,
.scenario-narration__block ul {
  margin: 0;
}

.scenario-narration__block ul {
  padding-left: 1.1rem;
}

.scenario-narration__prompt {
  padding: 0.7rem;
  border: 1px solid rgb(59 130 246 / 0.35);
  border-radius: 0.75rem;
  background: rgb(30 64 175 / 0.14);
}

.scenario-narration__prompt-text {
  color: var(--text) !important;
  font-weight: 800;
}

.scenario-narration code {
  color: var(--cyan);
  overflow-wrap: anywhere;
}

.scenario-narration__empty {
  color: var(--muted);
  padding: 0.75rem;
  border: 1px dashed rgb(148 163 184 / 0.35);
  border-radius: 0.75rem;
}

@media (max-width: 700px) {
  .scenario-narration {
    position: sticky;
    bottom: 0.5rem;
    z-index: 5;
    max-height: 75vh;
    overflow-y: auto;
    border-radius: 1rem 1rem 0.75rem 0.75rem;
  }

  .scenario-narration__header,
  .scenario-narration__selector-row,
  .scenario-narration__block-heading,
  .scenario-narration__prompt-actions {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .scenario-narration__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .scenario-narration__actions .badge {
    grid-column: 1 / -1;
  }
}
</style>
