<template>
  <section>
    <h2 class="text-sm font-medium uppercase tracking-wider mb-6" style="color: var(--muted);">
      Pod Monitor
    </h2>

    <!-- Loading -->
    <div v-if="podLoading && pods.length === 0" class="loading text-sm text-center py-8">
      Loading pods…
    </div>

    <!-- Pod grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      <div
        v-for="pod in pods"
        :key="pod.name"
        class="card"
        :style="{ borderLeftWidth: '3px', borderLeftColor: podBorderColor(pod) }"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-semibold truncate" style="color: var(--text);">{{ pod.name }}</span>
          <span
            class="badge"
            :class="podBadgeClass(pod)"
          >
            {{ pod.status }}
          </span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs" style="color: var(--muted);">
          <div>
            <span class="block font-medium">Ready</span>
            <span :style="{ color: pod.ready ? 'var(--green)' : 'var(--red)' }">
              {{ pod.ready ? 'Yes' : 'No' }}
            </span>
          </div>
          <div>
            <span class="block font-medium">Restarts</span>
            <span :style="{ color: pod.restarts > 0 ? 'var(--amber)' : 'var(--text)' }">
              {{ pod.restarts }}
            </span>
          </div>
          <div>
            <span class="block font-medium">Age</span>
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
import { ref, onMounted, onUnmounted } from 'vue';
import { useApi } from '@/composables/useApi';
import { usePolling } from '@/composables/usePolling';
import type { Pod, KubeEvent } from '@/types/api';
import EventLog from './EventLog.vue';

const { getPods, getEvents } = useApi();

const pods = ref<Pod[]>([]);
const events = ref<KubeEvent[]>([]);
const podLoading = ref(true);

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
