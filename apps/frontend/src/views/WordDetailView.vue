<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request, wordsApi, progressApi } from '@/lib/api'
import { useSpeech } from '@/composables/useSpeech'
import { useToast } from '@/composables/useToast'
import { useRecentlyViewed } from '@/composables/useRecentlyViewed'
import MasteryBadge from '@/components/learning/MasteryBadge.vue'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'

const route = useRoute()
const router = useRouter()
const { playAudio } = useSpeech()
const toast = useToast()
const { addViewedWord } = useRecentlyViewed()
const generatingExamples = ref(false)
const relatedWords = ref<{ sameTopic: any[]; similar: any[]; family?: any[] } | null>(null)
const etymology = ref<{ origin: string; root: string; breakdown: Array<{part: string; meaning: string; type: string}>; story: string; related: string[] } | null>(null)
const contextExamples = ref<Record<string, string> | null>(null)
const translations = ref<Record<string, string> | null>(null)
const difficulty = ref<number>(0)
const hoverDifficulty = ref(0)
const compareWord = ref('')
const compareResult = ref<any>(null)
const compareLoading = ref(false)

async function compareWords() {
  if (!compareWord.value.trim()) return
  compareLoading.value = true
  try {
    compareResult.value = await wordsApi.compareWords(word.value!.word, compareWord.value.trim())
  } catch {
    compareResult.value = null
  } finally {
    compareLoading.value = false
  }
}

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
  cefrLevel: string
  frequency: number
  audioUs?: string | null
  audioUk?: string | null
  favorited: boolean
  themes: Array<{ slug: string; name: string; topic?: string | null; subtopic?: string | null }>
  progress: {
    status: string
    interval: number
    easeFactor: number
    repetitions: number
    nextReview: string
    lastReview: string | null
    totalReviews: number
    correctReviews: number
    difficulty?: number | null
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
    addViewedWord(data.id, data.word, data.cefrLevel)
    document.title = `${data.word} \u00b7 Vocab Master`
    // Fetch related words
    wordsApi.getRelated(data.id).then(r => relatedWords.value = r).catch(() => {})
    wordsApi.getEtymology(data.id).then(r => etymology.value = r.etymology).catch(() => {})
    wordsApi.getContextExamples(data.id).then(r => contextExamples.value = r.examples).catch(() => {})
    wordsApi.getTranslations(data.id).then(r => translations.value = r.translations).catch(() => {})
    if (data.progress?.difficulty) difficulty.value = data.progress.difficulty
  } catch (e: any) {
    error.value = e.message || 'Word not found'
  } finally {
    loading.value = false
  }
})

async function toggleFavorite() {
  if (!word.value) return
  // Optimistic update
  const wasFavorited = word.value.favorited
  word.value = { ...word.value, favorited: !wasFavorited }
  toast.success(!wasFavorited ? `Added "${word.value.word}" to favorites` : `Removed "${word.value.word}" from favorites`)

  try {
    const result = await wordsApi.toggleFavorite(word.value.id)
    word.value = { ...word.value, favorited: result.favorited }
  } catch {
    word.value = { ...word.value!, favorited: wasFavorited }
    toast.error('Failed to toggle favorite')
  }
}

// Encounter (Words in the Wild)
const showEncounterModal = ref(false)
const encounterSource = ref('book')
const encounterNote = ref('')
const encounterLoading = ref(false)
const encounterCount = ref(0)
const encounterList = ref<{ id: string; source: string; note: string | null; createdAt: string }[]>([])

async function loadEncounters() {
  if (!word.value) return
  try {
    const data = await wordsApi.getWordEncounters(word.value.id)
    encounterList.value = data.encounters
    encounterCount.value = data.encounters.length
  } catch {}
}

// Load encounters when word loads
watch(word, (w) => { if (w) loadEncounters() })

async function addEncounter() {
  if (!word.value) return
  encounterLoading.value = true
  try {
    await wordsApi.addEncounter(word.value.id, encounterSource.value, encounterNote.value || undefined)
    toast.success(`Logged encounter from ${encounterSource.value}`)
    showEncounterModal.value = false
    encounterNote.value = ''
    loadEncounters()
  } catch (e: any) {
    toast.error(e.message || 'Failed to log encounter')
  } finally {
    encounterLoading.value = false
  }
}

