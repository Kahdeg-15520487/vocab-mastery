<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useSpeech } from '@/composables/useSpeech'
import { useActiveSession } from '@/composables/useActiveSession'
import { getLevelRange } from '@/lib/difficulty'
import { usePageTitle } from '@/composables/usePageTitle'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import DifficultySelector from '@/components/learning/DifficultySelector.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import ResumePrompt from '@/components/ui/ResumePrompt.vue'
import SingleTabWarning from '@/components/ui/SingleTabWarning.vue'

usePageTitle()

const toast = useToast()
const router = useRouter()
const { playAudio } = useSpeech()
const { activeSession, checkActiveSession, abandonActiveSession, showTabWarning, dismissTabWarning } = useActiveSession()

interface ListeningWord {
  index: number
  id: string
  word: string
  audioUs: string | null
  audioUk: string | null
  phoneticUs: string | null
  phoneticUk: string | null
  partOfSpeech: string[]
  definition: string
  examples: string[]
  synonyms: string[]
  cefrLevel: string
  letterCount: number
}

interface CheckResult {
  correct: boolean
  close: boolean
  correctAnswer: string
  phoneticUs: string | null
  definition: string
}

// Phase: setup | resume | playing | results
const phase = ref<'setup' | 'resume' | 'playing' | 'results'>('setup')

// Setup options
const wordCount = ref(10)
const wordCountOptions = [5, 10, 15, 20]
const difficulty = ref<'mixed' | 'easy' | 'medium' | 'hard'>('mixed')
const accent = ref<'us' | 'uk'>('us')

// Game state
const words = ref<ListeningWord[]>([])
const sessionId = ref('')
const currentIndex = ref(0)
const userInput = ref('')
const currentResult = ref<CheckResult | null>(null)
const loading = ref(false)
const error = ref('')
const confettiActive = ref(false)
const hintShown = ref(false)
const playsCount = ref(0)

// Results
const results = ref<Array<{ word: string; correct: boolean; close: boolean; userAnswer: string }>>([])
const correctCount = computed(() => results.value.filter(r => r.correct).length)
const closeCount = computed(() => results.value.filter(r => r.close && !r.correct).length)
const accuracy = computed(() => results.value.length > 0 ? Math.round((correctCount.value / results.value.length) * 100) : 0)

const currentWord = computed(() => words.value[currentIndex.value] || null)

// Load active session on mount
onMounted(async () => {
  const data = await checkActiveSession()
  if (data?.active && data.type === 'learn') {
    phase.value = 'resume'
  }
})

async function abandonAndStart() {
  await abandonActiveSession()
  await startSession()
}

async function resumeFromActive() {
  const data = await request<any>('/sessions/active')
  if (!data.active) {
    phase.value = 'setup'
    return
  }

  sessionId.value = data.sessionId
  const answeredIds = new Set(
    data.words?.filter((w: any) => w.answered).map((w: any) => w.id) || []
  )

  if (data.words) {
    words.value = data.words
    const nextIdx = data.words.findIndex((w: any) => !answeredIds.has(w.id))
    currentIndex.value = nextIdx >= 0 ? nextIdx : data.words.length
    results.value = data.words
      .filter((w: any) => w.answered)
      .map((w: any) => ({
        word: w.word,
        correct: w.response === 'easy',
        close: w.response === 'hard',
        userAnswer: w.word,
      }))
    phase.value = 'playing'
    if (currentWord.value) {
      nextTick(() => playCurrentAudio())
    }
  } else {
    phase.value = 'setup'
  }
}

async function startSession() {
  loading.value = true
  error.value = ''
  try {
    const levelRange = difficulty.value !== 'mixed' ? getLevelRange(difficulty.value) : undefined
    const data = await request<any>('/sessions/listening', {
      method: 'POST',
      body: JSON.stringify({
        levelRange,
        wordCount: wordCount.value,
      }),
    })

    if (!data.words?.length) {
      error.value = 'No words with audio available. Try different filters.'
      return
    }

    sessionId.value = data.sessionId
    words.value = data.words
    currentIndex.value = 0
    results.value = []
    phase.value = 'playing'

    nextTick(() => playCurrentAudio())
  } catch (e: any) {
    error.value = e.message || 'Failed to start listening session'
  } finally {
    loading.value = false
  }
}

function playCurrentAudio() {
  const w = currentWord.value
  if (!w) return
  playsCount.value++
  const audioFile = accent.value === 'uk' ? w.audioUk : w.audioUs
  playAudio(w.word, audioFile, accent.value)
}

function showHint() {
  hintShown.value = true
}

