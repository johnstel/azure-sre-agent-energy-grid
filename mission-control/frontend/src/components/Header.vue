<template>
  <header class="header">
    <!-- Left: Branding -->
    <div class="flex items-center gap-3">
      <span class="text-2xl">⚡</span>
      <div>
        <h1 class="text-lg font-bold tracking-tight" style="color: var(--text);">Mission Control</h1>
        <span class="text-xs" style="color: var(--muted);">Energy Grid Operations</span>
      </div>
    </div>

    <!-- Center: Navigation -->
    <nav class="flex items-center gap-1">
      <router-link
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="nav-link"
        :class="{ active: $route.path === tab.to }"
      >
        {{ tab.label }}
      </router-link>
    </nav>

    <!-- Right: Connection status -->
    <div class="flex items-center gap-2">
      <span class="dot" :class="connected ? 'dot-green' : 'dot-red'"></span>
      <span class="text-xs" style="color: var(--muted);">{{ connected ? 'Connected' : 'Disconnected' }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useWebSocket } from '@/composables/useWebSocket';

const tabs = [
  { to: '/', label: 'Preflight' },
  { to: '/deploy', label: 'Deploy' },
  { to: '/destroy', label: 'Destroy' },
  { to: '/monitor', label: 'Monitor' },
  { to: '/scenarios', label: 'Scenarios' },
];

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const { connected, connect } = useWebSocket(`${wsProtocol}//${window.location.host}/ws`);
connect();
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, var(--header-from), var(--header-to));
  border-bottom: 2px solid var(--accent);
}
.nav-link {
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--muted);
  text-decoration: none;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.nav-link:hover {
  color: var(--text);
  background: rgba(255,255,255,0.05);
}
.nav-link.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}
</style>
