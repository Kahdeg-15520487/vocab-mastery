<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '@/lib/api'

interface Stats {
  users: {
    total: number
    activeToday: number
    byTier: Record<string, number>
    byRole: Record<string, number>
  }
  content: {
    totalWords: number
    wordsLearned: number
    categorized?: number
  }
  activity: {
    totalSessions: number
  }
}

const stats = ref<Stats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    stats.value = await adminApi.getStats()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-2 text-slate-600 dark:text-slate-400">Loading statistics...</p>
    </div>

    <div v-else-if="error" class="bg-red-50 text-red-600 p-4 rounded-lg">
      {{ error }}
    </div>

    <div v-else-if="stats" class="space-y-6">
      <!-- User Stats -->
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Users</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-indigo-600">{{ stats.users.total }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Total Users</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">{{ stats.users.activeToday }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Active Today</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-blue-600">{{ stats.users.byTier.EXPLORER || 0 }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Explorers</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-purple-600">{{ stats.users.byTier.WORDSMITH || 0 }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Wordsmiths</p>
          </div>
        </div>
      </div>

      <!-- Content Stats -->
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Content</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-indigo-600">{{ stats.content.totalWords }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Total Words</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">{{ stats.content.wordsLearned }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Words Learned</p>
          </div>
          <div class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-blue-600">{{ stats.activity.totalSessions }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Total Sessions</p>
          </div>
          <div v-if="stats.content.categorized !== undefined" class="bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <p class="text-2xl font-bold text-purple-600">{{ stats.content.categorized }}</p>
            <p class="text-sm text-slate-600 dark:text-slate-400">Categorized</p>
          </div>
        </div>
      </div>

      <!-- Role Distribution -->
      <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Role Distribution</h2>
        <div class="flex gap-4">
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold">{{ stats.users.byRole.LEARNER || 0 }}</span>
            <span class="text-slate-600 dark:text-slate-400">Learners</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold">{{ stats.users.byRole.ADMIN || 0 }}</span>
            <span class="text-slate-600 dark:text-slate-400">Admins</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
