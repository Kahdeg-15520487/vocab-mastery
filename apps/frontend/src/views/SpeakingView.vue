<template>
  <div class="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">🎙️ Speaking Practice</h1>
      <router-link to="/browse" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
        Browse words →
      </router-link>
    </div>

    <!-- Setup phase -->
    <div v-if="phase === 'setup'" class="card space-y-6">
      <div class="text-center py-4">
        <div class="text-5xl mb-3">🗣️</div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Practice Your Pronunciation</h2>
        <p class="text-gray-500 dark:text-gray-400 mt-2">
          Listen to the word, then speak it aloud. Get instant feedback on your pronunciation.
        </p>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of Words</label>
          <select v-model="settings.count" class="input-field">
            <option :value="5">5 words</option>
            <option :value="10">10 words</option>
            <option :value="15">15 words</option>
            <option :value="20">20 words</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Difficulty</label>
          <select v-model="settings.difficulty" class="input-field">
            <option value="easy">Easy (common words)</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard (rare words)</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Accent</label>
          <select v-model="settings.accent" class="input-field">
            <option value="us">🇺🇸 American</option>
            <option value="uk">🇬🇧 British</option>
          </select>
        </div>
      </div>

      <div v-if="!speechSupported" class="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-4">
        <p class="text-sm text-amber-700 dark:text-amber-300">
          ⚠️ Your browser doesn't support the Web Speech API. You can still listen to audio and practice manually.
        </p>
      </div>

      <button @click="startPractice" class="btn-primary w-full" :disabled="loading">
        {{ loading ? 'Loading...' : '🎤 Start Speaking Practice' }}
      </button>
    </div>

    <!-- Practice phase -->
    <div v-else-if="phase === 'practice'" class="space-y-6">
      <!-- Progress -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-500 dark:text-gray-400">{{ currentIndex + 1 }} / {{ words.length }}</span>
        <div class="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
          <div class="h-2 rounded-full bg-indigo-500 transition-all" :style="{ width: progress + '%' }"></div>
        </div>
      </div>

      <!-- Word card -->
      <div class="card text-center space-y-6 py-8">
        <!-- Listen button -->
        <div>
          <button
            @click="playWord"
            class="w-20 h-20 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mx-auto hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
            :disabled="playing"
          >
            <span v-if="playing" class="text-3xl animate-pulse">🔊</span>
            <span v-else class="text-3xl">▶️</span>
          </button>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Click to listen</p>
        </div>

        <!-- Definition hint -->
        <div class="text-gray-600 dark:text-gray-400 text-sm">
          <span class="font-medium">Definition:</span> {{ currentWord?.definition }}
        </div>

        <!-- Record button -->
        <div>
          <button
            @click="toggleRecording"
            class="w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-all"
            :class="isRecording ? 'bg-red-500 hover:bg-red-600 scale-110' : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'"
          >
            <span class="text-3xl">{{ isRecording ? '⏹️' : '🎤' }}</span>
          </button>
          <p class="text-sm mt-2" :class="isRecording ? 'text-red-500 font-medium' : 'text-gray-500 dark:text-gray-400'">
            {{ isRecording ? 'Listening... speak now!' : 'Click to speak' }}
          </p>
        </div>

        <!-- Speech recognition result -->
        <div v-if="recognized" class="space-y-3">
          <div class="p-4 rounded-xl" :class="isCorrect ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'">
            <p class="text-sm text-gray-500 dark:text-gray-400">You said:</p>
            <p class="text-xl font-bold" :class="isCorrect ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              "{{ recognized }}"
            </p>
          </div>

          <!-- Show the answer if wrong -->
          <div v-if="!isCorrect" class="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <p class="text-sm text-gray-500 dark:text-gray-400">Correct pronunciation:</p>
            <p class="text-xl font-bold text-blue-600 dark:text-blue-400">
              {{ currentWord?.word }}
            </p>
            <p v-if="currentWord?.phonetic" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {{ currentWord.phonetic }}
            </p>
          </div>

          <div class="text-3xl">{{ isCorrect ? '✅' : '❌' }}</div>
        </div>

        <!-- Skip / Next buttons -->
        <div class="flex gap-3">
          <button @click="skipWord" class="btn-secondary flex-1" :disabled="isRecording">
            Skip
          </button>
          <button
            v-if="recognized"
            @click="nextWord"
            class="btn-primary flex-1"
          >
            {{ currentIndex < words.length - 1 ? 'Next Word →' : 'See Results' }}
          </button>
          <button
            v-if="!recognized"
            @click="playWord"
            class="btn-secondary flex-1"
            :disabled="playing"
          >
            🔊 Replay
          </button>
        </div>
      </div>
    </div>

    <!-- Results phase -->
    <div v-else-if="phase === 'results'" class="card space-y-6">
      <div class="text-center py-4">
        <div class="text-5xl mb-3">{{ resultEmoji }}</div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Speaking Practice Complete!</h2>
        <p class="text-gray-500 dark:text-gray-400 mt-1">
          {{ correctCount }} / {{ words.length }} correct
        </p>
      </div>

      <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
        <div
          class="h-3 rounded-full transition-all"
          :class="scorePercent >= 80 ? 'bg-green-500' : scorePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'"
          :style="{ width: scorePercent + '%' }"
        ></div>
      </div>

      <!-- Word results -->
      <div class="space-y-2">
        <div
          v-for="(result, i) in results"
          :key="i"
          class="flex items-center gap-3 p-3 rounded-lg"
          :class="result.correct ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'"
        >
          <span class="text-lg">{{ result.correct ? '✅' : '❌' }}</span>
          <div class="flex-1 min-w-0">
            <span class="font-medium text-gray-900 dark:text-white">{{ result.word }}</span>
            <span v-if="!result.correct && result.recognized" class="text-sm text-gray-500 dark:text-gray-400 ml-2">
              (heard: "{{ result.recognized }}")
            </span>
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <button @click="reset" class="btn-secondary flex-1">Try Again</button>
        <button @click="$router.push('/browse')" class="btn-primary flex-1">Browse Words</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { request } from '@/lib/api'
