<template>
  <section id="destroy" class="mission-panel mission-panel--danger">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow" style="color: var(--red);">03 · Controlled teardown</span>
        <h2 class="panel-title">Destroy Infrastructure</h2>
        <p class="panel-description">
          Remove the lab resource group only after explicit operator confirmation and preserve terminal output for review.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge" :class="canDestroy ? 'badge-offline' : 'badge-neutral'">
          {{ canDestroy ? 'Armed' : 'Locked' }}
        </span>
        <span v-if="jobStatus" class="badge" :class="jobBadgeClass">{{ jobStatus }}</span>
      </div>
    </div>

    <!-- Warning banner -->
    <div
      class="card card--danger mb-4 flex items-center gap-3"
    >
      <span class="text-2xl">⚠️</span>
      <div>
        <div class="text-sm font-bold" style="color: var(--red);">Destructive Operation</div>
        <div class="text-xs" style="color: var(--muted);">
          This will permanently delete all Azure resources in the specified resource group.
        </div>
      </div>
    </div>

    <div class="danger-zone mb-4">
      <div class="danger-zone__gate">
        <!-- Resource Group -->
        <div>
          <label class="field-label">Resource Group Name</label>
          <input
            v-model="resourceGroup"
            type="text"
            class="field-control w-full rounded-lg px-3 py-2 text-sm"
            style="background: var(--surface); color: var(--text); border: 1px solid var(--card-border);"
            placeholder="rg-srelab-eastus2"
          />
        </div>

        <!-- Safety gate -->
        <div>
          <label class="field-label">
            Confirmation token · <strong style="color: var(--red);">DELETE</strong>
          </label>
          <input
            v-model="confirmation"
            type="text"
            class="field-control w-full rounded-lg px-3 py-2 text-sm"
            style="background: rgb(69 10 10 / 0.28); color: var(--text); border: 1px solid var(--danger-border);"
            placeholder="Type DELETE"
          />
        </div>
      </div>

      <button
        class="danger-button px-6 py-2.5 text-xs"
        :disabled="!canDestroy"
        :style="{ opacity: canDestroy ? 1 : 0.4 }"
        @click="startDestroy"
      >
        {{ jobRunning ? 'Destroying…' : 'Permanently Destroy Resource Group' }}
      </button>
    </div>

    <!-- Terminal output -->
    <Terminal v-if="terminalLines.length > 0 || jobRunning" :lines="terminalLines" title="Destroy Output" tone="danger" />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useApi } from '@/composables/useApi';
import { useWebSocket } from '@/composables/useWebSocket';
import type { Job } from '@/types/api';
import Terminal from './Terminal.vue';

const { destroy } = useApi();

const resourceGroup = ref('rg-srelab-eastus2');
const confirmation = ref('');
const jobRunning = ref(false);
const jobStatus = ref<string | null>(null);
const requestId = ref<string | null>(null);
const terminalLines = ref<string[]>([]);

const canDestroy = computed(() => confirmation.value === 'DELETE' && !jobRunning.value);

const jobBadgeClass = computed(() => {
  if (jobStatus.value === 'completed') return 'badge-online';
  if (jobStatus.value === 'failed') return 'badge-offline';
  if (jobStatus.value === 'running') return 'badge-warning';
  if (jobStatus.value === 'pending') return 'badge-info';
  return 'badge-neutral';
});

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const { data: wsData, connect } = useWebSocket(`${wsProtocol}//${window.location.host}/ws`);
connect();

watch(wsData, (msg: unknown) => {
  if (!msg || typeof msg !== 'object') return;
  const m = msg as Record<string, unknown>;
  const eventJobId = typeof m.jobId === 'string'
    ? m.jobId
    : typeof m.job === 'object' && m.job !== null
      ? (m.job as Job).requestId
      : undefined;
  if (eventJobId !== requestId.value) return;

  if (m.type === 'job:stdout' || m.type === 'job:stderr') {
    terminalLines.value.push(String(m.data ?? ''));
  }
  if (m.type === 'job:complete') {
    const job = m.job as Job | undefined;
    jobStatus.value = job?.status ?? 'failed';
    jobRunning.value = false;
  }
});

async function startDestroy() {
  terminalLines.value = [
    `[Mission Control] Submitting destroy request for ${resourceGroup.value}...`,
  ];
  jobRunning.value = true;
  jobStatus.value = 'pending';
  requestId.value = null;
  confirmation.value = '';
  try {
    const res = await destroy({
      resourceGroupName: resourceGroup.value,
      confirmation: 'DELETE',
      skipConfirmation: true,
    });
    requestId.value = res.requestId;
    jobStatus.value = res.status;
    terminalLines.value = [...terminalLines.value, ...res.logs];
  } catch (e) {
    jobStatus.value = 'failed';
    jobRunning.value = false;
    terminalLines.value.push(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
</script>
