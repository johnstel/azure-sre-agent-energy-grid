<template>
  <section class="rehearsal-workflow" aria-label="Mission Control rehearsal workflow">
    <div class="wallboard-panel__heading">
      <div>
        <p class="wallboard-kicker">Rehearsal automation</p>
        <h2>Mission Control rehearsal state</h2>
      </div>
      <span class="badge" :class="statusBadgeClass">{{ statusBadgeLabel }}</span>
    </div>
    <p class="wallboard-card__copy">
      Capture rehearsal phases, evidence, redaction findings, and timing without fabricating portal evidence.
    </p>

    <div v-if="loading" class="wallboard-empty">Loading rehearsal runs…</div>
    <div v-else class="rehearsal-workflow__grid">
      <div class="rehearsal-workflow__panel">
        <div class="rehearsal-workflow__actions">
          <label>
            <span>Scenario</span>
            <select v-model="selectedScenario" class="field-control">
              <option v-for="scenario in availableScenarios" :key="scenario" :value="scenario">
                {{ scenario }}
              </option>
            </select>
          </label>
          <button class="command-button command-button--primary" type="button" @click="createRun">
            Create run
          </button>
          <button class="command-button command-button--neutral" type="button" :disabled="!activeRun" @click="advanceRun">
            Advance phase
          </button>
          <button class="command-button command-button--warning" type="button" :disabled="!activeRun" @click="interruptRun">
            Interrupt
          </button>
          <button class="command-button command-button--success" type="button" :disabled="!activeRun" @click="resumeRun">
            Resume
          </button>
          <button class="command-button command-button--neutral" type="button" :disabled="!activeRun" @click="resetRun">
            Reset
          </button>
        </div>

        <div v-if="errorMessage" class="wallboard-alert wallboard-alert--warning" role="alert">
          {{ errorMessage }}
        </div>

        <div class="rehearsal-workflow__runs">
          <button
            v-for="run in runs"
            :key="run.scenarioName"
            type="button"
            class="rehearsal-workflow__run"
            :class="{ 'is-selected': activeRun?.scenarioName === run.scenarioName }"
            @click="setActiveRun(run)"
          >
            <strong>{{ run.scenarioName }}</strong>
            <span>{{ run.phase }}</span>
            <small>{{ run.status }}</small>
          </button>
        </div>
      </div>

      <div class="rehearsal-workflow__panel">
        <div v-if="!activeRun" class="wallboard-empty">Create or select a rehearsal run to inspect evidence.</div>
        <div v-else>
          <div class="rehearsal-workflow__summary">
            <div>
              <p class="wallboard-kicker">Active rehearsal</p>
              <h3>{{ activeRun.scenarioName }}</h3>
            </div>
            <span class="badge" :class="runBadgeClass(activeRun)">{{ activeRun.gateStatus }}</span>
          </div>

          <dl class="rehearsal-workflow__details">
            <div>
              <dt>Phase</dt>
              <dd>{{ activeRun.phase }}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{{ activeRun.status }}</dd>
            </div>
            <div>
              <dt>Customer ready</dt>
              <dd>{{ activeRun.customerReady ? 'Yes' : 'No' }}</dd>
            </div>
            <div>
              <dt>Automated duration</dt>
              <dd>{{ activeRun.automatedScenarioDurationMs ?? 'n/a' }} ms</dd>
            </div>
            <div>
              <dt>Human timing</dt>
              <dd>{{ activeRun.humanTimingMs ?? 'n/a' }} ms</dd>
            </div>
            <div>
              <dt>SRE agent timing</dt>
              <dd>{{ activeRun.sreAgentAssistedTimingMs ?? 'n/a' }} ms</dd>
            </div>
          </dl>

          <div class="rehearsal-workflow__fields">
            <label>
              <span>Evidence path</span>
              <input v-model="evidenceForm.evidencePath" class="field-control" type="text" />
            </label>
            <label>
              <span>Manifest path</span>
              <input v-model="evidenceForm.manifestPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Config diff</span>
              <input v-model="evidenceForm.configDiffPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Inventory</span>
              <input v-model="evidenceForm.inventoryPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Events</span>
              <input v-model="evidenceForm.eventsPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Logs</span>
              <input v-model="evidenceForm.logsPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Alert history</span>
              <input v-model="evidenceForm.alertHistoryPath" class="field-control" type="text" />
            </label>
            <label>
              <span>KQL export</span>
              <input v-model="evidenceForm.kqlExportPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Recovery check</span>
              <input v-model="evidenceForm.recoveryCheckPath" class="field-control" type="text" />
            </label>
            <label>
              <span>Checksum</span>
              <input v-model="evidenceForm.checksum" class="field-control" type="text" />
            </label>
            <label class="control-check">
              <input v-model="evidenceForm.complete" type="checkbox" />
              Evidence package complete
            </label>
            <label>
              <span>Notes</span>
              <textarea v-model="evidenceForm.notes" class="field-control" rows="3"></textarea>
            </label>
          </div>

          <div class="rehearsal-workflow__footer">
            <button class="command-button command-button--primary" type="button" @click="saveEvidence">
              Save evidence
            </button>
            <div v-if="activeRun.evidencePackage.redactionFindings.length > 0" class="rehearsal-workflow__redactions">
              <strong>Redaction findings</strong>
              <ul>
                <li v-for="finding in activeRun.evidencePackage.redactionFindings" :key="finding">{{ finding }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { RehearsalRun, RehearsalScenarioName } from '@/types/api';
import { evaluateRehearsalGateStatus } from '@/utils/rehearsalWorkflow';

const {
  createRehearsalRun: createRunApi,
  getRehearsalScenarios,
  getRehearsalState,
  advanceRehearsalRun: advanceRunApi,
  interruptRehearsalRun: interruptRunApi,
  resumeRehearsalRun: resumeRunApi,
  resetRehearsalRun: resetRunApi,
  updateRehearsalEvidence: updateEvidenceApi,
} = useApi();

const runs = ref<RehearsalRun[]>([]);
const availableScenarios = ref<RehearsalScenarioName[]>(['OOMKilled', 'MongoDBDown', 'ServiceMismatch']);
const selectedScenario = ref<RehearsalScenarioName>('OOMKilled');
const activeRun = ref<RehearsalRun | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const evidenceForm = ref({
  evidencePath: '',
  manifestPath: '',
  configDiffPath: '',
  inventoryPath: '',
  eventsPath: '',
  logsPath: '',
  alertHistoryPath: '',
  kqlExportPath: '',
  recoveryCheckPath: '',
  checksum: '',
  complete: false,
  notes: '',
});

const statusBadgeLabel = computed(() => {
  if (runs.value.length === 0) return 'No runs';
  return `${runs.value.length} run${runs.value.length === 1 ? '' : 's'}`;
});

const statusBadgeClass = computed(() => {
  if (runs.value.length === 0) return 'badge-neutral';
  return 'badge-info';
});

function setActiveRun(run: RehearsalRun) {
  activeRun.value = run;
  selectedScenario.value = run.scenarioName;
  evidenceForm.value = {
    evidencePath: run.evidencePackage.evidencePath ?? '',
    manifestPath: run.evidencePackage.manifestPath ?? '',
    configDiffPath: run.evidencePackage.configDiffPath ?? '',
    inventoryPath: run.evidencePackage.inventoryPath ?? '',
    eventsPath: run.evidencePackage.eventsPath ?? '',
    logsPath: run.evidencePackage.logsPath ?? '',
    alertHistoryPath: run.evidencePackage.alertHistoryPath ?? '',
    kqlExportPath: run.evidencePackage.kqlExportPath ?? '',
    recoveryCheckPath: run.evidencePackage.recoveryCheckPath ?? '',
    checksum: Object.values(run.evidencePackage.attachmentChecksums)[0] ?? '',
    complete: run.evidencePackage.complete,
    notes: run.notes ?? '',
  };
}

function runBadgeClass(run: RehearsalRun) {
  const gateStatus = evaluateRehearsalGateStatus(run.evidencePackage);
  if (gateStatus === 'PASS') return 'badge-online';
  if (gateStatus === 'REDACTION_BLOCKED') return 'badge-offline';
  return 'badge-warning';
}

async function loadState() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [state, scenariosResponse] = await Promise.all([getRehearsalState(), getRehearsalScenarios()]);
    runs.value = state.runs;
    availableScenarios.value = scenariosResponse.scenarios;
    if (state.runs.length > 0) {
      const currentRun = state.runs[state.runs.length - 1];
      setActiveRun(currentRun);
    } else {
      activeRun.value = null;
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load rehearsals';
  } finally {
    loading.value = false;
  }
}

