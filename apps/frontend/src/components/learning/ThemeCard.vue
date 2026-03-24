<script setup lang="ts">
import type { Theme } from '@/types'

defineProps<{
  theme: Theme
  progress?: number
}>()

const emit = defineEmits<{
  (e: 'select', theme: Theme): void
}>()
</script>

<template>
  <div 
    class="card hover:shadow-md transition-shadow cursor-pointer group"
    @click="emit('select', theme)"
  >
    <div class="flex items-start justify-between">
      <div class="flex items-center gap-3">
        <span class="text-3xl">{{ theme.icon }}</span>
        <div>
          <h3 class="font-semibold text-slate-900 group-hover:text-primary-600 transition-colors">
            {{ theme.name }}
          </h3>
          <p class="text-sm text-slate-500">
            {{ theme.wordCount || 0 }} words
          </p>
        </div>
      </div>
      <span class="text-slate-400 group-hover:text-primary-500 transition-colors">→</span>
    </div>
    
    <div v-if="progress !== undefined" class="mt-4">
      <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
        <span>Progress</span>
        <span>{{ progress }}%</span>
      </div>
      <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div 
          class="h-full bg-secondary-500 transition-all"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </div>
  </div>
</template>
