<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useWordsStore } from '@/stores/words'
import { useListsStore } from '@/stores/lists'
import { useSpeech } from '@/composables/useSpeech'
import { useRecentlyViewed } from '@/composables/useRecentlyViewed'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import type { Word } from '@/types'
import { wordsApi, progressApi } from '@/lib/api'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const toast = useToast()

const wordsStore = useWordsStore()
const listsStore = useListsStore()
const { playAudio } = useSpeech()
const { addViewedWord, recentlyViewed, clearRecentlyViewed } = useRecentlyViewed()

const search = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const searchDebounced = ref('')
const selectedTheme = ref(localStorage.getItem('browse-theme') || '')
const selectedLevel = ref(localStorage.getItem('browse-level') || '')
const selectedStatus = ref(localStorage.getItem('browse-status') || '')
const page = ref(1)
const limit = 50
const selectedWord = ref<Word | null>(null)
const showListPicker = ref(false)
const addingToList = ref(false)
const addedToList = ref<string | null>(null)
const batchMode = ref(false)
const selectedWordIds = ref<Set<string>>(new Set())
const batchProcessing = ref(false)
const selectedTopic = ref('')
const selectedSubtopic = ref('')
const topics = ref<Array<{ name: string; totalCount: number; subtopics: Array<{ name: string; count: number }> }>>([])
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const currentSubtopics = computed(() => {
  if (!selectedTopic.value) return []
  const t = topics.value.find(t => t.name === selectedTopic.value)
  return t?.subtopics || []
})

const totalPages = computed(() => wordsStore.pagination.totalPages)
const totalWords = computed(() => wordsStore.pagination.total)
const currentPage = computed(() => wordsStore.pagination.page)

// Load saved filters from localStorage
onMounted(async () => {
  const saved = localStorage.getItem('browse-filters')
  if (saved) {
    try {
      const f = JSON.parse(saved)
      if (f.theme) selectedTheme.value = f.theme
      if (f.level) selectedLevel.value = f.level
      if (f.status) selectedStatus.value = f.status
    } catch { /* ignore */ }
  }

  await Promise.all([
    wordsStore.fetchThemes(),
    wordsStore.fetchWords({
      page: page.value,
      limit,
      theme: selectedTheme.value || undefined,
      level: selectedLevel.value || undefined,
      status: selectedStatus.value || undefined,
    }),
    listsStore.fetchLists(),
    wordsStore.fetchCounts(),
  ])
  
  // Auto-focus search if requested via query param
  if (route.query.focus === 'search') {
    await nextTick()
    searchInput.value?.focus()
  }
})

async function loadWords() {
  await wordsStore.fetchWords({
    search: searchDebounced.value || undefined,
    theme: selectedTheme.value || undefined,
    level: selectedLevel.value || undefined,
    status: selectedStatus.value || undefined,
    topic: selectedTopic.value || undefined,
    subtopic: selectedSubtopic.value || undefined,
    page: page.value,
    limit,
  })
}

// Debounce search input (300ms delay)
watch(search, (newValue) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchDebounced.value = newValue
  }, 300)
})

// Fetch topics when theme changes
watch(selectedTheme, async (newTheme) => {
  selectedTopic.value = ''
  selectedSubtopic.value = ''
  topics.value = []
  if (newTheme && newTheme !== 'none') {
    try {
      const data = await fetch(`/api/themes/${newTheme}/topics`).then(r => r.json())
      topics.value = data.topics || []
    } catch {}
  }
})

// Clear subtopic when topic changes
watch(selectedTopic, () => {
  selectedSubtopic.value = ''
})

// Trigger search when debounced value or filters change
watch([searchDebounced, selectedTheme, selectedLevel, selectedStatus, selectedTopic, selectedSubtopic], () => {
  page.value = 1
  // Save filter state to localStorage
  localStorage.setItem('browse-theme', selectedTheme.value)
  localStorage.setItem('browse-level', selectedLevel.value)
  localStorage.setItem('browse-status', selectedStatus.value)
  loadWords()
})

