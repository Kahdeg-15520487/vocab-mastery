<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { wordsApi } from '@/lib/api'
import { usePageTitle } from '@/composables/usePageTitle'
import { useToast } from '@/composables/useToast'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'

usePageTitle()

const toast = useToast()

interface Encounter {
  id: string
  userId: string
  wordId: string
  source: string
  note: string | null
  createdAt: string
  word: { id: string; word: string; cefrLevel: string }
}

const loading = ref(true)
const encounters = ref<Encounter[]>([])
const total = ref(0)
const page = ref(1)
const filterSource = ref('')
const deleting = ref<string | null>(null)

const sourceIcons: Record<string, string> = {
  book: '\uD83D\uDCD6',
  movie: '\uD83C\uDFAC',
  conversation: '\uD83D\uDCAC',
  article: '\uD83D\uDCF0',
  social_media: '\uD83D\uDCF1',
  song: '\uD83C\uDFB5',
  other: '\u2728',
}

const sourceLabels: Record<string, string> = {
  book: 'Book',
  movie: 'Movie/TV',
  conversation: 'Conversation',
  article: 'Article',
  social_media: 'Social Media',
  song: 'Song',
  other: 'Other',
}

const totalPages = computed(() => Math.ceil(total.value / 20))

async function loadEncounters() {
  loading.value = true
  try {
    const params: any = { page: page.value, limit: 20 }
    if (filterSource.value) params.source = filterSource.value
    const data = await wordsApi.getEncounters(params)
    encounters.value = data.encounters as Encounter[]
    total.value = data.total
  } catch (e: any) {
    toast.error(e.message || 'Failed to load encounters')
  } finally {
    loading.value = false
  }
}

async function deleteEncounter(enc: Encounter) {
  deleting.value = enc.id
  try {
    await wordsApi.deleteEncounter(enc.wordId, enc.id)
    encounters.value = encounters.value.filter(e => e.id !== enc.id)
    total.value--
    toast.success('Encounter removed')
  } catch (e: any) {
    toast.error(e.message || 'Failed to delete')
  } finally {
    deleting.value = null
  }
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString()
}

onMounted(loadEncounters)
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-8">
    <div class="flex items-center justify-between mb-6">
      <div>
        <router-link to="/" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">
          &larr; Back to Dashboard
        </router-link>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mt-1">Words in the Wild</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track where you encounter words in real life
        </p>
      </div>
      <div v-if="total > 0" class="text-sm text-slate-500 dark:text-slate-400">
        {{ total }} encounter{{ total !== 1 ? 's' : '' }} logged
      </div>
    </div>

    <!-- Source filter -->
    <div class="flex flex-wrap gap-2 mb-6">
      <button
        @click="filterSource = ''; page = 1; loadEncounters()"
        class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="!filterSource ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'"
      >
        All
      </button>
      <button
        v-for="(label, key) in sourceLabels"
        :key="key"
        @click="filterSource = key; page = 1; loadEncounters()"
        class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
        :class="filterSource === key ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'"
      >
        {{ sourceIcons[key] }} {{ label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Empty -->
    <div v-else-if="encounters.length === 0" class="card text-center py-12">
      <div class="text-4xl mb-4">{{ '\uD83C\uDF2C\uFE0F' }}</div>
      <h3 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">No Encounters Yet</h3>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
        When you spot a word you're learning in a book, movie, or conversation, log it here!
        Go to any word's detail page to add an encounter.
      </p>
      <router-link to="/browse" class="btn btn-primary mt-4 inline-block">Browse Words</router-link>
    </div>

    <!-- Encounter list -->
    <div v-else class="space-y-3">
      <div
        v-for="enc in encounters"
        :key="enc.id"
        class="card flex items-start gap-4"
      >
        <div class="text-2xl flex-shrink-0 mt-0.5">{{ sourceIcons[enc.source] || '\u2728' }}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <router-link :to="'/words/' + enc.wordId" class="font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
              {{ enc.word?.word }}
            </router-link>
            <LevelBadge v-if="enc.word?.cefrLevel" :level="enc.word.cefrLevel" />
            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
              {{ sourceLabels[enc.source] || enc.source }}
            </span>
          </div>
          <p v-if="enc.note" class="text-sm text-slate-600 dark:text-slate-400 mt-1">{{ enc.note }}</p>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">{{ formatDate(enc.createdAt) }}</p>
        </div>
        <button
          @click="deleteEncounter(enc)"
          :disabled="deleting === enc.id"
          class="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 flex-shrink-0 p-1"
          title="Remove encounter"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mt-6">
      <button
        @click="page = Math.max(1, page - 1); loadEncounters()"
        :disabled="page <= 1"
        class="btn btn-secondary text-sm"
      >
        Previous
      </button>
      <span class="text-sm text-slate-600 dark:text-slate-400">
        Page {{ page }} of {{ totalPages }}
      </span>
      <button
        @click="page = Math.min(totalPages, page + 1); loadEncounters()"
        :disabled="page >= totalPages"
        class="btn btn-secondary text-sm"
      >
        Next
      </button>
    </div>
  </div>
</template>
