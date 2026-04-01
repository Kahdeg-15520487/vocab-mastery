<script setup lang="ts">
import { usePWAInstall } from '@/composables/usePWAInstall'

const { canInstall, dismissed, install, dismiss } = usePWAInstall()
</script>

<template>
  <div
    v-if="canInstall && !dismissed"
    class="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-80 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 animate-slide-up"
  >
    <button
      @click="dismiss"
      class="absolute top-2 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-lg leading-none"
      title="Dismiss"
    >&times;</button>
    <div class="flex items-start gap-3">
      <span class="text-2xl">📱</span>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm text-slate-900 dark:text-white">Install Vocab Master</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Add to home screen for quick access and offline support</p>
        <button
          @click="install"
          class="mt-2 px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Install App
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.animate-slide-up { animation: slide-up 0.3s ease-out; }
</style>
