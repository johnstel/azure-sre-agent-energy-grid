<template>
  <header class="header">
    <div class="header-brand">
      <span class="header-mark" aria-hidden="true">⚡</span>
      <div>
        <h1>Mission Control</h1>
        <span>Energy Grid Operations Wallboard</span>
      </div>
    </div>

    <div class="header-context">
      <nav class="service-links" aria-label="Public service links">
        <span class="service-links__label">Public services</span>
        <a
          v-for="link in publicServiceLinks"
          :key="`${link.name}-${link.url}`"
          class="service-link"
          :href="link.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="`${link.name} · ${link.address}`"
        >
          {{ link.name }}
          <span class="sr-only">(opens in new tab)</span>
        </a>
        <span v-if="publicServiceLinks.length === 0" class="service-links__empty" :title="serviceStatusTitle">
          {{ serviceStatusLabel }}
        </span>
      </nav>
      <button
        class="analyst-button"
        type="button"
        aria-label="Open Local Analyst chat assistant"
        aria-controls="local-analyst-drawer"
        :aria-expanded="analystOpen"
        title="Open Local Analyst"
        @click="emit('open-analyst')"
      >
        <span aria-hidden="true">🤖</span>
        <span>AI</span>
      </button>
      <div class="connection-dot" :class="connected ? 'is-connected' : 'is-disconnected'" :title="connected ? 'WebSocket connected' : 'WebSocket disconnected'">
        <span class="dot" :class="connected ? 'dot-green' : 'dot-red'"></span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useApi } from '@/composables/useApi';
import { useWebSocket } from '@/composables/useWebSocket';
import type { Service, ServicePort } from '@/types/api';

interface PublicServiceLink {
  name: string;
  url: string;
  address: string;
  priority: number;
}

withDefaults(defineProps<{
  analystOpen?: boolean;
}>(), {
  analystOpen: false,
});

const emit = defineEmits<{
  'open-analyst': [];
}>();

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const { connected, connect } = useWebSocket(`${wsProtocol}//${window.location.host}/ws`);
const { getServices } = useApi();
const services = ref<Service[]>([]);
const serviceError = ref('');
let servicesTimer: ReturnType<typeof setInterval> | null = null;

connect();

const publicServiceLinks = computed(() => services.value
  .flatMap(serviceToPublicLinks)
  .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
  .slice(0, 4));

const serviceStatusLabel = computed(() => serviceError.value ? 'Services unavailable' : 'No public services yet');
const serviceStatusTitle = computed(() => serviceError.value || 'No LoadBalancer ingress or external IP addresses reported by Kubernetes services.');

onMounted(() => {
  void loadServices();
  servicesTimer = setInterval(() => {
    void loadServices();
  }, 15_000);
});

onUnmounted(() => {
  if (servicesTimer) clearInterval(servicesTimer);
});

