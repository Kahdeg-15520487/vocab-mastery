<script setup lang="ts">
import { computed } from 'vue'
import { computeMasteryTier, getMasteryConfig, type MasteryTier } from '@/lib/mastery'

const props = defineProps<{
  status: string
  repetitions?: number
  easeFactor?: number
  size?: 'sm' | 'md' | 'lg'
}>()

const sz = computed(() => props.size || 'sm')

const tier = computed<MasteryTier>(() =>
  computeMasteryTier({
    status: props.status,
    repetitions: props.repetitions ?? 0,
    easeFactor: props.easeFactor ?? 2.5,
  })
)

const config = computed(() => getMasteryConfig(tier.value))

const sizeClasses = computed(() => {
  switch (sz.value) {
    case 'lg': return 'px-3 py-1.5 text-sm'
    case 'md': return 'px-2.5 py-1 text-xs'
    case 'sm': default: return 'px-2 py-0.5 text-xs'
  }
})
</script>

<template>
  <span
    :class="[config.color, config.bgColor, config.darkBgColor, sizeClasses]"
    class="inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap"
    :title="config.label"
  >
    <span v-if="sz !== 'sm'">{{ config.icon }}</span>
    {{ config.label }}
  </span>
</template>