async function checkAnswer() {
  if (!userInput.value.trim() || !currentWord.value) return

  try {
    const result = await request<CheckResult>(`/sessions/listening/${sessionId.value}/check`, {
      method: 'POST',
      body: JSON.stringify({
        wordId: currentWord.value.id,
        answer: userInput.value.trim(),
      }),
    })

    currentResult.value = result
    results.value.push({
      word: result.correctAnswer,
      correct: result.correct,
      close: result.close,
      userAnswer: userInput.value.trim(),
    })

    if (result.correct) {
      toast.success('Correct!')
    } else if (result.close) {
      toast.success('Almost! So close!')
    }
  } catch (e: any) {
    toast.error(e.message || 'Failed to check answer')
  }
}

function nextWord() {
  currentResult.value = null
  userInput.value = ''
  hintShown.value = false
  playsCount.value = 0
  currentIndex.value++

  if (currentIndex.value >= words.value.length) {
    finishSession()
  } else {
    nextTick(() => playCurrentAudio())
  }
}

async function finishSession() {
  phase.value = 'results'
  if (accuracy.value >= 80) {
    confettiActive.value = true
    setTimeout(() => confettiActive.value = false, 3000)
  }

  try {
    await request(`/sessions/${sessionId.value}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  } catch {
    // Session completion is best-effort
  }
}

function goHome() {
  router.push('/')
}

function restart() {
  phase.value = 'setup'
  words.value = []
  results.value = []
  currentResult.value = null
  userInput.value = ''
  currentIndex.value = 0
}

function handleKeydown(e: KeyboardEvent) {
  if (phase.value !== 'playing') return

  if (e.key === 'Enter') {
    e.preventDefault()
    if (currentResult.value) {
      nextWord()
    } else if (userInput.value.trim()) {
      checkAnswer()
    }
  }
}

watch(currentWord, () => {
  if (phase.value === 'playing' && currentWord.value) {
    nextTick(() => playCurrentAudio())
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6" @keydown="handleKeydown">
    <ConfettiEffect :active="confettiActive" />

    <!-- Setup Screen -->
    <div v-if="phase === 'setup'">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">&#x1F3A7;</div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Listening Comprehension</h1>
        <p class="text-slate-600 dark:text-slate-400 mt-2">Listen to the word and type what you hear</p>
      </div>

      <div v-if="error" class="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
        {{ error }}
      </div>

      <div class="card space-y-6">
        <!-- Accent selection -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Accent</label>
          <div class="flex gap-3">
            <button
              @click="accent = 'us'"
              :class="accent === 'us' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'"
              class="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors"
            >
              &#x1F1FA;&#x1F1F8; American
            </button>
            <button
              @click="accent = 'uk'"
              :class="accent === 'uk' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'"
              class="flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors"
            >
              &#x1F1EC;&#x1F1E7; British
            </button>
          </div>
        </div>

        <!-- Difficulty -->
        <DifficultySelector v-model="difficulty" />

        <!-- Word count -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Words</label>
          <div class="flex gap-2">
            <button
              v-for="n in wordCountOptions"
              :key="n"
              @click="wordCount = n"
              :class="wordCount === n ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'"
              class="flex-1 py-2 rounded-lg border text-sm font-medium transition-colors"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <button
          @click="startSession"
          :disabled="loading"
          class="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white rounded-lg font-semibold transition-colors"
        >
          {{ loading ? 'Starting...' : 'Start Listening' }}
        </button>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 text-center mt-4">
        Only words with audio pronunciation are included in this mode.
      </p>
    </div>

    <!-- Resume Prompt -->
    <div v-if="phase === 'resume'">
      <ResumePrompt
        :answered-count="activeSession?.answeredCount || 0"
        :total-words="activeSession?.totalWords || 0"
        @resume="resumeFromActive"
        @abandon="abandonAndStart"
      />
    </div>

    <!-- Single Tab Warning -->
    <SingleTabWarning
      v-if="showTabWarning"
      :visible="showTabWarning"
      @close="dismissTabWarning"
    />

    <!-- Playing Screen -->
    <div v-if="phase === 'playing' && currentWord" class="space-y-6">
      <!-- Progress -->
      <ProgressBar :current="currentIndex + 1" :total="words.length" />

      <!-- Audio Card -->
      <div class="card text-center">
        <div class="mb-6">
          <LevelBadge v-if="currentWord.cefrLevel" :level="currentWord.cefrLevel" class="mb-3" />
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Listen and type what you hear
          </p>

          <!-- Play button -->
          <button
            @click="playCurrentAudio"
            class="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/30 hover:bg-primary-200 dark:hover:bg-primary-900/50 flex items-center justify-center mx-auto transition-colors group"
            title="Play audio"
          >
            <span class="text-4xl group-hover:scale-110 transition-transform">&#x1F50A;</span>
          </button>
          <p class="text-xs text-slate-400 mt-2">Played {{ playsCount }} time{{ playsCount !== 1 ? 's' : '' }}</p>
        </div>

        <!-- Hint -->
        <div v-if="hintShown" class="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <p class="text-sm text-amber-800 dark:text-amber-200">
            <span class="font-semibold">Hint:</span>
            {{ currentWord.word.length }} letters, starts with "{{ currentWord.word[0].toUpperCase() }}"
          </p>
        </div>

        <button
          v-if="!hintShown && !currentResult"
          @click="showHint"
          class="text-sm text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors mb-4"
        >
          Show hint
        </button>
      </div>

      <!-- Answer Input -->
      <div v-if="!currentResult" class="card">
        <div class="flex gap-2">
          <input
            v-model="userInput"
            type="text"
            placeholder="Type what you heard..."
            class="flex-1 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-lg font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            :maxlength="50"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown.enter.prevent="checkAnswer"
          />
          <button
            @click="checkAnswer"
            :disabled="!userInput.trim()"
            class="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold transition-colors"
          >
            Check
          </button>
        </div>
      </div>

      <!-- Result Feedback -->
      <div v-if="currentResult" class="card">
        <div :class="[
          currentResult.correct ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
          currentResult.close ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
          'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
        ]" class="p-4 rounded-lg border">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-2xl">{{ currentResult.correct ? '&#x2705;' : currentResult.close ? '&#x1F535;' : '&#x274C;' }}</span>
            <span class="text-lg font-bold" :class="currentResult.correct ? 'text-green-700 dark:text-green-300' : currentResult.close ? 'text-blue-700 dark:text-blue-300' : 'text-red-700 dark:text-red-300'">
              {{ currentResult.correct ? 'Correct!' : currentResult.close ? 'Almost!' : 'Not quite' }}
            </span>
          </div>

          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm text-slate-500 dark:text-slate-400">Answer:</span>
              <span class="font-bold text-lg text-slate-900 dark:text-white">{{ currentResult.correctAnswer }}</span>
            </div>
            <div v-if="currentResult.phoneticUs" class="flex items-center gap-2">
              <span class="text-sm text-slate-500 dark:text-slate-400">Pronunciation:</span>
              <span class="text-sm text-slate-600 dark:text-slate-300">/{{ currentResult.phoneticUs }}/</span>
            </div>
            <div v-if="currentResult.definition" class="text-sm text-slate-600 dark:text-slate-300">
              {{ currentResult.definition }}
            </div>
            <div v-if="!currentResult.correct" class="flex items-center gap-2">
              <span class="text-sm text-slate-500 dark:text-slate-400">You typed:</span>
              <span class="text-sm text-red-600 dark:text-red-400 line-through">{{ results[results.length - 1]?.userAnswer }}</span>
            </div>
          </div>
        </div>

        <button
          @click="nextWord"
          class="w-full mt-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold transition-colors"
        >
          {{ currentIndex < words.length - 1 ? 'Next Word' : 'See Results' }}
        </button>
      </div>
    </div>

    <!-- Results Screen -->
    <div v-if="phase === 'results'" class="space-y-6">
      <div class="card text-center">
        <div class="text-5xl mb-3">&#x1F3A7;</div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Session Complete!</h2>
        <p class="text-slate-500 dark:text-slate-400 mt-1">Listening Comprehension</p>

        <div class="grid grid-cols-3 gap-4 mt-6">
          <div class="text-center">
            <div class="text-3xl font-bold text-green-600">{{ correctCount }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Correct</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-blue-600">{{ closeCount }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Close</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-primary-600">{{ accuracy }}%</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Accuracy</div>
          </div>
        </div>
      </div>

      <!-- Word-by-word breakdown -->
      <div class="card">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Word Breakdown</h3>
        <div class="space-y-2">
          <div
            v-for="(r, i) in results"
            :key="i"
            :class="r.correct ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : r.close ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'"
            class="flex items-center justify-between p-3 rounded-lg border"
          >
            <div class="flex items-center gap-3">
              <span class="text-lg">{{ r.correct ? '&#x2705;' : r.close ? '&#x1F535;' : '&#x274C;' }}</span>
              <div>
                <span class="font-medium text-slate-900 dark:text-white">{{ r.word }}</span>
                <span v-if="!r.correct" class="text-sm text-slate-500 ml-2">({{ r.userAnswer }})</span>
              </div>
            </div>
            <span class="text-xs px-2 py-1 rounded-full" :class="r.correct ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : r.close ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'">
              {{ r.correct ? 'Correct' : r.close ? 'Close' : 'Wrong' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button @click="restart" class="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold transition-colors">
          Try Again
        </button>
        <button @click="goHome" class="flex-1 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-semibold transition-colors">
          Home
        </button>
      </div>
    </div>
  </div>
</template>
