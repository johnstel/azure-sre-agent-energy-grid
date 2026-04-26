<template>
  <section class="portal-validation">
    <div class="portal-validation__heading">
      <div class="portal-validation__heading-content">
        <p class="wallboard-kicker wallboard-kicker--urgent">Required before customer demo</p>
        <h2>Portal Evidence Validation</h2>
        <p class="section-help">
          Record confirmations after capturing real Azure SRE Agent portal evidence for each scenario.
        </p>
      </div>
      <span class="badge" :class="progressBadgeClass">{{ progressLabel }}</span>
    </div>

    <div class="portal-validation__alert">
      <p>
        <strong>Redaction reminder:</strong> Before recording confirmation, redact subscription ID, tenant ID, resource IDs, principal IDs, and all sensitive identifiers from screenshots and transcripts.
      </p>
    </div>

    <div class="portal-validation__scenarios">
      <div v-for="validation in validations" :key="validation.scenarioName" class="portal-validation__card">
        <div class="portal-validation__header">
          <div>
            <h3>{{ validation.scenarioName }}</h3>
            <p class="scenario-description">{{ scenarioDescriptions[validation.scenarioName] }}</p>
          </div>
          <span class="badge" :class="validation.status === 'confirmed' ? 'badge-online' : 'badge-warning'">
            {{ validation.status === 'confirmed' ? 'Confirmed ✓' : 'Awaiting ⏳' }}
          </span>
        </div>

        <div class="portal-validation__prompt">
          <label class="wallboard-kicker" :for="`prompt-${validation.scenarioName}`">Portal prompt</label>
          <p :id="`prompt-${validation.scenarioName}`" class="portal-validation__prompt-text">
            {{ scenarioPrompts[validation.scenarioName] }}
          </p>
          <div class="portal-validation__prompt-actions">
            <button
              class="command-button command-button--neutral"
              type="button"
              :aria-label="`Copy ${validation.scenarioName} prompt to clipboard`"
              @click="copyPrompt(validation.scenarioName)"
            >
              📋 Copy Prompt
            </button>
            <a
              href="https://aka.ms/sreagent/portal"
              target="_blank"
              rel="noopener noreferrer"
              class="command-button command-button--primary"
              :aria-label="`Open Azure SRE Agent portal in new tab`"
            >
              🔗 Open Portal
            </a>
          </div>
        </div>

        <div class="portal-validation__fields">
        <label :for="`timestamp-${validation.scenarioName}`">
          <span class="wallboard-kicker">Timestamp</span>
          <input
            :id="`timestamp-${validation.scenarioName}`"
            :value="validation.timestamp"
            :disabled="validation.status === 'confirmed'"
            class="field-control"
            type="text"
            placeholder="2026-04-26T13:30:00.000Z"
            @blur="updateTimestamp(validation.scenarioName, ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label :for="`initials-${validation.scenarioName}`">
          <span class="wallboard-kicker">Operator initials (2-4 letters)</span>
          <input
            :id="`initials-${validation.scenarioName}`"
            :value="validation.operatorInitials"
            :disabled="validation.status === 'confirmed'"
            class="field-control"
            type="text"
            maxlength="4"
            pattern="[A-Za-z]{2,4}"
            placeholder="JS"
            @input="updateInitials(validation.scenarioName, ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label :for="`evidence-path-${validation.scenarioName}`">
          <span class="wallboard-kicker">Evidence path</span>
          <input
            :id="`evidence-path-${validation.scenarioName}`"
            :value="validation.evidencePath"
            :disabled="validation.status === 'confirmed'"
            class="field-control"
            type="text"
            placeholder="docs/evidence/wave1-live/oom-killed/sre-agent/..."
            @input="updateEvidencePath(validation.scenarioName, ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label :for="`accuracy-${validation.scenarioName}`">
          <span class="wallboard-kicker">Outcome/Accuracy (optional)</span>
          <select
            :id="`accuracy-${validation.scenarioName}`"
            :value="validation.accuracy || ''"
            :disabled="validation.status === 'confirmed'"
            class="field-control"
            @change="updateAccuracy(validation.scenarioName, ($event.target as HTMLSelectElement).value as PortalValidationAccuracy | '')"
          >
            <option value="">Not assessed</option>
            <option value="PASS">PASS — Matched expected root cause</option>
            <option value="PARTIAL">PARTIAL — Partially helpful</option>
            <option value="FAIL">FAIL — Unhelpful response</option>
          </select>
        </label>

        <label :for="`notes-${validation.scenarioName}`">
          <span class="wallboard-kicker">Notes</span>
          <textarea
            :id="`notes-${validation.scenarioName}`"
            :value="validation.notes"
            :disabled="validation.status === 'confirmed'"
            class="field-control"
            rows="2"
            placeholder="Optional notes about portal output quality..."
            @input="updateNotes(validation.scenarioName, ($event.target as HTMLInputElement).value)"
          ></textarea>
        </label>

        <label class="control-check evidence-checkbox">
          <input
            :id="`evidence-captured-${validation.scenarioName}`"
            :checked="validation.evidenceCaptured"
            :disabled="validation.status === 'confirmed'"
            type="checkbox"
            @change="updateEvidenceCaptured(validation.scenarioName, ($event.target as HTMLInputElement).checked)"
          />
          <span>I captured real Azure SRE Agent portal evidence for this scenario.</span>
        </label>
      </div>

      <div class="portal-validation__actions">
        <button
          v-if="validation.status === 'awaiting'"
          class="command-button command-button--success"
          type="button"
          :disabled="!canConfirm(validation)"
          :aria-label="`Mark ${validation.scenarioName} as confirmed`"
          @click="confirmScenario(validation)"
        >
          Mark Confirmed
        </button>
        <button
          v-if="validation.status === 'confirmed'"
          class="command-button command-button--neutral"
          type="button"
          :aria-label="`Reset ${validation.scenarioName} confirmation`"
          @click="resetScenario(validation.scenarioName)"
        >
          Reset
        </button>
        </div>
      </div>
    </div>

    <div v-if="!resetConfirmVisible" class="portal-validation__footer">
      <button
        class="command-button command-button--danger"
        type="button"
        aria-label="Reset all confirmations (requires confirmation)"
        @click="resetConfirmVisible = true"
      >
        Reset all confirmations
      </button>
    </div>

    <div v-if="resetConfirmVisible" class="portal-validation__reset-confirm">
      <p>
        <strong>Confirm reset:</strong> This will clear all three scenario confirmations and evidence paths. This cannot be undone.
      </p>
      <div class="reset-confirm-actions">
        <button
          class="command-button command-button--danger"
          type="button"
          aria-label="Confirm reset all"
          @click="resetAll"
        >
          Yes, reset all
        </button>
        <button
          class="command-button command-button--neutral"
          type="button"
          aria-label="Cancel reset"
          @click="resetConfirmVisible = false"
        >
          Cancel
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { PortalValidation, PortalValidationAccuracy, PortalValidationScenarioName, PortalValidationState } from '../types/api';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3333' : '';

