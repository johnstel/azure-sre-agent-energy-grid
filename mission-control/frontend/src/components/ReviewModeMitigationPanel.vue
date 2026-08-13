<template>
  <section class="mitigation" :class="`mitigation--${presentation.tone}`" aria-labelledby="mitigation-heading">
    <div class="mitigation__heading">
      <div>
        <p class="mitigation__kicker">Review-mode mitigation</p>
        <h2 id="mitigation-heading">MongoDBDown · {{ evidence?.targetResource || 'energy/mongodb' }}</h2>
      </div>
      <span class="mitigation__badge" role="status">{{ presentation.label }}</span>
    </div>

    <p v-if="!evidence" class="mitigation__notice">
      {{ error || 'Mitigation evidence has not been queried yet. This is not a claim that the agent is idle.' }}
    </p>

    <template v-else>
      <p class="mitigation__meaning">{{ presentation.meaning }}</p>

      <p v-if="loud" class="mitigation__banner" role="alert">
        <strong>Attention:</strong>
        <span v-if="evidence.runModeBlocked">
          Effective run mode is <strong>{{ runMode.label }}</strong>. {{ runMode.meaning }}
        </span>
        <span v-else-if="evidence.schemaMismatch">
          The audit telemetry schema no longer matches the documented event/field names.
        </span>
        <span v-else>{{ presentation.meaning }}</span>
      </p>

      <dl class="mitigation__facts">
        <div>
          <dt>Effective run mode</dt>
          <dd :class="`mitigation__tone--${runMode.tone}`">{{ runMode.label }}</dd>
        </div>
        <div>
          <dt>Incident resolved</dt>
          <dd>{{ evidence.incidentResolved ? 'Yes — verified' : 'No' }}</dd>
        </div>
        <div>
          <dt>Proposed action</dt>
          <dd><code>{{ evidence.proposedCommand }}</code></dd>
        </div>
        <div v-if="evidence.approval">
          <dt>Approval decision</dt>
          <dd>
            {{ evidence.approval.outcome }}
            <small>observed {{ formatFreshness(evidence.approval.freshnessSeconds) }}</small>
          </dd>
        </div>
        <div v-if="evidence.execution">
          <dt>Execution</dt>
          <dd>
            <code>{{ evidence.execution.command || evidence.execution.toolName }}</code>
            <small>
              allowlisted: {{ evidence.execution.allowlisted ? 'yes' : 'no' }} ·
              observed {{ formatFreshness(evidence.execution.freshnessSeconds) }}
            </small>
          </dd>
        </div>
        <div v-if="evidence.resourceState">
          <dt>Resource mutation</dt>
          <dd :class="`mitigation__tone--${mutation.tone}`">
            {{ mutation.label }}
            <small>{{ evidence.resourceState.reason }}</small>
          </dd>
        </div>
      </dl>

      <h3 class="mitigation__subheading">Verification evidence</h3>
      <ul v-if="evidence.verification.probes.length" class="mitigation__probes">
        <li v-for="probe in evidence.verification.probes" :key="probe.probe" class="mitigation__probe">
          <span class="mitigation__probe-name">{{ probeLabels[probe.probe] }}</span>
          <span class="mitigation__probe-status" :class="`mitigation__tone--${probeStatus(probe.status).tone}`">
            {{ probeStatus(probe.status).label }}
          </span>
          <span class="mitigation__probe-value">{{ probe.observedValue }}</span>
          <small class="mitigation__probe-meta">
            source: {{ probe.source }} ·
            observed {{ formatFreshness(probe.freshnessSeconds) }}
            <template v-if="probe.threshold"> · threshold: {{ probe.threshold }}</template>
            · evidence: {{ probe.evidencePointer }}
          </small>
          <small v-if="probe.detail" class="mitigation__probe-detail">{{ probe.detail }}</small>
        </li>
      </ul>
      <p v-else class="mitigation__notice">
        No verification probes were collected. Recovery is unproven; the incident stays unresolved.
      </p>
      <p v-if="evidence.verification.missingProbes.length" class="mitigation__notice">
        Missing probes: {{ evidence.verification.missingProbes.join(', ') }}
      </p>
      <p v-if="evidence.execution?.completedAt && !evidence.verification.postDatesExecution" class="mitigation__notice">
        At least one probe does not post-date the execution, so it cannot prove the fix worked.
      </p>

      <template v-if="correlation.length">
        <h3 class="mitigation__subheading">Correlated identifiers</h3>
        <dl class="mitigation__facts">
          <div v-for="row in correlation" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd><code>{{ row.value }}</code></dd>
          </div>
        </dl>
      </template>

      <template v-if="evidence.securityFindings.length">
        <h3 class="mitigation__subheading mitigation__subheading--danger">Security findings</h3>
        <ul class="mitigation__list mitigation__list--danger">
          <li v-for="(finding, index) in evidence.securityFindings" :key="index">{{ finding }}</li>
        </ul>
      </template>

      <template v-if="evidence.guidance.rollbackCommand || evidence.guidance.escalation">
        <h3 class="mitigation__subheading">Rollback &amp; escalation</h3>
        <p v-if="evidence.guidance.rollbackCommand" class="mitigation__detail">
          <strong>Rollback:</strong> <code>{{ evidence.guidance.rollbackCommand }}</code>
          <small v-if="evidence.guidance.rollbackRationale">{{ evidence.guidance.rollbackRationale }}</small>
        </p>
        <p v-if="evidence.guidance.escalation" class="mitigation__detail">
          <strong>Escalation:</strong> {{ evidence.guidance.escalation }}
        </p>
      </template>

      <template v-if="evidence.rejectedEvidence.length">
        <h3 class="mitigation__subheading">Rejected evidence</h3>
        <ul class="mitigation__list">
          <li v-for="(reason, index) in evidence.rejectedEvidence" :key="index">{{ reason }}</li>
        </ul>
      </template>

      <template v-if="guardrails">
        <h3 class="mitigation__subheading">Guardrails</h3>
        <ul class="mitigation__list mitigation__list--warning">
          <li v-for="(disclosure, index) in guardrails.disclosures" :key="index">{{ disclosure }}</li>
        </ul>
        <p class="mitigation__detail">
          <strong>Allowlist:</strong>
          <code v-for="command in guardrails.allowlistedCommands" :key="command">{{ command }}</code>
        </p>
        <p class="mitigation__detail">
          <strong>Policy:</strong> {{ guardrails.policyDocument }}
        </p>
      </template>

      <ul class="mitigation__list mitigation__list--muted">
        <li v-for="(limitation, index) in evidence.limitations" :key="index">{{ limitation }}</li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReviewModeMitigationEvidence, ReviewModeMitigationGuardrails, VerificationProbeStatus } from '@/types/api';
