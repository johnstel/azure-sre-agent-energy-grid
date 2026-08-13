<template>
  <section class="customer-impact" :class="impact ? customerImpactStatusClass(impact.status) : 'customer-impact--unknown'" aria-labelledby="customer-impact-heading">
    <div class="customer-impact__heading">
      <div>
        <p class="customer-impact__kicker">Customer impact</p>
        <h2 id="customer-impact-heading">Meter ingestion SLO</h2>
      </div>
      <span v-if="impact" class="customer-impact__status" role="status">
        <span aria-hidden="true">{{ customerImpactStatusIcon(impact.status) }}</span>
        {{ customerImpactStatusLabel(impact.status) }}
      </span>
      <span v-else class="customer-impact__status" role="status">
        <span aria-hidden="true">?</span>
        Unknown — loading
      </span>
    </div>

    <template v-if="impact">
      <p class="customer-impact__journey"><strong>Journey:</strong> {{ impact.journey }}</p>
      <p class="customer-impact__source"><strong>Evidence:</strong> {{ impact.telemetry.source }}</p>

      <dl v-if="impact.telemetry.dataStatus === 'available'" class="customer-impact__metrics">
        <div v-if="impact.telemetry.successRatePct !== undefined">
          <dt>Success rate</dt>
          <dd>{{ impact.telemetry.successRatePct.toFixed(2) }}%</dd>
        </div>
        <div v-if="impact.telemetry.p95LatencyMs !== undefined">
          <dt>p95 latency</dt>
          <dd>{{ Math.round(impact.telemetry.p95LatencyMs) }} ms</dd>
        </div>
        <div v-if="formatFreshness(impact.telemetry.lastSuccessAgeSeconds)">
          <dt>Last success</dt>
          <dd>{{ formatFreshness(impact.telemetry.lastSuccessAgeSeconds) }}</dd>
        </div>
      </dl>
      <p v-else-if="impact.telemetry.dataStatus === 'no-data'" class="customer-impact__notice">
        No synthetic transaction telemetry was returned for the current query window.
      </p>
      <p v-else class="customer-impact__notice">
        Telemetry is unavailable. This status is not treated as healthy.
      </p>

      <p class="customer-impact__detail"><strong>Affected stage:</strong> {{ impact.affectedStage }}</p>
      <p class="customer-impact__detail"><strong>Recovery:</strong> {{ impact.recoveryCondition }}</p>
      <p class="customer-impact__detail">
        <a :href="gridReadinessPortal.href" target="_blank" rel="noopener noreferrer">{{ gridReadinessPortal.label }}</a>
        for Grid Readiness task history and audit evidence. This panel does not invent scheduled-task results.
      </p>
    </template>
    <p v-else class="customer-impact__notice">{{ error || 'Customer-impact telemetry has not returned yet.' }}</p>
  </section>
</template>

<script setup lang="ts">
import type { CustomerImpactResponse } from '@/types/api';
import {
  customerImpactStatusClass,
  customerImpactStatusIcon,
  customerImpactStatusLabel,
  formatFreshness,
} from '@/utils/customerImpact';
import { configuredSreAgentHandoff } from '@/utils/portalLinks';

const gridReadinessPortal = configuredSreAgentHandoff();

defineProps<{
  impact?: CustomerImpactResponse;
  error?: string;
}>();
</script>

<style scoped>
.customer-impact {
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: rgb(15 23 42 / 0.84);
  box-shadow: var(--shadow-tight);
  padding: 0.85rem;
}

.customer-impact--healthy { border-color: rgb(16 185 129 / 0.58); }
.customer-impact--degraded { border-color: rgb(245 158 11 / 0.72); }
.customer-impact--critical { border-color: rgb(239 68 68 / 0.72); }
.customer-impact--unknown { border-color: rgb(107 114 128 / 0.72); }
.customer-impact--no-data { border-color: rgb(167 139 250 / 0.56); }

.customer-impact__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.customer-impact__kicker {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.customer-impact h2 {
  color: var(--text);
  font-size: 1.2rem;
  line-height: 1.15;
}

.customer-impact__status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 999px;
  padding: 0.25rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 800;
  background: rgb(51 65 85 / 0.7);
  color: var(--text);
}

.customer-impact--healthy .customer-impact__status { background: rgb(6 78 59 / 0.72); color: #a7f3d0; }
.customer-impact--degraded .customer-impact__status { background: rgb(120 53 15 / 0.72); color: #fde68a; }
.customer-impact--critical .customer-impact__status { background: rgb(127 29 29 / 0.72); color: #fecaca; }
.customer-impact--no-data .customer-impact__status { background: rgb(30 27 75 / 0.78); color: #ddd6fe; }

.customer-impact__journey,
.customer-impact__source,
.customer-impact__detail,
.customer-impact__notice {
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
  margin-top: 0.55rem;
}

.customer-impact__detail a {
  color: var(--accent);
  text-decoration: underline;
}

.customer-impact__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.7rem;
}

.customer-impact__metrics div {
  border: 1px solid rgb(51 65 85 / 0.72);
  border-radius: var(--radius-sm);
  padding: 0.45rem;
}

.customer-impact__metrics dt { color: var(--muted); font-size: 0.72rem; }
.customer-impact__metrics dd { color: var(--text); font-weight: 800; margin-top: 0.15rem; }

@media (max-width: 680px) {
  .customer-impact__metrics { grid-template-columns: 1fr; }
}
</style>