function goToPage(newPage: number) {
  page.value = newPage
  loadWords()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function nextPage() {
  if (page.value < totalPages.value) {
    goToPage(page.value + 1)
  }
}

function prevPage() {
  if (page.value > 1) {
    goToPage(page.value - 1)
  }
}

function formatSynonyms(synonyms: string[]) {
  if (!synonyms || synonyms.length === 0) return ''
  return synonyms.slice(0, 5).join(' • ')
}

function openWordDetail(word: Word) {
  selectedWord.value = word
  addViewedWord(word.id, word.word, word.cefrLevel)
}

async function toggleFavorite(word: Word) {
  // Optimistic update — toggle immediately
  const wasFavorited = word.favorited
  word.favorited = !word.favorited
  toast.success(word.favorited ? `Added "${word.word}" to favorites` : `Removed "${word.word}" from favorites`)

  try {
    const result = await wordsApi.toggleFavorite(word.id)
    word.favorited = result.favorited // sync with server truth
  } catch (e: any) {
    word.favorited = wasFavorited // rollback on error
    toast.error('Failed to toggle favorite')
  }
}

function closeWordDetail() {
  selectedWord.value = null
  showListPicker.value = false
  addedToList.value = null
}

// Batch selection
function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) {
    selectedWordIds.value.clear()
  }
}

function toggleWordSelection(word: Word) {
  if (selectedWordIds.value.has(word.id)) {
    selectedWordIds.value.delete(word.id)
  } else {
    selectedWordIds.value.add(word.id)
  }
}

function selectAll() {
  for (const w of wordsStore.words) {
    selectedWordIds.value.add(w.id)
  }
}

function selectNone() {
  selectedWordIds.value.clear()
}

async function batchMarkStatus(status: 'mastered' | 'learning' | 'reviewing' | 'new') {
  if (selectedWordIds.value.size === 0) return
  batchProcessing.value = true
  const count = selectedWordIds.value.size

  try {
    await Promise.all(
      Array.from(selectedWordIds.value).map(id => progressApi.setStatus(id, status))
    )
    toast.success(`Marked ${count} word${count !== 1 ? 's' : ''} as ${status}`)
    selectedWordIds.value.clear()
    batchMode.value = false
  } catch (e: any) {
    toast.error('Failed to update some words')
  } finally {
    batchProcessing.value = false
  }
}

// Keyboard navigation in modal
function handleModalKeydown(e: KeyboardEvent) {
  if (!selectedWord.value) return
  if (e.key === 'Escape') {
    closeWordDetail()
    return
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    navigateWord(1)
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    navigateWord(-1)
  }
}

function navigateWord(direction: 1 | -1) {
  if (!selectedWord.value) return
  const idx = wordsStore.words.findIndex(w => w.id === selectedWord.value!.id)
  const newIdx = idx + direction
  if (newIdx >= 0 && newIdx < wordsStore.words.length) {
    selectedWord.value = wordsStore.words[newIdx]
    showListPicker.value = false
    addedToList.value = null
  }
}

async function addWordToList(listId: string) {
  if (!selectedWord.value) return
  addingToList.value = true
  try {
    await listsStore.addWordToList(listId, selectedWord.value.id)
    addedToList.value = listId
  } catch (e: any) {
    console.error('Failed to add word to list:', e.message)
  } finally {
    addingToList.value = false
  }
}

async function markWordStatus(status: 'learning' | 'reviewing' | 'mastered' | 'new') {
  if (!selectedWord.value) return
  const word = selectedWord.value
  const oldProgress = word.progress

  // Optimistic update
  word.progress = status === 'new' ? null : { ...oldProgress, status } as any

  const labels: Record<string, string> = {
    mastered: '✅ Marked as known!',
    learning: '📖 Marked as learning',
    reviewing: '🔄 Marked as reviewing',
    new: '🔄 Progress reset',
  }
  toast.success(labels[status] || `Status set to ${status}`)

  try {
    await progressApi.setStatus(word.id, status)
  } catch (e: any) {
    word.progress = oldProgress // rollback
    toast.error('Failed to update status')
  }
}

function hasDefinition(word: Word): boolean {
  return !!(word.definition && word.definition.length > 0)
}

