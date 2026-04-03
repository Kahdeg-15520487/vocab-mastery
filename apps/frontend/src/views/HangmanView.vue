<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { wordsApi } from '@/lib/api'
import { usePageTitle } from '@/composables/usePageTitle'
import { useToast } from '@/composables/useToast'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'

usePageTitle()
const toast = useToast()

type Phase = 'setup' | 'loading' | 'playing' | 'won' | 'lost'
const phase = ref<Phase>('setup')
const word = ref('')
const definition = ref('')
const cefrLevel = ref('')
const examples = ref<string[]>([])
const phonetic = ref('')
const guessedLetters = ref<Set<string>>(new Set())
const wrongGuesses = ref(0)
const maxWrong = 6
const totalXp = ref(0)
const wordsWon = ref(0)
const wordsPlayed = ref(0)
const showConfetti = ref(false)
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium')
const error = ref('')

// Hangman ASCII art
const hangmanParts = computed(() => {
  const lines = [
    '  +---+',
    '  |   |',
    `  ${wrongGuesses.value >= 1 ? 'O' : ' '}   |`,
    ` ${wrongGuesses.value >= 4 ? '/' : ' '}${wrongGuesses.value >= 2 ? '|' : ' '}${wrongGuesses.value >= 5 ? '\\' : ' '}  |`,
    ` ${wrongGuesses.value >= 3 ? '/' : ' '} ${wrongGuesses.value >= 6 ? '\\' : ' '}  |`,
    '      |',
    '========='
  ]
  return lines.join('\n')
})

const maskedWord = computed(() => {
  return word.value.split('').map(ch => {
    if (ch === ' ' || ch === '-' || ch === "'") return ch
    return guessedLetters.value.has(ch.toLowerCase()) ? ch : '_'
  }).join(' ')
})

const keyboardRows = [
  'qwertyuiop'.split(''),
  'asdfghjkl'.split(''),
  'zxcvbnm'.split('')
]

function getHintCount() {
  if (difficulty.value === 'easy') return 3
  if (difficulty.value === 'medium') return 1
  return 0
}

async function startGame() {
  phase.value = 'loading'
  error.value = ''

  try {
    // Fetch a random word via chain-start (gives random word)
    const res = await wordsApi.chainStart()
    word.value = res.word
    definition.value = res.definition || ''
    cefrLevel.value = res.cefrLevel || ''
    examples.value = []
    phonetic.value = ''

    // For easy mode, give some free letters
    guessedLetters.value = new Set()
    wrongGuesses.value = 0

    if (difficulty.value === 'easy') {
      // Reveal up to 2 letters
      const letters = word.value.toLowerCase().replace(/[^a-z]/g, '').split('')
      const revealed = new Set<string>()
      for (let i = 0; i < Math.min(2, new Set(letters).size); i++) {
        const unrevealed = [...new Set(letters)].filter(l => !revealed.has(l))
        if (unrevealed.length === 0) break
        const pick = unrevealed[Math.floor(Math.random() * unrevealed.length)]
        revealed.add(pick)
        guessedLetters.value.add(pick)
      }
    }

    phase.value = 'playing'
  } catch (e: any) {
    error.value = e.message || 'Failed to start game'
    phase.value = 'setup'
  }
}

function guessLetter(letter: string) {
  if (phase.value !== 'playing' || guessedLetters.value.has(letter)) return

  guessedLetters.value = new Set([...guessedLetters.value, letter])

  if (!word.value.toLowerCase().includes(letter)) {
    wrongGuesses.value++
  }

  // Check win
  const allRevealed = word.value.toLowerCase().replace(/[^a-z]/g, '').split('').every(ch => guessedLetters.value.has(ch))
  if (allRevealed) {
    phase.value = 'won'
    const xpEarned = difficulty.value === 'hard' ? 15 : difficulty.value === 'medium' ? 10 : 5
    const bonus = maxWrong - wrongGuesses.value > 3 ? 5 : 0
    totalXp.value += xpEarned + bonus
    wordsWon.value++
    wordsPlayed.value++
    if (bonus > 0) {
      toast.success(`+${xpEarned + bonus} XP (includes perfect bonus!)`)
    } else {
      toast.success(`+${xpEarned + bonus} XP`)
    }
    if (wordsWon.value % 3 === 0) {
      showConfetti.value = true
      setTimeout(() => showConfetti.value = false, 3000)
    }
  }

  // Check lose
  if (wrongGuesses.value >= maxWrong) {
    phase.value = 'lost'
    wordsPlayed.value++
    // Reveal all letters
    word.value.toLowerCase().replace(/[^a-z]/g, '').split('').forEach(ch => {
      guessedLetters.value = new Set([...guessedLetters.value, ch])
    })
  }
}

function useHint() {
  if (phase.value !== 'playing') return
  const unrevealed = word.value.toLowerCase().replace(/[^a-z]/g, '').split('').filter(ch => !guessedLetters.value.has(ch))
  if (unrevealed.length === 0) return
  const letter = unrevealed[Math.floor(Math.random() * unrevealed.length)]
  guessLetter(letter)
}

function nextWord() {
  startGame()
}

function resetGame() {
  phase.value = 'setup'
  totalXp.value = 0
  wordsWon.value = 0
  wordsPlayed.value = 0
  word.value = ''
  definition.value = ''
  guessedLetters.value = new Set()
  wrongGuesses.value = 0
}

