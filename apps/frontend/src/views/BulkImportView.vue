<script setup lang="ts">
import { ref, computed } from 'vue'
import { request } from '@/lib/api'
import { useListsStore } from '@/stores/lists'
import { useToast } from '@/composables/useToast'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const toast = useToast()
const listsStore = useListsStore()

const inputText = ref('')
const selectedListId = ref('')
const loading = ref(false)
const result = ref<{
  matched: Array<{ id: string; word: string; definition: string; cefrLevel: string }>
  unmatched: string[]
  added: number
  skipped: number
} | null>(null)

const lines = computed(() => {
  return inputText.value
    .split(/[\n,;]+/)
    .map(w => w.trim())
    .filter(w => w.length > 0)
})

const uniqueWords = computed(() => [...new Set(lines.value.map(w => w.toLowerCase()))])

listsStore.fetchLists()

async function lookupWords() {
  if (uniqueWords.value.length === 0) {
    toast.warning('Please enter some words first')
    return
  }

  loading.value = true
  result.value = null
  try {
    const body: any = { words: uniqueWords.value }
    if (selectedListId.value) body.listId = selectedListId.value

    result.value = await request<{
      matched: Array<{ id: string; word: string; definition: string; cefrLevel: string }>
      unmatched: string[]
      added: number
      skipped: number
    }>('/words/bulk-lookup', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    const r = result.value
    if (selectedListId.value) {
      toast.success(`Added ${r.added} words to list (${r.skipped} already there)`)
    }
  } catch (e: any) {
    toast.error(e.message || 'Lookup failed')
  } finally {
    loading.value = false
  }
}

function clearAll() {
  inputText.value = ''
  result.value = null
  selectedListId.value = ''
}
</script>

<template>
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">📋 Bulk Word Import</h1>
      <p class="text-slate-600 dark:text-slate-400">
        Paste a list of words to look them up and add them to a study list.
      </p>
    </div>

    <!-- Input area -->
    <div class="card space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Words <span class="text-slate-400 font-normal">(one per line, or comma/semicolon separated)</span>
        </label>
        <textarea
          v-model="inputText"
          rows="8"
          class="input"
          placeholder="apple&#10;banana&#10;elephant&#10;beautiful&#10;accomplish"
        />
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {{ lines.length }} entries ({{ uniqueWords.length }} unique)
        </p>
      </div>

      <div>
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Add to Study List <span class="text-slate-400 font-normal">(optional)</span>
        </label>
        <select v-model="selectedListId" class="input">
          <option value="">— Lookup only (don't add to list) —</option>
          <option v-for="list in listsStore.lists" :key="list.id" :value="list.id">
            {{ list.name }} ({{ list.wordCount ?? 0 }} words)
          </option>
        </select>
      </div>

      <div class="flex gap-3">
        <button
          @click="lookupWords"
          :disabled="loading || uniqueWords.length === 0"
          class="btn btn-primary flex-1"
        >
          <LoadingSpinner v-if="loading" class="w-5 h-5" />
          <template v-else>🔍 Lookup {{ uniqueWords.length }} Words</template>
        </button>
        <button @click="clearAll" class="btn btn-secondary">Clear</button>
      </div>
    </div>

    <!-- Results -->
    <template v-if="result">
      <!-- Summary -->
      <div class="grid grid-cols-3 gap-4">
        <div class="card text-center bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ result.matched.length }}</div>
          <div class="text-sm text-emerald-700 dark:text-emerald-300">Matched</div>
        </div>
        <div class="card text-center bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">{{ result.unmatched.length }}</div>
          <div class="text-sm text-red-700 dark:text-red-300">Not Found</div>
        </div>
        <div v-if="selectedListId" class="card text-center bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ result.added }}</div>
          <div class="text-sm text-blue-700 dark:text-blue-300">Added to List</div>
        </div>
        <div v-else class="card text-center bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
          <div class="text-2xl font-bold text-slate-600 dark:text-slate-400">{{ result.matched.length + result.unmatched.length }}</div>
          <div class="text-sm text-slate-700 dark:text-slate-300">Total</div>
        </div>
      </div>

      <!-- Matched words -->
      <div v-if="result.matched.length > 0" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">✅ Matched Words</h2>
        <div class="space-y-2 max-h-96 overflow-y-auto">
          <router-link
            v-for="word in result.matched"
            :key="word.id"
            :to="`/words/${word.id}`"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <span class="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-full font-medium">
              {{ word.cefrLevel }}
            </span>
            <span class="font-medium text-slate-900 dark:text-white">{{ word.word }}</span>
            <span class="text-sm text-slate-500 dark:text-slate-400 truncate flex-1">{{ word.definition }}</span>
          </router-link>
        </div>
      </div>

      <!-- Unmatched words -->
      <div v-if="result.unmatched.length > 0" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-3">❌ Not Found</h2>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="word in result.unmatched"
            :key="word"
            class="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm"
          >
            {{ word }}
          </span>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
          These words aren't in the dictionary. Try checking spelling or using base forms (e.g., "run" instead of "running").
        </p>
      </div>
    </template>
  </div>
</template>
