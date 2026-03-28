<script setup lang="ts">
interface LevelInfo {
  level: string
  total: number
  learned: number
  mastered: number
  progress: number
}

interface Props {
  levels: LevelInfo[]
}

defineProps<Props>()

function getLevelColor(level: string): string {
  const colors: Record<string, string> = {
    'A1': 'bg-green-500',
    'A2': 'bg-green-600',
    'B1': 'bg-blue-500',
    'B2': 'bg-blue-600',
    'C1': 'bg-purple-500',
    'C2': 'bg-purple-600',
  }
  return colors[level] || 'bg-slate-500'
}
</script>

<template>
  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">CEFR Progress</h3>
    
    <div class="space-y-4">
      <div
        v-for="level in levels"
        :key="level.level"
        class="space-y-1"
      >
        <div class="flex justify-between text-sm">
          <span class="font-medium text-slate-700 dark:text-slate-300">{{ level.level }}</span>
          <span class="text-slate-500 dark:text-slate-400">
            {{ level.learned }} / {{ level.total }} words
          </span>
        </div>
        <div class="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-300 rounded-full"
            :class="getLevelColor(level.level)"
            :style="{ width: `${level.progress}%` }"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-slate-400">
          <span>{{ level.progress }}% learned</span>
          <span>{{ level.mastered }} mastered</span>
        </div>
      </div>
    </div>
  </div>
</template>
