<script setup lang="ts">
import { ref, computed } from 'vue'

defineProps<{
  userName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const step = ref(0)
const totalSteps = 4

const steps = [
  {
    emoji: '\u{1F44B}',
    title: 'Welcome!',
    description: 'You\'re about to embark on a vocabulary learning journey. Let us show you around.',
  },
  {
    emoji: '\u{1F4DA}',
    title: 'Learn with Flashcards',
    description: 'Study words with spaced repetition flashcards. Each card shows the word, definition, examples, and pronunciation. Rate your recall to optimize your review schedule.',
  },
  {
    emoji: '\u{1F9E0}',
    title: 'Practice with Quizzes & Games',
    description: 'Test yourself with multiple choice quizzes, spelling practice, fill-in-the-blanks, listening comprehension, and the word chain game. Earn XP and level up!',
  },
  {
    emoji: '\u{1F680}',
    title: 'Track Your Progress',
    description: 'Monitor your streak, XP, and CEFR mastery. Set daily goals, earn achievements, and watch your vocabulary grow on the dashboard.',
  },
]

const current = computed(() => steps[step.value])

function next() {
  if (step.value < totalSteps - 1) {
    step.value++
  } else {
    emit('close')
  }
}

function skip() {
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="skip">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
      <!-- Step content -->
      <div class="p-8 text-center">
        <div class="text-6xl mb-4">{{ current.emoji }}</div>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">{{ current.title }}</h2>
        <p class="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{{ current.description }}</p>
      </div>

      <!-- Footer -->
      <div class="px-8 pb-6 flex items-center justify-between">
        <button
          @click="skip"
          class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Skip tour
        </button>

        <div class="flex gap-1.5">
          <div
            v-for="i in totalSteps"
            :key="i"
            class="w-2 h-2 rounded-full transition-colors"
            :class="i - 1 === step ? 'bg-primary-500' : i - 1 < step ? 'bg-primary-300 dark:bg-primary-700' : 'bg-slate-300 dark:bg-slate-600'"
          />
        </div>

        <button
          @click="next"
          class="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {{ step < totalSteps - 1 ? 'Next' : 'Get Started!' }}
        </button>
      </div>
    </div>
  </div>
</template>
