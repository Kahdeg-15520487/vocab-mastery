<script setup lang="ts">
const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" @click.self="emit('dismiss')">
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
        <div class="flex items-center gap-3">
          <span class="text-3xl">⚠️</span>
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">Single Tab Practice</h3>
        </div>
        <p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
          Practice sessions can only be active in <strong>one browser tab</strong> at a time.
          Opening multiple tabs may cause your progress to be lost or overwritten.
        </p>
        <div class="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3">
          <span class="text-lg flex-shrink-0">💡</span>
          <p class="text-sm text-amber-800 dark:text-amber-200">
            If you want to change settings or start a new session, use the restart option within the current tab.
          </p>
        </div>
        <button
          @click="emit('dismiss')"
          class="btn btn-primary w-full"
        >
          Got it
        </button>
      </div>
    </div>
  </Teleport>
</template>
