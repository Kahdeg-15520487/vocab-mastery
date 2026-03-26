<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { adminApi } from '@/lib/api'

interface CategoryStats {
  themeId: string
  themeSlug: string
  themeName: string
  count: number
}

interface CategorizationStats {
  totalWords: number
  categorizedWords: number
  uncategorizedWords: number
  themeStats: CategoryStats[]
}

interface LLMStatus {
  available: boolean
  provider: string
  model?: string
  error?: string
}

const llmStatus = ref<LLMStatus | null>(null)
const stats = ref<CategorizationStats | null>(null)
const loading = ref(false)
const categorizing = ref(false)
const previewWord = ref('')
const previewResult = ref<{ word: string; category: string } | null>(null)
const batchResult = ref<{ message: string; total: number; tagged: number; categoryCounts: Record<string, number> } | null>(null)
const error = ref<string | null>(null)
const batchSize = ref(100)

const progress = computed(() => {
  if (!stats.value) return 0
  return Math.round((stats.value.categorizedWords / stats.value.totalWords) * 100)
})

onMounted(async () => {
  await Promise.all([checkLLM(), loadStats()])
})

async function checkLLM() {
  try {
    llmStatus.value = await adminApi.checkLLMStatus()
  } catch (e: any) {
    llmStatus.value = { available: false, provider: 'unknown', error: e.message }
  }
}