function getDefinitions(def: string): string[] {
  if (!def) return []
  return def.split('\n\n').filter(Boolean)
}

// Personal notes
const personalNotes = ref('')
const notesSaving = ref(false)

function loadNotes() {
  if (!word.value) return
  // Notes are included in progress data from the word detail endpoint
  // Check if progress exists and has notes
  personalNotes.value = (word.value as any).progress?.notes || ''
}

// Load notes when word loads
watch(word, (w) => { if (w) loadNotes() })

let notesSaveTimer: ReturnType<typeof setTimeout> | null = null
async function saveNotes() {
  if (!word.value) return
  notesSaving.value = true
  try {
    await progressApi.updateNotes(word.value.id, personalNotes.value)
  } catch {
    // silent fail for auto-save
  } finally {
    notesSaving.value = false
  }
}

function onNotesInput() {
  if (notesSaveTimer) clearTimeout(notesSaveTimer)
  notesSaveTimer = setTimeout(saveNotes, 1000)
}

async function rateDifficulty(rating: number) {
  if (!word.value) return
  difficulty.value = rating
  try {
    await wordsApi.rateDifficulty(word.value.id, rating)
    toast.success(`Rated difficulty: ${'⭐'.repeat(rating)}`)
  } catch {
    toast.error('Failed to save difficulty')
    difficulty.value = 0
  }
}

async function markStatus(status: 'learning' | 'reviewing' | 'mastered' | 'new') {
  if (!word.value) return
  const oldProgress = word.value.progress

  // Optimistic update
  word.value = {
    ...word.value,
    progress: status === 'new' ? null : { ...oldProgress, status } as any,
  }

  const labels: Record<string, string> = {
    mastered: '✅ Marked as known!',
    learning: '📖 Marked as learning',
    reviewing: '🔄 Marked as reviewing',
    new: '🔄 Progress reset',
  }
  toast.success(labels[status] || `Status set to ${status}`)

  try {
    await progressApi.setStatus(word.value.id, status)
  } catch {
    word.value = { ...word.value!, progress: oldProgress }
    toast.error('Failed to update status')
  }
}

