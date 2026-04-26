<template>
  <section class="event-log">
    <div class="flex items-center justify-between gap-3 mb-3">
      <h3 class="text-sm font-bold uppercase tracking-wider" style="color: var(--muted);">
        Kubernetes Events
      </h3>
      <span class="badge badge-info">{{ events.length }} events</span>
    </div>
    <div class="log-box event-log__box">
      <div v-if="events.length === 0" class="text-xs" style="color: var(--muted);">No events</div>
      <table v-else class="event-log__table w-full text-xs" style="font-family: var(--font-mono);">
        <thead>
          <tr style="color: var(--muted);">
            <th class="text-left pr-4 pb-2">Time</th>
            <th class="text-left pr-4 pb-2">Type</th>
            <th class="text-left pr-4 pb-2">Reason</th>
            <th class="text-left pb-2">Message</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(evt, i) in events"
            :key="i"
            :style="{ color: evt.type === 'Warning' ? 'var(--amber)' : 'var(--text)' }"
          >
            <td class="pr-4 py-0.5 whitespace-nowrap">{{ formatTime(evt.timestamp) }}</td>
            <td class="pr-4 py-0.5">{{ evt.type }}</td>
            <td class="pr-4 py-0.5">{{ evt.reason }}</td>
            <td class="py-0.5 event-log__message">{{ evt.message }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { KubeEvent } from '@/types/api';

defineProps<{
  events: KubeEvent[];
}>();

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}
</script>

<style scoped>
.event-log__box {
  padding: 0;
}

.event-log__box > div {
  padding: 1rem;
}

.event-log__table {
  border-collapse: collapse;
  min-width: 720px;
}

.event-log__table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(2 6 23 / 0.96);
}

.event-log__table th,
.event-log__table td {
  border-bottom: 1px solid rgb(148 163 184 / 0.1);
  padding-top: 0.45rem;
  padding-bottom: 0.45rem;
  vertical-align: top;
}

.event-log__table th:first-child,
.event-log__table td:first-child {
  padding-left: 1rem;
}

.event-log__table th:last-child,
.event-log__table td:last-child {
  padding-right: 1rem;
}

.event-log__message {
  white-space: normal;
  word-break: break-word;
}
</style>