// Generate page numbers to display
const visiblePages = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value
  
  let start = Math.max(1, current - 2)
  let end = Math.min(total, current + 2)
  
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  
  return pages
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Browse Vocabulary</h1>
      <button
        @click="toggleBatchMode"
        class="text-sm px-3 py-1.5 rounded-lg transition-colors"
        :class="batchMode ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'"
      >
        {{ batchMode ? '✕ Cancel Select' : '☑ Select' }}
      </button>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div class="md:col-span-2">
          <input
            ref="searchInput"
            v-model="search"
            type="text"
            placeholder="Search words..."
            class="input"
          />
        </div>
        <select v-model="selectedTheme" class="input">
          <option value="">All Topics{{ wordsStore.wordCounts ? ` (${wordsStore.wordCounts.total})` : '' }}</option>
          <option value="none">📝 No Topic{{ wordsStore.wordCounts?.themes.none ? ` (${wordsStore.wordCounts.themes.none})` : '' }}</option>
          <option v-for="theme in wordsStore.themes" :key="theme.id" :value="theme.slug">
            {{ theme.icon }} {{ theme.name }}{{ wordsStore.wordCounts?.themes[theme.slug] ? ` (${wordsStore.wordCounts.themes[theme.slug]})` : '' }}
          </option>
        </select>
        <select v-if="topics.length" v-model="selectedTopic" class="input">
          <option value="">All Categories</option>
          <option v-for="t in topics" :key="t.name" :value="t.name">
            {{ t.name }} ({{ t.totalCount }})
          </option>
        </select>
        <select v-if="currentSubtopics.length" v-model="selectedSubtopic" class="input">
          <option value="">All Subtopics</option>
          <option v-for="s in currentSubtopics" :key="s.name" :value="s.name">
            {{ s.name }} ({{ s.count }})
          </option>
        </select>
        <select v-model="selectedLevel" class="input">
          <option value="">All Levels{{ wordsStore.wordCounts ? ` (${wordsStore.wordCounts.total})` : '' }}</option>
          <option v-for="lvl in ['A1','A2','B1','B2','C1','C2']" :key="lvl" :value="lvl">
            {{ lvl }} - {{ { A1:'Beginner', A2:'Elementary', B1:'Intermediate', B2:'Upper-Intermediate', C1:'Advanced', C2:'Proficient' }[lvl] }}{{ wordsStore.wordCounts?.levels[lvl] ? ` (${wordsStore.wordCounts.levels[lvl]})` : '' }}
          </option>
        </select>
        <select v-model="selectedStatus" class="input">
          <option value="">All Status</option>
          <option value="new">🆕 New{{ wordsStore.wordCounts?.statusCounts?.new ? ` (${wordsStore.wordCounts.statusCounts.new})` : '' }}</option>
          <option value="learning">📖 Learning{{ wordsStore.wordCounts?.statusCounts?.learning ? ` (${wordsStore.wordCounts.statusCounts.learning})` : '' }}</option>
          <option value="reviewing">🔄 Reviewing{{ wordsStore.wordCounts?.statusCounts?.reviewing ? ` (${wordsStore.wordCounts.statusCounts.reviewing})` : '' }}</option>
          <option value="mastered">✅ Mastered{{ wordsStore.wordCounts?.statusCounts?.mastered ? ` (${wordsStore.wordCounts.statusCounts.mastered})` : '' }}</option>
        </select>
      </div>
    </div>

    <!-- Recently Viewed -->
    <div v-if="!searchDebounced && !selectedTheme && !selectedLevel && !selectedStatus && recentlyViewed.length > 0" class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recently Viewed</h2>
        <button @click="clearRecentlyViewed" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">Clear</button>
      </div>
      <div class="flex gap-2 overflow-x-auto pb-2">
        <RouterLink
          v-for="w in recentlyViewed.slice(0, 10)"
          :key="w.id"
          :to="`/words/${w.id}`"
          class="flex-shrink-0 px-3 py-1.5 rounded-full text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-700 dark:hover:text-primary-400 transition-colors"
        >
          {{ w.word }}
        </RouterLink>
      </div>
    </div>

    <!-- Batch Action Bar -->
    <div v-if="batchMode" class="card bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 mb-4">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium text-primary-700 dark:text-primary-300">
            {{ selectedWordIds.size }} selected
          </span>
          <button @click="selectAll" class="text-xs text-primary-600 dark:text-primary-400 hover:underline">Select All</button>
          <button @click="selectNone" class="text-xs text-primary-600 dark:text-primary-400 hover:underline">Deselect</button>
        </div>
        <div class="flex items-center gap-2">
          <button @click="batchMarkStatus('mastered')" :disabled="batchProcessing || selectedWordIds.size === 0" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            ✅ I Know These
          </button>
          <button @click="batchMarkStatus('learning')" :disabled="batchProcessing || selectedWordIds.size === 0" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            📖 Learning
          </button>
          <button @click="toggleBatchMode" class="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="wordsStore.error" class="card bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-6">
      <p class="text-red-700 dark:text-red-400">Error loading words: {{ wordsStore.error }}</p>
    </div>

    <!-- Word List -->
    <div v-else-if="wordsStore.words.length" class="space-y-3">
      <div
        v-for="word in wordsStore.words"
        :key="word.id"
        class="card hover:shadow-md transition-shadow cursor-pointer relative"
        :class="{ 'ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/20': batchMode && selectedWordIds.has(word.id) }"
        @click="batchMode ? toggleWordSelection(word) : openWordDetail(word)"
      >
        <!-- Batch checkbox -->
        <div v-if="batchMode" class="absolute top-3 right-3 z-10">
          <div
            class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
            :class="selectedWordIds.has(word.id) ? 'bg-primary-600 border-primary-600' : 'border-slate-300 dark:border-slate-600'"
          >
            <span v-if="selectedWordIds.has(word.id)" class="text-white text-xs">✓</span>
          </div>
        </div>
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">{{ word.word }}</h3>
              <LevelBadge :level="word.cefrLevel" />
            </div>
            <div class="flex items-center gap-2 mb-1">
              <span v-if="word.partOfSpeech?.length" class="text-xs text-slate-400 dark:text-slate-500">
                {{ word.partOfSpeech.join(', ') }}
              </span>
            </div>
            <p class="text-slate-500 dark:text-slate-400 text-sm mb-2 flex items-center gap-2">
              {{ word.phoneticUs }}
              <button
                @click.stop="playAudio(word.word, word.audioUs || null, 'us')"
                class="text-primary-500 hover:text-primary-700 transition-colors"
                title="Pronounce"
              >
                🔊
              </button>
            </p>
            <p class="text-slate-700 dark:text-slate-300 line-clamp-2">{{ word.definition }}</p>
            <p v-if="word.synonyms?.length" class="text-sm text-slate-500 dark:text-slate-400 mt-2">
              {{ formatSynonyms(word.synonyms) }}
            </p>
          </div>
          <div class="ml-4 text-right flex flex-col items-end gap-2">
            <button
              @click.stop="toggleFavorite(word)"
              class="text-xl transition-transform hover:scale-125"
              :title="word.favorited ? 'Remove from favorites' : 'Add to favorites'"
            >
              {{ word.favorited ? '❤️' : '🤍' }}
            </button>
            <span 
              v-if="word.progress"
              :class="[
                'badge',
                word.progress.status === 'mastered' ? 'badge-success' :
                word.progress.status === 'reviewing' ? 'badge-primary' :
                word.progress.status === 'learning' ? 'badge-warning' : 'badge-secondary'
              ]"
            >
              {{ word.progress.status }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!wordsStore.loading" class="text-center py-12">
      <div class="text-4xl mb-4">🔍</div>
      <p class="text-slate-600 dark:text-slate-400">No words found matching your criteria.</p>
    </div>

    <!-- Loading -->
    <div v-else class="space-y-3">
      <div
        v-for="i in 6"
        :key="i"
        class="card animate-pulse"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <div class="h-6 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
              <div class="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-10"></div>
              <div class="h-5 bg-slate-200 dark:bg-slate-700 rounded-full w-20"></div>
            </div>
            <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3 mb-2"></div>
            <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full mb-1"></div>
            <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/5"></div>
          </div>
          <div class="ml-4 w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Showing {{ wordsStore.words.length }} of {{ totalWords }} words (Page {{ currentPage }} of {{ totalPages }})
      </p>
      
      <div class="flex items-center gap-2">
        <!-- Previous Button -->
        <button
          @click="prevPage"
          :disabled="currentPage === 1"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            currentPage === 1
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900'
          ]"
        >
          ← Previous
        </button>
        
        <!-- Page Numbers -->
        <div class="flex items-center gap-1">
          <button
            v-if="currentPage > 3"
            @click="goToPage(1)"
            class="px-3 py-2 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
          >
            1
          </button>
          <span v-if="currentPage > 4" class="px-2 text-slate-400">...</span>
          
          <button
            v-for="p in visiblePages"
            :key="p"
            @click="goToPage(p)"
            :class="[
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              p === currentPage
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900'
            ]"
          >
            {{ p }}
          </button>
          
          <span v-if="currentPage < totalPages - 3" class="px-2 text-slate-400">...</span>
          <button
            v-if="currentPage < totalPages - 2"
            @click="goToPage(totalPages)"
            class="px-3 py-2 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
          >
            {{ totalPages }}
          </button>
        </div>
        
        <!-- Next Button -->
        <button
          @click="nextPage"
          :disabled="currentPage === totalPages"
          :class="[
            'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            currentPage === totalPages
              ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900'
          ]"
        >
          Next →
        </button>
      </div>
    </div>

    <!-- Word Detail Modal -->
    <div 
      v-if="selectedWord" 
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="closeWordDetail"
      tabindex="0"
      @keydown="handleModalKeydown"
    >
      <div class="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl">
        <!-- Header -->
        <div class="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3 mb-1">
                <h2 class="text-2xl font-bold text-slate-900 dark:text-white">{{ selectedWord.word }}</h2>
                <LevelBadge :level="selectedWord.cefrLevel" />
              </div>
              <p class="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                {{ selectedWord.phoneticUs }}
                <button
                  @click="playAudio(selectedWord.word, selectedWord.audioUs || null, 'us')"
                  class="text-primary-500 hover:text-primary-700 transition-colors"
                  title="Pronounce"
                >
                  🔊
                </button>
              </p>
              <p v-if="selectedWord.phoneticUk && selectedWord.phoneticUk !== selectedWord.phoneticUs" class="text-slate-400 text-sm">
                UK: {{ selectedWord.phoneticUk }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <button
                @click="toggleFavorite(selectedWord)"
                class="text-2xl transition-transform hover:scale-125"
                :title="selectedWord.favorited ? 'Remove from favorites' : 'Add to favorites'"
              >
                {{ selectedWord.favorited ? '❤️' : '🤍' }}
              </button>
              <button @click="closeWordDetail" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-2xl leading-none">
                ×
              </button>
            </div>
          </div>
          <div class="mt-2">
            <RouterLink
              :to="`/words/${selectedWord.id}`"
              class="text-sm text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
            >
              Full Details
              <span class="text-xs">→</span>
            </RouterLink>
          </div>
        </div>

        <!-- Content -->
        <div class="p-4 space-y-4">
          <!-- Part of Speech -->
          <div v-if="selectedWord.partOfSpeech?.length">
            <span class="text-sm text-slate-500 dark:text-slate-400">Part of Speech:</span>
            <div class="flex gap-2 mt-1">
              <span 
                v-for="pos in selectedWord.partOfSpeech" 
                :key="pos"
                class="badge badge-secondary"
              >
                {{ pos }}
              </span>
            </div>
          </div>

          <!-- Definition -->
          <div v-if="hasDefinition(selectedWord)">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Definition</h3>
            <p class="text-slate-700 dark:text-slate-300 whitespace-pre-line">{{ selectedWord.definition }}</p>
          </div>
          <div v-else class="text-slate-400 italic">
            No definition available yet. Run the crawler to add definitions.
          </div>

          <!-- Examples -->
          <div v-if="selectedWord.examples?.length">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Examples</h3>
            <ul class="space-y-2">
              <li 
                v-for="(example, i) in selectedWord.examples" 
                :key="i"
                class="text-slate-600 dark:text-slate-400 pl-4 border-l-2 border-primary-200"
              >
                {{ example }}
              </li>
            </ul>
          </div>

          <!-- Synonyms -->
          <div v-if="selectedWord.synonyms?.length">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Synonyms</h3>
            <div class="flex flex-wrap gap-2">
              <span 
                v-for="syn in selectedWord.synonyms" 
                :key="syn"
                class="px-2 py-1 bg-secondary-100 text-secondary-700 rounded text-sm"
              >
                {{ syn }}
              </span>
            </div>
          </div>

          <!-- Antonyms -->
          <div v-if="selectedWord.antonyms?.length">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Antonyms</h3>
            <div class="flex flex-wrap gap-2">
              <span 
                v-for="ant in selectedWord.antonyms" 
                :key="ant"
                class="px-2 py-1 bg-red-100 text-red-700 rounded text-sm"
              >
                {{ ant }}
              </span>
            </div>
          </div>

          <!-- Themes -->
          <div v-if="selectedWord.themes?.length">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Topics</h3>
            <div class="flex flex-wrap gap-2">
              <router-link 
                v-for="theme in selectedWord.themes" 
                :key="typeof theme === 'string' ? theme : theme.slug"
                :to="`/browse?theme=${typeof theme === 'string' ? theme : theme.slug}`"
                class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-sm hover:bg-blue-100 dark:hover:bg-blue-900"
              >
                {{ typeof theme === 'string' ? theme : (theme.subtopic || theme.name) }}
              </router-link>
            </div>
          </div>

          <!-- Quick Status Actions -->
          <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Quick Mark</h3>
            <div class="flex gap-2 flex-wrap">
              <button
                @click="markWordStatus('mastered')"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
              >
                ✅ I Know This
              </button>
              <button
                @click="markWordStatus('learning')"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
              >
                📖 Learning
              </button>
              <button
                @click="markWordStatus('reviewing')"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
              >
                🔄 Reviewing
              </button>
              <button
                v-if="selectedWord.progress?.status"
                @click="markWordStatus('new')"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
              >
                🔄 Reset
              </button>
            </div>
          </div>

          <!-- Add to Study List -->
          <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
            <button
              @click="showListPicker = !showListPicker"
              class="btn btn-secondary w-full flex items-center justify-center gap-2"
            >
              <span>📋</span>
              <span>{{ addedToList ? 'Added to List ✓' : 'Add to Study List' }}</span>
            </button>

            <div v-if="showListPicker" class="mt-3 space-y-2 max-h-40 overflow-y-auto">
              <div v-if="listsStore.lists.length === 0" class="text-center py-2 text-sm text-slate-500 dark:text-slate-400">
                No lists yet. <RouterLink to="/lists" class="text-primary-600 dark:text-primary-400">Create one</RouterLink>
              </div>
              <button
                v-for="list in listsStore.lists"
                :key="list.id"
                @click="addWordToList(list.id)"
                :disabled="addingToList || addedToList === list.id"
                :class="[
                  'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                  addedToList === list.id
                    ? 'bg-secondary-50 text-secondary-700'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                ]"
              >
                <span class="font-medium">{{ list.name }}</span>
                <span class="text-slate-400 ml-2">({{ list.wordCount || 0 }} words)</span>
                <span v-if="addedToList === list.id" class="ml-2">✓</span>
              </button>
            </div>
          </div>

          <!-- Word Navigation -->
          <div class="border-t border-slate-200 dark:border-slate-700 pt-4 flex items-center justify-between">
            <button
              @click="navigateWord(-1)"
              :disabled="wordsStore.words.findIndex(w => w.id === selectedWord!.id) <= 0"
              class="btn btn-secondary text-sm flex items-center gap-1"
            >
              ← Previous
            </button>
            <span class="text-xs text-slate-400">
              {{ wordsStore.words.findIndex(w => w.id === selectedWord!.id) + 1 }} / {{ wordsStore.words.length }}
            </span>
            <button
              @click="navigateWord(1)"
              :disabled="wordsStore.words.findIndex(w => w.id === selectedWord!.id) >= wordsStore.words.length - 1"
              class="btn btn-secondary text-sm flex items-center gap-1"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
