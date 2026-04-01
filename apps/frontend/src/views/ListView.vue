<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useListsStore, type ListDetail } from '@/stores/lists'
import { wordsApi } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const listsStore = useListsStore()
const toast = useToast()

const listId = route.params.id as string
const showAddWords = ref(false)
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

// Confirm dialog state
const confirmDialog = ref(false)
const confirmAction = ref<(() => void) | null>(null)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmVariant = ref<'danger' | 'warning' | 'primary'>('danger')
const confirmBtnText = ref('Confirm')

function showConfirm(opts: { title?: string; message: string; variant?: 'danger' | 'warning' | 'primary'; confirmText?: string }, action: () => void) {
  confirmTitle.value = opts.title || ''
  confirmMessage.value = opts.message
  confirmVariant.value = opts.variant || 'danger'
  confirmBtnText.value = opts.confirmText || 'Confirm'
  confirmAction.value = action
  confirmDialog.value = true
}

const list = computed<ListDetail | null>(() => listsStore.currentList)

onMounted(() => {
  listsStore.fetchList(listId)
})

async function searchWords() {
  if (!searchQuery.value.trim() || searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  searching.value = true
  try {
    const data = await wordsApi.search(searchQuery.value, 20)
    // API returns array directly, not { words: [...] }
    searchResults.value = Array.isArray(data) ? data : (data.words || [])
  } catch (_e) {
    // Search failed silently
  } finally {
    searching.value = false
  }
}

// Debounced search
function onSearchInput() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchWords()
  }, 300)
}

async function addWord(wordId: string) {
  try {
    await listsStore.addWordToList(listId, wordId)
    // Refresh list
    await listsStore.fetchList(listId)
    // Remove from search results
    searchResults.value = searchResults.value.filter(w => w.id !== wordId)
  } catch (e: any) {
    toast.error(e.message)
  }
}

async function removeWord(wordId: string) {
  showConfirm(
    { title: 'Remove Word', message: 'Remove this word from the list?', variant: 'warning', confirmText: 'Remove' },
    async () => {
      try {
        await listsStore.removeWordFromList(listId, wordId)
        await listsStore.fetchList(listId)
      } catch (e: any) {
        toast.error(e.message)
      }
    }
  )
}

async function deleteList() {
  showConfirm(
    { title: 'Delete List', message: 'Delete this list? This cannot be undone.', confirmText: 'Delete List' },
    async () => {
      try {
        await listsStore.deleteList(listId)
        router.push('/lists')
      } catch (e: any) {
        toast.error(e.message)
      }
    }
  )
}

function goBack() {
  router.push('/lists')
}

function studyList() {
  router.push({ path: '/learn', query: { list: listId } })
}

function printList() {
  const token = sessionStorage.getItem('accessToken')
  const url = `/api/lists/${listId}/print?token=${token}`
  window.open(url, '_blank')
}

