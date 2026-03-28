<script setup lang="ts">
defineProps<{
  level: string
}>()

const levelColors: Record<string, string> = {
  A1: 'bg-green-100 text-green-800',
  A2: 'bg-lime-100 text-lime-800',
  B1: 'bg-yellow-100 text-yellow-800',
  B2: 'bg-orange-100 text-orange-800',
  C1: 'bg-red-100 text-red-800',
  C2: 'bg-purple-100 text-purple-800',
}

const levelIcons: Record<string, string> = {
  A1: '🌱',
  A2: '🌿',
  B1: '🌳',
  B2: '🌲',
  C1: '🏔️',
  C2: '🏆',
}
</script>

<template>
  <span 
    :class="[
      'badge inline-flex items-center gap-1',
      levelColors[level] || 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
    ]"
  >
    <span>{{ levelIcons[level] || '📖' }}</span>
    <span>{{ level }}</span>
  </span>
</template>
