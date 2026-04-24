<template>
  <div class="terminal-wrapper">
    <div v-if="title" class="terminal-title">
      <span class="terminal-dot"></span>
      <span class="terminal-dot amber"></span>
      <span class="terminal-dot green"></span>
      <span class="ml-3 text-xs" style="color: var(--muted);">{{ title }}</span>
    </div>
    <div ref="terminalEl" class="terminal-body log-box" style="max-height: 400px;">
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
  border: 1px solid var(--card-border);
  border-radius: 8px;
  overflow: hidden;
}
.terminal-title {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;
  background: var(--card);
  border-bottom: 1px solid var(--card-border);
}
.terminal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--red);
  margin-right: 6px;
}
.terminal-dot.amber { background: var(--amber); }
.terminal-dot.green { background: var(--green); }
.terminal-body {
  border: none;
  border-radius: 0;
}
.terminal-line {
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text);
}
.terminal-line:has-text("error"),
.terminal-line:has-text("Error") {
  color: var(--red);
}
</style>
