<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  username: string
  size?: 'sm' | 'md' | 'lg'
}>(), {
  size: 'md',
})

const initials = computed(() => {
  if (!props.username) return '?'
  return props.username.slice(0, 2).toUpperCase()
})

// Generate a consistent color based on username
const bgColor = computed(() => {
  if (!props.username) return 'bg-slate-400'
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < props.username.length; i++) {
    hash = props.username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-7 h-7 text-xs'
    case 'lg': return 'w-14 h-14 text-xl'
    default: return 'w-9 h-9 text-sm'
  }
})
</script>

<template>
  <div
    :class="[bgColor, sizeClasses]"
    class="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none"
  >
    {{ initials }}
  </div>
</template>