const validations = ref<PortalValidation[]>([]);
const confirmedCount = ref(0);
const resetConfirmVisible = ref(false);

const scenarioPrompts: Record<PortalValidationScenarioName, string> = {
  OOMKilled: 'Why is the meter-service pod failing? Check recent pod events, memory limits, and container restarts.',
  MongoDBDown: 'Why are meter readings unavailable? Trace the symptom through service endpoints, MongoDB deployment state, and recent events.',
  ServiceMismatch: 'Why is the meter-service unreachable despite running pods? Check service selectors, endpoint readiness, and pod labels.',
};

const scenarioDescriptions: Record<PortalValidationScenarioName, string> = {
  OOMKilled: 'Meter service pods crashing — memory exhaustion',
  MongoDBDown: 'Cascading failure — MongoDB dependency unavailable',
  ServiceMismatch: 'Silent failure — service selector does not match pods',
};

const progressBadgeClass = computed(() => {
  if (confirmedCount.value === 3) return 'badge-online';
  return 'badge-warning';
});

const progressLabel = computed(() => {
  if (confirmedCount.value === 3) return 'READY FOR DEMO ✓';
  return `${confirmedCount.value}/3 PENDING`;
});

function canConfirm(validation: PortalValidation): boolean {
  return (
    validation.evidenceCaptured &&
    /^[A-Za-z]{2,4}$/.test(validation.operatorInitials) &&
    !Number.isNaN(Date.parse(validation.timestamp)) &&
    validation.evidencePath.trim().length > 0
  );
}

