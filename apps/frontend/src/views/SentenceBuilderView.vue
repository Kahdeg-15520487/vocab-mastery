<script setup lang="ts">
import { ref, computed } from 'vue'
import { request } from '@/lib/api'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'


// State
const phase = ref<'setup' | 'playing' | 'results'>('setup')
const loading = ref(false)
const sentences = ref<Array<{
  wordId: string
  word: string
  sentence: string
  scrambled: string[]
  cefrLevel: string
}>>([])
const currentIndex = ref(0)
const userAnswer = ref<string[]>([])
const results = ref<Array<{ correct: boolean; sentence: string; userAnswer: string }>>([])
const confettiActive = ref(false)

// Settings
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium')
const sentenceCount = 5

const difficultyLevels: Record<string, string[]> = {
  easy: ['A1', 'A2'],
  medium: ['A1', 'A2', 'B1', 'B2'],
  hard: ['B1', 'B2', 'C1', 'C2'],
}

function scrambleWords(sentence: string): string[] {
  const words = sentence.split(/\s+/).filter(w => w.length > 0)
  // Fisher-Yates shuffle
  const shuffled = [...words]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  // Ensure it's actually scrambled
  if (shuffled.join(' ') === words.join(' ')) {
    return [...shuffled].reverse()
  }
  return shuffled
}

async function startGame() {
  loading.value = true
  try {
    const levels = difficultyLevels[difficulty.value]
    const levelParam = levels.map(l => `level=${l}`).join('&')
    const data = await request<{ words: any[] }>(`/words?limit=${sentenceCount * 3}&${levelParam}`)

    // Pick words that have example sentences
    const wordsWithSentences = (data.words || []).filter(w =>
      w.examples && Array.isArray(w.examples) && w.examples.length > 0
    ).slice(0, sentenceCount)

    if (wordsWithSentences.length === 0) {
      return
    }

    sentences.value = wordsWithSentences.map(w => {
      const sentence = (w.examples as string[])[0].replace(/[.!?]+$/, '').trim()
      return {
        wordId: w.id,
        word: w.word,
        sentence,
        scrambled: scrambleWords(sentence),
        cefrLevel: w.cefrLevel,
      }
    })

    currentIndex.value = 0
    userAnswer.value = []
    results.value = []
    phase.value = 'playing'
  } catch {
    // Failed to load
  } finally {
    loading.value = false
  }
}

const currentSentence = computed(() => sentences.value[currentIndex.value])

function addWord(word: string) {
  userAnswer.value.push(word)
}


function removeFromAnswer(index: number) {
  userAnswer.value.splice(index, 1)
}

function getAvailableWords(): string[] {
  const used = [...userAnswer.value]
  const available: string[] = []
  const scrambled = [...currentSentence.value.scrambled]
  
  for (const word of scrambled) {
    const usedIdx = used.indexOf(word)
    if (usedIdx >= 0) {
      used.splice(usedIdx, 1)
    } else {
      available.push(word)
    }
  }
  return available
}

function submitAnswer() {
  if (!currentSentence.value) return
  
  const correct = userAnswer.value.join(' ').toLowerCase().trim() ===
    currentSentence.value.sentence.toLowerCase().trim()
  
  results.value.push({
    correct,
    sentence: currentSentence.value.sentence,
    userAnswer: userAnswer.value.join(' '),
  })

  // Next sentence
  if (currentIndex.value < sentences.value.length - 1) {
    currentIndex.value++
    userAnswer.value = []
  } else {
    // Game over
    phase.value = 'results'
    const correctCount = results.value.filter(r => r.correct).length
    if (correctCount >= results.value.length * 0.8) {
      confettiActive.value = true
      setTimeout(() => confettiActive.value = false, 3000)
    }
  }
}

function skipSentence() {
  results.value.push({
    correct: false,
    sentence: currentSentence.value!.sentence,
    userAnswer: '(skipped)',
  })

  if (currentIndex.value < sentences.value.length - 1) {
    currentIndex.value++
    userAnswer.value = []
  } else {
    phase.value = 'results'
  }
}