async function createRun() {
  errorMessage.value = '';
  try {
    const response = await createRunApi({ scenarioName: selectedScenario.value });
    runs.value = [...runs.value.filter(run => run.scenarioName !== response.run.scenarioName), response.run];
    setActiveRun(response.run);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to create rehearsal run';
  }
}

async function advanceRun() {
  if (!activeRun.value) return;
  errorMessage.value = '';
  try {
    const response = await advanceRunApi(activeRun.value.scenarioName, { notes: evidenceForm.value.notes });
    const nextRun = response.run;
    runs.value = runs.value.map(run => run.scenarioName === nextRun.scenarioName ? nextRun : run);
    setActiveRun(nextRun);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to advance rehearsal';
  }
}

async function interruptRun() {
  if (!activeRun.value) return;
  errorMessage.value = '';
  try {
    const response = await interruptRunApi({ scenarioName: activeRun.value.scenarioName, reason: evidenceForm.value.notes || 'Interrupted from Mission Control' });
    const nextRun = response.run;
    runs.value = runs.value.map(run => run.scenarioName === nextRun.scenarioName ? nextRun : run);
    setActiveRun(nextRun);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to interrupt rehearsal';
  }
}

async function resumeRun() {
  if (!activeRun.value) return;
  errorMessage.value = '';
  try {
    const response = await resumeRunApi({ scenarioName: activeRun.value.scenarioName });
    const nextRun = response.run;
    runs.value = runs.value.map(run => run.scenarioName === nextRun.scenarioName ? nextRun : run);
    setActiveRun(nextRun);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to resume rehearsal';
  }
}

