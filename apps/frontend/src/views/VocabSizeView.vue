<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { sessionsApi } from '@/lib/api'
import { usePageTitle } from '@/composables/usePageTitle'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

usePageTitle()

interface TestWord {
  id: string
  word: string
  known: boolean
}

interface Band {
  level: string
  estimatedTotal: number
  totalInDb: number
  words: TestWord[]
}

const loading = ref(true)
const error = ref('')
const bands = ref<Band[]>([])
const submitting = ref(false)
const submitted = ref(false)
const result = ref<{ estimatedVocabularySize: number; confidence: string; bands: { band: string; total: number; recognized: number; rate: number }[] } | null>(null)

const totalWords = computed(() => bands.value.reduce((sum, b) => sum + b.words.length, 0))
const totalKnown = computed(() => bands.value.reduce((sum, b) => sum + b.words.filter(w => w.known).length, 0))
const progress = computed(() => totalWords.value > 0 ? Math.round((totalKnown.value / totalWords.value) * 100) : 0)

onMounted(async () => {
  try {
    const data = await sessionsApi.getVocabSizeTest()
    bands.value = data.bands
  } catch (e: any) {
    error.value = e.message || 'Failed to load test words'
  } finally {
    loading.value = false
  }
})

function toggleWord(bandIdx: number, wordIdx: number) {
  const word = bands.value[bandIdx].words[wordIdx]
  word.known = !word.known
}

function toggleAll(bandIdx: number, known: boolean) {
  bands.value[bandIdx].words.forEach(w => w.known = known)
}

async function submitTest() {
  submitting.value = true
  try {
    const responses = bands.value.flatMap(b =>
      b.words.map(w => ({ wordId: w.id, known: w.known }))
    )
    result.value = await sessionsApi.submitVocabSize(responses)
    submitted.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to submit'
  } finally {
    submitting.value = false
  }
}

function resetTest() {
  bands.value.forEach(b => b.words.forEach(w => w.known = false))
  submitted.value = false
  result.value = null
}

const levelColors: Record<string, string> = {
  A1: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  A2: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  B1: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  B2: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  C1: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  C2: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

function formatSize(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

const confidenceLabels: Record<string, string> = {
  high: 'High (40+ words tested)',
  medium: 'Medium (20+ words tested)',
  low: 'Low (fewer than 20 words)',
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
      <router-link to="/stats" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">
        &larr; Back to Statistics
      </router-link>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white mt-2">Vocabulary Size Estimator</h1>
      <p class="text-slate-600 dark:text-slate-400 mt-1">
        Check the words you know to estimate your total English vocabulary size.
        Be honest — only mark words you can define and use in a sentence.
      </p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="card text-center py-8">
      <p class="text-red-500">{{ error }}</p>
      <button @click="$router.go(0)" class="btn btn-primary mt-4">Retry</button>
    </div>

    <!-- Results -->
    <template v-else-if="submitted && result">
      <div class="card text-center mb-6">
        <h2 class="text-lg font-semibold text-slate-500 dark:text-slate-400 mb-2">Estimated Vocabulary Size</h2>
        <div class="text-5xl font-bold text-primary-600 dark:text-primary-400 mb-2">
          ~{{ formatSize(result.estimatedVocabularySize) }}
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400">words</p>
        <div class="mt-3">
          <span class="text-xs px-2 py-1 rounded-full"
            :class="result.confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : result.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'">
            Confidence: {{ confidenceLabels[result.confidence] || result.confidence }}
          </span>
        </div>
      </div>

      <!-- Per-level breakdown -->
      <div class="card mb-6">
        <h3 class="font-semibold text-slate-900 dark:text-white mb-4">Recognition by Level</h3>
        <div class="space-y-3">
          <div v-for="b in result.bands" :key="b.band" class="flex items-center gap-3">
            <span class="text-sm font-medium w-8" :class="levelColors[b.band]?.split(' ').slice(1).join(' ') || ''">{{ b.band }}</span>
            <div class="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-500"
                :class="b.rate >= 80 ? 'bg-green-500' : b.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'"
                :style="{ width: b.rate + '%' }" />
            </div>
            <span class="text-sm text-slate-600 dark:text-slate-400 w-20 text-right">{{ b.rate }}% ({{ b.recognized }}/{{ b.total }})</span>
          </div>
        </div>
      </div>

      <div class="text-center">
        <button @click="resetTest" class="btn btn-secondary">Retake Test</button>
      </div>
    </template>

    <!-- Test form -->
    <template v-else>
      <!-- Progress bar -->
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-slate-600 dark:text-slate-400">Words checked: {{ totalKnown }} / {{ totalWords }}</span>
          <span class="text-sm font-medium text-primary-600 dark:text-primary-400">{{ progress }}%</span>
        </div>
        <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
          <div class="bg-primary-500 h-2 rounded-full transition-all duration-300" :style="{ width: progress + '%' }" />
        </div>
      </div>

      <!-- Word bands -->
      <div v-for="(band, bandIdx) in bands" :key="band.level" class="card mb-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium px-2 py-1 rounded" :class="levelColors[band.level]">{{ band.level }}</span>
            <span class="text-sm text-slate-600 dark:text-slate-400">{{ band.totalInDb.toLocaleString() }} words in database</span>
          </div>
          <div class="flex gap-2">
            <button @click="toggleAll(bandIdx, true)" class="text-xs text-primary-600 dark:text-primary-400 hover:underline">Select All</button>
            <button @click="toggleAll(bandIdx, false)" class="text-xs text-slate-400 hover:underline">Clear</button>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(word, wordIdx) in band.words"
            :key="word.id"
            @click="toggleWord(bandIdx, wordIdx)"
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            :class="word.known
              ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'"
          >
            {{ word.word }}
          </button>
        </div>
      </div>

      <!-- Submit -->
      <div class="text-center mt-6">
        <button @click="submitTest" :disabled="submitting" class="btn btn-primary px-8">
          {{ submitting ? 'Estimating...' : 'Estimate My Vocabulary Size' }}
        </button>
      </div>
    </template>
  </div>
</template>