async function loadStats() {
  loading.value = true
  try {
    stats.value = await adminApi.getCategorizationStats()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function previewCategorization() {
  if (!previewWord.value.trim()) return
  
  loading.value = true
  previewResult.value = null
  error.value = null
  
  try {
    previewResult.value = await adminApi.previewCategorization(previewWord.value.trim())
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function runBatchCategorization() {
  if (!confirm(`Categorize up to ${batchSize.value} uncategorized words?`)) return
  
  categorizing.value = true
  batchResult.value = null
  error.value = null
  
  try {
    batchResult.value = await adminApi.batchCategorize(batchSize.value)
    await loadStats()
  } catch (e: any) {
    error.value = e.message
  } finally {
    categorizing.value = false
  }
}

async function categorizeAll() {
  const uncategorized = stats.value?.uncategorizedWords || 0
  if (!confirm(`Categorize ALL ${uncategorized} uncategorized words? This may take a while.`)) return
  
  categorizing.value = true
  batchResult.value = null
  error.value = null
  
  try {
    batchResult.value = await adminApi.batchCategorize(uncategorized)
    await loadStats()
  } catch (e: any) {
    error.value = e.message
  } finally {
    categorizing.value = false
  }
}

function getThemeIcon(slug: string): string {
  const icons: Record<string, string> = {
    technology: '💻',
    business: '💼',
    environment: '🌿',
    health: '🏥',
    science: '🔬',
    education: '📚',
    food: '🍳',
    society: '🌍',
    general: '📝',
  }
  return icons[slug] || '📌'
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-bold text-slate-900">LLM Word Categorization</h2>

    <!-- LLM Status -->
    <div class="card">
      <h3 class="font-semibold text-slate-700 mb-3">LLM Status</h3>
      <div v-if="llmStatus" class="flex items-center gap-3">
        <span 
          :class="[
            'w-3 h-3 rounded-full',
            llmStatus.available ? 'bg-green-500' : 'bg-red-500'
          ]"
        />
        <span v-if="llmStatus.available" class="text-slate-700">
          {{ llmStatus.provider }} ({{ llmStatus.model }})
        </span>
        <span v-else class="text-red-600">
          {{ llmStatus.error || 'Not available' }}
        </span>
      </div>
      <p v-else class="text-slate-500">Checking...</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="card bg-red-50 border border-red-200">
      <p class="text-red-700">{{ error }}</p>
    </div>

    <!-- Progress -->
    <div v-if="stats" class="card">
      <h3 class="font-semibold text-slate-700 mb-3">Categorization Progress</h3>
      
      <div class="mb-4">
        <div class="flex justify-between text-sm text-slate-600 mb-1">
          <span>{{ stats.categorizedWords.toLocaleString() }} / {{ stats.totalWords.toLocaleString() }} words</span>
          <span>{{ progress }}%</span>
        </div>
        <div class="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div 
            class="h-full bg-primary-500 transition-all duration-300"
            :style="{ width: `${progress}%` }"
          />
        </div>
      </div>

      <!-- Theme breakdown -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          v-for="theme in stats.themeStats" 
          :key="theme.themeId"
          class="bg-slate-50 rounded-lg p-3"
        >
          <div class="flex items-center gap-2 mb-1">
            <span>{{ getThemeIcon(theme.themeSlug) }}</span>
            <span class="text-sm font-medium text-slate-700">{{ theme.themeName }}</span>
          </div>
          <p class="text-lg font-bold text-slate-900">{{ theme.count.toLocaleString() }}</p>
        </div>
      </div>
    </div>

    <!-- Preview -->
    <div class="card">
      <h3 class="font-semibold text-slate-700 mb-3">Preview Categorization</h3>
      <p class="text-sm text-slate-500 mb-3">
        Test the LLM categorization on a single word.
      </p>
      
      <div class="flex gap-3">
        <input
          v-model="previewWord"
          type="text"
          placeholder="Enter a word to categorize..."
          class="input flex-1"
          @keyup.enter="previewCategorization"
        />
        <button 
          @click="previewCategorization"
          :disabled="loading || !previewWord.trim()"
          class="btn btn-secondary"
        >
          Preview
        </button>
      </div>

      <div v-if="previewResult" class="mt-4 p-4 bg-slate-50 rounded-lg">
        <p class="text-slate-700">
          <span class="font-medium">"{{ previewResult.word }}"</span>
          → 
          <span class="badge" :class="previewResult.category === 'general' ? 'badge-secondary' : 'badge-primary'">
            {{ getThemeIcon(previewResult.category) }} {{ previewResult.category }}
          </span>
        </p>
      </div>
    </div>

    <!-- Batch Categorization -->
    <div class="card">
      <h3 class="font-semibold text-slate-700 mb-3">Batch Categorization</h3>
      <p class="text-sm text-slate-500 mb-3">
        Categorize uncategorized words using the LLM.
      </p>

      <div class="flex flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-600">Batch size:</label>
          <select v-model="batchSize" class="input w-24">
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="250">250</option>
            <option :value="500">500</option>
            <option :value="1000">1000</option>
          </select>
        </div>
        
        <button 
          @click="runBatchCategorization"
          :disabled="categorizing || !llmStatus?.available"
          class="btn btn-primary"
        >
          {{ categorizing ? 'Categorizing...' : `Categorize ${batchSize} Words` }}
        </button>

        <button 
          v-if="stats && stats.uncategorizedWords > 0"
          @click="categorizeAll"
          :disabled="categorizing || !llmStatus?.available"
          class="btn btn-secondary"
        >
          Categorize All ({{ stats.uncategorizedWords.toLocaleString() }})
        </button>
      </div>

      <!-- Batch Result -->
      <div v-if="batchResult" class="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
        <p class="font-medium text-green-800 mb-2">{{ batchResult.message }}</p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span class="text-green-600">Total:</span>
            <span class="font-medium">{{ batchResult.total }}</span>
          </div>
          <div>
            <span class="text-green-600">Tagged:</span>
            <span class="font-medium">{{ batchResult.tagged }}</span>
          </div>
        </div>
        <div v-if="batchResult.categoryCounts" class="mt-3 flex flex-wrap gap-2">
          <span 
            v-for="(count, category) in batchResult.categoryCounts" 
            :key="category"
            class="badge badge-secondary"
          >
            {{ getThemeIcon(category as string) }} {{ category }}: {{ count }}
          </span>
        </div>
      </div>
    </div>

    <!-- Info -->
    <div class="card bg-blue-50 border border-blue-200">
      <h3 class="font-semibold text-blue-800 mb-2">ℹ️ How it works</h3>
      <ul class="text-sm text-blue-700 space-y-1">
        <li>• The LLM analyzes each word's definition and categorizes it into one of 8 themes</li>
        <li>• Words that don't fit any theme are marked as "general"</li>
        <li>• Each word gets exactly one category (or general)</li>
        <li>• You can re-run categorization to update themes</li>
      </ul>
    </div>
  </div>
</template>
