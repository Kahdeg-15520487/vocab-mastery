<script setup lang="ts">
import { ref, computed } from 'vue'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useListsStore } from '@/stores/lists'
import LevelBadge from '@/components/learning/LevelBadge.vue'

const emit = defineEmits<{
  close: []
}>()

const toast = useToast()
const listsStore = useListsStore()

// Form state
const topic = ref('')
const cefrLevel = ref('B1')
const wordCount = ref(20)
const listName = ref('')

// Generation state
const generating = ref(false)
const creating = ref(false)
const suggestions = ref<Array<{
  word: string
  reason: string
  inDatabase: boolean
  wordData: { id: string; word: string; definition: string; cefrLevel: string; partOfSpeech: string[]; phoneticUs: string | null } | null
}>>([])
const selectedWords = ref<Set<string>>(new Set())
const genError = ref('')

const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const availableWordIds = computed(() =>
  suggestions.value.filter(s => s.inDatabase && s.wordData).map(s => s.wordData!.id)
)

const selectedCount = computed(() => selectedWords.value.size)
const allAvailableSelected = computed(() =>
  availableWordIds.value.length > 0 && availableWordIds.value.every(id => selectedWords.value.has(id))
)

async function generate() {
  if (!topic.value.trim()) {
    toast.error('Please enter a topic')
    return
  }

  generating.value = true
  genError.value = ''
  suggestions.value = []
  selectedWords.value = new Set()

  try {
    const body: any = {
      topic: topic.value.trim(),
      cefrLevel: cefrLevel.value,
      wordCount: wordCount.value,
    }
    if (listName.value.trim()) {
      body.name = listName.value.trim()
    }

    const data = await request<{
      suggestions: typeof suggestions.value
      totalSuggested: number
      inDatabase: number
      notInDatabase: number
    }>('/lists/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    suggestions.value = data.suggestions

    // Auto-select all words that are in our database
    const autoSelect = new Set<string>()
    for (const s of data.suggestions) {
      if (s.inDatabase && s.wordData) {
        autoSelect.add(s.wordData.id)
      }
    }
    selectedWords.value = autoSelect

    if (data.inDatabase === 0) {
      genError.value = 'None of the suggested words are in our database yet. Try a different topic.'
    }
  } catch (e: any) {
    genError.value = e.message || 'Generation failed'
    toast.error(genError.value)
  } finally {
    generating.value = false
  }
}

function toggleWord(id: string) {
  const s = new Set(selectedWords.value)
  if (s.has(id)) {
    s.delete(id)
  } else {
    s.add(id)
  }
  selectedWords.value = s
}

function toggleAll() {
  if (allAvailableSelected.value) {
    selectedWords.value = new Set()
  } else {
    selectedWords.value = new Set(availableWordIds.value)
  }
}

async function createList() {
  if (selectedWords.value.size === 0) {
    toast.error('Select at least one word')
    return
  }

  creating.value = true
  try {
    const name = listName.value.trim() || `${topic.value.trim()} (${cefrLevel.value})`
    const result = await request<{ id: string; name: string; wordCount: number }>('/lists/generate/create', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: `Generated from topic "${topic.value}" at ${cefrLevel.value} level`,
        wordIds: [...selectedWords.value],
      }),
    })

    toast.success(`Created "${result.name}" with ${result.wordCount} words`)
    listsStore.fetchLists()
    emit('close')
  } catch (e: any) {
    toast.error(e.message || 'Failed to create list')
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="emit('close')">
    <div class="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
      <!-- Header -->
      <div class="p-6 border-b border-slate-200 dark:border-slate-700">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">🤖 Generate Word List</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">AI-powered vocabulary list generation</p>
          </div>
          <button @click="emit('close')" class="text-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
      </div>

      <!-- Form -->
      <div class="p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Topic *</label>
          <input
            v-model="topic"
            placeholder="e.g., Business meetings, Cooking, Travel, Medical terms..."
            class="input w-full"
            :disabled="generating"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">CEFR Level</label>
            <select v-model="cefrLevel" class="input w-full" :disabled="generating">
              <option v-for="level in cefrLevels" :key="level" :value="level">{{ level }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Words</label>
            <select v-model="wordCount" class="input w-full" :disabled="generating">
              <option :value="10">10 words</option>
              <option :value="20">20 words</option>
              <option :value="30">30 words</option>
              <option :value="50">50 words</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            List Name <span class="text-slate-400">(optional)</span>
          </label>
          <input
            v-model="listName"
            placeholder="Auto-generated from topic if empty"
            class="input w-full"
            :disabled="generating"
          />
        </div>

        <button
          @click="generate"
          :disabled="generating || !topic.trim()"
          class="btn btn-primary w-full"
        >
          {{ generating ? '🔄 Generating...' : '🤖 Generate Words' }}
        </button>

        <!-- Error -->
        <div v-if="genError" class="text-red-600 dark:text-red-400 text-sm text-center">
          {{ genError }}
        </div>

        <!-- Results -->
        <div v-if="suggestions.length > 0" class="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Suggestions ({{ suggestions.filter(s => s.inDatabase).length }}/{{ suggestions.length }} in database)
            </h3>
            <button
              @click="toggleAll"
              class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              {{ allAvailableSelected ? 'Deselect All' : 'Select All' }}
            </button>
          </div>

          <div class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="(s, i) in suggestions"
              :key="i"
              class="flex items-start gap-3 p-3 rounded-lg border transition-colors"
              :class="[
                s.inDatabase
                  ? (selectedWords.has(s.wordData!.id)
                    ? 'border-primary-300 bg-primary-50/50 dark:bg-primary-900/10 dark:border-primary-700'
                    : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500')
                  : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 opacity-60'
              ]"
            >
              <!-- Checkbox -->
              <label v-if="s.inDatabase" class="flex items-center cursor-pointer mt-0.5">
                <input
                  type="checkbox"
                  :checked="selectedWords.has(s.wordData!.id)"
                  @change="toggleWord(s.wordData!.id)"
                  class="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
              </label>
              <span v-else class="text-slate-400 mt-0.5 text-sm">—</span>

              <!-- Word info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-slate-900 dark:text-white">{{ s.word }}</span>
                  <LevelBadge v-if="s.wordData?.cefrLevel" :level="s.wordData.cefrLevel" />
                  <span v-if="!s.inDatabase" class="text-xs text-slate-400">(not in database)</span>
                </div>
                <p class="text-sm text-slate-500 dark:text-slate-400">{{ s.reason }}</p>
                <p v-if="s.wordData?.definition" class="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                  {{ s.wordData.definition.slice(0, 100) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Create button -->
          <div class="flex items-center justify-between pt-2">
            <span class="text-sm text-slate-500 dark:text-slate-400">
              {{ selectedCount }} word{{ selectedCount !== 1 ? 's' : '' }} selected
            </span>
            <button
              @click="createList"
              :disabled="creating || selectedCount === 0"
              class="btn btn-primary"
            >
              {{ creating ? 'Creating...' : `Create List (${selectedCount})` }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
