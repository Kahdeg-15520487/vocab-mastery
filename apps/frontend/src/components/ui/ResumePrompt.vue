<script setup lang="ts">
defineProps<{
  answeredCount: number
  totalWords: number
}>()

const emit = defineEmits<{
  resume: []
  restart: []
}>()
</script>

<template>
  <div class="max-w-lg mx-auto">
    <div class="card text-center space-y-4">
      <div class="text-5xl">📋</div>
      <h2 class="text-xl font-bold text-slate-900 dark:text-white">Resume Practice?</h2>
      <p class="text-slate-600 dark:text-slate-400">
        You have an active session with
        <strong class="text-slate-900 dark:text-white">{{ answeredCount }} / {{ totalWords }}</strong>
        questions answered.
      </p>
      <div class="flex gap-3 justify-center pt-2">
        <button
          @click="emit('resume')"
          class="btn btn-primary"
        >
          ▶️ Resume
        </button>
        <button
          @click="emit('restart')"
          class="btn btn-secondary"
        >
          🔄 Start Over
        </button>
      </div>
    </div>
  </div>
</template>
