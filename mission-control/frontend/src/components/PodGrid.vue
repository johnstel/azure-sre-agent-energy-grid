<template>
  <section id="pods" class="mission-panel">
    <div class="panel-heading">
      <div class="panel-heading__copy">
        <span class="panel-eyebrow">04 · Live grid telemetry</span>
        <h2 class="panel-title">Pod Monitor</h2>
        <p class="panel-description">
          Track Kubernetes pod health, restart pressure, and recent events from a continuously refreshed operations view.
        </p>
      </div>
      <div class="panel-actions">
        <span class="badge badge-info">Polling 5s</span>
        <span class="badge" :class="unhealthyPods > 0 ? 'badge-warning' : 'badge-online'">
          {{ healthyPods }}/{{ pods.length }} healthy
        </span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="podLoading && pods.length === 0" class="loading text-sm text-center py-8">
      Loading pods…
    </div>

    <!-- Pod grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      <div
        v-for="pod in pods"
        :key="pod.name"
        class="card card--telemetry"
        :style="{ borderLeftWidth: '3px', borderLeftColor: podBorderColor(pod) }"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <span class="text-sm font-bold truncate pr-3 mono-label" style="color: var(--text);">{{ pod.name }}</span>
          <span
            class="badge"
            :class="podBadgeClass(pod)"
          >
            {{ pod.status }}
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs" style="color: var(--muted);">
          <div class="telemetry-metric">
            <span>Ready</span>
            <span :style="{ color: pod.ready ? 'var(--green)' : 'var(--red)' }">
              {{ pod.ready ? 'YES' : 'NO' }}
            </span>
          </div>
          <div class="telemetry-metric">
            <span>Restarts</span>
            <span :style="{ color: pod.restarts > 0 ? 'var(--amber)' : 'var(--text)' }">
              {{ pod.restarts }}
            </span>
          </div>
          <div class="telemetry-metric">
            <span>Age</span>
            <span>{{ pod.age }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Events -->
    <EventLog :events="events" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useApi } from '@/composables/useApi';
import { usePolling } from '@/composables/usePolling';
import type { Pod, KubeEvent } from '@/types/api';
import EventLog from './EventLog.vue';

const { getPods, getEvents } = useApi();

const pods = ref<Pod[]>([]);
const events = ref<KubeEvent[]>([]);
const podLoading = ref(true);

const healthyPods = computed(() =>
  pods.value.filter(pod => pod.status === 'Running' && pod.ready).length
);
const unhealthyPods = computed(() => Math.max(pods.value.length - healthyPods.value, 0));

const podPoller = usePolling(async () => {
  const res = await getPods();
  pods.value = res.pods;
  podLoading.value = false;
  return res;
}, 5000);

const eventPoller = usePolling(async () => {
  const res = await getEvents();
  events.value = res.events;
  return res;
}, 5000);

onMounted(() => {
  podPoller.start();
  eventPoller.start();
});

onUnmounted(() => {
  podPoller.stop();
  eventPoller.stop();
});

function podBorderColor(pod: Pod): string {
  if (pod.status === 'Running' && pod.ready) return 'var(--green)';
  if (['CrashLoopBackOff', 'Error', 'Failed', 'OOMKilled'].includes(pod.status)) return 'var(--red)';
  return 'var(--amber)';
}

function podBadgeClass(pod: Pod): string {
  if (pod.status === 'Running' && pod.ready) return 'badge-online';
  if (['CrashLoopBackOff', 'Error', 'Failed', 'OOMKilled'].includes(pod.status)) return 'badge-offline';
  return 'badge-warning';
}
</script>