function exportAnki() {
  const token = sessionStorage.getItem('accessToken')
  // Use fetch to download with auth header
  fetch(`/api/lists/${listId}/export/anki`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${list.value?.name || 'vocab'}_anki_export.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
    .catch(() => {})
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-4">
      <button @click="goBack" class="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300">
        ← Back
      </button>
    </div>

    <!-- Loading -->
    <div v-if="listsStore.loading && !list" class="space-y-6">
      <SkeletonLoader variant="card" height="140px" />
      <SkeletonLoader variant="card" height="200px" />
    </div>

    <!-- List Content -->
    <div v-else-if="list">
      <!-- List Header -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6" :style="{ borderLeft: `4px solid ${list.color}` }">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-4">
            <span class="text-4xl">{{ list.icon }}</span>
            <div>
              <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-200">{{ list.name }}</h1>
              <p v-if="list.description" class="text-slate-600 dark:text-slate-400 mt-1">{{ list.description }}</p>
              <p class="text-sm text-slate-500 dark:text-slate-400 mt-2">
                {{ list.pagination.total }} words
                <span v-if="!list.isOwner" class="ml-2">
                  • Shared by {{ list.owner?.username }}
                </span>
              </p>
            </div>
          </div>
          
          <div class="flex gap-2">
            <button
              @click="studyList"
              class="btn btn-primary text-sm"
              :disabled="list.pagination.total === 0"
            >
              📚 Study
            </button>
            <button
              @click="router.push({ path: '/quiz', query: { list: listId, auto: 'true' } })"
              class="btn btn-secondary text-sm"
              :disabled="list.pagination.total === 0"
            >
              🧠 Quiz
            </button>
            <template v-if="list.isOwner && !list.isSystem">
            <button
              @click="printList"
              class="btn btn-secondary text-sm"
              :disabled="list.pagination.total === 0"
            >
              Print
            </button>
            <button
              @click="exportAnki"
              class="btn btn-secondary text-sm"
              :disabled="list.pagination.total === 0"
            >
              Export CSV
            </button>
            <button
              @click="showAddWords = !showAddWords"
              class="btn btn-secondary text-sm"
            >
              {{ showAddWords ? 'Cancel' : '+ Add Words' }}
            </button>
            <button
              @click="deleteList"
              class="btn btn-danger text-sm"
            >
              Delete
            </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Add Words Panel -->
      <div v-if="showAddWords && list.isOwner" class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <h2 class="font-semibold text-slate-800 dark:text-slate-200 mb-4">Add Words</h2>
        
        <div class="flex gap-2 mb-4">
          <input
            v-model="searchQuery"
            @input="onSearchInput"
            type="text"
            placeholder="Search for words to add..."
            class="input flex-1"
          />
        </div>

        <!-- Search Results -->
        <div v-if="searching" class="text-center py-4">
          <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
        </div>
        
        <div v-else-if="searchResults.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
          <div
            v-for="word in searchResults"
            :key="word.id"
            class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg"
          >
            <div>
              <span class="font-medium">{{ word.word }}</span>
              <span class="text-sm text-slate-500 dark:text-slate-400 ml-2">{{ word.cefrLevel }}</span>
            </div>
            <button
              @click="addWord(word.id)"
              class="btn btn-primary btn-sm"
            >
              Add
            </button>
          </div>
        </div>
        
        <p v-else-if="searchQuery && !searching" class="text-slate-500 dark:text-slate-400 text-center py-4">
          <template v-if="searchQuery.length < 2">
            Type at least 2 characters to search.
          </template>
          <template v-else>
            No words found. Try a different search.
          </template>
        </p>
      </div>

      <!-- Words List -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <table class="w-full">
          <thead class="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th class="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Word</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Definition</th>
              <th class="text-left px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Level</th>
              <th v-if="list.isOwner" class="text-right px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="word in list.words" :key="word.id" class="hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900">
              <td class="px-4 py-3">
                <div class="font-medium text-slate-800 dark:text-slate-200">{{ word.word }}</div>
                <div v-if="word.phoneticUs" class="text-sm text-slate-500 dark:text-slate-400">{{ word.phoneticUs }}</div>
              </td>
              <td class="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 max-w-md truncate">
                {{ word.definition || 'No definition' }}
              </td>
              <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700">
                  {{ word.cefrLevel }}
                </span>
              </td>
              <td v-if="list.isOwner && !list.isSystem" class="px-4 py-3 text-right">
                <button
                  @click="removeWord(word.id)"
                  class="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Empty State -->
        <div v-if="list.words.length === 0" class="text-center py-12">
          <p class="text-slate-500 dark:text-slate-400">No words in this list yet.</p>
          <button
            v-if="list.isOwner"
            @click="showAddWords = true"
            class="btn btn-primary mt-4"
          >
            Add Words
          </button>
        </div>

        <!-- Pagination -->
        <div v-if="list.pagination.totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Showing {{ list.words.length }} of {{ list.pagination.total }} words
          </p>
          <div class="flex gap-2">
            <button
              v-if="list.pagination.page > 1"
              @click="listsStore.fetchList(listId, list.pagination.page - 1)"
              class="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              v-if="list.pagination.page < list.pagination.totalPages"
              @click="listsStore.fetchList(listId, list.pagination.page + 1)"
              class="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="text-center py-12">
      <p class="text-slate-500 dark:text-slate-400">List not found or you don't have access.</p>
      <button @click="goBack" class="btn btn-primary mt-4">
        Back to Lists
      </button>
    </div>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      v-model="confirmDialog"
      :title="confirmTitle"
      :message="confirmMessage"
      :variant="confirmVariant"
      :confirm-text="confirmBtnText"
      @confirm="confirmAction?.()"
    />
  </div>
</template>
