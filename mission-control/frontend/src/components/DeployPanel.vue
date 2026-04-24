<template>
  <section>
    <h2 class="text-sm font-medium uppercase tracking-wider mb-6" style="color: var(--muted);">
      Deploy Infrastructure
    </h2>

    <div class="card mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <!-- Location -->
        <div>
          <label class="block text-xs font-medium mb-1" style="color: var(--muted);">Location</label>
          <select
            v-model="location"
            class="w-full rounded-lg px-3 py-2 text-sm"
            style="background: var(--surface); color: var(--text); border: 1px solid var(--card-border);"
          >
            <option value="eastus2">East US 2</option>
            <option value="swedencentral">Sweden Central</option>
            <option value="australiaeast">Australia East</option>
          </select>
        </div>

        <!-- Skip RBAC -->
        <div class="flex items-end gap-2">
          <label class="flex items-center gap-2 text-xs cursor-pointer" style="color: var(--muted);">
            <input type="checkbox" v-model="skipRbac" class="rounded" />
            Skip RBAC
          </label>
        </div>

        <!-- Skip SRE Agent -->
        <div class="flex items-end gap-2">
          <label class="flex items-center gap-2 text-xs cursor-pointer" style="color: var(--muted);">
            <input type="checkbox" v-model="skipSreAgent" class="rounded" />
            Skip SRE Agent
          </label>
        </div>
      </div>

      <button
        class="px-6 py-2.5 text-sm font-semibold rounded-lg transition-opacity"
        style="background: var(--accent); color: var(--bg);"
        :disabled="jobRunning"
        :style="{ opacity: jobRunning ? 0.5 : 1 }"
        @click="startDeploy"
      >
        {{ jobRunning ? 'Deploying…' : 'Deploy Infrastructure' }}
      </button>

      <!-- Job status -->
      <div v-if="jobStatus" class="mt-3 text-xs flex items-center gap-2">
        <span
          class="badge"
          :class="{
            'badge-online': jobStatus === 'completed',
            'badge-offline': jobStatus === 'failed',
            'badge-warning': jobStatus === 'running',
            'badge-info': jobStatus === 'pending',
          }"
        >
          {{ jobStatus }}
        </span>
        <span v-if="requestId" style="color: var(--muted);">ID: {{ requestId }}</span>
      </div>
    </div>

    <!-- Terminal output -->
    <Terminal v-if="terminalLines.length > 0 || jobRunning" :lines="terminalLines" title="Deploy Output" />
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useApi } from '@/composables/useApi';
import { useWebSocket } from '@/composables/useWebSocket';
import Terminal from './Terminal.vue';

const { deploy } = useApi();

const location = ref('eastus2');
const skipRbac = ref(false);
const skipSreAgent = ref(false);
const jobRunning = ref(false);
const jobStatus = ref<string | null>(null);
const requestId = ref<string | null>(null);
const terminalLines = ref<string[]>([]);

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const { data: wsData, connect } = useWebSocket(`${wsProtocol}//${window.location.host}/ws`);
connect();

watch(wsData, (msg: unknown) => {
  if (!msg || typeof msg !== 'object') return;
  const m = msg as Record<string, unknown>;
  if (m.requestId !== requestId.value) return;

  if (m.type === 'job:stdout' || m.type === 'job:stderr') {
    terminalLines.value.push(String(m.data ?? ''));
  }
  if (m.type === 'job:complete') {
    jobStatus.value = m.exitCode === 0 ? 'completed' : 'failed';
    jobRunning.value = false;
  }
});

async function startDeploy() {
  terminalLines.value = [];
  jobRunning.value = true;
  jobStatus.value = 'pending';
  try {
    const res = await deploy({ location: location.value, skipConfirmation: true });
    requestId.value = res.requestId;
    jobStatus.value = 'running';
  } catch (e) {
    jobStatus.value = 'failed';
    jobRunning.value = false;
    terminalLines.value.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
</script>
