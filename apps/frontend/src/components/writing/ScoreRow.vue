<template>
  <div class="flex items-center gap-3">
    <span class="text-sm w-5 text-center">{{ icon }}</span>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-xs font-medium" :class="isDark ? 'text-slate-300' : 'text-slate-700'">{{ label }}</span>
        <span class="text-xs font-bold" :class="scoreColor">{{ score }}/5</span>
      </div>
      <!-- Score bar -->
      <div class="w-full h-1.5 rounded-full" :class="isDark ? 'bg-slate-700' : 'bg-slate-200'">
        <div class="h-full rounded-full transition-all duration-500" :class="scoreBarColor" :style="{ width: `${score * 20}%` }" />
      </div>
      <!-- Note -->
      <p v-if="note" class="text-xs mt-0.5 truncate" :class="isDark ? 'text-slate-500' : 'text-slate-400'" :title="note">
        {{ note }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  score: number
  note: string
  isDark: boolean
  icon: string
}>()

const scoreColor = computed(() => {
  if (props.score >= 4) return 'text-green-600 dark:text-green-400'
  if (props.score >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
})

const scoreBarColor = computed(() => {
  if (props.score >= 4) return 'bg-green-500'
  if (props.score >= 3) return 'bg-amber-500'
  return 'bg-red-500'
})
</script>
