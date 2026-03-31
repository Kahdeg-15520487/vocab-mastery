<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: 'mixed' | 'easy' | 'medium' | 'hard'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: 'mixed' | 'easy' | 'medium' | 'hard']
}>()

const difficulty = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const options = [
  { value: 'mixed' as const, label: 'Mixed', icon: '🎲', desc: 'All CEFR levels' },
  { value: 'easy' as const, label: 'Easy', icon: '🟢', desc: 'A1–A2 words' },
  { value: 'medium' as const, label: 'Medium', icon: '🟡', desc: 'B1–B2 words' },
  { value: 'hard' as const, label: 'Hard', icon: '🔴', desc: 'C1–C2 words' },
]
</script>

<template>
  <div>
    <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Difficulty</h3>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <button
        v-for="opt in options"
        :key="opt.value"
        @click="difficulty = opt.value"
        class="p-4 rounded-xl border-2 transition-all text-center"
        :class="difficulty === opt.value
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'"
      >
        <div class="text-2xl mb-1">{{ opt.icon }}</div>
        <div class="font-medium text-slate-900 dark:text-white text-sm">{{ opt.label }}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">{{ opt.desc }}</div>
      </button>
    </div>
  </div>
</template>