// Keyboard input
function handleKeydown(e: KeyboardEvent) {
  if (phase.value !== 'playing') return
  const key = e.key.toLowerCase()
  if (/^[a-z]$/.test(key)) {
    guessLetter(key)
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-6">
    <!-- Setup -->
    <div v-if="phase === 'setup'" class="card text-center py-12">
      <div class="text-5xl mb-4">🎯</div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Hangman</h1>
      <p class="text-slate-600 dark:text-slate-400 mb-8">Guess the word letter by letter. 6 wrong guesses and it's game over!</p>

      <div class="max-w-xs mx-auto space-y-4 mb-8">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Difficulty</label>
          <div class="flex gap-2 justify-center">
            <button
              v-for="d in ['easy', 'medium', 'hard']"
              :key="d"
              @click="difficulty = d as any"
              :class="difficulty === d ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
              class="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors"
            >
              {{ d }}
            </button>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            {{ difficulty === 'easy' ? '2 free letters + hints' : difficulty === 'medium' ? '1 free hint' : 'No hints' }}
          </p>
        </div>
      </div>

      <button @click="startGame" class="btn btn-primary text-lg px-8 py-3">
        🎯 Start Game
      </button>
    </div>

    <!-- Loading -->
    <div v-else-if="phase === 'loading'" class="card text-center py-12">
      <div class="text-4xl animate-bounce mb-4">🎯</div>
      <p class="text-slate-600 dark:text-slate-400">Loading word...</p>
    </div>

    <!-- Playing / Won / Lost -->
    <div v-else>
      <!-- Score bar -->
      <div class="flex items-center justify-between mb-4 px-1">
        <div class="flex items-center gap-4 text-sm">
          <span class="text-emerald-600 dark:text-emerald-400 font-medium">✅ {{ wordsWon }}</span>
          <span class="text-red-500 font-medium">❌ {{ wordsPlayed - wordsWon }}</span>
          <span class="text-amber-500 font-medium">⭐ {{ totalXp }} XP</span>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="difficulty !== 'hard' && phase === 'playing'" class="text-xs text-slate-400">
            💡 {{ getHintCount() }} hint{{ getHintCount() !== 1 ? 's' : '' }}
          </span>
          <button @click="resetGame" class="text-xs text-slate-400 hover:text-slate-600">End Game</button>
        </div>
      </div>

      <!-- Hangman drawing -->
      <div class="card mb-4">
        <pre class="text-center font-mono text-lg text-slate-700 dark:text-slate-300 select-none leading-tight">{{ hangmanParts }}</pre>
      </div>

      <!-- Word display -->
      <div class="card mb-4 text-center">
        <div class="text-3xl font-mono font-bold tracking-wider text-slate-900 dark:text-white mb-3">
          {{ maskedWord }}
        </div>
        <div v-if="cefrLevel" class="flex items-center justify-center gap-2 mb-2">
          <LevelBadge :level="cefrLevel" />
          <span v-if="phonetic" class="text-sm text-slate-500">/{{ phonetic }}/</span>
        </div>

        <!-- Hint button -->
        <button
          v-if="phase === 'playing' && difficulty !== 'hard'"
          @click="useHint"
          class="mt-3 text-sm text-primary-500 hover:text-primary-600 transition-colors"
        >
          💡 Reveal a letter
        </button>
      </div>

      <!-- Definition hint (after 2 wrong) -->
      <div v-if="wrongGuesses >= 2 && phase === 'playing' && definition" class="card mb-4">
        <p class="text-sm text-slate-600 dark:text-slate-400 italic">💡 Hint: {{ definition }}</p>
      </div>

      <!-- On-screen keyboard -->
      <div v-if="phase === 'playing'" class="card">
        <div class="space-y-2">
          <div v-for="row in keyboardRows" :key="row[0]" class="flex justify-center gap-1">
            <button
              v-for="letter in row"
              :key="letter"
              @click="guessLetter(letter)"
              :disabled="guessedLetters.has(letter)"
              :class="[
                guessedLetters.has(letter)
                  ? word.toLowerCase().includes(letter)
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-300'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-400 border-red-300'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-primary-50 dark:hover:bg-primary-900/20'
              ]"
              class="w-9 h-10 rounded-lg border text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              {{ letter.toUpperCase() }}
            </button>
          </div>
        </div>
        <p class="text-center text-xs text-slate-400 mt-3">Type letters on your keyboard or click above</p>
      </div>

      <!-- Won -->
      <div v-if="phase === 'won'" class="card text-center py-6">
        <div class="text-4xl mb-2">🎉</div>
        <h2 class="text-xl font-bold text-emerald-600 dark:text-emerald-400 mb-2">Correct!</h2>
        <p class="text-slate-600 dark:text-slate-400 mb-1">
          <strong>{{ word }}</strong> — {{ definition }}
        </p>
        <div v-if="examples.length" class="mt-2 text-sm text-slate-500 italic">
          {{ examples[0] }}
        </div>
        <div class="flex gap-3 justify-center mt-4">
          <button @click="nextWord" class="btn btn-primary">Next Word →</button>
          <button @click="resetGame" class="btn btn-secondary">End Game</button>
        </div>
      </div>

      <!-- Lost -->
      <div v-if="phase === 'lost'" class="card text-center py-6">
        <div class="text-4xl mb-2">😵</div>
        <h2 class="text-xl font-bold text-red-500 mb-2">Game Over!</h2>
        <p class="text-slate-600 dark:text-slate-400 mb-1">
          The word was: <strong>{{ word }}</strong>
        </p>
        <p class="text-sm text-slate-500">{{ definition }}</p>
        <div v-if="examples.length" class="mt-2 text-sm text-slate-500 italic">
          {{ examples[0] }}
        </div>
        <div class="flex gap-3 justify-center mt-4">
          <button @click="nextWord" class="btn btn-primary">Try Again</button>
          <button @click="resetGame" class="btn btn-secondary">End Game</button>
        </div>
      </div>
    </div>

    <ConfettiEffect v-if="showConfetti" />
  </div>
</template>
