<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  emoji?: string
  text?: string
}>(), {
  size: 'md',
  emoji: '',
  text: '',
})

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
} as const

const emojiSizes = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-6xl',
} as const
</script>

<template>
  <div class="text-center py-12">
    <div v-if="emoji" :class="['mb-4', emojiSizes[size]]">
      <span class="inline-block animate-spin">{{ emoji }}</span>
    </div>
    <div v-else :class="['animate-spin rounded-full border-b-2 border-indigo-600 mx-auto', sizeClasses[size]]"></div>
    <p v-if="text" class="mt-2 text-slate-600 dark:text-slate-400">{{ text }}</p>
  </div>
</template>
