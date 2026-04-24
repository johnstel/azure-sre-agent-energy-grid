<template>
  <section>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-sm font-medium uppercase tracking-wider" style="color: var(--muted);">
        Preflight Checks
      </h2>
      <button
        class="px-4 py-2 text-xs font-semibold rounded-lg transition-colors"
        style="background: var(--accent); color: var(--bg);"
        :disabled="loading"
        @click="runPreflight"
      >
        {{ loading ? 'Checking…' : 'Run Preflight' }}
      </button>
    </div>

    <!-- Readiness banner -->
    <div
      v-if="checks.length > 0"
      class="card mb-6 text-center py-3 text-sm font-semibold"
      :style="{
        borderColor: allPass ? 'var(--green)' : 'var(--red)',
        color: allPass ? 'var(--green)' : 'var(--red)',
      }"
    >
      {{ allPass ? '✓ Ready to Deploy' : '✗ Not Ready' }}
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
      <div v-for="check in checks" :key="check.name" class="card flex items-start gap-3">
        <span
          class="dot mt-1"
          :class="{
            'dot-green': check.status === 'pass',
            'dot-amber': check.status === 'warn',
            'dot-red': check.status === 'fail',
          }"
        ></span>
        <div class="min-w-0">
          <div class="text-sm font-semibold" style="color: var(--text);">{{ check.name }}</div>
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