async function resetRun() {
  if (!activeRun.value) return;
  errorMessage.value = '';
  try {
    const response = await resetRunApi(activeRun.value.scenarioName);
    const nextRun = response.run;
    runs.value = runs.value.map(run => run.scenarioName === nextRun.scenarioName ? nextRun : run);
    setActiveRun(nextRun);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to reset rehearsal';
  }
}

async function saveEvidence() {
  if (!activeRun.value) return;
  errorMessage.value = '';
  try {
    const response = await updateEvidenceApi({
      scenarioName: activeRun.value.scenarioName,
      evidencePath: evidenceForm.value.evidencePath || undefined,
      manifestPath: evidenceForm.value.manifestPath || undefined,
      configDiffPath: evidenceForm.value.configDiffPath || undefined,
      inventoryPath: evidenceForm.value.inventoryPath || undefined,
      eventsPath: evidenceForm.value.eventsPath || undefined,
      logsPath: evidenceForm.value.logsPath || undefined,
      alertHistoryPath: evidenceForm.value.alertHistoryPath || undefined,
      kqlExportPath: evidenceForm.value.kqlExportPath || undefined,
      recoveryCheckPath: evidenceForm.value.recoveryCheckPath || undefined,
      attachmentChecksums: evidenceForm.value.checksum ? { portal: evidenceForm.value.checksum } : {},
      complete: evidenceForm.value.complete,
      notes: evidenceForm.value.notes || undefined,
    });
    const nextRun = response.run;
    runs.value = runs.value.map(run => run.scenarioName === nextRun.scenarioName ? nextRun : run);
    setActiveRun(nextRun);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to save evidence';
  }
}

onMounted(() => {
  void loadState();
});
</script>

<style scoped>
.rehearsal-workflow {
  margin-top: 1rem;
  border: 1px solid var(--border, #2c3e50);
  border-radius: 12px;
  padding: 1rem;
  background: rgba(11, 18, 25, 0.95);
}

.rehearsal-workflow__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(240px, 1fr) minmax(0, 2fr);
}

.rehearsal-workflow__panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.rehearsal-workflow__actions,
.rehearsal-workflow__fields,
.rehearsal-workflow__footer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.rehearsal-workflow__actions {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.rehearsal-workflow__runs {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rehearsal-workflow__run {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  border: 1px solid var(--border, #2c3e50);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  border-radius: 8px;
  padding: 0.7rem;
  text-align: left;
}

.rehearsal-workflow__run.is-selected {
  border-color: var(--accent, #4fc3f7);
}

.rehearsal-workflow__summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.rehearsal-workflow__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.rehearsal-workflow__details div {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 0.75rem;
}

.rehearsal-workflow__details dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  opacity: 0.7;
}

.rehearsal-workflow__details dd {
  margin: 0.25rem 0 0;
  font-weight: 600;
}

.rehearsal-workflow__redactions {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  padding-top: 0.75rem;
}

.rehearsal-workflow__redactions ul {
  margin: 0.4rem 0 0;
  padding-left: 1rem;
}
</style>
