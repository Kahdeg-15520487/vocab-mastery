<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request, wordsApi } from '@/lib/api'
import { useSpeech } from '@/composables/useSpeech'
import { useToast } from '@/composables/useToast'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'

const route = useRoute()
const router = useRouter()
const { speak } = useSpeech()
const toast = useToast()

interface WordDetail {
  id: string
  word: string
  phoneticUs: string
  phoneticUk: string
  partOfSpeech: string[]
  definition: string
  examples: string[]
  synonyms: string[]
  antonyms: string[]
  oxfordList: string
  cefrLevel: string
  frequency: number
  favorited: boolean
  themes: Array<{ id: string; name: string; slug: string }>
  progress: {
    status: string
    interval: number
    easeFactor: number
    repetitions: number
    nextReview: string
    lastReview: string | null
    totalReviews: number
    correctReviews: number
  } | null
}

const word = ref<WordDetail | null>(null)
const loading = ref(true)
const error = ref('')

const statusColors: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  learning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  reviewing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  mastered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}

const statusLabels: Record<string, string> = {
  new: 'New',
  learning: 'Learning',
  reviewing: 'Reviewing',
  mastered: 'Mastered',
}

onMounted(async () => {
  try {
    const data = await request<WordDetail>(`/words/${route.params.id}`)
    word.value = data
    document.title = `${data.word} · Vocab Master`
  } catch (e: any) {
    error.value = e.message || 'Word not found'
  } finally {
    loading.value = false
  }
})

async function toggleFavorite() {
  if (!word.value) return
  try {
    const result = await wordsApi.toggleFavorite(word.value.id)
    word.value = { ...word.value, favorited: result.favorited }
    toast.success(result.favorited ? `Added "${word.value.word}" to favorites` : `Removed "${word.value.word}" from favorites`)
  } catch {
    toast.error('Failed to toggle favorite')
  }
}

