<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const router = useRouter()
const wordsCached = ref(0)
const progressCached = ref(0)
const pendingActions = ref(0)
const loading = ref(true)
const selectedLevel = ref('all')
const selectedMode = ref<'learn' | 'review'>('learn')

const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const canStudy = computed(() => wordsCached.value > 0)

async function loadStatus() {
  loading.value = true
  try {
    const { useOfflineDB } = await import('@/composables/useOfflineDB')
    const db = useOfflineDB()
    const status = await db.getSyncStatus()
    wordsCached.value = status.wordsCount
    progressCached.value = status.progressCount
    pendingActions.value = status.pendingActions
  } catch {
    // IndexedDB not available
  } finally {
    loading.value = false
  }
}

async function startOfflineLearn() {
  try {
    const { useOfflineLearn } = await import('@/composables/useOfflineLearn')
    const offline = useOfflineLearn()
    const words = await offline.getOfflineWords({
      level: selectedLevel.value === 'all' ? undefined : selectedLevel.value,
      limit: 10,
    })

    if (words.length === 0) {
      return
    }

    // Navigate to learn view with offline data in sessionStorage
    sessionStorage.setItem('offline-session-data', JSON.stringify({
      words,
      mode: 'learn',
    }))
    router.push('/learn?offline=true')
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('Failed to start offline learn:', e)
  }
}

async function startOfflineReview() {
  try {
    const { useOfflineLearn } = await import('@/composables/useOfflineLearn')
    const offline = useOfflineLearn()
    const words = await offline.getOfflineDueWords(10)

    if (words.length === 0) {
      return
    }

    sessionStorage.setItem('offline-session-data', JSON.stringify({
      words,
      mode: 'review',
    }))
    router.push('/review?offline=true')
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('Failed to start offline review:', e)
  }
}

onMounted(loadStatus)

function reloadPage() {
  window.location.reload()
}
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center p-4">
    <div class="max-w-lg w-full">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="text-6xl mb-4">📡</div>
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">
          Offline Mode
        </h1>
        <p class="text-slate-600 dark:text-slate-400">
          You're offline, but you can still study with cached data.
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <!-- Offline Content -->
      <template v-else-if="canStudy">
        <!-- Cache Stats -->
        <div class="grid grid-cols-3 gap-3 mb-6">
          <div class="card text-center">
            <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ wordsCached }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Words</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ progressCached }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Progress</div>
          </div>
          <div class="card text-center">
            <div class="text-2xl font-bold" :class="pendingActions > 0 ? 'text-amber-600' : 'text-green-600'">
              {{ pendingActions }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Pending</div>
          </div>
        </div>

        <!-- Mode Selection -->
        <div class="card mb-4">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Study Mode
          </label>
          <div class="flex gap-2">
            <button
              @click="selectedMode = 'learn'"
              class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="selectedMode === 'learn'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              📚 Learn
            </button>
            <button
              @click="selectedMode = 'review'"
              class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="selectedMode === 'review'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              🔁 Review
            </button>
          </div>
        </div>

        <!-- Level Selection (Learn mode only) -->
        <div v-if="selectedMode === 'learn'" class="card mb-4">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            CEFR Level
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              @click="selectedLevel = 'all'"
              class="py-1.5 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="selectedLevel === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              All Levels
            </button>
            <button
              v-for="level in levels"
              :key="level"
              @click="selectedLevel = level"
              class="py-1.5 px-3 rounded-lg text-sm font-medium transition-colors"
              :class="selectedLevel === level
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
            >
              {{ level }}
            </button>
          </div>
        </div>

        <!-- Start Button -->
        <button
          @click="selectedMode === 'learn' ? startOfflineLearn() : startOfflineReview()"
          class="btn btn-primary w-full text-lg py-3"
        >
          {{ selectedMode === 'learn' ? '📚 Start Learning' : '🔁 Start Review' }}
        </button>

        <p class="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">
          Your progress will be saved and synced when you're back online.
        </p>
      </template>

      <!-- No Cache Available -->
      <template v-else>
        <div class="card text-center py-8">
          <div class="text-4xl mb-3">📭</div>
          <p class="text-slate-600 dark:text-slate-400 mb-4">
            No words are cached for offline use yet. You need to sync your data while online first.
          </p>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Go to <strong>Settings → Offline Mode → Sync Now</strong> to download words.
          </p>
        </div>
      </template>

      <!-- Try Again -->
      <button
        @click="reloadPage"
        class="mt-6 text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline block mx-auto"
      >
        🔄 Check connection
      </button>
    </div>
  </div>
</template>
