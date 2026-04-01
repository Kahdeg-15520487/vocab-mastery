<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { statsApi } from '@/lib/api'
import { useProgressStore } from '@/stores/progress'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'

const progressStore = useProgressStore()

type Phase = 'loading' | 'ready' | 'playing' | 'results'
const phase = ref<Phase>('loading')
const words = ref<Array<{ id: string; word: string; definition: string; cefr_level: string }>>([])
const currentIdx = ref(0)
const score = ref(0)
const timeLeft = ref(60)
const answers = ref<Array<{ word: string; correct: boolean }>>([])
const showAnswer = ref(false)
const timer = ref<ReturnType<typeof setInterval> | null>(null)
const error = ref('')
const showConfetti = ref(false)
const duration = ref(60)

const currentWord = computed(() => words.value[currentIdx.value])

onMounted(async () => {
  try {
    const res = await statsApi.getSpeedRound()
    words.value = res.words
    phase.value = 'ready'
  } catch (e: any) {
    error.value = e.message || 'Failed to load words'
    phase.value = 'ready'
  }
})

onUnmounted(() => {
  if (timer.value) clearInterval(timer.value)
})

function startRound(seconds: number = 60) {
  duration.value = seconds
  timeLeft.value = seconds
  currentIdx.value = 0
  score.value = 0
  answers.value = []
  showAnswer.value = false
  phase.value = 'playing'

  timer.value = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) {
      clearInterval(timer.value!)
      timer.value = null
      finishRound()
    }
  }, 1000)
}

function markKnown(correct: boolean) {
  if (!currentWord.value) return
  answers.value.push({ word: currentWord.value.word, correct })
  if (correct) score.value++
  showAnswer.value = false

  if (currentIdx.value < words.value.length - 1) {
    currentIdx.value++
  } else {
    finishRound()
  }
}

function finishRound() {
  if (timer.value) {
    clearInterval(timer.value)
    timer.value = null
  }
  phase.value = 'results'
  progressStore.fetchDashboard()

  const accuracy = words.value.length > 0 ? (score.value / answers.value.length) * 100 : 0
  if (accuracy >= 80 || score.value >= 15) {
    showConfetti.value = true
    setTimeout(() => showConfetti.value = false, 3000)
  }
}

const accuracy = computed(() => {
  if (answers.value.length === 0) return 0
  return Math.round((score.value / answers.value.length) * 100)
})

const timePercent = computed(() => (timeLeft.value / duration.value) * 100)

function playAgain() {
  window.location.href = '/speed-round'
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <ConfettiEffect v-if="showConfetti" />

    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-xl">⚡</div>
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Speed Round</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">How many words can you identify in 60 seconds?</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="phase === 'loading'" class="card text-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-slate-500 dark:text-slate-400">Loading words...</p>
    </div>

    <!-- Ready -->
    <div v-else-if="phase === 'ready'" class="card">
      <div class="text-center py-6">
        <div class="text-5xl mb-4">⚡</div>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Speed Round</h2>
        <p class="text-slate-500 dark:text-slate-400 mb-6">
          You'll see {{ words.length }} words. For each word, decide if you know it.
          Be quick — the clock is ticking!
        </p>

        <div class="grid grid-cols-3 gap-4 max-w-xs mx-auto mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-red-600">{{ words.length }}</div>
            <div class="text-xs text-slate-500">Words</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-amber-600">60s</div>
            <div class="text-xs text-slate-500">Default</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">+2</div>
            <div class="text-xs text-slate-500">XP each</div>
          </div>
        </div>

        <div class="flex gap-3 justify-center">
          <button @click="startRound(30)" class="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors hover:bg-slate-300 dark:hover:bg-slate-600">
            30s Sprint
          </button>
          <button @click="startRound(60)" class="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold text-lg transition-colors">
            60s Round
          </button>
          <button @click="startRound(120)" class="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors hover:bg-slate-300 dark:hover:bg-slate-600">
            120s Marathon
          </button>
        </div>
      </div>
    </div>

    <!-- Playing -->
    <div v-else-if="phase === 'playing' && currentWord" class="space-y-4">
      <!-- Timer bar -->
      <div class="flex items-center gap-3">
        <span class="text-sm font-mono font-bold" :class="timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-slate-600 dark:text-slate-400'">
          {{ Math.floor(timeLeft / 60) }}:{{ (timeLeft % 60).toString().padStart(2, '0') }}
        </span>
        <div class="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-3">
          <div class="h-3 rounded-full transition-all duration-1000" :class="timeLeft <= 10 ? 'bg-red-500' : timeLeft <= 30 ? 'bg-amber-500' : 'bg-green-500'" :style="{ width: timePercent + '%' }"></div>
        </div>
        <span class="text-sm font-bold text-green-600">{{ score }}/{{ answers.length }}</span>
      </div>

      <!-- Word card -->
      <div class="card text-center py-8">
        <div class="flex items-center justify-center gap-2 mb-2">
          <LevelBadge v-if="currentWord.cefr_level" :level="currentWord.cefr_level" />
          <span class="text-xs text-slate-400">{{ currentIdx + 1 }} / {{ words.length }}</span>
        </div>
        <h3 class="text-3xl font-bold text-slate-900 dark:text-white mb-3">{{ currentWord.word }}</h3>
        <p v-if="showAnswer" class="text-slate-600 dark:text-slate-400 text-sm mb-4">{{ currentWord.definition }}</p>
        <button v-else @click="showAnswer = true" class="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
          Show definition →
        </button>
      </div>

      <!-- Buttons -->
      <div class="grid grid-cols-2 gap-3">
        <button @click="markKnown(false)" class="py-4 rounded-xl font-semibold text-lg border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
          Don't Know
        </button>
        <button @click="markKnown(true)" class="py-4 rounded-xl font-semibold text-lg border-2 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
          Know It!
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="phase === 'results'" class="card">
      <div class="text-center py-6">
        <div class="text-5xl mb-4">{{ accuracy >= 80 ? '🔥' : accuracy >= 60 ? '⚡' : '💪' }}</div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {{ accuracy >= 80 ? 'Lightning Fast!' : accuracy >= 60 ? 'Great Speed!' : 'Keep Practicing!' }}
        </h2>

        <div class="grid grid-cols-4 gap-3 max-w-sm mx-auto mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ score }}</div>
            <div class="text-xs text-slate-500">Known</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-red-500">{{ answers.length - score }}</div>
            <div class="text-xs text-slate-500">Missed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-amber-600">{{ accuracy }}%</div>
            <div class="text-xs text-slate-500">Accuracy</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">+{{ score * 2 }}</div>
            <div class="text-xs text-slate-500">XP</div>
          </div>
        </div>

        <!-- Answer review -->
        <div class="text-left max-h-60 overflow-y-auto space-y-1 mb-6">
          <div v-for="(a, idx) in answers" :key="idx" class="flex items-center gap-2 p-1.5 rounded text-sm"
            :class="a.correct ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'">
            <span>{{ a.correct ? '✅' : '❌' }}</span>
            <span class="font-medium text-slate-900 dark:text-white">{{ a.word }}</span>
          </div>
        </div>

        <div class="flex gap-3 justify-center">
          <router-link to="/" class="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">
            Dashboard
          </router-link>
          <button @click="playAgain" class="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors">
            Play Again
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="text-red-500 text-sm mt-4">{{ error }}</p>
  </div>
</template>
