<template>
  <section id="deploy" class="mission-panel">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow">02 · Provision</span>
        <h2 class="panel-title">Deploy Infrastructure</h2>
        <p class="panel-description">
          Launch the Azure SRE lab footprint with clear regional intent and live job output for operator confidence.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge" :class="jobBadgeClass">{{ jobStatusLabel }}</span>
      </div>
    </div>

    <div class="card card--control mb-4">
      <div class="control-grid mb-4">
        <!-- Location -->
        <div>
          <label class="field-label">Location</label>
          <select
            v-model="location"
            class="field-control w-full rounded-lg px-3 py-2 text-sm"
            style="background: var(--surface); color: var(--text); border: 1px solid var(--card-border);"
          >
            <option value="eastus2">East US 2</option>
            <option value="swedencentral">Sweden Central</option>
            <option value="australiaeast">Australia East</option>
          </select>
        </div>

        <!-- Workload -->
        <div>
          <label class="field-label">Workload Name</label>
          <input
            v-model="workloadName"
            type="text"
            class="field-control w-full rounded-lg px-3 py-2 text-sm"
            style="background: var(--surface); color: var(--text); border: 1px solid var(--card-border);"
            placeholder="srelab"
          />
        </div>

        <!-- Skip RBAC -->
        <div class="flex items-end">
          <label class="control-check w-full cursor-pointer">
            <input type="checkbox" v-model="skipRbac" class="rounded" />
            Skip RBAC
          </label>
        </div>

        <!-- Skip SRE Agent -->
        <div class="flex items-end">
          <label class="control-check w-full cursor-pointer">
            <input type="checkbox" v-model="skipSreAgent" class="rounded" />
            Skip SRE Agent
          </label>
        </div>
      </div>

      <button
        class="command-button command-button--primary px-6 py-2.5 text-sm"
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
import { computed, ref, watch } from 'vue';
import { useApi } from '@/composables/useApi';
import { useWebSocket } from '@/composables/useWebSocket';
import type { Job } from '@/types/api';
import Terminal from './Terminal.vue';

const { deploy } = useApi();

const location = ref('eastus2');
const workloadName = ref('srelab');
const skipRbac = ref(false);
const skipSreAgent = ref(false);
const jobRunning = ref(false);
const jobStatus = ref<string | null>(null);
const requestId = ref<string | null>(null);
const terminalLines = ref<string[]>([]);

const jobStatusLabel = computed(() => {
  if (jobRunning.value) return 'Running';
  if (!jobStatus.value) return 'Ready to deploy';
  return jobStatus.value;
});

const jobBadgeClass = computed(() => {
  if (jobRunning.value || jobStatus.value === 'running') return 'badge-warning';
  if (jobStatus.value === 'completed') return 'badge-online';
  if (jobStatus.value === 'failed') return 'badge-offline';
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

async function startDeploy() {
  terminalLines.value = [
    `[Mission Control] Submitting deploy request for ${workloadName.value || 'srelab'} in ${location.value}...`,
  ];
  jobRunning.value = true;
  jobStatus.value = 'pending';
  requestId.value = null;
  try {
    const res = await deploy({
      location: location.value,
      workloadName: workloadName.value || 'srelab',
      skipRbac: skipRbac.value,
      skipSreAgent: skipSreAgent.value,
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
