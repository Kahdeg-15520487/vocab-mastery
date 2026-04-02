<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { request } from '@/lib/api'
import { useSpeech } from '@/composables/useSpeech'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'

const { playAudio } = useSpeech()

type CardType = 'word' | 'definition'
type CardState = 'hidden' | 'revealed' | 'matched'

interface Card {
  id: string
  pairId: string
  type: CardType
  text: string
  state: CardState
  cefrLevel?: string
  word?: string
}

// Game state
const phase = ref<'setup' | 'playing' | 'results'>('setup')
const cards = ref<Card[]>([])
const loading = ref(false)
const flippedCards = ref<number[]>([])
const matchedPairs = ref(0)
const totalPairs = ref(0)
const moves = ref(0)
const startTime = ref(0)
const elapsedTime = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
const confettiActive = ref(false)

// Settings
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium')
const cefrLevel = ref('mixed')

const pairCounts = { easy: 4, medium: 6, hard: 8 }

async function startGame() {
  loading.value = true
  try {
    const levelParam = cefrLevel.value === 'mixed' ? '' : `&level=${cefrLevel.value}`
    const data = await request<{ words: any[] }>(`/words?limit=${pairCounts[difficulty.value]}${levelParam}`)

    if (!data.words?.length) return

    const gameCards: Card[] = []
    data.words.forEach((w: any) => {
      const pairId = w.id
      // Word card
      gameCards.push({
        id: `word-${w.id}`,
        pairId,
        type: 'word',
        text: w.word,
        state: 'hidden',
        cefrLevel: w.cefrLevel,
        word: w.word,
      })
      // Definition card
      gameCards.push({
        id: `def-${w.id}`,
        pairId,
        type: 'definition',
        text: w.definition || '',
        state: 'hidden',
        cefrLevel: w.cefrLevel,
        word: w.word,
      })
    })

    // Shuffle cards
    for (let i = gameCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [gameCards[i], gameCards[j]] = [gameCards[j], gameCards[i]]
    }

    cards.value = gameCards
    totalPairs.value = data.words.length
    matchedPairs.value = 0
    moves.value = 0
    flippedCards.value = []
    startTime.value = Date.now()
    elapsedTime.value = 0

    // Start timer
    if (timer) { clearInterval(timer); timer = null }
    timer = setInterval(() => {
      elapsedTime.value = Math.floor((Date.now() - startTime.value) / 1000)
    }, 1000)

    phase.value = 'playing'
  } catch {
    // Failed to load words
  } finally {
    loading.value = false
  }
}

function flipCard(index: number) {
  if (phase.value !== 'playing') return
  if (cards.value[index].state !== 'hidden') return
  if (flippedCards.value.length >= 2) return
  if (flippedCards.value.includes(index)) return

  cards.value[index].state = 'revealed'
  flippedCards.value.push(index)

  // Play pronunciation when revealing a word card
  if (cards.value[index].type === 'word' && cards.value[index].word) {
    playAudio(cards.value[index].word!, undefined, 'us')
  }

  if (flippedCards.value.length === 2) {
    moves.value++
    const [first, second] = flippedCards.value
    const card1 = cards.value[first]
    const card2 = cards.value[second]

    if (card1.pairId === card2.pairId && card1.type !== card2.type) {
      // Match found!
      setTimeout(() => {
        cards.value[first].state = 'matched'
        cards.value[second].state = 'matched'
        matchedPairs.value++
        flippedCards.value = []

        // Check win
        if (matchedPairs.value === totalPairs.value) {
          gameWon()
        }
      }, 500)
    } else {
      // No match — flip back
      setTimeout(() => {
        cards.value[first].state = 'hidden'
        cards.value[second].state = 'hidden'
        flippedCards.value = []
      }, 1000)
    }
  }
}

