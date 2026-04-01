<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <div>
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">📚 Reading Mode</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Analyze text to discover vocabulary you know and gaps to fill</p>
    </div>

    <!-- Input area -->
    <div class="card space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-semibold text-slate-900 dark:text-white">Paste Text to Analyze</h2>
        <div v-if="sprintId" class="flex items-center gap-2">
          <input type="checkbox" v-model="checkSprint" id="checkSprint" class="rounded border-slate-300" />
          <label for="checkSprint" class="text-sm text-slate-600 dark:text-slate-400">Check sprint coverage</label>
        </div>
      </div>

      <textarea
        v-model="textInput"
        placeholder="Paste an article, story, or any English text here to analyze vocabulary coverage..."
        class="w-full p-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        rows="8"
      />

      <div class="flex justify-between items-center">
        <span class="text-xs text-slate-400">{{ textInput.trim().split(/\s+/).filter(Boolean).length }} words</span>
        <button
          @click="analyzeText"
          :disabled="!textInput.trim() || analyzing"
          class="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {{ analyzing ? 'Analyzing...' : '🔍 Analyze Text' }}
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-if="result" class="space-y-4">
      <!-- Overview cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="card text-center">
          <div class="text-2xl font-bold text-slate-900 dark:text-white">{{ result.totalWords }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Total Words</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ result.known.count }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Known ({{ result.readability.knownPercent }}%)</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">{{ result.learning.count }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Learning ({{ result.readability.learningPercent }}%)</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-red-600 dark:text-red-400">{{ result.unknown.count }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Unknown ({{ result.readability.unknownPercent }}%)</div>
        </div>
      </div>

      <!-- Readability bar -->
      <div class="card">
        <h3 class="font-semibold text-slate-900 dark:text-white mb-3">Vocabulary Coverage</h3>
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
          <div
            v-if="result.readability.knownPercent > 0"
            class="bg-green-500 h-full transition-all duration-500"
            :style="{ width: result.readability.knownPercent + '%' }"
            :title="'Known: ' + result.readability.knownPercent + '%'"
          />
          <div
            v-if="result.readability.learningPercent > 0"
            class="bg-amber-500 h-full transition-all duration-500"
            :style="{ width: result.readability.learningPercent + '%' }"
            :title="'Learning: ' + result.readability.learningPercent + '%'"
          />
        </div>
        <div class="flex justify-between mt-2 text-xs">
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500 inline-block"></span> Known</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-amber-500 inline-block"></span> Learning</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-slate-300 dark:bg-slate-600 inline-block"></span> Unknown</span>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-400 mt-2">
          <template v-if="result.readability.knownPercent >= 95">🌟 Excellent! You know nearly all words in this text.</template>
          <template v-else-if="result.readability.knownPercent >= 80">👍 Good comprehension! A few words to learn.</template>
          <template v-else-if="result.readability.knownPercent >= 60">📖 Moderate comprehension. Some vocabulary gaps to fill.</template>
          <template v-else>📚 Challenging text. Focus on learning the unknown words below.</template>
        </p>
      </div>

      <!-- Sprint coverage (if applicable) -->
      <div v-if="result.sprintCoverage" class="card">
        <h3 class="font-semibold text-slate-900 dark:text-white mb-3">🏃 Sprint Word Coverage</h3>
        <div class="flex items-center gap-4 mb-3">
          <div class="text-3xl font-bold" :class="result.sprintCoverage.coverage >= 80 ? 'text-green-600 dark:text-green-400' : result.sprintCoverage.coverage >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'">
            {{ result.sprintCoverage.coverage }}%
          </div>
          <div>
            <div class="text-sm text-slate-600 dark:text-slate-400">{{ result.sprintCoverage.found }} of {{ result.sprintCoverage.total }} sprint words found</div>
            <div class="text-xs text-slate-400">Try using these words in your writing!</div>
          </div>
        </div>
        <div v-if="result.sprintCoverage.missingWords.length" class="flex flex-wrap gap-1.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Missing:</span>
          <span
            v-for="w in result.sprintCoverage.missingWords.slice(0, 15)"
            :key="w"
            class="px-2 py-0.5 text-xs bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full"
          >
            {{ w }}
          </span>
        </div>
      </div>

      <!-- Unknown words in dictionary -->
      <div v-if="result.unknown.inDictionary.length" class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-slate-900 dark:text-white">📖 Unknown Words in Dictionary</h3>
          <button
            @click="addUnknownWordsToList"
            :disabled="addingToList"
            class="text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {{ addingToList ? 'Adding...' : 'Add to Study List' }}
          </button>
        </div>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">These words are in our dictionary. Click to learn them!</p>
        <div class="space-y-2">
          <div
            v-for="w in result.unknown.inDictionary"
            :key="w.id"
            class="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <router-link
                  :to="`/words/${w.id}`"
                  class="font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {{ w.word }}
                </router-link>
                <LevelBadge :level="w.cefrLevel" />
              </div>
              <p class="text-sm text-slate-600 dark:text-slate-400">{{ w.definition }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Suggestions -->
      <div class="card">
        <h3 class="font-semibold text-slate-900 dark:text-white mb-3">💡 Reading Suggestions</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">
          Your level: <strong>{{ suggestions?.userLevel || 'A1' }}</strong> —
          Words to learn at <strong>{{ suggestions?.nextLevel || 'A2' }}</strong> level:
        </p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div
            v-for="w in suggestions?.suggestedWords || []"
            :key="w.id"
            class="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-center"
          >
            <router-link :to="`/words/${w.id}`" class="text-sm font-medium text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
              {{ w.word }}
            </router-link>
            <div class="text-xs text-slate-400 truncate">{{ w.definition }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '../lib/api'
import { useListsStore } from '@/stores/lists'
import { useToast } from '@/composables/useToast'
import LevelBadge from '../components/learning/LevelBadge.vue'

const route = useRoute()

const textInput = ref('')
const analyzing = ref(false)
const result = ref<any>(null)
const suggestions = ref<any>(null)
const sprintId = ref<string | null>(null)
const checkSprint = ref(true)
const toast = useToast()
const listsStore = useListsStore()
const addingToList = ref(false)

async function addUnknownWordsToList() {
  if (!result.value?.unknown?.inDictionary?.length) return
  addingToList.value = true
  try {
    // Get user's lists
    await listsStore.fetchLists()
    const lists = listsStore.lists
    if (!lists.length) {
      toast.error('Create a study list first')
      return
    }
    // Use the first list or prompt — for simplicity, use first list
    const listId = lists[0].id
    const wordIds = result.value.unknown.inDictionary.map((w: any) => w.id)
    for (const wordId of wordIds) {
      await listsStore.addWordToList(listId, wordId)
    }
    toast.success(`Added ${wordIds.length} words to "${lists[0].name}"`)
  } catch (e: any) {
    toast.error(e.message || 'Failed to add words')
  } finally {
    addingToList.value = false
  }
}

onMounted(async () => {
  const sid = route.query.sprintId as string
  if (sid) {
    sprintId.value = sid
  }

  // Load suggestions
  try {
    suggestions.value = await request<any>('/reading/suggestions')
  } catch {
    // Silent
  }
})

async function analyzeText() {
  if (!textInput.value.trim()) return
  analyzing.value = true
  try {
    result.value = await request<any>('/reading/analyze', {
      method: 'POST',
      body: JSON.stringify({
        text: textInput.value.trim(),
        sprintId: checkSprint.value && sprintId.value ? sprintId.value : undefined,
      }),
    })
  } catch (e: any) {
    alert('Failed to analyze: ' + (e.message || 'Unknown error'))
  } finally {
    analyzing.value = false
  }
}
</script>
