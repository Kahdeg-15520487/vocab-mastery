<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { request } from '@/lib/api'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'

interface LeaderboardEntry {
  rank: number
  id: string
  username: string
  totalXp: number
  level: number
}

interface LeaderboardData {
  entries: LeaderboardEntry[]
  total: number
  page: number
  totalPages: number
  currentUser: LeaderboardEntry | null
}

const data = ref<LeaderboardData | null>(null)
const loading = ref(true)
const error = ref('')

const showCurrentUserCard = computed(() => {
  if (!data.value?.currentUser) return false
  return !data.value.entries.some(e => e.id === data.value!.currentUser!.id)
})

onMounted(async () => {
  await fetchLeaderboard()
})

async function fetchLeaderboard(page = 1) {
  try {
    loading.value = true
    error.value = ''
    data.value = await request<LeaderboardData>(`/stats/leaderboard?page=${page}&limit=20`)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function rankSuffix(rank: number): string {
  if (rank === 1) return 'st'
  if (rank === 2) return 'nd'
  if (rank === 3) return 'rd'
  return 'th'
}

function rankClass(rank: number): string {
  if (rank === 1) return 'text-yellow-500'
  if (rank === 2) return 'text-slate-400'
  if (rank === 3) return 'text-amber-600'
  return 'text-slate-300 dark:text-slate-600'
}

const medalEmoji = computed(() => (rank: number) => {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">🏆 Leaderboard</h1>
    </div>

    <!-- Loading -->
    <div v-if="loading && !data" class="space-y-3">
      <SkeletonLoader v-for="i in 5" :key="i" variant="card" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="card text-center py-8">
      <div class="text-4xl mb-2">😔</div>
      <p class="text-slate-600 dark:text-slate-400">{{ error }}</p>
    </div>

    <template v-else-if="data">
      <!-- Current User Card (if not on first page) -->
      <div
        v-if="showCurrentUserCard"
        class="card mb-6 border-2 border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20"
      >
        <div class="flex items-center gap-4">
          <div class="text-2xl font-bold text-primary-600 dark:text-primary-400 w-12 text-center">
            #{{ data.currentUser?.rank }}
          </div>
          <UserAvatar v-if="data.currentUser?.username" :username="data.currentUser.username" />
          <div class="flex-1">
            <div class="font-semibold text-primary-700 dark:text-primary-300">
              {{ data.currentUser?.username }}
              <span class="text-xs font-normal">(You)</span>
            </div>
            <div class="text-sm text-primary-500">Level {{ data.currentUser?.level }}</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-primary-600 dark:text-primary-400">{{ data.currentUser?.totalXp?.toLocaleString() }} XP</div>
          </div>
        </div>
      </div>

      <!-- Leaderboard Entries -->
      <div class="space-y-2">
        <div
          v-for="entry in data.entries"
          :key="entry.id"
          class="card flex items-center gap-4"
          :class="entry.id === data.currentUser?.id ? 'border-primary-300 dark:border-primary-700 bg-primary-50/50 dark:bg-primary-900/10' : ''"
        >
          <!-- Rank -->
          <div class="w-12 text-center flex-shrink-0">
            <span v-if="entry.rank <= 3" class="text-2xl">{{ medalEmoji(entry.rank) }}</span>
            <span v-else class="text-lg font-bold" :class="rankClass(entry.rank)">
              {{ entry.rank }}<sup class="text-xs">{{ rankSuffix(entry.rank) }}</sup>
            </span>
          </div>

          <!-- Avatar -->
          <UserAvatar :username="entry.username" />

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-900 dark:text-white truncate">
              {{ entry.username }}
              <span v-if="entry.id === data.currentUser?.id" class="text-xs font-normal text-primary-500 ml-1">(You)</span>
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Level {{ entry.level }}</div>
          </div>

          <!-- XP -->
          <div class="text-right flex-shrink-0">
            <div class="font-bold text-primary-600 dark:text-primary-400">{{ entry.totalXp.toLocaleString() }}</div>
            <div class="text-xs text-slate-400">XP</div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="data.entries.length === 0" class="card text-center py-12">
        <div class="text-6xl mb-4">🌟</div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">No one has earned XP yet!</h3>
        <p class="text-slate-500 dark:text-slate-400 mb-4">Be the first to complete a learning session.</p>
        <router-link to="/learn" class="btn btn-primary">Start Learning</router-link>
      </div>

      <!-- Pagination -->
      <div v-if="data.totalPages > 1" class="flex items-center justify-center gap-2 mt-6">
        <button
          :disabled="data.page <= 1"
          @click="fetchLeaderboard(data.page - 1)"
          class="btn btn-secondary text-sm"
        >
          ← Previous
        </button>
        <span class="text-sm text-slate-500 dark:text-slate-400">
          Page {{ data.page }} of {{ data.totalPages }}
        </span>
        <button
          :disabled="data.page >= data.totalPages"
          @click="fetchLeaderboard(data.page + 1)"
          class="btn btn-secondary text-sm"
        >
          Next →
        </button>
      </div>
    </template>
  </div>
</template>
