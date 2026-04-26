<template>
  <div class="terminal-wrapper" :class="{ 'terminal-wrapper--danger': tone === 'danger' }">
    <div v-if="title" class="terminal-title">
      <span class="terminal-badge" :class="{ 'terminal-badge--danger': tone === 'danger' }">
        {{ tone === 'danger' ? 'Destructive stream' : 'Output stream' }}
      </span>
      <span class="ml-3 text-xs font-semibold" style="color: var(--muted);">{{ title }}</span>
    </div>
    <div ref="terminalEl" class="terminal-body log-box">
      <div v-if="lines.length === 0" class="loading text-xs">Waiting for output…</div>
      <div v-for="(line, i) in lines" :key="i" class="terminal-line">{{ line }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  lines: string[];
  title?: string;
  tone?: 'default' | 'danger';
}>();

const terminalEl = ref<HTMLElement | null>(null);

watch(
  () => props.lines.length,
  async () => {
    await nextTick();
    if (terminalEl.value) {
      terminalEl.value.scrollTop = terminalEl.value.scrollHeight;
    }
  },
);
</script>

<style scoped>
.terminal-wrapper {
  border: 1px solid rgb(51 65 85 / 0.88);
  border-radius: 12px;
  box-shadow: 0 16px 34px rgb(2 6 23 / 0.18);
}
.terminal-wrapper--danger {
  border-color: rgb(239 68 68 / 0.42);
}
.terminal-title {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background: linear-gradient(180deg, rgb(30 41 59 / 0.94), rgb(15 23 42 / 0.94));
  border-bottom: 1px solid rgb(51 65 85 / 0.88);
}
.terminal-badge {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgb(34 211 238 / 0.3);
  border-radius: 999px;
  background: rgb(34 211 238 / 0.08);
  color: var(--accent);
  padding: 0.18rem 0.5rem;
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.terminal-badge--danger {
  border-color: rgb(239 68 68 / 0.45);
  background: rgb(127 29 29 / 0.22);
  color: #fecaca;
}
.terminal-body {
  border: none;
  border-radius: 0;
}
.terminal-line {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}
</style>