import { usePageTitle } from '@/composables/usePageTitle'
import { useSpeech } from '@/composables/useSpeech'

usePageTitle()

// Add to page title map
if (!document.title.includes('Speaking')) document.title = 'Speaking Practice · Vocab Master'

const { playAudio: playWordAudio } = useSpeech()

interface WordItem {
  id: string
  word: string
  definition: string
  phonetic?: string
}

interface WordResult {
  word: string
  recognized: string
  correct: boolean
}

const phase = ref<'setup' | 'practice' | 'results'>('setup')
const loading = ref(false)
const words = ref<WordItem[]>([])
const currentIndex = ref(0)
const currentWord = computed(() => words.value[currentIndex.value])
const progress = computed(() => ((currentIndex.value + 1) / words.value.length) * 100)

const settings = ref({
  count: 10,
  difficulty: 'medium',
  accent: 'us',
})

const playing = ref(false)
const isRecording = ref(false)
const recognized = ref<string | null>(null)
const isCorrect = ref(false)
const results = ref<WordResult[]>([])

const correctCount = computed(() => results.value.filter(r => r.correct).length)
const scorePercent = computed(() => words.value.length > 0 ? Math.round((correctCount.value / words.value.length) * 100) : 0)
const resultEmoji = computed(() => scorePercent.value >= 90 ? '🏆' : scorePercent.value >= 70 ? '🎉' : scorePercent.value >= 50 ? '👍' : '💪')

// Speech recognition
const speechSupported = ref(false)
let recognition: any = null

onMounted(() => {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    speechSupported.value = true
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim()
      recognized.value = transcript
      isRecording.value = false

      // Compare — allow minor variations
      const target = currentWord.value?.word.toLowerCase() || ''
      isCorrect.value = checkPronunciation(transcript, target)

      results.value.push({
        word: target,
        recognized: transcript,
        correct: isCorrect.value,
      })
    }

    recognition.onerror = () => {
      isRecording.value = false
      recognized.value = '[not recognized]'
      isCorrect.value = false
      results.value.push({
        word: currentWord.value?.word || '',
        recognized: '[not recognized]',
        correct: false,
      })
    }

    recognition.onend = () => {
      isRecording.value = false
    }
  }
})