async function loadValidations() {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations`);
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to load portal validations:', err);
  }
}

async function copyPrompt(scenarioName: PortalValidationScenarioName) {
  const prompt = scenarioPrompts[scenarioName];
  try {
    await navigator.clipboard.writeText(prompt);
    alert('Prompt copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy prompt:', err);
    alert('Failed to copy prompt. Please copy manually.');
  }
}

async function updateEvidenceCaptured(scenarioName: PortalValidationScenarioName, checked: boolean) {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceCaptured: checked }),
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to update evidence captured:', err);
  }
}

async function updateTimestamp(scenarioName: PortalValidationScenarioName, timestamp: string) {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp }),
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to update timestamp:', err);
  }
}

async function updateInitials(scenarioName: PortalValidationScenarioName, initials: string) {
  const operatorInitials = initials.toUpperCase();
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorInitials }),
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to update initials:', err);
  }
}

async function updateEvidencePath(scenarioName: PortalValidationScenarioName, path: string) {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidencePath: path }),
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to update evidence path:', err);
  }
}

async function updateAccuracy(scenarioName: PortalValidationScenarioName, accuracy: PortalValidationAccuracy | '') {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accuracy: accuracy || undefined }),
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to update accuracy:', err);
  }
}

async function updateNotes(scenarioName: PortalValidationScenarioName, notes: string) {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to update notes:', err);
  }
}

async function confirmScenario(validation: PortalValidation) {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${validation.scenarioName}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: validation.timestamp,
        operatorInitials: validation.operatorInitials,
        accuracy: validation.accuracy,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || 'Failed to confirm scenario');
      return;
    }

    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to confirm scenario:', err);
    alert('Failed to confirm scenario. Please check all required fields.');
  }
}

async function resetScenario(scenarioName: PortalValidationScenarioName) {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/${scenarioName}/reset`, {
      method: 'POST',
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
  } catch (err) {
    console.error('Failed to reset scenario:', err);
  }
}

async function resetAll() {
  try {
    const response = await fetch(`${API_BASE}/api/portal-validations/reset-all`, {
      method: 'POST',
    });
    const data: PortalValidationState = await response.json();
    validations.value = data.validations;
    confirmedCount.value = data.confirmedCount;
    resetConfirmVisible.value = false;
  } catch (err) {
    console.error('Failed to reset all validations:', err);
  }
}

onMounted(() => {
  loadValidations();
});
</script>

<style scoped>
.portal-validation {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 1.5rem;
}

.portal-validation__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.portal-validation__heading-content {
  flex: 1;
  min-width: 0;
}

.portal-validation__heading h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.wallboard-kicker--urgent {
  color: rgba(255, 193, 7, 1);
  font-weight: 600;
}

.section-help {
  margin-top: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  max-width: 72ch;
  line-height: 1.5;
}

.portal-validation__alert {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.portal-validation__alert p {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  max-width: 80ch;
  line-height: 1.5;
}

.portal-validation__scenarios {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 20px;
}

.portal-validation__card {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.portal-validation__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.portal-validation__header h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
}

.scenario-description {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.portal-validation__prompt {
  margin-bottom: 16px;
}

.portal-validation__prompt-text {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
  font-family: ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.portal-validation__prompt-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.portal-validation__prompt-actions a {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.portal-validation__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.portal-validation__fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Full-width fields */
.portal-validation__fields label:nth-child(3), /* Evidence path */
.portal-validation__fields label:nth-child(4), /* Accuracy */
.portal-validation__fields label:nth-child(5), /* Notes */
.portal-validation__fields label:nth-child(6) { /* Checkbox */
  grid-column: 1 / -1;
}

.evidence-checkbox {
  flex-direction: row !important;
  align-items: flex-start;
  gap: 8px !important;
  padding: 12px;
  background: rgba(0, 123, 255, 0.05);
  border: 1px solid rgba(0, 123, 255, 0.2);
  border-radius: 6px;
}

.evidence-checkbox input {
  margin-top: 2px;
}

.evidence-checkbox span {
  font-weight: 500;
}

.portal-validation__actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.portal-validation__footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.portal-validation__reset-confirm {
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
}

.portal-validation__reset-confirm p {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.reset-confirm-actions {
  display: flex;
  gap: 8px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .portal-validation__scenarios {
    grid-template-columns: 1fr;
  }

  .portal-validation__fields {
    grid-template-columns: 1fr;
  }

  .portal-validation__fields label:nth-child(3),
  .portal-validation__fields label:nth-child(4),
  .portal-validation__fields label:nth-child(5),
  .portal-validation__fields label:nth-child(6) {
    grid-column: 1;
  }
}

@media (max-width: 400px) {
  .portal-validation__scenarios {
    grid-template-columns: 1fr;
  }
}
</style>
