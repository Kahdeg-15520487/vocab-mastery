<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useWordsStore } from '@/stores/words'
import { useListsStore } from '@/stores/lists'
import { useSpeech } from '@/composables/useSpeech'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import type { Word } from '@/types'
import { wordsApi } from '@/lib/api'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const toast = useToast()

const wordsStore = useWordsStore()
const listsStore = useListsStore()
const { speak } = useSpeech()

const search = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const searchDebounced = ref('')
const selectedTheme = ref('')
const selectedLevel = ref('')
const page = ref(1)
const limit = 50
const selectedWord = ref<Word | null>(null)
const showListPicker = ref(false)
const addingToList = ref(false)
const addedToList = ref<string | null>(null)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

const totalPages = computed(() => wordsStore.pagination.totalPages)
const totalWords = computed(() => wordsStore.pagination.total)
const currentPage = computed(() => wordsStore.pagination.page)

onMounted(async () => {
  await Promise.all([
    wordsStore.fetchThemes(),
    wordsStore.fetchWords({ page: page.value, limit }),
    listsStore.fetchLists(),
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

// Trigger search when debounced value changes
watch([searchDebounced, selectedTheme, selectedLevel], () => {
  page.value = 1
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
}

async function toggleFavorite(word: Word) {
  try {
    const result = await wordsApi.toggleFavorite(word.id)
    word.favorited = result.favorited
    toast.success(word.favorited ? `Added "${word.word}" to favorites` : `Removed "${word.word}" from favorites`)
  } catch (e: any) {
    toast.error('Failed to toggle favorite')
  }
}

function closeWordDetail() {
  selectedWord.value = null
  showListPicker.value = false
  addedToList.value = null
}

// Keyboard navigation in modal
function handleModalKeydown(e: KeyboardEvent) {
  if (!selectedWord.value) return
  if (e.key === 'Escape') {
    closeWordDetail()
    return
  }
  // Arrow keys navigate between words
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    const idx = wordsStore.words.findIndex(w => w.id === selectedWord.value!.id)
    if (idx >= 0 && idx < wordsStore.words.length - 1) {
      selectedWord.value = wordsStore.words[idx + 1]
      showListPicker.value = false
      addedToList.value = null
    }
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    const idx = wordsStore.words.findIndex(w => w.id === selectedWord.value!.id)
    if (idx > 0) {
      selectedWord.value = wordsStore.words[idx - 1]
      showListPicker.value = false
      addedToList.value = null
    }
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
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-6">Browse Vocabulary</h1>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <option value="">All Themes</option>
          <option value="none">📝 No Theme</option>
          <option v-for="theme in wordsStore.themes" :key="theme.id" :value="theme.slug">
            {{ theme.icon }} {{ theme.name }}
          </option>
        </select>
        <select v-model="selectedLevel" class="input">
          <option value="">All Levels</option>
          <option value="A1">A1 - Beginner</option>
          <option value="A2">A2 - Elementary</option>
          <option value="B1">B1 - Intermediate</option>
          <option value="B2">B2 - Upper-Intermediate</option>
          <option value="C1">C1 - Advanced</option>
          <option value="C2">C2 - Proficient</option>
        </select>
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
        class="card hover:shadow-md transition-shadow cursor-pointer"
        @click="openWordDetail(word)"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">{{ word.word }}</h3>
              <LevelBadge :level="word.cefrLevel" />
              <span v-if="word.oxfordList === '3000'" class="badge badge-secondary">Oxford 3000</span>
              <span v-else class="badge badge-primary">Oxford 5000</span>
            </div>
            <div class="flex items-center gap-2 mb-1">
              <span v-if="word.partOfSpeech?.length" class="text-xs text-slate-400 dark:text-slate-500">
                {{ word.partOfSpeech.join(', ') }}
              </span>
            </div>
            <p class="text-slate-500 dark:text-slate-400 text-sm mb-2 flex items-center gap-2">
              {{ word.phoneticUs }}
              <button
                @click.stop="speak(word.word)"
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
                  @click="speak(selectedWord.word)"
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
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">Themes</h3>
            <div class="flex flex-wrap gap-2">
              <span 
                v-for="theme in selectedWord.themes" 
                :key="theme"
                class="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-sm"
              >
                {{ theme }}
              </span>
            </div>
          </div>

          <!-- Word Lists -->
          <div class="flex gap-2 text-sm text-slate-500 dark:text-slate-400">
            <span v-if="selectedWord.oxfordList === '3000'" class="badge badge-secondary">
              Oxford 3000
            </span>
            <span v-else class="badge badge-primary">
              Oxford 5000
            </span>
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
        </div>
      </div>
    </div>
  </div>
</template>
