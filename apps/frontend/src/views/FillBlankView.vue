<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

const toast = useToast()

interface FillBlankQuestion {
  index: number
  id: string
  word: string // revealed after answering
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

// Game state
const questions = ref<FillBlankQuestion[]>([])
const sessionId = ref('')
const currentIndex = ref(0)
const letterInputs = ref<string[]>([])  // one char per box
const activeBox = ref(0)
const currentResult = ref<{ correct: boolean; close: boolean; correctAnswer: string } | null>(null)
const loading = ref(false)
const error = ref('')
const boxRefs = ref<HTMLInputElement[]>([])
const confettiActive = ref(false)
const hintsUsed = ref(0)

// Results
const results = ref<Map<string, { correct: boolean; close: boolean; answer: string; correctAnswer: string }>>(new Map())
const xpEarned = ref(0)
const leveledUp = ref(false)

const currentQuestion = computed(() => questions.value[currentIndex.value] || null)

// Split sentence around the ____ blank
const sentenceParts = computed(() => {
  if (!currentQuestion.value) return { before: '', after: '' }
  const idx = currentQuestion.value.sentence.indexOf('____')
  if (idx === -1) return { before: currentQuestion.value.sentence, after: '' }
  return {
    before: currentQuestion.value.sentence.slice(0, idx),
    after: currentQuestion.value.sentence.slice(idx + 4),
  }
})

// Get the answer from letter boxes
const answer = computed(() => letterInputs.value.join('').trim())

// Initialize letter boxes when question changes
watch(currentQuestion, (q) => {
  if (q) {
    letterInputs.value = Array(q.word.length).fill('')
    activeBox.value = 0
  }
}, { immediate: true })

const progress = computed(() => ({
  current: currentIndex.value + 1,
  total: questions.value.length,
}))
const correctCount = computed(() => [...results.value.values()].filter(r => r.correct).length)

function focusBox(index: number) {
  const max = currentQuestion.value?.word.length ?? 0
  if (index < 0 || index >= max) return
  activeBox.value = index
  boxRefs.value[index]?.focus()
}

function onBoxInput(e: Event, index: number) {
  const input = e.target as HTMLInputElement
  const val = input.value
  const max = currentQuestion.value?.word.length ?? 0

  if (val.length > 0) {
    // Take only the last typed character
    const char = val.slice(-1)
    letterInputs.value[index] = char
    input.value = char

    // Move to next box
    if (index < max - 1) {
      focusBox(index + 1)
    }
  }

  // Auto-check when all boxes filled
  if (letterInputs.value.every(l => l !== '')) {
    nextTick(() => checkAnswer())
  }
}

function onBoxKeydown(e: KeyboardEvent, index: number) {
  const max = currentQuestion.value?.word.length ?? 0

  if (e.key === 'Backspace') {
    if (letterInputs.value[index] === '' && index > 0) {
      // Move back and clear previous
      letterInputs.value[index - 1] = ''
      focusBox(index - 1)
    } else {
      letterInputs.value[index] = ''
    }
    e.preventDefault()
    return
  }

  if (e.key === 'ArrowLeft' && index > 0) {
    focusBox(index - 1)
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowRight' && index < max - 1) {
    focusBox(index + 1)
    e.preventDefault()
    return
  }

  if (e.key === 'Enter') {
    if (currentResult.value) {
      nextWord()
    } else if (answer.value) {
      checkAnswer()
    }
    e.preventDefault()
    return
  }

  // Ignore non-letter keys
  if (e.key.length !== 1) return
}

function onKeyDown(e: KeyboardEvent) {
  if (phase.value !== 'playing') return
  // Global Enter handler (backup if focus is outside boxes)
  if (e.key === 'Enter' && !e.target || !(e.target as HTMLElement).classList?.contains('blank-box')) {
    if (currentResult.value) nextWord()
    else if (answer.value) checkAnswer()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

async function startPractice() {
  loading.value = true
  error.value = ''
  results.value = new Map()
  currentIndex.value = 0
  currentResult.value = null
  hintsUsed.value = 0

  try {
    const data = await request<{ sessionId: string; questionCount: number; questions: any[] }>('/sessions/fill-blank', {
      method: 'POST',
      body: JSON.stringify({ wordCount: wordCount.value }),
    })
    sessionId.value = data.sessionId
    questions.value = data.questions
    phase.value = 'playing'
    await nextTick()
    focusBox(0)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function checkAnswer() {
  if (!currentQuestion.value || !answer.value || currentResult.value) return
  loading.value = true

  try {
    const result = await request<{ correct: boolean; close: boolean; correctAnswer: string }>(
      `/sessions/fill-blank/${sessionId.value}/check`,
      {
        method: 'POST',
        body: JSON.stringify({
          wordId: currentQuestion.value.id,
          answer: answer.value,
        }),
      }
    )
    currentResult.value = result
    results.value.set(currentQuestion.value.id, {
      correct: result.correct,
      close: result.close,
      answer: answer.value,
      correctAnswer: result.correctAnswer,
    })

    // If wrong, fill in the correct answer in the boxes
    if (!result.correct && result.correctAnswer) {
      const letters = result.correctAnswer.split('')
      for (let i = 0; i < letterInputs.value.length; i++) {
        letterInputs.value[i] = letters[i] || ''
      }
    }
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
  currentResult.value = null
  await nextTick()
  focusBox(0)
}

async function completeSession() {
  try {
    const result = await request<any>(`/sessions/${sessionId.value}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
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
  const revealCount = Math.min(hintsUsed.value, word.length)
  for (let i = 0; i < revealCount; i++) {
    letterInputs.value[i] = word[i]
  }
  focusBox(Math.min(revealCount, word.length - 1))
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
          Read the sentence and type the missing word into the blank boxes. Context helps reinforce meaning!
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
    <div v-else-if="phase === 'playing'" class="max-w-2xl mx-auto">
      <ProgressBar :current="progress.current" :total="progress.total" class="mb-6" />

      <div v-if="currentQuestion" class="card">
        <!-- Level & hint -->
        <div class="flex items-center justify-between mb-4">
          <LevelBadge :level="currentQuestion.cefrLevel" />
          <button
            v-if="!currentResult"
            @click="showHint"
            class="btn btn-secondary text-xs py-1 px-3"
            title="Reveal more letters"
          >
            💡 Hint
          </button>
        </div>

        <!-- Sentence with inline blank boxes -->
        <div class="mb-6 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <p class="text-lg text-slate-800 dark:text-slate-200 leading-loose">
            <span>{{ sentenceParts.before }}</span><!--
            --><span class="inline-flex gap-0.5 mx-1 align-middle">
              <input
                v-for="(_, i) in letterInputs"
                :key="i"
                :ref="el => { if (el) boxRefs[i] = el as HTMLInputElement }"
                :value="letterInputs[i]"
                :disabled="!!currentResult"
                maxlength="1"
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                class="blank-box w-8 h-9 text-center text-base font-mono font-bold rounded border-2 uppercase outline-none transition-all"
                :class="[
                  activeBox === i && !currentResult
                    ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                    : currentResult?.correct
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : currentResult
                        ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : letterInputs[i]
                          ? 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-400'
                ]"
                @focus="activeBox = i"
                @input="onBoxInput($event, i)"
                @keydown="onBoxKeydown($event, i)"
              />
            </span><!--
            --><span>{{ sentenceParts.after }}</span>
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
