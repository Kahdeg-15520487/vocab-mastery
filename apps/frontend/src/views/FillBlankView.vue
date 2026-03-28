<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useListsStore } from '@/stores/lists'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

const toast = useToast()

interface FillBlankQuestion {
  index: number
  id: string
  word: string // used for client-side validation
  sentence: string // the example with ____ blank
  definition: string
  partOfSpeech: string[]
  cefrLevel: string
  hint: string // last N letters revealed progressively
}

// Phase: setup | playing | results
const phase = ref<'setup' | 'playing' | 'results'>('setup')

const wordCount = ref(10)
const wordCountOptions = [5, 10, 15, 20]
const selectedListId = ref('')

const listsStore = useListsStore()
onMounted(() => { listsStore.fetchLists() })

// Game state
const questions = ref<FillBlankQuestion[]>([])
const sessionId = ref('')
const currentIndex = ref(0)
const answer = ref('')
const currentResult = ref<{ correct: boolean; close: boolean; correctAnswer: string } | null>(null)
const loading = ref(false)
const error = ref('')
const answerInput = ref<HTMLInputElement | null>(null)
const confettiActive = ref(false)
const hintsUsed = ref(0)

// Results
const results = ref<Map<string, { correct: boolean; close: boolean; answer: string; correctAnswer: string }>>(new Map())
const xpEarned = ref(0)
const leveledUp = ref(false)

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

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[m][n]
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

const currentQuestion = computed(() => questions.value[currentIndex.value] || null)
const progress = computed(() => ({
  current: currentIndex.value + 1,
  total: questions.value.length,
}))
const correctCount = computed(() => [...results.value.values()].filter(r => r.correct).length)

async function startPractice() {
  loading.value = true
  error.value = ''
  results.value = new Map()
  currentIndex.value = 0
  answer.value = ''
  currentResult.value = null
  hintsUsed.value = 0

  try {
    const data = await request<{ sessionId: string; questionCount: number; questions: any[] }>('/sessions/fill-blank', {
      method: 'POST',
      body: JSON.stringify({ wordCount: wordCount.value, listId: selectedListId.value || undefined }),
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

  const userAnswer = answer.value.trim().toLowerCase()
  const correctAnswer = currentQuestion.value.word.trim().toLowerCase()
  const isCorrect = userAnswer === correctAnswer

  // Levenshtein "close" check
  let isClose = false
  if (!isCorrect) {
    const dist = levenshtein(userAnswer, correctAnswer)
    isClose = dist > 0 && dist <= 2 && dist < correctAnswer.length / 3
  }

  // Show result instantly
  currentResult.value = { correct: isCorrect, close: isClose, correctAnswer: currentQuestion.value.word }
  results.value.set(currentQuestion.value.id, {
    correct: isCorrect,
    close: isClose,
    answer: answer.value.trim(),
    correctAnswer: currentQuestion.value.word,
  })

  // Fire-and-forget API call
  request(`/sessions/fill-blank/${sessionId.value}/check`, {
    method: 'POST',
    body: JSON.stringify({ wordId: currentQuestion.value.id, answer: answer.value.trim() }),
  }).catch(() => {})
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
  hintsUsed.value++
  const word = currentQuestion.value.word
  // Reveal more letters each time
  const revealCount = Math.min(hintsUsed.value, word.length)
  const partial = word.slice(0, revealCount)
  answer.value = partial
  answerInput.value?.focus()
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
        <div class="text-6xl mb-4">📝</div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Fill in the Blank</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Read the sentence and type the missing word. Context helps reinforce meaning!
        </p>
      </div>

      <div class="card space-y-6">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Number of sentences
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

        <!-- Study from List (optional) -->
        <div v-if="listsStore.lists.length > 0">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Study from List <span class="text-slate-400">(optional)</span>
          </label>
          <select v-model="selectedListId" class="input w-full">
            <option value="">All words</option>
            <option v-for="list in listsStore.lists" :key="list.id" :value="list.id">
              {{ list.icon }} {{ list.name }} ({{ list.wordCount }} words)
            </option>
          </select>
        </div>

        <button
          @click="startPractice"
          :disabled="loading"
          class="btn btn-primary w-full text-lg py-3"
        >
          {{ loading ? 'Loading...' : '📝 Start Practice' }}
        </button>
      </div>

      <div v-if="error" class="mt-4 text-center text-red-600 dark:text-red-400">
        {{ error }}
      </div>
    </div>

    <!-- ==================== PLAYING PHASE ==================== -->
    <div v-else-if="phase === 'playing'" class="max-w-lg mx-auto">
      <ProgressBar :current="progress.current" :total="progress.total" class="mb-6" />

      <div v-if="currentQuestion" class="card">
        <!-- Level -->
        <div class="flex items-center justify-between mb-4">
          <LevelBadge :level="currentQuestion.cefrLevel" />
          <span class="text-sm text-slate-500 dark:text-slate-400">
            {{ currentQuestion.word.length }} letters
          </span>
        </div>

        <!-- Sentence with blank -->
        <div class="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <p class="text-lg text-slate-800 dark:text-slate-200 leading-relaxed">
            {{ currentQuestion.sentence }}
          </p>
        </div>

        <!-- Definition (as additional clue) -->
        <div class="mb-4">
          <h4 class="text-xs uppercase tracking-wider text-slate-400 mb-1">Definition</h4>
          <p class="text-sm text-slate-600 dark:text-slate-400">{{ currentQuestion.definition }}</p>
        </div>

        <!-- Part of Speech -->
        <div v-if="currentQuestion.partOfSpeech.length" class="mb-4 flex gap-2 flex-wrap">
          <span
            v-for="pos in currentQuestion.partOfSpeech"
            :key="pos"
            class="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          >
            {{ pos }}
          </span>
        </div>

        <!-- Input -->
        <div class="flex gap-2">
          <input
            ref="answerInput"
            v-model="answer"
            :disabled="!!currentResult"
            :placeholder="currentResult ? '' : 'Type the missing word...'"
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
            title="Reveal more letters"
          >
            💡
          </button>
          <button
            v-if="!currentResult"
            @click="checkAnswer"
            :disabled="!answer.trim()"
            class="btn btn-primary text-sm"
          >
            Check
          </button>
        </div>

        <!-- Result Feedback -->
        <div v-if="currentResult" class="mt-4 text-center">
          <div v-if="currentResult.correct" class="text-green-600 dark:text-green-400">
            <div class="text-3xl mb-1">✅</div>
            <p class="font-semibold text-lg">Correct!</p>
            <p class="text-slate-600 dark:text-slate-400 mt-1">
              <span class="font-bold text-green-700 dark:text-green-300">{{ currentResult.correctAnswer }}</span>
            </p>
          </div>
          <div v-else class="text-red-600 dark:text-red-400">
            <div class="text-3xl mb-1">{{ currentResult.close ? '😅' : '❌' }}</div>
            <p class="font-semibold text-lg">
              {{ currentResult.close ? 'Close!' : 'Incorrect' }}
            </p>
            <p class="text-slate-600 dark:text-slate-400 mt-1">
              The correct word is:
              <span class="font-bold text-slate-900 dark:text-white">{{ currentResult.correctAnswer }}</span>
            </p>
          </div>

          <button @click="nextWord" class="btn btn-primary mt-4">
            {{ currentIndex >= questions.length - 1 ? 'See Results' : 'Next →' }}
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
