<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

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

const route = useRoute()
const toast = useToast()

// State
const phase = ref<'setup' | 'playing' | 'results'>('setup')
const loading = ref(false)
const quizData = ref<QuizData | null>(null)
const quizResult = ref<{ xpEarned?: number; leveledUp?: boolean; newAchievements?: string[] } | null>(null)
const confettiActive = ref(false)
const currentIndex = ref(0)
const selectedId = ref<string | null>(null)
const answered = ref(false)
const isCorrect = ref(false)
const correctId = ref<string | null>(null)
const score = ref(0)
const startTime = ref(Date.now())
const missedQuestions = ref<Array<{ question: QuizQuestion; selectedId: string }>>([])

// Quiz settings
const questionCount = ref(10)
const difficulty = ref<'mixed' | 'easy' | 'medium' | 'hard'>('mixed')
const questionMode = ref<'word-to-def' | 'def-to-word'>('word-to-def')

const difficultyOptions = [
  { value: 'mixed', label: 'Mixed', icon: '🎲', desc: 'All CEFR levels' },
  { value: 'easy', label: 'Easy', icon: '🟢', desc: 'A1–A2 words' },
  { value: 'medium', label: 'Medium', icon: '🟡', desc: 'B1–B2 words' },
  { value: 'hard', label: 'Hard', icon: '🔴', desc: 'C1–C2 words' },
] as const

const countOptions = [5, 10, 15, 20]

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

function getLevelRange(diff: string): [string, string] | undefined {
  switch (diff) {
    case 'easy': return ['A1', 'A2']
    case 'medium': return ['B1', 'B2']
    case 'hard': return ['C1', 'C2']
    default: return undefined
  }
}