function getDefinitions(def: string): string[] {
  if (!def) return []
  return def.split('\n\n').filter(Boolean)
}
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-3xl">
    <!-- Loading -->
    <div v-if="loading" class="space-y-6">
      <div class="flex items-start gap-4">
        <div class="flex-1">
          <SkeletonLoader variant="text" width="192px" height="36px" />
          <div class="mt-3"><SkeletonLoader variant="text" width="128px" height="20px" /></div>
          <div class="mt-2"><SkeletonLoader variant="text" width="96px" height="16px" /></div>
        </div>
      </div>
      <SkeletonLoader variant="card" />
      <SkeletonLoader variant="card" />
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <SkeletonLoader variant="card" />
        <SkeletonLoader variant="card" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-20">
      <div class="text-5xl mb-4">😕</div>
      <h1 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Word Not Found</h1>
      <p class="text-slate-600 dark:text-slate-400 mb-4">{{ error }}</p>
      <button @click="router.back()" class="btn btn-secondary">← Go Back</button>
    </div>

    <!-- Word Detail -->
    <div v-else-if="word">
      <!-- Header -->
      <div class="flex items-start justify-between mb-6">
        <div>
          <div class="flex items-center gap-3 mb-2">
            <h1 class="text-3xl font-bold text-slate-900 dark:text-white">{{ word.word }}</h1>
            <button
              @click="toggleFavorite"
              class="text-xl transition-transform hover:scale-110"
              :title="word.favorited ? 'Remove from favorites' : 'Add to favorites'"
            >
              {{ word.favorited ? '❤️' : '🤍' }}
            </button>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <span v-if="word.cefrLevel" class="text-sm font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              {{ word.cefrLevel }}
            </span>
            <span v-if="word.oxfordList" class="text-sm text-slate-500 dark:text-slate-400">
              Oxford {{ word.oxfordList }}
            </span>
            <span v-for="pos in (word.partOfSpeech || [])" :key="pos" class="text-sm text-slate-500 dark:text-slate-400 italic">
              {{ pos }}
            </span>
          </div>
          <!-- Phonetics -->
          <div v-if="word.phoneticUs || word.phoneticUk" class="flex items-center gap-4 mt-3">
            <button
              v-if="word.phoneticUs"
              @click="speak(word.word, 'en-US')"
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              🔊 US {{ word.phoneticUs }}
            </button>
            <button
              v-if="word.phoneticUk"
              @click="speak(word.word, 'en-GB')"
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              🔊 UK {{ word.phoneticUk }}
            </button>
          </div>
        </div>

        <!-- Progress Badge -->
        <div v-if="word.progress" class="text-right">
          <span
            class="text-sm font-medium px-3 py-1 rounded-full"
            :class="statusColors[word.progress.status] || statusColors.new"
          >
            {{ statusLabels[word.progress.status] || word.progress.status }}
          </span>
          <div class="text-xs text-slate-400 mt-1">
            {{ word.progress.totalReviews }} review{{ word.progress.totalReviews !== 1 ? 's' : '' }}
          </div>
        </div>
      </div>

      <!-- Definitions -->
      <div class="card mb-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">📝 Definitions</h2>
        <div class="space-y-3">
          <div
            v-for="(def, idx) in getDefinitions(word.definition)"
            :key="idx"
            class="pl-4 border-l-2 border-primary-200 dark:border-primary-800"
          >
            <p class="text-slate-700 dark:text-slate-300">{{ def }}</p>
          </div>
        </div>
      </div>

      <!-- Examples -->
      <div v-if="word.examples?.length" class="card mb-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">💬 Examples</h2>
        <div class="space-y-2">
          <div
            v-for="(ex, idx) in word.examples"
            :key="idx"
            class="flex gap-2"
          >
            <span class="text-slate-400 mt-0.5">•</span>
            <p class="text-slate-700 dark:text-slate-300 italic">{{ ex }}</p>
          </div>
        </div>
      </div>

      <!-- Synonyms & Antonyms -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div v-if="word.synonyms?.length" class="card">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">🔄 Synonyms</h2>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(syn, idx) in word.synonyms"
              :key="idx"
              class="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full text-sm"
            >
              {{ syn }}
            </span>
          </div>
        </div>
        <div v-if="word.antonyms?.length" class="card">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">⚡ Antonyms</h2>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(ant, idx) in word.antonyms"
              :key="idx"
              class="px-2.5 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-full text-sm"
            >
              {{ ant }}
            </span>
          </div>
        </div>
      </div>

      <!-- Themes -->
      <div v-if="word.themes?.length" class="card mb-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">🏷️ Themes</h2>
        <div class="flex flex-wrap gap-2">
          <router-link
            v-for="theme in word.themes"
            :key="theme.id"
            :to="`/browse?theme=${theme.slug}`"
            class="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-full text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          >
            {{ theme.name }}
          </router-link>
        </div>
      </div>

      <!-- Progress Details -->
      <div v-if="word.progress" class="card mb-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">📊 Your Progress</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div class="text-2xl font-bold text-slate-900 dark:text-white">{{ word.progress.repetitions }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Repetitions</div>
          </div>
          <div class="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div class="text-2xl font-bold text-slate-900 dark:text-white">{{ word.progress.easeFactor }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Ease Factor</div>
          </div>
          <div class="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div class="text-2xl font-bold text-slate-900 dark:text-white">{{ word.progress.correctReviews }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Correct</div>
          </div>
          <div class="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div class="text-2xl font-bold text-slate-900 dark:text-white">
              {{ word.progress.totalReviews > 0 ? Math.round((word.progress.correctReviews / word.progress.totalReviews) * 100) : 0 }}%
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Accuracy</div>
          </div>
        </div>
        <div v-if="word.progress.nextReview" class="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Next review: {{ new Date(word.progress.nextReview).toLocaleDateString() }}
        </div>
      </div>

      <!-- Back Button -->
      <div class="text-center">
        <button @click="router.back()" class="btn btn-secondary">
          ← Go Back
        </button>
      </div>
    </div>
  </div>
</template>
