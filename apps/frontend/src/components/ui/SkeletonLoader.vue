<script setup lang="ts">
defineProps<{
  variant?: 'text' | 'card' | 'circle' | 'badge'
  width?: string
  height?: string
  count?: number
}>()
</script>

<template>
  <!-- Multiple skeleton items -->
  <template v-if="count && count > 1">
    <SkeletonLoader
      v-for="i in count"
      :key="i"
      :variant="variant"
      :width="width"
      :height="height"
      :count="1"
    />
  </template>

  <!-- Single skeleton item -->
  <div
    v-else
    class="animate-pulse rounded-md bg-slate-200 dark:bg-slate-700"
    :class="{
      'rounded-full': variant === 'circle',
      'rounded-lg': variant === 'card',
      'rounded-full px-3 py-1 inline-block': variant === 'badge',
    }"
    :style="{
      width: width || (variant === 'circle' ? '40px' : variant === 'badge' ? '60px' : '100%'),
      height: height || (variant === 'circle' ? '40px' : variant === 'card' ? '80px' : variant === 'badge' ? '24px' : '16px'),
    }"
  />
</template>