async function startQuiz() {
  loading.value = true
  try {
    const body: any = {
      questionCount: questionCount.value,
    }
    const levelRange = getLevelRange(difficulty.value)
    if (levelRange) body.levelRange = levelRange
    if (route.query.list) body.listId = route.query.list as string

    const data = await request<QuizData>('/sessions/quiz', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    quizData.value = data
    score.value = 0
    currentIndex.value = 0
    quizResult.value = null
    missedQuestions.value = []
    startTime.value = Date.now()
    phase.value = 'playing'
  } catch (e: any) {
    toast.error(e.message || 'Failed to start quiz')
  } finally {
    loading.value = false
  }
}

async function selectOption(option: QuizOption) {
  if (answered.value) return

  // Immediately set from client-side data (no flash of wrong state)
  answered.value = true
  selectedId.value = option.id
  isCorrect.value = option.correct
  correctId.value = question.value!.id
  if (option.correct) score.value++
  else missedQuestions.value.push({ question: question.value!, selectedId: option.id })

  // Fire-and-forget: record answer on server for session tracking
  try {
    await request<{ correct: boolean; correctId: string }>(
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
  } catch {
    // Already handled client-side
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
    // Complete the session
    completeSession()
    phase.value = 'results'
  }
}

async function completeSession() {
  try {
    const result = await request<{ xpEarned?: number; leveledUp?: boolean; newAchievements?: string[] }>(`/sessions/${quizData.value!.sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    quizResult.value = result
    if (result.leveledUp) {
      confettiActive.value = true
      setTimeout(() => { confettiActive.value = false }, 4000)
    }
  } catch {
    // Non-critical — session still completed locally
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

// Auto-start if coming from a list (has query params)
onMounted(() => {
  if (route.query.auto === 'true') {
    startQuiz()
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto">

    <!-- ==================== SETUP PHASE ==================== -->
    <div v-if="phase === 'setup'" class="space-y-8">
      <div class="text-center">
        <div class="text-6xl mb-4">🧠</div>
        <h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">Quiz Mode</h1>
        <p class="text-slate-500 dark:text-slate-400">Test your vocabulary knowledge with multiple-choice questions</p>
      </div>

      <!-- Difficulty -->
      <div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Difficulty</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            v-for="opt in difficultyOptions"
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

      <!-- Question Count -->
      <div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Number of Questions</h3>
        <div class="flex gap-3">
          <button
            v-for="count in countOptions"
            :key="count"
            @click="questionCount = count"
            class="flex-1 py-3 rounded-xl border-2 font-medium transition-all"
            :class="questionCount === count
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
              : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'"
          >
            {{ count }}
          </button>
        </div>
      </div>

      <!-- Question Mode -->
      <div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Question Type</h3>
        <div class="grid grid-cols-2 gap-3">
          <button
            @click="questionMode = 'word-to-def'"
            class="p-4 rounded-xl border-2 transition-all text-center"
            :class="questionMode === 'word-to-def'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'"
          >
            <div class="text-xl mb-1">🔤 → 📖</div>
            <div class="font-medium text-slate-900 dark:text-white text-sm">Word → Definition</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">See word, pick definition</div>
          </button>
          <button
            @click="questionMode = 'def-to-word'"
            class="p-4 rounded-xl border-2 transition-all text-center"
            :class="questionMode === 'def-to-word'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'"
          >
            <div class="text-xl mb-1">📖 → 🔤</div>
            <div class="font-medium text-slate-900 dark:text-white text-sm">Definition → Word</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">See definition, pick word</div>
          </button>
        </div>
      </div>

      <!-- Start Button -->
      <div class="text-center">
        <button @click="startQuiz" :disabled="loading" class="btn btn-primary text-lg px-8 py-3">
          <span v-if="loading" class="animate-spin inline-block mr-2">⏳</span>
          {{ loading ? 'Starting...' : '🧠 Start Quiz' }}
        </button>
      </div>
    </div>

    <!-- ==================== PLAYING PHASE ==================== -->
    <div v-else-if="phase === 'playing' && question" class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <button @click="phase = 'setup'" class="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
          ← Exit
        </button>
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
        <!-- Word to Definition mode -->
        <template v-if="questionMode === 'word-to-def'">
          <div class="text-sm text-slate-500 dark:text-slate-400 mb-1">What is the definition of:</div>
          <h2 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">{{ question.word }}</h2>
          <div v-if="question.phoneticUs" class="text-slate-500 dark:text-slate-400 text-sm mb-1">
            {{ question.phoneticUs }}
          </div>
          <div class="text-xs text-slate-400">
            {{ question.cefrLevel }} · {{ question.partOfSpeech.join(', ') }}
          </div>
        </template>
        <!-- Definition to Word mode -->
        <template v-else>
          <div class="text-sm text-slate-500 dark:text-slate-400 mb-1">Which word matches this definition:</div>
          <p class="text-lg font-semibold text-slate-900 dark:text-white mb-2">{{ question.definition }}</p>
          <div class="text-xs text-slate-400">
            {{ question.cefrLevel }}
          </div>
        </template>
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
              <!-- Word-to-Def: show ONLY definition (not the word!) -->
              <template v-if="questionMode === 'word-to-def'">
                <div class="text-slate-700 dark:text-slate-300">{{ option.definition }}</div>
              </template>
              <!-- Def-to-Word: show ONLY word (not the definition!) -->
              <template v-else>
                <div class="font-medium text-slate-900 dark:text-white">{{ option.word }}</div>
              </template>
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

        <button @click="nextQuestion" class="btn btn-primary">
          {{ currentIndex < quizData!.questionCount - 1 ? 'Next Question →' : 'See Results' }}
        </button>
      </div>
    </div>

    <!-- ==================== RESULTS PHASE ==================== -->
    <div v-else-if="phase === 'results' && quizData" class="text-center space-y-6">
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

      <!-- Difficulty & Mode info -->
      <div class="text-sm text-slate-500 dark:text-slate-400">
        {{ difficultyOptions.find(d => d.value === difficulty)?.icon }}
        {{ difficultyOptions.find(d => d.value === difficulty)?.label }} ·
        {{ quizData.questionCount }} questions
      </div>

      <!-- XP Earned -->
      <div v-if="quizResult?.xpEarned" class="flex items-center justify-center gap-2">
        <span class="text-2xl">⚡</span>
        <span class="text-lg font-bold text-primary-600 dark:text-primary-400">+{{ quizResult.xpEarned }} XP</span>
      </div>

      <div class="flex gap-4 justify-center">
        <button @click="startQuiz" class="btn btn-primary">
          🔄 Try Again
        </button>
        <button @click="phase = 'setup'" class="btn btn-secondary">
          ⚙️ Change Settings
        </button>
        <router-link to="/" class="btn btn-secondary">
          ← Home
        </router-link>
      </div>

      <!-- Missed Questions Review -->
      <div v-if="missedQuestions.length > 0" class="text-left">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">
          📝 Words to Review ({{ missedQuestions.length }} missed)
        </h3>
        <div class="space-y-3">
          <div
            v-for="missed in missedQuestions"
            :key="missed.question.id"
            class="card border-l-4 border-red-400 dark:border-red-600"
          >
            <div class="flex items-start justify-between">
              <div>
                <div class="font-semibold text-slate-900 dark:text-white">
                  {{ missed.question.word }}
                  <span class="text-xs font-normal text-slate-400 ml-2">{{ missed.question.cefrLevel }}</span>
                </div>
                <div class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ missed.question.definition }}</div>
                <div v-if="missed.question.examples?.length" class="text-xs text-slate-500 dark:text-slate-500 italic mt-1">
                  "{{ missed.question.examples[0] }}"
                </div>
              </div>
              <router-link
                :to="`/words/${missed.question.id}`"
                class="text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
              >
                Details →
              </router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfettiEffect :active="confettiActive" :duration="4000" />
  </div>
</template>
