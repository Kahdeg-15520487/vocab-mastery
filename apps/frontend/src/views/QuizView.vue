<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '@/lib/api'
import ProgressBar from '@/components/learning/ProgressBar.vue'

interface QuizOption {
  id: string
  word: string
  definition: string
  correct: boolean
}

interface QuizQuestion {
  index: number
  id: string
  word: string
  phoneticUs: string | null
  partOfSpeech: string[]
  definition: string
  examples: string[]
  cefrLevel: string
  options: QuizOption[]
}

interface QuizData {
  sessionId: string
  questionCount: number
  questions: QuizQuestion[]
}

const router = useRouter()
const loading = ref(true)
const quizData = ref<QuizData | null>(null)
const currentIndex = ref(0)
const selectedId = ref<string | null>(null)
const answered = ref(false)
const isCorrect = ref(false)
const correctId = ref<string | null>(null)
const score = ref(0)
const showResults = ref(false)
const startTime = ref(Date.now())

const question = computed(() => {
  if (!quizData.value) return null
  return quizData.value.questions[currentIndex.value]
})

const accuracy = computed(() => {
  if (!quizData.value || currentIndex.value === 0) return 0
  return Math.round((score.value / currentIndex.value) * 100)
})

const resultEmoji = computed(() => {
  const acc = accuracy.value
  if (acc >= 90) return '🏆'
  if (acc >= 70) return '🎉'
  if (acc >= 50) return '👍'
  return '💪'
})

const resultMessage = computed(() => {
  const acc = accuracy.value
  if (acc >= 90) return 'Outstanding!'
  if (acc >= 70) return 'Great job!'
  if (acc >= 50) return 'Good effort!'
  return 'Keep practicing!'
})

async function startQuiz() {
  loading.value = true
  try {
    const data = await request<QuizData>('/sessions/quiz', {
      method: 'POST',
      body: JSON.stringify({ questionCount: 10 }),
    })
    quizData.value = data
    startTime.value = Date.now()
  } catch (e: any) {
    alert(e.message || 'Failed to start quiz')
    router.push('/')
  } finally {
    loading.value = false
  }
}

async function selectOption(option: QuizOption) {
  if (answered.value) return
  answered.value = true
  selectedId.value = option.id

  try {
    const result = await request<{ correct: boolean; correctId: string }>(
      `/sessions/quiz/${quizData.value!.sessionId}/answer`,
      {
        method: 'POST',
        body: JSON.stringify({
          wordId: question.value!.id,
          selectedId: option.id,
          responseTime: Date.now() - startTime.value,
        }),
      }
    )
    isCorrect.value = result.correct
    correctId.value = result.correctId
    if (result.correct) {
      score.value++
    }
  } catch {
    // Fallback to client-side check
    isCorrect.value = option.correct
    correctId.value = question.value!.id
    if (option.correct) score.value++
  }
}

function nextQuestion() {
  if (currentIndex.value < quizData.value!.questionCount - 1) {
    currentIndex.value++
    selectedId.value = null
    answered.value = false
    isCorrect.value = false
    correctId.value = null
    startTime.value = Date.now()
  } else {
    showResults.value = true
  }
}

function optionClass(option: QuizOption): string {
  if (!answered.value) {
    return 'border-slate-200 dark:border-slate-600 hover:border-primary-400 dark:hover:border-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer'
  }
  if (option.id === correctId.value) {
    return 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
  }
  if (option.id === selectedId.value && !isCorrect.value) {
    return 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
  }
  return 'border-slate-200 dark:border-slate-600 opacity-50'
}

