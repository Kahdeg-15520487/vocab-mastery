<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { wordsApi } from '@/lib/api'
import LevelBadge from './LevelBadge.vue'

const wordOfDay = ref<any>(null)
const loading = ref(true)
const showDefinition = ref(false)

onMounted(async () => {
  try {
    const data = await wordsApi.getDaily()
    wordOfDay.value = data
  } catch {
    // Silently fail — not critical
  } finally {
    loading.value = false
  }
})

function revealDefinition() {
  showDefinition.value = true
}
</script>

<template>
  <div v-if="loading" class="card animate-pulse">
    <div class="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
    <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-2"></div>
    <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
  </div>

  <div v-else-if="wordOfDay" class="card bg-gradient-to-br from-primary-50 to-secondary-50 border-primary-200">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <span>✨</span> Word of the Day
      </h2>
      <LevelBadge :level="wordOfDay.cefrLevel" />
    </div>

    <div class="mb-3">
      <h3 class="text-2xl font-bold text-primary-700">{{ wordOfDay.word }}</h3>
      <p class="text-slate-500 dark:text-slate-400 text-sm">{{ wordOfDay.phoneticUs }}</p>
    </div>

    <!-- Hidden definition - click to reveal -->
    <div v-if="!showDefinition">
      <button
        @click="revealDefinition"
        class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-800 underline underline-offset-2"
      >
        Click to reveal definition
      </button>
    </div>

    <div v-else>
      <p class="text-slate-700 dark:text-slate-300 mb-2">{{ wordOfDay.definition }}</p>
      
      <p v-if="wordOfDay.examples?.length" class="text-slate-600 dark:text-slate-400 text-sm italic mt-2">
        "{{ wordOfDay.examples[0] }}"
      </p>

      <div v-if="wordOfDay.synonyms?.length" class="mt-3 flex flex-wrap gap-1.5">
        <span
          v-for="syn in wordOfDay.synonyms"
          :key="syn"
          class="px-2 py-0.5 bg-white/60 text-slate-600 dark:text-slate-400 rounded text-xs"
        >
          {{ syn }}
        </span>
      </div>
    </div>

    <!-- Status badge if user has progress -->
    <div v-if="wordOfDay.progress" class="mt-3 pt-3 border-t border-primary-200">
      <span
        :class="[
          'badge text-xs',
          wordOfDay.progress.status === 'mastered' ? 'badge-success' :
          wordOfDay.progress.status === 'reviewing' ? 'badge-primary' :
          wordOfDay.progress.status === 'learning' ? 'badge-warning' : 'badge-secondary'
        ]"
      >
        {{ wordOfDay.progress.status }}
      </span>
    </div>
  </div>
</template>
