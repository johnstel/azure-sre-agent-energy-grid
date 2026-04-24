<template>
  <section>
    <h3 class="text-sm font-medium uppercase tracking-wider mb-3" style="color: var(--muted);">
      Kubernetes Events
    </h3>
    <div class="log-box" style="max-height: 300px;">
      <div v-if="events.length === 0" class="text-xs" style="color: var(--muted);">No events</div>
      <table v-else class="w-full text-xs" style="font-family: var(--font-mono);">
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
            <td class="py-0.5">{{ evt.message }}</td>
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
