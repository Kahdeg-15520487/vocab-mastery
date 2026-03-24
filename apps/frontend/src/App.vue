<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppNavigation from '@/components/layout/AppNavigation.vue'
</script>

<template>
  <div class="min-h-screen bg-slate-50">
    <AppNavigation />
    <main class="container mx-auto px-4 py-6 pb-20 md:pb-6">
      <RouterView />
    </main>
  </div>
</template>
