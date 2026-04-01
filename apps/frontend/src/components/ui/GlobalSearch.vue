<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '@/lib/api'

interface WordResult {
  id: string
  word: string
  definition: string
  cefrLevel: string
  themes: any[]
}

const router = useRouter()
const isOpen = ref(false)
const query = ref('')
const results = ref<WordResult[]>([])
const loading = ref(false)
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

function open() {
  isOpen.value = true
  query.value = ''
  results.value = []
  selectedIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}

function close() {
  isOpen.value = false
  results.value = []
}

async function search(q: string) {
  if (q.length < 2) {
    results.value = []
    return
  }
  loading.value = true
  try {
    const data = await request<{ words: WordResult[] }>(`/words?search=${encodeURIComponent(q)}&limit=8`)
    results.value = data.words || []
    selectedIndex.value = 0
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

watch(query, (q) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => search(q), 300)
})

function selectWord(word: WordResult) {
  close()
  router.push(`/words/${word.id}`)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    return
  }
  if (e.key === 'Enter' && results.value.length > 0) {
    e.preventDefault()
    selectWord(results.value[selectedIndex.value])
    return
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  // Ctrl+K or Cmd+K to open search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }
  // / to open search (when not in an input)
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault()
    open()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})

const cefrColors: Record<string, string> = {
  A1: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  A2: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  B1: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  B2: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  C1: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  C2: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
</script>

<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
    >
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="close" />
      <div class="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <!-- Search Input -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <span class="text-slate-400 text-lg">&#x1F50D;</span>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="Search words... (Ctrl+K)"
            class="flex-1 bg-transparent outline-none text-slate-900 dark:text-white placeholder-slate-400"
            @keydown="handleKeydown"
          />
          <kbd class="hidden sm:inline-block text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">ESC</kbd>
        </div>

        <!-- Results -->
        <div v-if="results.length > 0" class="max-h-80 overflow-y-auto">
          <button
            v-for="(word, idx) in results"
            :key="word.id"
            class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
            :class="idx === selectedIndex ? 'bg-primary-50 dark:bg-primary-900/20' : ''"
            @click="selectWord(word)"
            @mouseenter="selectedIndex = idx"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-900 dark:text-white">{{ word.word }}</span>
                <span
                  v-if="word.cefrLevel"
                  class="text-xs px-1.5 py-0.5 rounded font-medium"
                  :class="cefrColors[word.cefrLevel] || 'bg-slate-100 text-slate-600'"
                >
                  {{ word.cefrLevel }}
                </span>
              </div>
              <div class="text-sm text-slate-500 dark:text-slate-400 truncate">
                {{ word.definition }}
              </div>
            </div>
          </button>
        </div>

        <!-- Empty State -->
        <div v-else-if="query.length >= 2 && !loading" class="px-4 py-8 text-center text-slate-400">
          No words found for "{{ query }}"
        </div>

        <!-- Loading -->
        <div v-else-if="loading" class="px-4 py-4 text-center">
          <span class="animate-spin inline-block">&#x23F3;</span>
        </div>

        <!-- Initial State -->
        <div v-else-if="query.length < 2" class="px-4 py-4 text-center text-sm text-slate-400">
          Type at least 2 characters to search
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-4 py-2 text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700">
          <span>&#x2191;&#x2193; Navigate &middot; Enter to select</span>
          <span>Ctrl+K to toggle</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
