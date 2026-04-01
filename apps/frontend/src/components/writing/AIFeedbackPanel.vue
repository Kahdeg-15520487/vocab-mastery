<template>
  <div v-if="visible" class="border rounded-xl overflow-hidden transition-all duration-300"
    :class="isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'">

    <!-- Header -->
    <button @click="collapsed = !collapsed"
      class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
      <div class="flex items-center gap-2">
        <span class="text-lg">🤖</span>
        <span class="text-sm font-semibold" :class="isDark ? 'text-white' : 'text-slate-900'">AI Coach</span>
        <!-- Status badges -->
        <span v-if="status === 'evaluating'" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
          Analyzing…
        </span>
        <span v-else-if="status === 'done'" class="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
          Review complete
        </span>
        <span v-else-if="status === 'error'" class="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
          Error
        </span>
      </div>
      <svg class="w-4 h-4 transition-transform" :class="collapsed ? '' : 'rotate-180'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Body -->
    <div v-show="!collapsed" class="px-4 pb-4 space-y-3">

      <!-- Evaluating state -->
      <div v-if="status === 'evaluating'" class="flex items-center gap-3 py-2">
        <div class="flex gap-1">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style="animation-delay: 300ms"></span>
        </div>
        <span class="text-sm" :class="isDark ? 'text-slate-400' : 'text-slate-500'">Reviewing your sentence…</span>
      </div>

      <!-- Error state -->
      <div v-else-if="status === 'error'" class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
        {{ errorMessage || 'AI Coach could not evaluate this sentence.' }}
      </div>

      <!-- Results -->
      <div v-else-if="status === 'done' && evaluation" class="space-y-3">
        <!-- Score bars -->
        <div class="space-y-2">
          <ScoreRow label="Grammar" :score="evaluation.grammar.score" :note="evaluation.grammar.note" :is-dark="isDark" icon="📝" />
          <ScoreRow label="Word Usage" :score="evaluation.usage.score" :note="evaluation.usage.note" :is-dark="isDark" icon="🎯" />
          <ScoreRow label="Clarity" :score="evaluation.clarity.score" :note="evaluation.clarity.note" :is-dark="isDark" icon="💡" />
        </div>

        <!-- Overall badge -->
        <div class="flex items-center gap-2 pt-1">
          <span class="text-sm font-medium" :class="overallClass">{{ overallLabel }}</span>
          <span class="text-xs" :class="isDark ? 'text-slate-500' : 'text-slate-400'">
            {{ overallScore }}/15
          </span>
        </div>

        <!-- Suggestion -->
        <div v-if="evaluation.suggestion && evaluation.suggestion !== 'No improvement needed.'" class="p-3 rounded-lg"
          :class="isDark ? 'bg-indigo-900/20 border border-indigo-800/50' : 'bg-indigo-50 border border-indigo-100'">
          <div class="flex items-start gap-2">
            <span class="text-sm">💡</span>
            <p class="text-sm" :class="isDark ? 'text-indigo-300' : 'text-indigo-700'">{{ evaluation.suggestion }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SentenceEvaluation } from '../../lib/browser-ai-prompts'

import ScoreRow from './ScoreRow.vue'

const props = defineProps<{
  visible: boolean
  status: 'idle' | 'evaluating' | 'done' | 'error'
  evaluation: SentenceEvaluation | null
  errorMessage?: string
}>()

const collapsed = ref(false)

// Detect dark mode (simple check, works with Tailwind dark: class strategy)
const isDark = computed(() => {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
})

const overallScore = computed(() => {
  if (!props.evaluation) return 0
  return props.evaluation.grammar.score + props.evaluation.usage.score + props.evaluation.clarity.score
})

const overallLabel = computed(() => {
  const s = overallScore.value
  if (s >= 14) return '🌟 Excellent'
  if (s >= 11) return '👍 Good'
  if (s >= 8) return '📚 Fair — keep practicing'
  return '💪 Needs work'
})

const overallClass = computed(() => {
  const s = overallScore.value
  if (s >= 14) return 'text-green-600 dark:text-green-400'
  if (s >= 11) return 'text-blue-600 dark:text-blue-400'
  if (s >= 8) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
})
</script>
