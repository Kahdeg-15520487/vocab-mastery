<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  segments: Array<{ label: string; value: number; color: string }>
  size?: number
  strokeWidth?: number
}>()

const s = computed(() => props.size || 120)
const sw = computed(() => props.strokeWidth || 16)
const r = computed(() => (s.value - sw.value) / 2)
const circumference = computed(() => 2 * Math.PI * r.value)
const total = computed(() => props.segments.reduce((sum, s) => sum + s.value, 0))

const arcs = computed(() => {
  let offset = 0
  return props.segments.map(seg => {
    const pct = total.value > 0 ? seg.value / total.value : 0
    const dash = circumference.value * pct
    const gap = circumference.value - dash
    const arc = { ...seg, dash, gap, offset }
    offset += dash
    return arc
  })
})
</script>

<template>
  <div class="inline-flex flex-col items-center gap-2">
    <svg :width="s" :height="s" :viewBox="`0 0 ${s} ${s}`">
      <!-- Background circle -->
      <circle
        :cx="s/2" :cy="s/2" :r="r"
        fill="none"
        :stroke-width="sw"
        class="stroke-slate-200 dark:stroke-slate-700"
      />
      <!-- Segments -->
      <circle
        v-for="(arc, i) in arcs"
        :key="i"
        :cx="s/2" :cy="s/2" :r="r"
        fill="none"
        :stroke="arc.color"
        :stroke-width="sw"
        :stroke-dasharray="`${arc.dash} ${arc.gap}`"
        :stroke-dashoffset="-arc.offset"
        stroke-linecap="round"
        class="transition-all duration-700"
      />
      <!-- Center text -->
      <text :x="s/2" :y="s/2 - 6" text-anchor="middle" dominant-baseline="middle"
        class="fill-slate-900 dark:fill-white text-lg font-bold"
      >{{ total }}</text>
      <text :x="s/2" :y="s/2 + 12" text-anchor="middle" dominant-baseline="middle"
        class="fill-slate-500 dark:fill-slate-400 text-xs"
      >words</text>
    </svg>
    <!-- Legend -->
    <div class="flex flex-wrap justify-center gap-x-3 gap-y-1">
      <div v-for="seg in segments" :key="seg.label" class="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
        <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: seg.color }" />
        {{ seg.label }} ({{ seg.value }})
      </div>
    </div>
  </div>
</template>
