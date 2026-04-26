<template>
  <div class="app-shell min-h-screen" style="background: var(--bg); color: var(--text);">
    <a class="skip-link" href="#mission-wallboard">Skip to Mission Control wallboard</a>
    <Header :analyst-open="analystOpen" @open-analyst="requestAnalyst" />
    <main id="mission-wallboard" class="mission-layout" aria-label="Mission Control operational wallboard">
      <MissionWallboard
        :analyst-open-request="analystOpenRequest"
        @analyst-open-change="analystOpen = $event"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Header from './components/Header.vue';
import MissionWallboard from './components/MissionWallboard.vue';

const analystOpenRequest = ref(0);
const analystOpen = ref(false);

function requestAnalyst() {
  analystOpenRequest.value += 1;
}
</script>
