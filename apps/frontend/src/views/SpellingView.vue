<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useSpeech } from '@/composables/useSpeech'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'
// SkeletonLoader not used in this view
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

const toast = useToast()
const { speak } = useSpeech()

interface SpellingQuestion {
  index: number
  id: string
  definition: string
  phoneticUs: string | null
  partOfSpeech: string[]
  examples: string[]
  synonyms: string[]
  cefrLevel: string
  letterCount: number
  firstLetter: string
}

interface SpellingResult {
  correct: boolean
  close: boolean
  correctAnswer: string
  word: string
}

// Phase: setup | playing | results
const phase = ref<'setup' | 'playing' | 'results'>('setup')

// Setup options
const wordCount = ref(10)
const wordCountOptions = [5, 10, 15, 20]

// Game state
const questions = ref<SpellingQuestion[]>([])
const sessionId = ref('')
const currentIndex = ref(0)
const answer = ref('')
const currentResult = ref<SpellingResult | null>(null)
const loading = ref(false)
const error = ref('')
const answerInput = ref<HTMLInputElement | null>(null)
const confettiActive = ref(false)

// Results
const results = ref<Map<string, { correct: boolean; close: boolean; answer: string; correctAnswer: string }>>(new Map())
const xpEarned = ref(0)
const leveledUp = ref(false)

