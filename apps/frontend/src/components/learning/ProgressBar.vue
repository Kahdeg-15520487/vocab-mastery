<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  current: number
  total: number
  label?: string
}>()

const percent = computed(() => {
  if (props.total === 0) return 0
  return Math.round((props.current / props.total) * 100)
})
</script>

<template>
  <div class="w-full">
    <div class="flex items-center justify-between mb-2" v-if="label">
      <span class="text-sm font-medium text-slate-700">{{ label }}</span>
      <span class="text-sm text-slate-500">{{ current }}/{{ total }}</span>
    </div>
    <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
      <div 
        class="h-full bg-primary-500 transition-all duration-300 ease-out"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