async function generateExamples() {
  if (!word.value || generatingExamples.value) return
  generatingExamples.value = true
  try {
    const result = await wordsApi.generateExamples(word.value.id)
    if (result.examples.length > 0) {
      word.value = { ...word.value, examples: [...(word.value.examples || []), ...result.examples] }
      toast.success(`Generated ${result.examples.length} example sentences`)
    } else {
      toast.error('Could not generate examples. Try again later.')
    }
  } catch (e: any) {
    toast.error(e.message || 'Failed to generate examples')
  } finally {
    generatingExamples.value = false
  }
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
            <button
              @click="showEncounterModal = true"
              class="text-lg transition-transform hover:scale-110"
              title="Log encounter (Words in the Wild)"
            >
              🌍
              <span v-if="encounterCount > 0" class="ml-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full px-1.5">{{ encounterCount }}</span>
            </button>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <span v-if="word.cefrLevel" class="text-sm font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
              {{ word.cefrLevel }}
            </span>
            <MasteryBadge
              v-if="word.progress"
              :status="word.progress.status"
              :repetitions="word.progress.repetitions"
              :ease-factor="word.progress.easeFactor"
              size="md"
            />
            <span v-for="pos in (word.partOfSpeech || [])" :key="pos" class="text-sm text-slate-500 dark:text-slate-400 italic">
              {{ pos }}
            </span>
          </div>
          <!-- Phonetics -->
          <div v-if="word.phoneticUs || word.phoneticUk" class="flex items-center gap-4 mt-3">
            <button
              v-if="word.phoneticUs"
              @click="playAudio(word.word, word.audioUs || null, 'us')"
              class="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              🔊 US {{ word.phoneticUs }}
            </button>
            <button
              v-if="word.phoneticUk"
              @click="playAudio(word.word, word.audioUk || null, 'uk')"
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

      <!-- Personal Notes -->
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">My Notes</h2>
          <span v-if="notesSaving" class="text-xs text-slate-400">Saving...</span>
        </div>
        <textarea
          v-model="personalNotes"
          @input="onNotesInput"
          placeholder="Add a mnemonic, memory trick, or personal note..."
          rows="3"
          class="input w-full text-sm"
          maxlength="1000"
        ></textarea>
        <p class="text-xs text-slate-400 mt-1 text-right">{{ personalNotes.length }}/1000</p>
      </div>

      <!-- Examples -->
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">\U0001f4ac Examples</h2>
          <button
            @click="generateExamples"
            :disabled="generatingExamples"
            class="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
          >
            {{ generatingExamples ? 'Generating...' : (word.examples?.length ? 'Generate More' : 'Generate Examples') }}
          </button>
        </div>
        <div v-if="word.examples?.length" class="space-y-2">
          <div
            v-for="(ex, idx) in word.examples"
            :key="idx"
            class="flex gap-2"
          >
            <span class="text-slate-400 mt-0.5">•</span>
            <p class="text-slate-700 dark:text-slate-300 italic">{{ ex }}</p>
          </div>
        </div>
        <p v-else-if="!generatingExamples" class="text-sm text-slate-400 dark:text-slate-500">
          No examples yet. Click "Generate Examples" to create some with AI.
        </p>
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
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">🏷️ Topics</h2>
        <div class="flex flex-wrap gap-2">
          <router-link
            v-for="theme in word.themes"
            :key="typeof theme === 'string' ? theme : theme.slug"
            :to="`/browse?theme=${typeof theme === 'string' ? theme : theme.slug}`"
            class="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-full text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          >
            {{ typeof theme === 'string' ? theme : (theme.subtopic || theme.name) }}
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

      <!-- Quick Mark Status -->
      <div class="card mb-6">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">⚡ Quick Mark</h2>
        <div class="flex gap-2 flex-wrap">
          <button
            @click="markStatus('mastered')"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
          >
            ✅ I Know This
          </button>
          <button
            @click="markStatus('learning')"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
          >
            📖 Learning
          </button>
          <button
            @click="markStatus('reviewing')"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            🔄 Reviewing
          </button>
          <button
            v-if="word.progress"
            @click="markStatus('new')"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
          >
            🔄 Reset Progress
          </button>
        </div>
      </div>

      <!-- Difficulty Rating -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Difficulty Rating</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">How hard is this word for you? This adjusts your review schedule.</p>
        <div class="flex items-center gap-1">
          <button
            v-for="star in 5" :key="star"
            @click="rateDifficulty(star)"
            @mouseenter="hoverDifficulty = star"
            @mouseleave="hoverDifficulty = 0"
            class="text-2xl transition-transform hover:scale-110"
            :title="['Very Easy', 'Easy', 'Normal', 'Hard', 'Very Hard'][star - 1]"
          >
            {{ star <= (hoverDifficulty || difficulty) ? '⭐' : '☆' }}
          </button>
          <span v-if="difficulty" class="ml-2 text-sm font-medium text-slate-500 dark:text-slate-400">
            {{ ['', 'Very Easy', 'Easy', 'Normal', 'Hard', 'Very Hard'][difficulty] }}
          </span>
        </div>
        <p v-if="difficulty" class="text-xs text-slate-400 mt-2">
          {{ difficulty <= 2 ? 'Reviews will be spaced further apart' : difficulty >= 4 ? 'Reviews will come more frequently' : 'Standard review schedule' }}
        </p>
      </div>

      <!-- Back Button -->
      <div class="text-center">
        <button @click="router.back()" class="btn btn-secondary">
          ← Go Back
        </button>
      </div>

      <!-- Etymology -->
      <div v-if="etymology" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Etymology</h2>
        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm">
n            <span class="text-slate-500 dark:text-slate-400">Origin:</span>
            <span class="font-medium text-slate-900 dark:text-white">{{ etymology.origin }}</span>
            <span v-if="etymology.root" class="text-slate-400">(root: <em>{{ etymology.root }}</em>)</span>
          </div>
          <!-- Word breakdown -->
          <div v-if="etymology.breakdown && etymology.breakdown.length" class="flex flex-wrap gap-2">
            <div
              v-for="(b, i) in etymology.breakdown"
              :key="i"
              class="px-3 py-1.5 rounded-lg text-sm"
              :class="{
                'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800': b.type === 'prefix',
                'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800': b.type === 'root',
                'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800': b.type === 'suffix',
              }"
            >
              <span class="font-semibold">{{ b.part }}</span>
              <span class="text-xs ml-1 opacity-75">{{ b.meaning }}</span>
            </div>
          </div>
          <!-- Story -->
          <p v-if="etymology.story" class="text-sm text-slate-600 dark:text-slate-400 italic">
            {{ etymology.story }}
          </p>
          <!-- Related root words -->
          <div v-if="etymology.related && etymology.related.length">
            <span class="text-xs text-slate-500 dark:text-slate-400">Related:</span>
            <div class="flex flex-wrap gap-1 mt-1">
              <router-link
                v-for="rw in etymology.related"
                :key="rw"
                :to="'/browse?search=' + rw"
                class="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-400 hover:text-primary-600"
              >{{ rw }}</router-link>
            </div>
          </div>
        </div>
      </div>

      <!-- Context Examples -->
      <div v-if="contextExamples" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Context Examples</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">How this word is used across different domains</p>
        <div class="space-y-3">
          <div v-for="(sentence, domain) in contextExamples" :key="domain" v-show="sentence" class="flex gap-3">
            <span class="shrink-0 mt-0.5 px-2 py-0.5 rounded text-xs font-medium"
              :class="{
                'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300': domain === 'academic',
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300': domain === 'business',
                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300': domain === 'casual',
                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300': domain === 'news',
                'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300': domain === 'literature',
              }"
            >{{ domain }}</span>
            <p class="text-sm text-slate-700 dark:text-slate-300" v-html="sentence.replace(/\*\*(.+?)\*\*/g, '<strong class=\'text-slate-900 dark:text-white\'>$1</strong>')"></p>
          </div>
        </div>
      </div>

      <!-- Translations -->
      <div v-if="translations" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Translations</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div v-for="(tr, code) in translations" :key="code" v-show="tr"
            class="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800"
          >
            <span class="text-lg">{{ { es: '🇪🇸', fr: '🇫🇷', de: '🇩🇪', pt: '🇵🇹', vi: '🇻🇳', ja: '🇯🇵', ko: '🇰🇷', zh: '🇨🇳', it: '🇮🇹', nl: '🇳🇱', ru: '🇷🇺', ar: '🇸🇦', hi: '🇮🇳', th: '🇹🇭' }[code] || '🌐' }}</span>
            <div>
              <div class="text-xs text-slate-400 uppercase">{{ code }}</div>
              <div class="text-sm font-medium text-slate-900 dark:text-white">{{ tr }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Word Compare -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">Compare Words</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">Confused between similar words? Compare them side by side.</p>
        <div class="flex gap-2">
          <input
            v-model="compareWord"
            placeholder="Enter a word to compare with {{ word.word }}..."
            class="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            @keyup.enter="compareWords"
          />
          <button
            @click="compareWords"
            :disabled="compareLoading || !compareWord.trim()"
            class="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {{ compareLoading ? '...' : 'Compare' }}
          </button>
        </div>

        <div v-if="compareLoading" class="text-center py-4 text-slate-400">
          <span class="animate-pulse">Analyzing...</span>
        </div>

        <div v-else-if="compareResult" class="mt-4 space-y-3">
          <!-- Summary -->
          <div class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
            <p class="text-sm text-primary-800 dark:text-primary-200">{{ compareResult.comparison }}</p>
          </div>

          <!-- Side by side -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <h3 class="font-semibold text-blue-800 dark:text-blue-200 mb-2">{{ compareResult.word1.word }}</h3>
              <p class="text-sm text-slate-700 dark:text-slate-300 mb-1">{{ compareResult.word1.meaning }}</p>
              <p class="text-xs text-blue-600 dark:text-blue-400 mt-2"><strong>When to use:</strong> {{ compareResult.word1.usage }}</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">"{{ compareResult.word1.example }}"</p>
              <div v-if="compareResult.word1.collocations?.length" class="mt-2 flex flex-wrap gap-1">
                <span v-for="c in compareResult.word1.collocations" :key="c" class="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-blue-700 dark:text-blue-300">{{ c }}</span>
              </div>
            </div>
            <div class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <h3 class="font-semibold text-green-800 dark:text-green-200 mb-2">{{ compareResult.word2.word }}</h3>
              <p class="text-sm text-slate-700 dark:text-slate-300 mb-1">{{ compareResult.word2.meaning }}</p>
              <p class="text-xs text-green-600 dark:text-green-400 mt-2"><strong>When to use:</strong> {{ compareResult.word2.usage }}</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">"{{ compareResult.word2.example }}"</p>
              <div v-if="compareResult.word2.collocations?.length" class="mt-2 flex flex-wrap gap-1">
                <span v-for="c in compareResult.word2.collocations" :key="c" class="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/40 rounded text-green-700 dark:text-green-300">{{ c }}</span>
              </div>
            </div>
          </div>

          <!-- Memory tip & nuance -->
          <div v-if="compareResult.memoryTip" class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <p class="text-sm text-amber-800 dark:text-amber-200">💡 {{ compareResult.memoryTip }}</p>
          </div>
          <p v-if="compareResult.nuance" class="text-xs text-slate-500 dark:text-slate-400 italic">{{ compareResult.nuance }}</p>
        </div>
      </div>

      <!-- Related Words -->
      <div v-if="relatedWords && (relatedWords.sameTopic.length > 0 || relatedWords.similar.length > 0 || (relatedWords.family && relatedWords.family.length > 0))" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Related Words</h2>
        <!-- Word Family -->
        <div v-if="relatedWords.family && relatedWords.family.length > 0" class="mb-4">
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Word Family</h3>
          <div class="flex flex-wrap gap-2">
            <router-link
              v-for="w in relatedWords.family"
              :key="w.id"
              :to="`/words/${w.id}`"
              class="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
            >
              {{ w.word }}
            </router-link>
          </div>
        </div>
        <div v-if="relatedWords.sameTopic.length > 0" class="mb-4">
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Same Topic</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <router-link
              v-for="w in relatedWords.sameTopic"
              :key="w.id"
              :to="`/words/${w.id}`"
              class="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <span class="font-medium text-slate-900 dark:text-white">{{ w.word }}</span>
              <span v-if="w.cefrLevel" class="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{{ w.cefrLevel }}</span>
              <span class="text-xs text-slate-500 dark:text-slate-400 truncate flex-1">{{ w.definition }}</span>
            </router-link>
          </div>
        </div>
        <div v-if="relatedWords.similar.length > 0">
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Similar Words</h3>
          <div class="flex flex-wrap gap-2">
            <router-link
              v-for="w in relatedWords.similar"
              :key="w.id"
              :to="`/words/${w.id}`"
              class="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
            >
              {{ w.word }}
            </router-link>
          </div>
        </div>
      </div>

      <!-- Past Encounters -->
      <div v-if="encounterList.length > 0" class="card">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Encounters ({{ encounterCount }})</h2>
          <router-link to="/encounters" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">View all &rarr;</router-link>
        </div>
        <div class="space-y-2">
          <div v-for="enc in encounterList.slice(0, 5)" :key="enc.id" class="flex items-center gap-3 py-1.5">
            <span class="text-lg">{{ {book:'📖',movie:'🎬',conversation:'💬',article:'📰',social_media:'📱',song:'🎵',other:'✨'}[enc.source] || '✨' }}</span>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize">{{ enc.source.replace('_', ' ') }}</span>
              <p v-if="enc.note" class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ enc.note }}</p>
            </div>
            <span class="text-xs text-slate-400">{{ new Date(enc.createdAt).toLocaleDateString() }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Encounter Modal -->
  <Teleport to="body">
    <div v-if="showEncounterModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showEncounterModal = false">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Log Encounter</h3>
        <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">Where did you encounter &ldquo;{{ word?.word }}&rdquo;?</p>

        <div class="grid grid-cols-3 gap-2 mb-4">
          <button v-for="(src, key) in ({book:'📖 Book',movie:'🎬 Movie/TV',conversation:'💬 Chat',article:'📰 Article',social_media:'📱 Social',song:'🎵 Song',other:'✨ Other'})" :key="key"
            @click="encounterSource = key"
            class="px-3 py-2 rounded-lg text-sm text-center transition-colors"
            :class="encounterSource === key ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'"
          >{{ src }}</button>
        </div>

        <textarea v-model="encounterNote" placeholder="Context note (optional)..." rows="2" class="input w-full mb-4"></textarea>

        <div class="flex gap-3 justify-end">
          <button @click="showEncounterModal = false" class="btn btn-secondary text-sm">Cancel</button>
          <button @click="addEncounter" :disabled="encounterLoading" class="btn btn-primary text-sm">
            {{ encounterLoading ? 'Saving...' : 'Log Encounter' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

</template>
