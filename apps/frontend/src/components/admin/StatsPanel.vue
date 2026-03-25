<script setup lang="ts">
import { ref, onMounted } from 'vue'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

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
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/admin/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to fetch stats')
    stats.value = await response.json()
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
      <p class="mt-2 text-slate-600">Loading statistics...</p>
    </div>

    <div v-else-if="error" class="bg-red-50 text-red-600 p-4 rounded-lg">
      {{ error }}
    </div>

    <div v-else-if="stats" class="space-y-6">
      <!-- User Stats -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-slate-800 mb-4">Users</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-indigo-600">{{ stats.users.total }}</p>
            <p class="text-sm text-slate-600">Total Users</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">{{ stats.users.activeToday }}</p>
            <p class="text-sm text-slate-600">Active Today</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-blue-600">{{ stats.users.byTier.EXPLORER || 0 }}</p>
            <p class="text-sm text-slate-600">Explorers</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-purple-600">{{ stats.users.byTier.WORDSMITH || 0 }}</p>
            <p class="text-sm text-slate-600">Wordsmiths</p>
          </div>
        </div>
      </div>

      <!-- Content Stats -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-slate-800 mb-4">Content</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-indigo-600">{{ stats.content.totalWords }}</p>
            <p class="text-sm text-slate-600">Total Words</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-green-600">{{ stats.content.wordsLearned }}</p>
            <p class="text-sm text-slate-600">Words Learned</p>
          </div>
          <div class="bg-slate-50 rounded-lg p-4">
            <p class="text-2xl font-bold text-blue-600">{{ stats.activity.totalSessions }}</p>
            <p class="text-sm text-slate-600">Total Sessions</p>
          </div>
        </div>
      </div>

      <!-- Role Distribution -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-slate-800 mb-4">Role Distribution</h2>
        <div class="flex gap-4">
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold">{{ stats.users.byRole.LEARNER || 0 }}</span>
            <span class="text-slate-600">Learners</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold">{{ stats.users.byRole.ADMIN || 0 }}</span>
            <span class="text-slate-600">Admins</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
