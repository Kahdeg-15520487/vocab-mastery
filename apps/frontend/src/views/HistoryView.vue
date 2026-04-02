<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { request } from '@/lib/api'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'

interface SessionSummary {
  id: string
  type: string
  themeId: string | null
  startedAt: string
  completedAt: string
  totalCorrect: number
  totalIncorrect: number
  wordCount: number
  accuracy: number
  duration: number // seconds
}

const loading = ref(true)
const sessions = ref<SessionSummary[]>([])
const total = ref(0)
const page = ref(1)
const limit = 15
const filterType = ref<string>('')

const totalPages = computed(() => Math.ceil(total.value / limit))

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString()
}

function typeIcon(type: string): string {
  switch (type) {
    case 'learn': return '📚'
    case 'review': return '🔄'
    case 'quiz': return '🧠'
    default: return '📝'
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'learn': return 'Learn'
    case 'review': return 'Review'
    case 'quiz': return 'Quiz'
    default: return type
  }
}

function accuracyColor(acc: number): string {
  if (acc >= 80) return 'text-green-600 dark:text-green-400'
  if (acc >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

async function loadSessions() {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      limit: String(limit),
    })
    if (filterType.value) params.set('type', filterType.value)
    
    const data = await request<{
      sessions: SessionSummary[]
      total: number
      page: number
      totalPages: number
    }>(`/sessions?${params}`)
    sessions.value = data.sessions
    total.value = data.total
  } catch (e: any) {
    console.error('Failed to load sessions:', e)
  } finally {
    loading.value = false
  }
}

async function exportCSV() {
  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch('/api/sessions/export', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error('Export failed')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocab-sessions-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Silently fail
  }
}

onMounted(() => {
  loadSessions()
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">📝 Session History</h1>
        <p class="text-slate-500 dark:text-slate-400">
          {{ total }} completed session{{ total !== 1 ? 's' : '' }}
        </p>
      </div>
      <button
        @click="exportCSV"
        :disabled="sessions.length === 0"
        class="btn btn-secondary text-sm"
      >
        📥 Export CSV
      </button>
    </div>

    <!-- Filters -->
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="ft in ['', 'learn', 'review', 'quiz']"
        :key="ft"
        @click="filterType = ft; page = 1; loadSessions()"
        class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        :class="filterType === ft
          ? 'bg-primary-600 text-white'
          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600'"
      >
        {{ ft ? `${typeIcon(ft)} ${typeLabel(ft)}` : '📋 All' }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <SkeletonLoader v-for="i in 5" :key="i" type="card" />
    </div>

    <!-- Empty State -->
    <div v-else-if="sessions.length === 0" class="text-center py-12">
      <div class="text-6xl mb-4">📝</div>
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-2">No sessions yet</h2>
      <p class="text-slate-500 dark:text-slate-400 mb-6">
        Start learning to build your session history.
      </p>
      <router-link to="/learn" class="btn btn-primary">
        📚 Start Learning
      </router-link>
    </div>

    <!-- Sessions List -->
    <div v-else class="space-y-3">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="card flex items-center gap-4"
      >
        <!-- Type Icon -->
        <div class="text-3xl flex-shrink-0">{{ typeIcon(session.type) }}</div>

        <!-- Session Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-semibold text-slate-900 dark:text-white">{{ typeLabel(session.type) }}</span>
            <span class="text-xs text-slate-400">·</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">{{ session.wordCount }} words</span>
            <span class="text-xs text-slate-400">·</span>
            <span class="text-sm text-slate-500 dark:text-slate-400">{{ formatDuration(session.duration) }}</span>
          </div>
          <div class="text-sm text-slate-400">{{ formatDate(session.completedAt) }}</div>
        </div>

        <!-- Accuracy -->
        <div class="text-right flex-shrink-0">
          <div class="text-lg font-bold" :class="accuracyColor(session.accuracy)">
            {{ session.accuracy }}%
          </div>
          <div class="text-xs text-slate-400">
            {{ session.totalCorrect }}/{{ session.totalCorrect + session.totalIncorrect }}
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center gap-2">
      <button
        v-for="p in totalPages"
        :key="p"
        @click="page = p; loadSessions()"
        class="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
        :class="p === page ? 'bg-primary-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
      >
        {{ p }}
      </button>
    </div>
  </div>
</template>
