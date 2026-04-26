<template>
  <section id="preflight" class="mission-panel">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow">01 · Readiness gate</span>
        <h2 class="panel-title">Preflight Checks</h2>
        <p class="panel-description">
          Validate local tooling, Azure access, and deployment prerequisites before any infrastructure change.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge" :class="readinessBadgeClass">{{ readinessLabel }}</span>
        <button
          class="command-button command-button--primary px-4 py-2 text-xs"
          :disabled="loading"
          @click="runPreflight"
        >
          {{ loading ? 'Checking…' : 'Run Preflight' }}
        </button>
      </div>
    </div>

    <!-- Readiness banner -->
    <div
      v-if="checks.length > 0"
      class="card card--status status-strip mb-4"
      :style="{
        borderColor: allPass ? 'var(--green)' : 'var(--red)',
        color: allPass ? 'var(--green)' : 'var(--red)',
      }"
    >
      <span class="status-strip__title">
        <span class="dot" :class="allPass ? 'dot-green' : 'dot-red'"></span>
        {{ allPass ? 'Ready to Deploy' : 'Not Ready' }}
      </span>
      <span class="status-strip__meta">
        {{ checks.length }} checks evaluated
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading && checks.length === 0" class="loading text-sm text-center py-8">
      Running preflight checks…
    </div>

    <!-- Error -->
    <div v-if="error" class="card mb-4 text-sm" style="border-color: var(--red); color: var(--red);">
      Error: {{ error.message }}
    </div>

    <!-- Checks grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="check in checks" :key="check.name" class="card card--status flex items-start gap-3">
        <span
          class="dot mt-1"
          :class="{
            'dot-green': check.status === 'pass',
            'dot-amber': check.status === 'warn',
            'dot-red': check.status === 'fail',
          }"
        ></span>
        <div class="min-w-0">
          <div class="text-sm font-bold" style="color: var(--text);">{{ check.name }}</div>
          <div class="text-xs mt-1" style="color: var(--muted);">{{ check.message }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useApi } from '@/composables/useApi';
import type { PreflightCheck } from '@/types/api';

const { getPreflight } = useApi();
const checks = ref<PreflightCheck[]>([]);
const loading = ref(false);
const error = ref<Error | null>(null);

const allPass = computed(() =>
  checks.value.length > 0 && checks.value.every(c => c.status === 'pass')
);

const readinessLabel = computed(() => {
  if (loading.value) return 'Checking';
  if (checks.value.length === 0) return 'Not evaluated';
  return allPass.value ? 'Ready to deploy' : 'Action required';
});

const readinessBadgeClass = computed(() => {
  if (loading.value) return 'badge-warning';
  if (checks.value.length === 0) return 'badge-neutral';
  return allPass.value ? 'badge-online' : 'badge-offline';
});

async function runPreflight() {
  loading.value = true;
  error.value = null;
  try {
    const res = await getPreflight();
    checks.value = res.checks;
  } catch (e) {
    error.value = e instanceof Error ? e : new Error(String(e));
  } finally {
    loading.value = false;
  }
}

onMounted(runPreflight);
</script>