function gameWon() {
  if (timer) clearInterval(timer)
  elapsedTime.value = Math.floor((Date.now() - startTime.value) / 1000)
  confettiActive.value = true
  setTimeout(() => confettiActive.value = false, 3000)
  phase.value = 'results'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const gridCols = computed(() => {
  const total = cards.value.length
  if (total <= 8) return 'grid-cols-4'   // 4 pairs = 8 cards
  if (total <= 12) return 'grid-cols-4'  // 6 pairs = 12 cards
  return 'grid-cols-4 md:grid-cols-4'    // 8 pairs = 16 cards
})

function getCardColor(card: Card): string {
  if (card.state === 'matched') return 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-400 dark:border-emerald-600'
  if (card.state === 'revealed') {
    return card.type === 'word'
      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600'
      : 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600'
  }
  return 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
}

function quitGame() {
  if (timer) { clearInterval(timer); timer = null }
  phase.value = 'setup'
}

onUnmounted(() => {
  if (timer) { clearInterval(timer); timer = null }
})
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <ConfettiEffect :active="confettiActive" />

    <!-- Setup -->
    <template v-if="phase === 'setup'">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">🃏 Word Match</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Match words with their definitions. Flip cards to find pairs!
        </p>
      </div>

      <div class="card max-w-md mx-auto space-y-4">
        <!-- Difficulty -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Difficulty</label>
          <div class="flex gap-2">
            <button
              v-for="(count, diff) in pairCounts"
              :key="diff"
              @click="difficulty = diff as any"
              class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="difficulty === diff
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              {{ diff === 'easy' ? '🟢 Easy' : diff === 'medium' ? '🟡 Medium' : '🔴 Hard' }}
              <span class="text-xs opacity-75">({{ count }} pairs)</span>
            </button>
          </div>
        </div>

        <!-- CEFR Level -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Word Level</label>
          <div class="flex flex-wrap gap-2">
            <button
              @click="cefrLevel = 'mixed'"
              class="py-1.5 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="cefrLevel === 'mixed'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              Mixed
            </button>
            <button
              v-for="level in ['A1', 'A2', 'B1', 'B2']"
              :key="level"
              @click="cefrLevel = level"
              class="py-1.5 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="cefrLevel === level
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              {{ level }}
            </button>
          </div>
        </div>

        <button
          @click="startGame"
          :disabled="loading"
          class="btn btn-primary w-full"
        >
          <template v-if="loading">
            <LoadingSpinner class="w-5 h-5" />
          </template>
          <template v-else>
            🎴 Start Game
          </template>
        </button>
      </div>
    </template>

    <!-- Playing -->
    <template v-else-if="phase === 'playing'">
      <!-- Stats bar -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-4 text-sm">
          <span class="text-slate-600 dark:text-slate-400">
            ⏱ {{ formatTime(elapsedTime) }}
          </span>
          <span class="text-slate-600 dark:text-slate-400">
            👆 {{ moves }} moves
          </span>
          <span class="text-slate-600 dark:text-slate-400">
            ✅ {{ matchedPairs }}/{{ totalPairs }}
          </span>
        </div>
        <button
          @click="quitGame"
          class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          ✕ Quit
        </button>
      </div>

      <!-- Card grid -->
      <div :class="gridCols" class="grid gap-3">
        <div
          v-for="(card, index) in cards"
          :key="card.id"
          @click="flipCard(index)"
          class="aspect-square rounded-xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-center p-2"
          :class="[
            getCardColor(card),
            card.state === 'hidden' ? 'hover:scale-105' : '',
            card.state === 'matched' ? 'scale-95 opacity-70' : '',
          ]"
        >
          <!-- Hidden card -->
          <template v-if="card.state === 'hidden'">
            <div class="text-3xl text-slate-400 dark:text-slate-500">?</div>
          </template>

          <!-- Revealed/Matched word card -->
          <template v-else-if="card.type === 'word'">
            <div class="text-center">
              <div class="font-bold text-slate-900 dark:text-white text-sm">{{ card.text }}</div>
              <LevelBadge v-if="card.cefrLevel" :level="card.cefrLevel" class="mt-1 text-xs" />
            </div>
          </template>

          <!-- Revealed/Matched definition card -->
          <template v-else>
            <div class="text-xs text-slate-700 dark:text-slate-300 text-center leading-tight line-clamp-4">
              {{ card.text }}
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Results -->
    <template v-else-if="phase === 'results'">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">
          {{ moves <= totalPairs * 1.5 ? '🏆' : moves <= totalPairs * 2 ? '🎉' : '💪' }}
        </div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {{ moves <= totalPairs * 1.5 ? 'Perfect Memory!' : moves <= totalPairs * 2 ? 'Great Job!' : 'Well Done!' }}
        </h2>
        <p class="text-slate-600 dark:text-slate-400 mb-6">
          You matched all {{ totalPairs }} pairs!
        </p>

        <div class="card max-w-sm mx-auto mb-6">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ totalPairs }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Pairs</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ moves }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Moves</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ formatTime(elapsedTime) }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Time</div>
            </div>
          </div>
        </div>

        <div class="flex gap-3 justify-center">
          <button @click="startGame" class="btn btn-primary">🔄 Play Again</button>
          <button @click="phase = 'setup'" class="btn btn-secondary">⚙️ Change Settings</button>
        </div>
      </div>
    </template>
  </div>
</template>
