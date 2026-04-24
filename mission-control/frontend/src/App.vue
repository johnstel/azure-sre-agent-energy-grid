<template>
  <div class="min-h-screen" style="background: var(--bg); color: var(--text);">
    <Header />
    <main class="max-w-7xl mx-auto px-4 py-6">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import Header from './components/Header.vue';
</script>
