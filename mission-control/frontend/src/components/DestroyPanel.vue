<template>
  <section>
    <h2 class="text-sm font-medium uppercase tracking-wider mb-6" style="color: var(--muted);">
      Destroy Infrastructure
    </h2>

    <!-- Warning banner -->
    <div
      class="card mb-6 flex items-center gap-3"
      style="border-color: var(--red); background: var(--badge-red-bg);"
    >
      <span class="text-2xl">⚠️</span>
      <div>
        <div class="text-sm font-bold" style="color: var(--red);">Destructive Operation</div>
        <div class="text-xs" style="color: var(--muted);">
          This will permanently delete all Azure resources in the specified resource group.
        </div>
      </div>
    </div>

    <div class="card mb-6">
      <!-- Resource Group -->
      <div class="mb-4">
        <label class="block text-xs font-medium mb-1" style="color: var(--muted);">Resource Group Name</label>
        <input
          v-model="resourceGroup"
          type="text"
          class="w-full sm:w-96 rounded-lg px-3 py-2 text-sm"
          style="background: var(--surface); color: var(--text); border: 1px solid var(--card-border);"
          placeholder="rg-srelab-eastus2"
        />
      </div>

      <!-- Safety gate -->
      <div class="mb-4">
        <label class="block text-xs font-medium mb-1" style="color: var(--muted);">
          Type <strong style="color: var(--red);">DELETE</strong> to confirm
        </label>
        <input
          v-model="confirmation"
          type="text"
          class="w-full sm:w-64 rounded-lg px-3 py-2 text-sm"
          style="background: var(--surface); color: var(--text); border: 1px solid var(--card-border);"
          placeholder="Type DELETE"
        />
      </div>

      <button
        class="px-6 py-2.5 text-sm font-semibold rounded-lg transition-opacity"
        style="background: var(--red); color: white;"
        :disabled="!canDestroy"
        :style="{ opacity: canDestroy ? 1 : 0.4 }"
        @click="startDestroy"
      >
        {{ jobRunning ? 'Destroying…' : 'Destroy Infrastructure' }}
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
      </div>
    </div>

    <!-- Terminal output -->
    <Terminal v-if="terminalLines.length > 0 || jobRunning" :lines="terminalLines" title="Destroy Output" />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useApi } from '@/composables/useApi';
import { useWebSocket } from '@/composables/useWebSocket';
import Terminal from './Terminal.vue';

const { destroy } = useApi();

const resourceGroup = ref('rg-srelab-eastus2');
const confirmation = ref('');
const jobRunning = ref(false);
const jobStatus = ref<string | null>(null);
const requestId = ref<string | null>(null);
const terminalLines = ref<string[]>([]);

const canDestroy = computed(() => confirmation.value === 'DELETE' && !jobRunning.value);

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

async function startDestroy() {
  terminalLines.value = [];
  jobRunning.value = true;
  jobStatus.value = 'pending';
  confirmation.value = '';
  try {
    const res = await destroy({ resourceGroupName: resourceGroup.value, skipConfirmation: true });
    requestId.value = res.requestId;
    jobStatus.value = 'running';
  } catch (e) {
    jobStatus.value = 'failed';
    jobRunning.value = false;
    terminalLines.value.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
</script>
