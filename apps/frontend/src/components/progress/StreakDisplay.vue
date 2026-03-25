<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  current: number
  longest: number
}

const props = defineProps<Props>()

const streakEmoji = computed(() => {
  if (props.current >= 100) return '🔥🔥🔥'
  if (props.current >= 30) return '🔥🔥'
  if (props.current >= 7) return '🔥'
  if (props.current >= 3) return '✨'
  return '🌟'
})
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-slate-800">Streak</h3>
      <span class="text-2xl">{{ streakEmoji }}</span>
    </div>
    
    <div class="flex items-end gap-6">
      <div>
        <p class="text-4xl font-bold text-orange-500">
          {{ current }}
        </p>
        <p class="text-sm text-slate-500">Current</p>
      </div>
      
      <div class="pb-1">
        <p class="text-xl font-semibold text-slate-400">
          {{ longest }}
        </p>
        <p class="text-xs text-slate-400">Best</p>
      </div>
    </div>
    
    <div v-if="current === 0" class="mt-4 text-sm text-slate-500">
      Start learning today to begin your streak!
    </div>
    <div v-else-if="current < 7" class="mt-4 text-sm text-slate-500">
      Keep going! {{ 7 - current }} more days until Week Warrior 🔥
    </div>
  </div>
</template>
