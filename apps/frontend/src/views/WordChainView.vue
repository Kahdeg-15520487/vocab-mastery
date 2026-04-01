<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { wordsApi } from '@/lib/api'
import { useProgressStore } from '@/stores/progress'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'

const progressStore = useProgressStore()

type Phase = 'loading' | 'playing' | 'gameover'
const phase = ref<Phase>('loading')
const currentWord = ref('')
const currentDefinition = ref('')
const currentLevel = ref('')
const userInput = ref('')
const chainLength = ref(0)
const totalXp = ref(0)
const chain = ref<Array<{ word: string; valid: boolean; definition?: string }>>([])
const feedback = ref<{ type: 'success' | 'error'; message: string; xp?: number } | null>(null)
const showConfetti = ref(false)
const skipped = ref(0)
const maxSkips = 3
const error = ref('')
const startTime = ref(0)

onMounted(async () => {
  try {
    const res = await wordsApi.chainStart()
    currentWord.value = res.word
    currentDefinition.value = res.definition
    currentLevel.value = res.cefrLevel
    chain.value = [{ word: res.word, valid: true }]
    phase.value = 'playing'
    startTime.value = Date.now()
  } catch (e: any) {
    error.value = e.message || 'Failed to start game'
    phase.value = 'playing'
  }
})

const requiredLetter = computed(() => {
  if (!currentWord.value) return ''
  return currentWord.value[currentWord.value.length - 1].toUpperCase()
})

const skipAvailable = computed(() => skipped.value < maxSkips)

async function submitWord() {
  if (!userInput.value.trim()) return

  const word = userInput.value.trim().toLowerCase()
  userInput.value = ''

  // Don't allow repeating words in the chain
  if (chain.value.some(c => c.word.toLowerCase() === word)) {
    feedback.value = { type: 'error', message: `"${word}" was already used in this chain!` }
    return
  }

  try {
    const res = await wordsApi.chainValidate(currentWord.value, word, chainLength.value)

    if (res.valid) {
      chainLength.value = res.chainLength!
      totalXp.value += res.xpEarned || 0
      chain.value.push({ word: res.word!, valid: true, definition: res.definition })
      currentWord.value = res.word!
      currentDefinition.value = res.definition || ''
      currentLevel.value = res.cefrLevel || ''
      feedback.value = { type: 'success', message: `+${res.xpEarned} XP`, xp: res.xpEarned }

      if (chainLength.value >= 10) {
        showConfetti.value = true
        setTimeout(() => showConfetti.value = false, 3000)
      }
    } else {
      chain.value.push({ word, valid: false })
      feedback.value = { type: 'error', message: res.reason || 'Invalid word' }

      // Game over after 3 invalid attempts (tracked by invalid chain entries)
      const invalidCount = chain.value.filter(c => !c.valid).length
      if (invalidCount >= 3) {
        endGame()
        return
      }
    }
  } catch {
    feedback.value = { type: 'error', message: 'Something went wrong' }
  }
}

async function skipWord() {
  if (!skipAvailable.value) return
  skipped.value++

  try {
    const res = await wordsApi.chainStart()
    currentWord.value = res.word
    currentDefinition.value = res.definition
    currentLevel.value = res.cefrLevel
    feedback.value = null
  } catch {
    // Ignore
  }
}

function endGame() {
  phase.value = 'gameover'
  progressStore.fetchDashboard()
}

function playAgain() {
  window.location.href = '/word-chain'
}