onUnmounted(() => {
  if (recognition) {
    recognition.abort()
  }
})

function checkPronunciation(spoken: string, target: string): boolean {
  if (!spoken || !target) return false
  // Exact match
  if (spoken === target) return true
  // Strip punctuation
  const clean = spoken.replace(/[^a-z\s'-]/g, '').trim()
  if (clean === target) return true
  // Check if spoken contains the word
  if (clean.split(/\s+/).includes(target)) return true
  // Levenshtein distance for close matches (allow 1-2 char diff for short words)
  const dist = levenshtein(clean, target)
  const threshold = Math.max(1, Math.floor(target.length * 0.25))
  return dist <= threshold
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
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      )
    }
  }
  return dp[m][n]
}

async function startPractice() {
  loading.value = true
  try {
    const difficultyMap: Record<string, string> = {
      easy: 'A1,A2',
      medium: 'B1,B2',
      hard: 'C1,C2',
    }
    const data = await request<{ words: WordItem[] }>('/sessions/speaking', {
      method: 'POST',
      body: JSON.stringify({
        count: settings.value.count,
        cefrLevels: difficultyMap[settings.value.difficulty],
      }),
    })
    words.value = data.words
    phase.value = 'practice'
  } catch (e: any) {
    // Fallback: use quiz endpoint
    try {
      const data = await request<{ questions: any[] }>('/sessions/quiz', {
        method: 'POST',
        body: JSON.stringify({
          count: settings.value.count,
          difficulty: settings.value.difficulty,
        }),
      })
      words.value = data.questions.map((q: any) => ({
        id: q.id || q.wordId,
        word: q.word,
        definition: q.definition || q.sanitizedDefinition,
        phonetic: q.phonetic,
      }))
      phase.value = 'practice'
    } catch (e2: any) {
      // Final fallback: use browse words
      try {
        const data = await request<{ words: any[] }>('/words?limit=' + settings.value.count)
        words.value = data.words.map((w: any) => ({
          id: w.id,
          word: w.word,
          definition: w.definition,
          phonetic: w.phonetic,
        }))
        phase.value = 'practice'
      } catch (e3: any) {
        // Give up
      }
    }
  } finally {
    loading.value = false
  }
}

async function playWord() {
  if (!currentWord.value || playing.value) return
  playing.value = true
  try {
    await playWordAudio(currentWord.value.word, null, settings.value.accent as 'us' | 'uk')
  } catch {
    // Fallback to TTS
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(currentWord.value.word)
      utterance.lang = settings.value.accent === 'uk' ? 'en-GB' : 'en-US'
      utterance.rate = 0.8
      speechSynthesis.speak(utterance)
    }
  } finally {
    setTimeout(() => { playing.value = false }, 500)
  }
}

function toggleRecording() {
  if (!recognition) {
    // Manual mode — mark as spoken
    recognized.value = currentWord.value?.word || ''
    isCorrect.value = true
    results.value.push({
      word: currentWord.value?.word || '',
      recognized: '(manual)',
      correct: true,
    })
    return
  }

  if (isRecording.value) {
    recognition.stop()
    isRecording.value = false
  } else {
    recognized.value = null
    isCorrect.value = false
    recognition.lang = settings.value.accent === 'uk' ? 'en-GB' : 'en-US'
    recognition.start()
    isRecording.value = true
  }
}

function skipWord() {
  results.value.push({
    word: currentWord.value?.word || '',
    recognized: '(skipped)',
    correct: false,
  })
  nextWord()
}

function nextWord() {
  recognized.value = null
  isCorrect.value = false
  if (currentIndex.value < words.value.length - 1) {
    currentIndex.value++
  } else {
    phase.value = 'results'
  }
}

function reset() {
  phase.value = 'setup'
  words.value = []
  currentIndex.value = 0
  results.value = []
  recognized.value = null
  isCorrect.value = false
}
</script>