onMounted(() => {
  startQuiz()
})
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="animate-spin text-4xl mb-4">🧠</div>
      <p class="text-slate-600 dark:text-slate-400">Preparing your quiz...</p>
    </div>

    <!-- Results -->
    <div v-else-if="showResults && quizData" class="text-center space-y-6">
      <div class="text-8xl mb-4">{{ resultEmoji }}</div>
      <h2 class="text-3xl font-bold text-slate-900 dark:text-white">{{ resultMessage }}</h2>
      
      <div class="card">
        <div class="grid grid-cols-3 gap-6 text-center">
          <div>
            <div class="text-3xl font-bold text-primary-600 dark:text-primary-400">{{ score }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Correct</div>
          </div>
          <div>
            <div class="text-3xl font-bold text-slate-900 dark:text-white">{{ quizData.questionCount }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Total</div>
          </div>
          <div>
            <div class="text-3xl font-bold" :class="accuracy >= 70 ? 'text-green-600' : accuracy >= 50 ? 'text-yellow-600' : 'text-red-600'">
              {{ accuracy }}%
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Accuracy</div>
          </div>
        </div>
      </div>

      <div class="flex gap-4 justify-center">
        <button @click="startQuiz" class="btn btn-primary">
          🔄 Try Again
        </button>
        <router-link to="/" class="btn btn-secondary">
          ← Home
        </router-link>
      </div>
    </div>

    <!-- Quiz Question -->
    <div v-else-if="question" class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <router-link to="/" class="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
          ← Exit
        </router-link>
        <span class="text-sm text-slate-500 dark:text-slate-400">
          Question {{ currentIndex + 1 }} / {{ quizData!.questionCount }}
        </span>
        <span class="text-sm font-medium text-primary-600 dark:text-primary-400">
          Score: {{ score }}
        </span>
      </div>

      <!-- Progress -->
      <ProgressBar :current="currentIndex" :total="quizData!.questionCount" />

      <!-- Question Card -->
      <div class="card text-center">
        <div class="text-sm text-slate-500 dark:text-slate-400 mb-1">
          What is the definition of:
        </div>
        <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          {{ question.word }}
        </h2>
        <div v-if="question.phoneticUs" class="text-slate-500 dark:text-slate-400 text-sm mb-1">
          {{ question.phoneticUs }}
        </div>
        <div class="text-xs text-slate-400">
          {{ question.cefrLevel }} · {{ question.partOfSpeech.join(', ') }}
        </div>
      </div>

      <!-- Options -->
      <div class="space-y-3">
        <button
          v-for="option in question.options"
          :key="option.id"
          @click="selectOption(option)"
          :disabled="answered"
          class="w-full text-left p-4 rounded-xl border-2 transition-all duration-200"
          :class="optionClass(option)"
        >
          <div class="flex items-center gap-3">
            <span
              class="flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-medium"
              :class="answered && option.id === correctId ? 'border-green-500 bg-green-500 text-white' : 
                       answered && option.id === selectedId && !isCorrect ? 'border-red-500 bg-red-500 text-white' :
                       'border-slate-300 dark:border-slate-500'"
            >
              <span v-if="answered && option.id === correctId">✓</span>
              <span v-else-if="answered && option.id === selectedId && !isCorrect">✗</span>
              <span v-else>{{ question.options.indexOf(option) + 1 }}</span>
            </span>
            <div class="min-w-0 flex-1">
              <div class="font-medium text-slate-900 dark:text-white">{{ option.word }}</div>
              <div class="text-sm text-slate-500 dark:text-slate-400 truncate">{{ option.definition }}</div>
            </div>
          </div>
        </button>
      </div>

      <!-- Feedback & Next -->
      <div v-if="answered" class="text-center space-y-4">
        <div v-if="isCorrect" class="text-green-600 dark:text-green-400 font-semibold text-lg">
          ✅ Correct!
        </div>
        <div v-else class="text-red-600 dark:text-red-400 font-semibold text-lg">
          ❌ Incorrect — the answer was <strong>{{ question.options.find(o => o.id === correctId)?.word }}</strong>
        </div>

        <!-- Show examples if available -->
        <div v-if="question.examples?.length" class="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
          <div v-for="ex in question.examples.slice(0, 2)" :key="ex" class="italic">
            "{{ ex }}"
          </div>
        </div>

        <button @click="nextQuestion" class="btn btn-primary">
          {{ currentIndex < quizData!.questionCount - 1 ? 'Next Question →' : 'See Results' }}
        </button>
      </div>
    </div>
  </div>
</template>
