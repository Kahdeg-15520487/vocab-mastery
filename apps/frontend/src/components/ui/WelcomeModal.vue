<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '@/lib/api'

defineProps<{
  userName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()

const step = ref(0)
const selectedLevel = ref('')
const dailyGoal = ref(10)

const cefrLevels = [
  { value: 'A1', label: 'A1 — Beginner', description: 'Basic words and phrases' },
  { value: 'A2', label: 'A2 — Elementary', description: 'Everyday expressions' },
  { value: 'B1', label: 'B1 — Intermediate', description: 'Main points of clear text' },
  { value: 'B2', label: 'B2 — Upper Intermediate', description: 'Complex texts, technical discussion' },
  { value: 'C1', label: 'C1 — Advanced', description: 'Demanding texts, implicit meaning' },
  { value: 'C2', label: 'C2 — Proficiency', description: 'Near-native fluency' },
]

const goalOptions = [5, 10, 15, 20, 30, 50]

const steps = [
  { type: 'welcome' },
  { type: 'level' },
  { type: 'goal' },
  { type: 'ready' },
] as const

const currentStep = computed(() => steps[step.value])

async function next() {
  if (step.value < steps.length - 1) {
    step.value++
  } else {
    // Final step — save settings and close
    await saveSettings()
    emit('close')
  }
}

function skip() {
  emit('close')
}

async function saveSettings() {
  try {
    if (selectedLevel.value) {
      // Save CEFR level as user preference
      await request('/progress/daily-goal', {
        method: 'POST',
        body: JSON.stringify({ goal: dailyGoal.value }),
      })
    }
  } catch {
    // Non-blocking
  }
}

function goToVocabTest() {
  emit('close')
  router.push('/vocab-size')
}

function goToLearn() {
  emit('close')
  router.push('/learn')
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="skip">
    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden max-h-[90vh] overflow-y-auto">
      <!-- Step 1: Welcome -->
      <template v-if="currentStep.type === 'welcome'">
        <div class="p-8 text-center">
          <div class="text-6xl mb-4">👋</div>
          <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Welcome{{ userName ? `, ${userName}` : '' }}!
          </h2>
          <p class="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
            You're about to embark on a vocabulary learning journey. Let us personalize your experience.
          </p>
          <div class="grid grid-cols-3 gap-3 text-center">
            <div class="card p-3">
              <div class="text-2xl mb-1">📚</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">8+ Study Modes</div>
            </div>
            <div class="card p-3">
              <div class="text-2xl mb-1">🧠</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Spaced Repetition</div>
            </div>
            <div class="card p-3">
              <div class="text-2xl mb-1">🏆</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Gamified</div>
            </div>
          </div>
        </div>
      </template>

      <!-- Step 2: CEFR Level -->
      <template v-else-if="currentStep.type === 'level'">
        <div class="p-8">
          <div class="text-center mb-6">
            <div class="text-4xl mb-2">🎯</div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-1">
              What's your English level?
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              This helps us recommend the right words for you.
            </p>
          </div>
          <div class="space-y-2">
            <button
              v-for="level in cefrLevels"
              :key="level.value"
              @click="selectedLevel = level.value"
              class="w-full text-left p-3 rounded-lg border-2 transition-all"
              :class="selectedLevel === level.value
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'"
            >
              <div class="font-semibold text-sm" :class="selectedLevel === level.value ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'">
                {{ level.label }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">{{ level.description }}</div>
            </button>
          </div>
          <button
            @click="goToVocabTest"
            class="w-full mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Not sure? Take the vocabulary level test →
          </button>
        </div>
      </template>

      <!-- Step 3: Daily Goal -->
      <template v-else-if="currentStep.type === 'goal'">
        <div class="p-8 text-center">
          <div class="text-4xl mb-2">📅</div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-1">
            Set your daily goal
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">
            How many words do you want to learn each day?
          </p>
          <div class="grid grid-cols-3 gap-2 mb-6">
            <button
              v-for="goal in goalOptions"
              :key="goal"
              @click="dailyGoal = goal"
              class="p-4 rounded-lg border-2 transition-all"
              :class="dailyGoal === goal
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-slate-200 dark:border-slate-600 hover:border-slate-300'"
            >
              <div class="text-2xl font-bold" :class="dailyGoal === goal ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'">
                {{ goal }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">words/day</div>
            </button>
          </div>
          <div class="card bg-slate-50 dark:bg-slate-700/50 p-3">
            <p class="text-xs text-slate-500 dark:text-slate-400">
              💡 <strong>Tip:</strong> Start with {{ dailyGoal <= 10 ? 'a manageable' : dailyGoal <= 20 ? 'an ambitious' : 'a challenging' }} goal of <strong>{{ dailyGoal }} words/day</strong>.
              {{ dailyGoal <= 10 ? "It's better to be consistent than to overcommit!" : "You can always adjust this later in Settings." }}
            </p>
          </div>
        </div>
      </template>

      <!-- Step 4: Ready -->
      <template v-else-if="currentStep.type === 'ready'">
        <div class="p-8 text-center">
          <div class="text-6xl mb-4">🚀</div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">
            You're all set!
          </h2>
          <p class="text-slate-600 dark:text-slate-400 mb-6">
            Start learning new words or explore the dashboard. Your daily goal is set to <strong>{{ dailyGoal }} words/day</strong>.
          </p>
          <div class="flex gap-3 justify-center">
            <button
              @click="goToLearn"
              class="btn btn-primary"
            >
              📚 Start Learning
            </button>
            <button
              @click="emit('close')"
              class="btn btn-secondary"
            >
              🏠 Explore Dashboard
            </button>
          </div>
        </div>
      </template>

      <!-- Footer with navigation -->
      <div class="px-8 pb-6 flex items-center justify-between">
        <button
          @click="skip"
          class="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Skip tour
        </button>

        <div class="flex gap-1.5">
          <div
            v-for="i in steps.length"
            :key="i"
            class="w-2 h-2 rounded-full transition-colors cursor-pointer"
            :class="i - 1 === step ? 'bg-indigo-500' : i - 1 < step ? 'bg-indigo-300 dark:bg-indigo-700' : 'bg-slate-300 dark:bg-slate-600'"
            @click="step = i - 1"
          />
        </div>

        <button
          v-if="currentStep.type !== 'ready'"
          @click="next"
          class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          {{ step < steps.length - 1 ? 'Next' : 'Get Started!' }}
        </button>
      </div>
    </div>
  </div>
</template>
