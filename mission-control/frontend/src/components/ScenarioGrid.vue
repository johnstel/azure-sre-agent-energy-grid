<template>
  <section>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-sm font-medium uppercase tracking-wider" style="color: var(--muted);">
        Breakable Scenarios
      </h2>
      <button
        class="px-4 py-2 text-xs font-semibold rounded-lg transition-opacity"
        style="background: var(--green); color: var(--bg);"
        :disabled="fixingAll"
        :style="{ opacity: fixingAll ? 0.5 : 1 }"
        @click="handleFixAll"
      >
        {{ fixingAll ? 'Fixing…' : '🔧 Fix All' }}
      </button>
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
        class="card"
        :style="{
          borderLeftWidth: '3px',
          borderLeftColor: scenario.enabled ? 'var(--red)' : 'var(--card-border)',
        }"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-semibold" style="color: var(--text);">{{ formatName(scenario.name) }}</span>
          <span class="badge" :class="scenario.enabled ? 'badge-offline' : 'badge-online'">
            {{ scenario.enabled ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <p class="text-xs mb-3" style="color: var(--muted);">{{ scenario.description }}</p>
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-opacity"
          :style="{
            background: scenario.enabled ? 'var(--amber)' : 'var(--accent)',
            color: 'var(--bg)',
            opacity: toggling === scenario.name ? 0.5 : 1,
          }"
          :disabled="toggling === scenario.name"
          @click="toggleScenario(scenario)"
        >
          {{ scenario.enabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '@/composables/useApi';
import type { Scenario } from '@/types/api';

const { getScenarios, enableScenario, disableScenario, fixAll } = useApi();

const scenarios = ref<Scenario[]>([]);
const loading = ref(false);
const toggling = ref<string | null>(null);
const fixingAll = ref(false);

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