const correctCount = computed(() => results.value.filter(r => r.correct).length)
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <ConfettiEffect :active="confettiActive" />

    <!-- Setup -->
    <template v-if="phase === 'setup'">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">🔤 Sentence Builder</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Arrange the scrambled words to form a correct sentence.
        </p>
      </div>

      <div class="card max-w-md mx-auto space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Difficulty</label>
          <div class="flex gap-2">
            <button
              v-for="diff in ['easy', 'medium', 'hard']"
              :key="diff"
              @click="difficulty = diff as any"
              class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="difficulty === diff
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              {{ diff === 'easy' ? '🟢 Easy' : diff === 'medium' ? '🟡 Medium' : '🔴 Hard' }}
            </button>
          </div>
        </div>

        <button @click="startGame" :disabled="loading" class="btn btn-primary w-full">
          <LoadingSpinner v-if="loading" class="w-5 h-5" />
          <template v-else>🔤 Start Building</template>
        </button>
      </div>
    </template>

    <!-- Playing -->
    <template v-else-if="phase === 'playing' && currentSentence">
      <!-- Progress -->
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm text-slate-500 dark:text-slate-400">
          {{ currentIndex + 1 }} / {{ sentences.length }}
        </span>
        <div class="flex-1 mx-4 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-indigo-600 transition-all duration-300"
            :style="{ width: `${((currentIndex) / sentences.length) * 100}%` }"
          />
        </div>
        <button @click="skipSentence" class="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          Skip →
        </button>
      </div>

      <!-- Target word -->
      <div class="card bg-indigo-50 dark:bg-indigo-900/20 text-center">
        <p class="text-sm text-indigo-600 dark:text-indigo-400 mb-1">Build a sentence with:</p>
        <p class="text-xl font-bold text-indigo-700 dark:text-indigo-300">{{ currentSentence.word }}</p>
      </div>

      <!-- User's answer area -->
      <div
        class="card min-h-[60px] flex flex-wrap gap-2 p-4"
        :class="userAnswer.length === 0 ? 'border-dashed border-2 border-slate-300 dark:border-slate-600' : ''"
      >
        <template v-if="userAnswer.length === 0">
          <p class="text-sm text-slate-400 w-full text-center">Click words below to build the sentence...</p>
        </template>
        <template v-else>
          <button
            v-for="(word, index) in userAnswer"
            :key="index"
            @click="removeFromAnswer(index)"
            class="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
          >
            {{ word }}
          </button>
        </template>
      </div>

      <!-- Available scrambled words -->
      <div class="flex flex-wrap gap-2 justify-center">
        <button
          v-for="(word, index) in getAvailableWords()"
          :key="index"
          @click="addWord(word)"
          class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          {{ word }}
        </button>
      </div>

      <!-- Submit -->
      <div class="flex justify-center gap-3">
        <button
          @click="userAnswer = []"
          class="btn btn-secondary"
        >
          🗑️ Clear
        </button>
        <button
          @click="submitAnswer"
          :disabled="userAnswer.length === 0"
          class="btn btn-primary"
        >
          ✅ Submit
        </button>
      </div>
    </template>

    <!-- Results -->
    <template v-else-if="phase === 'results'">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">
          {{ correctCount >= results.length * 0.8 ? '🏆' : correctCount >= results.length * 0.5 ? '🎉' : '💪' }}
        </div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {{ correctCount >= results.length * 0.8 ? 'Excellent!' : correctCount >= results.length * 0.5 ? 'Good Job!' : 'Keep Practicing!' }}
        </h2>
        <p class="text-slate-600 dark:text-slate-400 mb-6">
          {{ correctCount }} out of {{ results.length }} sentences correct
        </p>

        <!-- Sentence review -->
        <div class="card text-left space-y-3 max-w-lg mx-auto mb-6">
          <div
            v-for="(r, i) in results"
            :key="i"
            class="p-3 rounded-lg"
            :class="r.correct ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'"
          >
            <div class="flex items-center gap-2 mb-1">
              <span>{{ r.correct ? '✅' : '❌' }}</span>
              <span class="text-sm font-medium" :class="r.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'">
                {{ r.correct ? 'Correct' : 'Incorrect' }}
              </span>
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              <strong>Correct:</strong> {{ r.sentence }}
            </p>
            <p v-if="!r.correct" class="text-sm text-red-600 dark:text-red-400">
              <strong>Your answer:</strong> {{ r.userAnswer }}
            </p>
          </div>
        </div>

        <div class="flex gap-3 justify-center">
          <button @click="startGame" class="btn btn-primary">🔄 Play Again</button>
          <button @click="phase = 'setup'" class="btn btn-secondary">⚙️ Settings</button>
        </div>
      </div>
    </template>
  </div>
</template>