async function loadServices() {
  try {
    const response = await getServices();
    services.value = response.services;
    serviceError.value = '';
  } catch (error) {
    services.value = [];
    serviceError.value = `Public services unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function serviceToPublicLinks(service: Service): PublicServiceLink[] {
  if (isHttpUrl(service.publicUrl)) {
    return [{
      name: compactServiceName(service.name),
      url: service.publicUrl,
      address: service.externalHostname ?? service.externalIP ?? service.publicUrl,
      priority: servicePriority(service),
    }];
  }

  const addresses = [
    ...(service.loadBalancerIngress ?? []).map(ingress => ingress.hostname ?? ingress.ip).filter(isNonEmptyString),
    service.externalHostname,
    service.externalIP,
    ...(service.externalIPs ?? []).filter(isNonEmptyString),
  ].filter(isNonEmptyString);
  const uniqueAddresses = Array.from(new Set(addresses));
  if (uniqueAddresses.length === 0) return [];

  return uniqueAddresses.map(address => {
    const port = selectPublicServicePort(service);
    if (!port) return undefined;
    return {
      name: compactServiceName(service.name),
      url: buildServiceUrl(address, port),
      address,
      priority: servicePriority(service),
    };
  }).filter((link): link is PublicServiceLink => link !== undefined);
}

function selectPublicServicePort(service: Service): ServicePort | undefined {
  const ports = service.portDetails ?? [];
  return ports.find(port => port.port === 443)
    ?? ports.find(port => port.port === 80)
    ?? ports.find(port => port.name?.toLowerCase().includes('http'))
    ?? ports.find(port => port.appProtocol?.toLowerCase().includes('http'));
}

function buildServiceUrl(address: string, port?: ServicePort): string {
  const portNumber = port?.port;
  const portName = port?.name?.toLowerCase() ?? '';
  const appProtocol = port?.appProtocol?.toLowerCase() ?? '';
  const secure = portNumber === 443 || portName.includes('https') || appProtocol.includes('https');
  const protocol = secure ? 'https' : 'http';
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  const portSuffix = portNumber && !((secure && portNumber === 443) || (!secure && portNumber === 80))
    ? `:${portNumber}`
    : '';
  return `${protocol}://${host}${portSuffix}`;
}

function servicePriority(service: Service): number {
  const name = service.name.toLowerCase();
  if (name.includes('grid-dashboard')) return 0;
  if (name.includes('ops-console')) return 1;
  if (name.includes('dashboard')) return 2;
  if (service.type === 'LoadBalancer') return 3;
  return 4;
}

function compactServiceName(name: string): string {
  return name
    .replace(/^energy-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 80px;
  padding: 0.85rem clamp(1rem, 2vw, 1.5rem);
  position: relative;
  top: 0;
  z-index: 20;
  background:
    linear-gradient(135deg, rgb(15 23 42 / 0.94), rgb(30 58 95 / 0.9)),
    linear-gradient(90deg, rgb(34 211 238 / 0.12), transparent 45%, rgb(167 139 250 / 0.12));
  border-bottom: 1px solid rgb(34 211 238 / 0.35);
  box-shadow: 0 16px 40px rgb(2 6 23 / 0.32);
  backdrop-filter: blur(14px);
}

.header-brand,
.header-context,
.service-links,
.connection-dot,
.analyst-button {
  display: flex;
  align-items: center;
}

.header-brand {
  gap: 0.85rem;
  min-width: 0;
}

.header-mark {
  display: grid;
  width: 2.6rem;
  height: 2.6rem;
  place-items: center;
  border: 1px solid rgb(34 211 238 / 0.4);
  border-radius: 0.9rem;
  background: rgb(34 211 238 / 0.1);
  box-shadow: inset 0 0 22px rgb(34 211 238 / 0.08), 0 0 18px rgb(34 211 238 / 0.12);
  font-size: 1.35rem;
}

.header h1 {
  color: var(--text);
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.header span {
  color: var(--muted);
  font-size: 0.95rem;
}

.header-context {
  min-width: 0;
  gap: 0.75rem;
}

.service-links {
  min-width: 0;
  max-width: min(58vw, 920px);
  gap: 0.45rem;
  border: 1px solid rgb(148 163 184 / 0.22);
  border-radius: 999px;
  background: rgb(15 23 42 / 0.54);
  padding: 0.35rem 0.45rem 0.35rem 0.7rem;
  overflow: hidden;
}

.service-links__label {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.service-link,
.service-links__empty,
.analyst-button {
  border: 1px solid rgb(148 163 184 / 0.22);
  border-radius: 999px;
  background: rgb(2 6 23 / 0.34);
  padding: 0.45rem 0.65rem;
  white-space: nowrap;
}

.service-link {
  max-width: 12rem;
  color: var(--text);
  font-size: 0.88rem;
  font-weight: 800;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
}

.service-link:hover,
.service-link:focus-visible,
.analyst-button:hover,
.analyst-button:focus-visible {
  border-color: rgb(34 211 238 / 0.52);
  background: rgb(8 47 73 / 0.5);
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.service-links__empty {
  color: var(--muted);
  font-size: 0.86rem;
}

.analyst-button {
  gap: 0.35rem;
  color: var(--text);
  cursor: pointer;
  font-weight: 900;
}

.connection-dot {
  flex: 0 0 auto;
  width: 1.8rem;
  height: 1.8rem;
  justify-content: center;
  border: 1px solid rgb(148 163 184 / 0.2);
  border-radius: 999px;
  background: rgb(15 23 42 / 0.42);
}

.connection-dot.is-connected {
  border-color: rgb(16 185 129 / 0.24);
}

.connection-dot.is-disconnected {
  border-color: rgb(239 68 68 / 0.32);
}

@media (max-width: 720px) {
  .header {
    align-items: flex-start;
    flex-direction: column;
  }

  .header-context {
    flex-wrap: wrap;
  }

  .service-links {
    max-width: 100%;
    flex-wrap: wrap;
    border-radius: 1rem;
  }
}
</style>
