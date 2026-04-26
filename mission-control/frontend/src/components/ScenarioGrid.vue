<template>
  <section id="scenarios" class="mission-panel">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow">06 · Resilience drills</span>
        <h2 class="panel-title">Breakable Scenarios</h2>
        <p class="panel-description">
          Enable controlled failure modes for demos and restore the grid to a healthy state with one repair action.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge" :class="activeScenarios > 0 ? 'badge-offline' : 'badge-online'">
          {{ activeScenarios }} active faults
        </span>
        <button
          class="command-button command-button--success px-4 py-2 text-xs"
          :disabled="fixingAll"
          :style="{ opacity: fixingAll ? 0.5 : 1 }"
          @click="handleFixAll"
        >
          {{ fixingAll ? 'Repairing…' : 'Repair All' }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && scenarios.length === 0" class="loading text-sm text-center py-8">
      Loading scenarios…
    </div>

    <!-- Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="scenario in scenarios"
        :key="scenario.name"
        class="card card--telemetry scenario-card"
        :class="{ 'is-active': scenario.enabled }"
        :style="{
          borderLeftWidth: '3px',
          borderLeftColor: scenario.enabled ? 'var(--red)' : 'var(--card-border)',
        }"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-semibold" style="color: var(--text);">{{ formatName(scenario.name) }}</span>
          <span class="badge" :class="scenario.enabled ? 'badge-offline' : 'badge-online'">
            {{ scenario.enabled ? 'Active fault' : 'Stable' }}
          </span>
        </div>
        <p class="text-xs mb-3" style="color: var(--muted);">{{ scenario.description }}</p>
        <button
          class="command-button px-3 py-1.5 text-xs"
          :class="scenario.enabled ? 'command-button--success' : 'command-button--warning'"
          :style="{ opacity: toggling === scenario.name ? 0.5 : 1 }"
          :disabled="toggling === scenario.name"
          @click="toggleScenario(scenario)"
        >
          {{ scenario.enabled ? 'Repair Scenario' : 'Inject Fault' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useApi } from '@/composables/useApi';
import type { Scenario } from '@/types/api';

const { getScenarios, enableScenario, disableScenario, fixAll } = useApi();

const scenarios = ref<Scenario[]>([]);
const loading = ref(false);
const toggling = ref<string | null>(null);
const fixingAll = ref(false);

const activeScenarios = computed(() => scenarios.value.filter(scenario => scenario.enabled).length);

async function loadScenarios() {
  loading.value = true;
  try {
    const res = await getScenarios();
    scenarios.value = res.scenarios;
  } catch {
    // silently retry on next action
  } finally {
    loading.value = false;
  }
}

async function toggleScenario(scenario: Scenario) {
  toggling.value = scenario.name;
  try {
    if (scenario.enabled) {
      await disableScenario(scenario.name);
    } else {
      await enableScenario(scenario.name);
    }
    await loadScenarios();
  } finally {
    toggling.value = null;
  }
}

async function handleFixAll() {
  fixingAll.value = true;
  try {
    await fixAll();
    await loadScenarios();
  } finally {
    fixingAll.value = false;
  }
}

function formatName(name: string): string {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

onMounted(loadScenarios);
</script>