import {
  PROBE_LABELS,
  correlationRows,
  describeMitigationState,
  describeMutation,
  describeProbeStatus,
  describeRunMode,
  formatFreshness,
  requiresLoudBanner,
} from '@/utils/reviewModeMitigation';

const props = defineProps<{
  evidence?: ReviewModeMitigationEvidence;
  guardrails?: ReviewModeMitigationGuardrails;
  error?: string;
}>();

const probeLabels = PROBE_LABELS;

const presentation = computed(() =>
  props.evidence
    ? describeMitigationState(props.evidence.state)
    : { label: 'Not queried', tone: 'neutral' as const, meaning: '', loud: false },
);
const runMode = computed(() => describeRunMode(props.evidence?.effectiveRunMode ?? 'unknown'));
const mutation = computed(() => describeMutation(props.evidence?.resourceState?.mutation ?? 'unknown'));
const loud = computed(() => (props.evidence ? requiresLoudBanner(props.evidence) : false));
const correlation = computed(() => (props.evidence ? correlationRows(props.evidence) : []));

function probeStatus(status: VerificationProbeStatus) {
  return describeProbeStatus(status);
}
</script>

<style scoped>
.mitigation {
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.mitigation--success { border-color: rgba(34, 197, 94, 0.55); }
.mitigation--warning { border-color: rgba(234, 179, 8, 0.6); }
.mitigation--danger { border-color: rgba(239, 68, 68, 0.7); }
.mitigation--pending { border-color: rgba(59, 130, 246, 0.55); }

.mitigation__heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.mitigation__kicker {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  opacity: 0.7;
  margin: 0;
}

.mitigation__badge {
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid currentColor;
  white-space: nowrap;
}

.mitigation__banner {
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(239, 68, 68, 0.12);
  outline: 1px solid rgba(239, 68, 68, 0.4);
  margin: 0;
}

.mitigation__meaning { margin: 0; opacity: 0.9; }
.mitigation__notice { margin: 0; opacity: 0.8; font-style: italic; }
.mitigation__detail { margin: 0; }

.mitigation__subheading {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0.35rem 0 0;
  opacity: 0.8;
}

.mitigation__subheading--danger { color: rgb(248, 113, 113); opacity: 1; }

.mitigation__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.5rem 1rem;
  margin: 0;
}

.mitigation__facts dt { font-size: 0.75rem; opacity: 0.7; }
.mitigation__facts dd { margin: 0; font-weight: 600; }
.mitigation__facts dd small { display: block; font-weight: 400; opacity: 0.7; }

.mitigation__probes { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }

.mitigation__probe {
  display: grid;
  gap: 0.15rem;
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;
  background: rgba(148, 163, 184, 0.08);
}

.mitigation__probe-name { font-weight: 600; }
.mitigation__probe-status { font-weight: 600; }
.mitigation__probe-value { font-family: ui-monospace, monospace; font-size: 0.8rem; }
.mitigation__probe-meta,
.mitigation__probe-detail { opacity: 0.7; }

.mitigation__tone--success { color: rgb(74, 222, 128); }
.mitigation__tone--warning { color: rgb(250, 204, 21); }
.mitigation__tone--danger { color: rgb(248, 113, 113); }
.mitigation__tone--pending { color: rgb(96, 165, 250); }
.mitigation__tone--neutral { color: inherit; }

.mitigation__list { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.25rem; }
.mitigation__list--danger { color: rgb(248, 113, 113); }
.mitigation__list--warning { color: rgb(250, 204, 21); }
.mitigation__list--muted { opacity: 0.65; font-size: 0.8rem; }

.mitigation code {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
  background: rgba(148, 163, 184, 0.15);
  padding: 0.1rem 0.35rem;
  border-radius: 0.3rem;
  margin-right: 0.35rem;
}
</style>