const duration = computed(() => {
  if (!startTime.value) return '0:00'
  const elapsed = Math.floor((Date.now() - startTime.value) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <ConfettiEffect v-if="showConfetti" />

    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xl">🔗</div>
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Word Chain</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">Connect words by their last letter</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="phase === 'loading'" class="card text-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-slate-500 dark:text-slate-400">Starting game...</p>
    </div>

    <!-- Playing -->
    <div v-else-if="phase === 'playing'" class="space-y-4">
      <!-- Stats bar -->
      <div class="grid grid-cols-4 gap-2">
        <div class="card text-center py-2 px-1">
          <div class="text-lg font-bold text-purple-600 dark:text-purple-400">{{ chainLength }}</div>
          <div class="text-xs text-slate-500">Chain</div>
        </div>
        <div class="card text-center py-2 px-1">
          <div class="text-lg font-bold text-amber-600 dark:text-amber-400">+{{ totalXp }}</div>
          <div class="text-xs text-slate-500">XP</div>
        </div>
        <div class="card text-center py-2 px-1">
          <div class="text-lg font-bold text-slate-600 dark:text-slate-400">{{ duration }}</div>
          <div class="text-xs text-slate-500">Time</div>
        </div>
        <div class="card text-center py-2 px-1">
          <div class="text-lg font-bold" :class="skipAvailable ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'">
            {{ maxSkips - skipped }}
          </div>
          <div class="text-xs text-slate-500">Skips</div>
        </div>
      </div>

      <!-- Current word card -->
      <div class="card bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-purple-200 dark:border-purple-800">
        <div class="text-center">
          <div class="text-xs text-slate-500 dark:text-slate-400 mb-1">Current word</div>
          <div class="text-4xl font-bold text-purple-700 dark:text-purple-300 mb-2">{{ currentWord }}</div>
          <div class="flex items-center justify-center gap-2 mb-2">
            <LevelBadge v-if="currentLevel" :level="currentLevel" />
          </div>
          <p class="text-sm text-slate-600 dark:text-slate-400 italic">{{ currentDefinition }}</p>
        </div>
      </div>

      <!-- Required letter prompt -->
      <div class="text-center">
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-2">
          Type a word starting with
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-600 text-white font-bold text-lg mx-1">
            {{ requiredLetter }}
          </span>
        </p>
      </div>

      <!-- Input -->
      <div class="flex gap-2">
        <input
          v-model="userInput"
          @keyup.enter="submitWord"
          placeholder="Type your word..."
          class="flex-1 px-4 py-3 rounded-xl border-2 border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-lg font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder:text-slate-400"
          autocomplete="off"
          spellcheck="false"
          autofocus
        />
        <button @click="submitWord" :disabled="!userInput.trim()" class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold disabled:opacity-50 transition-colors">
          Go
        </button>
      </div>

      <!-- Action buttons -->
      <div class="flex justify-between items-center">
        <button @click="skipWord" :disabled="!skipAvailable" class="text-sm text-blue-500 hover:text-blue-600 disabled:text-slate-300 dark:disabled:text-slate-600 transition-colors">
          Skip ({{ maxSkips - skipped }} left)
        </button>
        <button @click="endGame" class="text-sm text-slate-500 hover:text-slate-600 transition-colors">
          End Game
        </button>
      </div>

      <!-- Feedback -->
      <div v-if="feedback" class="p-3 rounded-xl transition-all" :class="feedback.type === 'success' ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'">
        <div class="flex items-center gap-2">
          <span class="text-lg">{{ feedback.type === 'success' ? '✅' : '❌' }}</span>
          <span class="font-medium" :class="feedback.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
            {{ feedback.message }}
          </span>
        </div>
      </div>

      <!-- Chain history -->
      <div v-if="chain.length > 1" class="card">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Chain History</h3>
        <div class="flex flex-wrap gap-1">
          <template v-for="(item, idx) in chain" :key="idx">
            <span
              class="inline-block px-2 py-1 rounded-lg text-sm font-medium"
              :class="item.valid
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                : 'bg-red-100 dark:bg-red-900/30 text-red-500 line-through'"
            >
              {{ item.word }}
            </span>
            <span v-if="idx < chain.length - 1" class="text-slate-300 dark:text-slate-600 flex items-center">→</span>
          </template>
        </div>
      </div>

      <!-- Invalid count -->
      <div v-if="chain.filter(c => !c.valid).length > 0" class="text-center text-xs text-slate-400">
        {{ chain.filter(c => !c.valid).length }}/3 mistakes — 3 and it's game over!
      </div>
    </div>

    <!-- Game Over -->
    <div v-else-if="phase === 'gameover'" class="card">
      <div class="text-center py-6">
        <div class="text-5xl mb-4">🔗</div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Game Over!</h2>

        <div class="grid grid-cols-3 gap-4 max-w-xs mx-auto mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">{{ chainLength }}</div>
            <div class="text-xs text-slate-500">Chain Length</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-amber-600">+{{ totalXp }}</div>
            <div class="text-xs text-slate-500">XP Earned</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ chain.filter(c => c.valid).length }}</div>
            <div class="text-xs text-slate-500">Valid Words</div>
          </div>
        </div>

        <!-- Final chain -->
        <div v-if="chain.length > 0" class="mb-6">
          <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Your Chain</h3>
          <div class="flex flex-wrap gap-1 justify-center">
            <template v-for="(item, idx) in chain" :key="idx">
              <span
                class="inline-block px-2 py-1 rounded-lg text-sm font-medium"
                :class="item.valid
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-500 line-through'"
              >
                {{ item.word }}
              </span>
              <span v-if="idx < chain.length - 1" class="text-slate-300 dark:text-slate-600 flex items-center">→</span>
            </template>
          </div>
        </div>

        <div class="flex gap-3 justify-center">
          <button @click="$router.push('/')" class="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">
            Dashboard
          </button>
          <button @click="playAgain" class="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors">
            Play Again
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="text-red-500 text-sm mt-4">{{ error }}</p>
  </div>
</template>