// Keyboard shortcut
function onKeyDown(e: KeyboardEvent) {
  if (phase.value !== 'playing') return
  if (e.key === 'Enter') {
    if (currentResult.value) {
      nextWord()
    } else if (answer.value.trim()) {
      checkAnswer()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

const currentQuestion = computed(() => questions.value[currentIndex.value] || null)
const progress = computed(() => ({
  current: currentIndex.value + 1,
  total: questions.value.length,
}))
const correctCount = computed(() => [...results.value.values()].filter(r => r.correct).length)

// Letter hint boxes
const letterBoxes = computed(() => {
  if (!currentQuestion.value) return []
  const count = currentQuestion.value.letterCount
  const answered = answer.value.toLowerCase()
  const correctWord = currentResult.value?.correctAnswer?.toLowerCase() || ''
  return Array.from({ length: count }, (_, i) => {
    if (currentResult.value) {
      // After answering: show correct letters in green, wrong in red
      if (i < answered.length) {
        return answered[i] === correctWord[i] ? 'correct' : 'wrong'
      }
      return 'missing'
    }
    if (i < answered.length) {
      return answered[i] === correctWord[i] ? 'filled-correct' : 'filled'
    }
    return 'empty'
  })
})

async function startPractice() {
  loading.value = true
  error.value = ''
  results.value = new Map()
  currentIndex.value = 0
  answer.value = ''
  currentResult.value = null

  try {
    const data = await request<{ sessionId: string; questionCount: number; questions: SpellingQuestion[] }>('/sessions/spelling', {
      method: 'POST',
      body: JSON.stringify({ wordCount: wordCount.value }),
    })
    sessionId.value = data.sessionId
    questions.value = data.questions
    phase.value = 'playing'
    await nextTick()
    answerInput.value?.focus()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function checkAnswer() {
  if (!currentQuestion.value || !answer.value.trim() || currentResult.value) return
  loading.value = true

  try {
    const result = await request<SpellingResult>(`/sessions/spelling/${sessionId.value}/check`, {
      method: 'POST',
      body: JSON.stringify({
        wordId: currentQuestion.value.id,
        answer: answer.value.trim(),
      }),
    })
    currentResult.value = result
    results.value.set(currentQuestion.value.id, {
      correct: result.correct,
      close: result.close,
      answer: answer.value.trim(),
      correctAnswer: result.correctAnswer,
    })
  } catch (e: any) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function nextWord() {
  if (currentIndex.value >= questions.value.length - 1) {
    await completeSession()
    return
  }
  currentIndex.value++
  answer.value = ''
  currentResult.value = null
  await nextTick()
  answerInput.value?.focus()
}

async function completeSession() {
  try {
    const result = await request<any>(`/sessions/${sessionId.value}/complete`, {
      method: 'POST',
    })
    xpEarned.value = result.xpEarned || 0
    leveledUp.value = result.leveledUp || false
    phase.value = 'results'

    if (leveledUp.value) {
      toast.success('🎉 You reached a new level!', 'Level Up!')
      confettiActive.value = true
      setTimeout(() => { confettiActive.value = false }, 4000)
    }
  } catch (e: any) {
    toast.error(e.message)
  }
}

function retry() {
  phase.value = 'setup'
  results.value = new Map()
  xpEarned.value = 0
  leveledUp.value = false
}

function showHint() {
  if (!currentQuestion.value || currentResult.value) return
  // Add next correct letter
  if (answer.value.length === 0) {
    answer.value = currentQuestion.value.firstLetter
    answerInput.value?.focus()
  }
}

const missedWords = computed(() =>
  [...results.value.entries()]
    .filter(([_, r]) => !r.correct)
    .map(([id, r]) => ({ id, ...r }))
)
</script>

<template>
  <div>
    <!-- ==================== SETUP PHASE ==================== -->
    <div v-if="phase === 'setup'" class="max-w-lg mx-auto">
      <div class="text-center mb-8">
        <div class="text-6xl mb-4">✍️</div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Spelling Practice</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Read the definition, type the word. A great way to memorize spelling!
        </p>
      </div>

      <div class="card space-y-6">
        <!-- Word Count -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Number of words
          </label>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="count in wordCountOptions"
              :key="count"
              @click="wordCount = count"
              class="py-2 rounded-lg text-sm font-medium transition-colors"
              :class="wordCount === count
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'"
            >
              {{ count }}
            </button>
          </div>
        </div>

        <button
          @click="startPractice"
          :disabled="loading"
          class="btn btn-primary w-full text-lg py-3"
        >
          {{ loading ? 'Loading...' : '✍️ Start Practice' }}
        </button>
      </div>

      <div v-if="error" class="mt-4 text-center text-red-600 dark:text-red-400">
        {{ error }}
      </div>
    </div>

    <!-- ==================== PLAYING PHASE ==================== -->
    <div v-else-if="phase === 'playing'" class="max-w-lg mx-auto">
      <!-- Progress -->
      <ProgressBar :current="progress.current" :total="progress.total" class="mb-6" />

      <!-- Question Card -->
      <div v-if="currentQuestion" class="card">
        <!-- Level + Letter Count -->
        <div class="flex items-center justify-between mb-4">
          <LevelBadge :level="currentQuestion.cefrLevel" />
          <span class="text-sm text-slate-500 dark:text-slate-400">
            {{ currentQuestion.letterCount }} letters
          </span>
        </div>

        <!-- Definition -->
        <div class="mb-4">
          <h3 class="text-xs uppercase tracking-wider text-slate-400 mb-1">Definition</h3>
          <p class="text-lg text-slate-900 dark:text-white">{{ currentQuestion.definition }}</p>
        </div>

        <!-- Part of Speech -->
        <div v-if="currentQuestion.partOfSpeech.length" class="mb-3 flex gap-2 flex-wrap">
          <span
            v-for="pos in currentQuestion.partOfSpeech"
            :key="pos"
            class="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          >
            {{ pos }}
          </span>
        </div>

        <!-- Examples (word masked) -->
        <div v-if="currentQuestion.examples.length" class="mb-4">
          <h4 class="text-xs uppercase tracking-wider text-slate-400 mb-1">Examples</h4>
          <div class="space-y-1">
            <p
              v-for="(ex, i) in currentQuestion.examples.slice(0, 2)"
              :key="i"
              class="text-sm text-slate-600 dark:text-slate-400 italic"
            >
              "{{ ex }}"
            </p>
          </div>
        </div>

        <!-- Synonyms -->
        <div v-if="currentQuestion.synonyms.length" class="mb-4">
          <h4 class="text-xs uppercase tracking-wider text-slate-400 mb-1">Synonyms</h4>
          <div class="flex gap-1 flex-wrap">
            <span
              v-for="syn in currentQuestion.synonyms.slice(0, 4)"
              :key="syn"
              class="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
            >
              {{ syn }}
            </span>
          </div>
        </div>

        <!-- Letter Hint Boxes -->
        <div class="flex justify-center gap-1 mb-4 flex-wrap">
          <div
            v-for="(state, i) in letterBoxes"
            :key="i"
            class="w-8 h-10 flex items-center justify-center text-lg font-bold rounded border-2 transition-colors"
            :class="{
              'border-slate-300 dark:border-slate-600': state === 'empty',
              'border-primary-300 bg-primary-50/50 dark:bg-primary-900/10 text-primary-600 dark:text-primary-400': state === 'filled',
              'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300': state === 'filled-correct',
              'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300': state === 'correct',
              'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300': state === 'wrong',
              'border-slate-400 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500': state === 'missing',
            }"
          >
            <template v-if="currentResult">
              {{ currentResult.correctAnswer[i] || '' }}
            </template>
            <template v-else>
              {{ i < answer.length ? answer[i] : '' }}
            </template>
          </div>
        </div>

        <!-- Input -->
        <div class="flex gap-2">
          <input
            ref="answerInput"
            v-model="answer"
            :disabled="!!currentResult"
            :placeholder="currentResult ? '' : `Type the word (${currentQuestion.firstLetter}...)`"
            class="input flex-1"
            :class="currentResult ? (currentResult.correct ? 'border-green-500' : 'border-red-500') : ''"
            @keyup.enter="currentResult ? nextWord() : checkAnswer()"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <button
            v-if="!currentResult"
            @click="showHint"
            class="btn btn-secondary text-sm"
            title="Reveal first letter"
          >
            💡 Hint
          </button>
        </div>

        <!-- Result Feedback -->
        <div v-if="currentResult" class="mt-4 text-center">
          <div v-if="currentResult.correct" class="text-green-600 dark:text-green-400">
            <div class="text-3xl mb-1">✅</div>
            <p class="font-semibold text-lg">Correct!</p>
          </div>
          <div v-else class="text-red-600 dark:text-red-400">
            <div class="text-3xl mb-1">{{ currentResult.close ? '😅' : '❌' }}</div>
            <p class="font-semibold text-lg">
              {{ currentResult.close ? 'Close!' : 'Incorrect' }}
            </p>
            <p class="text-slate-600 dark:text-slate-400 mt-1">
              The correct spelling is:
              <span class="font-bold text-slate-900 dark:text-white">{{ currentResult.correctAnswer }}</span>
              <button
                @click="speak(currentResult.correctAnswer)"
                class="ml-2 text-lg hover:scale-110 transition-transform"
                title="Listen"
              >🔊</button>
            </p>
          </div>

          <button @click="nextWord" class="btn btn-primary mt-4">
            {{ currentIndex >= questions.length - 1 ? 'See Results' : 'Next Word →' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== RESULTS PHASE ==================== -->
    <div v-else-if="phase === 'results'" class="max-w-lg mx-auto text-center">
      <div class="card">
        <div class="text-6xl mb-4">{{ correctCount === questions.length ? '🌟' : correctCount >= questions.length / 2 ? '👍' : '💪' }}</div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Practice Complete!</h2>

        <div class="grid grid-cols-3 gap-4 my-6">
          <div>
            <div class="text-3xl font-bold text-green-600 dark:text-green-400">{{ correctCount }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Correct</div>
          </div>
          <div>
            <div class="text-3xl font-bold text-red-600 dark:text-red-400">{{ questions.length - correctCount }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Incorrect</div>
          </div>
          <div>
            <div class="text-3xl font-bold text-primary-600 dark:text-primary-400">
              {{ questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0 }}%
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Accuracy</div>
          </div>
        </div>

        <!-- XP Earned -->
        <div v-if="xpEarned" class="flex items-center justify-center gap-2 mb-4">
          <span class="text-2xl">⚡</span>
          <span class="text-lg font-bold text-primary-600 dark:text-primary-400">+{{ xpEarned }} XP</span>
        </div>

        <!-- Missed Words -->
        <div v-if="missedWords.length" class="text-left mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
          <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Words to Review</h3>
          <div class="space-y-2">
            <div
              v-for="w in missedWords"
              :key="w.id"
              class="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border-l-4 border-red-400"
            >
              <div>
                <span class="font-semibold text-slate-900 dark:text-white">{{ w.correctAnswer }}</span>
                <span class="text-sm text-slate-500 dark:text-slate-400 ml-2">you typed: "{{ w.answer }}"</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button @click="retry" class="btn btn-primary flex-1">Try Again</button>
          <router-link to="/" class="btn btn-secondary flex-1">Home</router-link>
        </div>
      </div>

      <ConfettiEffect :active="confettiActive" :duration="4000" />
    </div>
  </div>
</template>
