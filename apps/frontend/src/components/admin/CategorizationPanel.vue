<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
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
  provider?: string
  model?: string
  error?: string
}

interface Job {
  id: string
  type: string
  status: string
  progress: number
  totalItems: number
  processedItems: number
  result: any
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

const llmStatus = ref<LLMStatus | null>(null)
const stats = ref<CategorizationStats | null>(null)
const jobs = ref<Job[]>([])
const activeJob = ref<Job | null>(null)
const loading = ref(false)
const previewWord = ref('')
const previewResult = ref<{ word: string; category: string } | null>(null)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

let pollInterval: ReturnType<typeof setInterval> | null = null

const progress = computed(() => {
  if (!stats.value) return 0
  return Math.round((stats.value.categorizedWords / stats.value.totalWords) * 100)
})

onMounted(async () => {
  await Promise.all([checkLLM(), loadStats(), loadJobs()])
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

async function checkLLM() {
  try {
    llmStatus.value = await adminApi.checkLLMStatus()
  } catch (e: any) {
    llmStatus.value = { available: false, error: e.message }
  }
}

async function loadStats() {
  try {
    stats.value = await adminApi.getCategorizationStats()
  } catch (_e: any) {
    // Stats loading failure is non-critical
  }
}

async function loadJobs() {
  try {
    jobs.value = await adminApi.getJobs({ limit: 10 })
    
    // Find running/pending job
    const prev = activeJob.value
    activeJob.value = jobs.value.find((j: Job) => j.status === 'RUNNING' || j.status === 'PENDING') || null
    
    // Start polling when job becomes active, stop when it completes
    if (activeJob.value && !prev) {
      if (!pollInterval) {
        pollInterval = setInterval(() => {
          loadJobs()
        }, 2000)
      }
    } else if (!activeJob.value && prev) {
      // Job just completed — refresh stats, then stop polling
      await loadStats()
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    } else if (activeJob.value) {
      // Still running — refresh stats periodically
      await loadStats()
    }
  } catch (_e: any) {
    // Jobs loading failure is non-critical
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

async function startCategorizeJob(limit: number) {
  error.value = null
  success.value = null
  
  const confirmMsg = limit === 0 
    ? 'Categorize ALL uncategorized words? This will run in the background.'
    : `Categorize up to ${limit} uncategorized words?`
  
  if (!confirm(confirmMsg)) return
  
  try {
    const job = await adminApi.createCategorizeJob({ 
      limit: limit || undefined,
    })
    success.value = `Job created! ID: ${job.id}`
    await loadJobs()
  } catch (e: any) {
    error.value = e.message
  }
}

async function cancelJob(jobId: string) {
  if (!confirm('Cancel this job?')) return
  
  try {
    await adminApi.cancelJob(jobId)
    await loadJobs()
  } catch (e: any) {
    error.value = e.message
  }
}

async function deleteJob(jobId: string) {
  try {
    await adminApi.deleteJob(jobId)
    await loadJobs()
  } catch (e: any) {
    error.value = e.message
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'PENDING': return 'bg-yellow-100 text-yellow-800'
    case 'RUNNING': return 'bg-blue-100 text-blue-800'
    case 'COMPLETED': return 'bg-green-100 text-green-800'
    case 'FAILED': return 'bg-red-100 text-red-800'
    case 'CANCELLED': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleString()
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

    <!-- Success -->
    <div v-if="success" class="card bg-green-50 border border-green-200">
      <p class="text-green-700">{{ success }}</p>
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

    <!-- Active Job -->
    <div v-if="activeJob" class="card border-2 border-blue-300 bg-blue-50">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold text-blue-800">
          {{ activeJob.status === 'RUNNING' ? '⏳ Running Job' : '⏸️ Pending Job' }}
        </h3>
        <span :class="['badge', getStatusColor(activeJob.status)]">
          {{ activeJob.status }}
        </span>
      </div>
      
      <div class="mb-3">
        <div class="flex justify-between text-sm text-blue-700 mb-1">
          <span>{{ activeJob.processedItems }} / {{ activeJob.totalItems }} words</span>
          <span>{{ activeJob.progress }}%</span>
        </div>
        <div class="h-2 bg-blue-200 rounded-full overflow-hidden">
          <div 
            class="h-full bg-blue-600 transition-all duration-300"
            :style="{ width: `${activeJob.progress}%` }"
          />
        </div>
      </div>
      
      <button
        v-if="activeJob.status === 'RUNNING' || activeJob.status === 'PENDING'"
        @click="cancelJob(activeJob.id)"
        class="btn bg-red-100 hover:bg-red-200 text-red-700 text-sm"
      >
        Cancel Job
      </button>
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

    <!-- Start Job -->
    <div class="card">
      <h3 class="font-semibold text-slate-700 mb-3">Start Categorization Job</h3>
      <p class="text-sm text-slate-500 mb-3">
        Jobs run in the background. You can close this page and check progress later.
      </p>

      <div class="flex flex-wrap gap-3">
        <button 
          @click="startCategorizeJob(100)"
          :disabled="!llmStatus?.available || !!activeJob"
          class="btn btn-primary"
        >
          Categorize 100 Words
        </button>
        <button 
          @click="startCategorizeJob(500)"
          :disabled="!llmStatus?.available || !!activeJob"
          class="btn btn-secondary"
        >
          Categorize 500 Words
        </button>
        <button 
          @click="startCategorizeJob(0)"
          :disabled="!llmStatus?.available || !!activeJob || !stats?.uncategorizedWords"
          class="btn btn-secondary"
        >
          Categorize All ({{ stats?.uncategorizedWords?.toLocaleString() || 0 }})
        </button>
      </div>
    </div>

    <!-- Job History -->
    <div class="card">
      <h3 class="font-semibold text-slate-700 mb-3">Job History</h3>
      
      <div v-if="jobs.length === 0" class="text-slate-500 text-sm">
        No jobs yet.
      </div>
      
      <div v-else class="space-y-3">
        <div 
          v-for="job in jobs" 
          :key="job.id"
          class="border border-slate-200 rounded-lg p-3"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs text-slate-500">{{ job.id.slice(0, 8) }}</span>
              <span :class="['badge text-xs', getStatusColor(job.status)]">
                {{ job.status }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-500">{{ formatDate(job.createdAt) }}</span>
              <button 
                v-if="job.status !== 'RUNNING' && job.status !== 'PENDING'"
                @click="deleteJob(job.id)"
                class="text-slate-400 hover:text-red-600 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
          
          <div class="text-sm text-slate-600">
            {{ job.processedItems }} / {{ job.totalItems }} words ({{ job.progress }}%)
          </div>
          
          <div v-if="job.status === 'COMPLETED' && job.result" class="mt-2 text-sm">
            <div class="flex flex-wrap gap-1">
              <span 
                v-for="(count, category) in job.result.categoryCounts" 
                :key="category"
                class="badge badge-secondary text-xs"
              >
                {{ getThemeIcon(String(category)) }} {{ category }}: {{ count }}
              </span>
            </div>
          </div>
          
          <div v-if="job.error" class="mt-2 text-sm text-red-600">
            {{ job.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- Info -->
    <div class="card bg-blue-50 border border-blue-200">
      <h3 class="font-semibold text-blue-800 mb-2">ℹ️ How it works</h3>
      <ul class="text-sm text-blue-700 space-y-1">
        <li>• Jobs run in the background - you can close this page</li>
        <li>• Each job processes words in batches of 100</li>
        <li>• Progress is saved automatically</li>
        <li>• You can cancel a running job at any time</li>
      </ul>
    </div>
  </div>
</template>
