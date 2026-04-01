<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useStatsStore } from '@/stores/stats'
import { statsApi } from '@/lib/api'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'

const statsStore = useStatsStore()

// Heatmap & study time
const heatmapData = ref<Array<{ date: string; wordsLearned: number; wordsReviewed: number }>>([])
const studyTime = ref<{ totalTimeMinutes: number; totalSessions: number; avgSessionMinutes: number; byType: { type: string; totalMinutes: number; sessions: number }[] } | null>(null)

onMounted(async () => {
  await Promise.all([
    statsStore.fetchStats(),
    statsStore.fetchDailyStats(7),
    statsApi.getHeatmap().then(d => heatmapData.value = d).catch(() => {}),
    statsApi.getStudyTime().then(d => studyTime.value = d).catch(() => {}),
  ])
})

// Heatmap computed — generate grid for last 12 months
const heatmapGrid = computed(() => {
  if (!heatmapData.value.length) return []
  const dataMap = new Map(heatmapData.value.map(d => [d.date.split('T')[0], d]))
  const today = new Date()
  const weeks = []
  for (let w = 51; w >= 0; w--) {
    const week = []
    for (let d = 6; d >= 0; d--) {
      const date = new Date(today)
      date.setDate(date.getDate() - w * 7 - d)
      const key = date.toISOString().split('T')[0]
      const entry = dataMap.get(key)
      const total = entry ? entry.wordsLearned + entry.wordsReviewed : 0
      week.push({ date: key, total })
    }
    weeks.push(week)
  }
  return weeks
})

const heatmapColor = (total: number) => {
  if (total === 0) return 'bg-slate-100 dark:bg-slate-800'
  if (total < 5) return 'bg-green-200 dark:bg-green-900'
  if (total < 15) return 'bg-green-400 dark:bg-green-700'
  if (total < 30) return 'bg-green-600 dark:bg-green-500'
  return 'bg-green-800 dark:bg-green-300'
}

const totalStudyHours = computed(() => studyTime.value ? Math.round(studyTime.value.totalTimeMinutes / 60 * 10) / 10 : 0)

const sessionTypeEmoji: Record<string, string> = {
  learn: '\ud83d\udcda',
  review: '\ud83d\udd04',
  quiz: '\ud83e\udde0',
  spelling: '\u270d\ufe0f',
  'fill-blank': '\ud83d\udcdd',
}

const stats = computed(() => statsStore.stats)
const dailyStats = computed(() => statsStore.dailyStats)
const loading = computed(() => statsStore.loading)

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { weekday: 'short' })
}

// XP calculations (matching backend formula)
const xpForLevel = (level: number) => {
  let total = 0
  for (let i = 1; i < level; i++) total += 50 * (i + 1)
  return total
}

const statsXpProgress = computed(() => {
  if (!stats.value) return 0
  const totalXp = stats.value.user.totalXP
  const level = stats.value.user.level
  const currentLevelXp = xpForLevel(level)
  const nextLevelXp = xpForLevel(level + 1)
  const range = nextLevelXp - currentLevelXp
  if (range === 0) return 100
  return Math.min(100, Math.round(((totalXp - currentLevelXp) / range) * 100))
})

const statsXpNeeded = computed(() => {
  if (!stats.value) return 0
  const totalXp = stats.value.user.totalXP
  const level = stats.value.user.level
  const nextLevelXp = xpForLevel(level + 1)
  return nextLevelXp - totalXp
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">📊 Statistics</h1>
      <div class="flex items-center gap-4">
        <router-link to="/leaderboard" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
          🏆 Leaderboard →
        </router-link>
        <router-link to="/vocab-size" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
          📐 Vocab Size Test →
        </router-link>
        <router-link to="/history" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
          View session history →
        </router-link>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading && !stats" class="space-y-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SkeletonLoader v-for="i in 4" :key="i" type="card" />
      </div>
      <SkeletonLoader variant="card" />
      <SkeletonLoader variant="card" />
      <SkeletonLoader variant="card" />
    </div>

    <!-- User Stats -->
    <div v-else-if="stats" class="space-y-6">
      <!-- Overview Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card text-center">
          <div class="text-3xl font-bold text-primary-600 dark:text-primary-400">{{ stats.user.totalWords }}</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Words Learned</div>
        </div>
        <div class="card text-center">
          <div class="text-3xl font-bold text-secondary-600">{{ stats.user.masteredWords }}</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Mastered</div>
        </div>
        <div class="card text-center">
          <div class="text-3xl font-bold text-warning-600">{{ stats.user.currentStreak }}</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Day Streak</div>
        </div>
        <div class="card text-center">
          <div class="text-3xl font-bold text-danger-600">{{ stats.user.level }}</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Level</div>
        </div>
      </div>

      <!-- Status Distribution -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Learning Progress</h2>
        <div class="space-y-3">
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">Mastered</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ stats.words.status.mastered }}</span>
            </div>
            <div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-green-500"
                :style="{ width: `${stats.words.total > 0 ? (stats.words.status.mastered / stats.words.total) * 100 : 0}%` }"
              />
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">Reviewing</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ stats.words.status.reviewing }}</span>
            </div>
            <div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-primary-500"
                :style="{ width: `${stats.words.total > 0 ? (stats.words.status.reviewing / stats.words.total) * 100 : 0}%` }"
              />
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">Learning</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ stats.words.status.learning }}</span>
            </div>
            <div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-yellow-500"
                :style="{ width: `${stats.words.total > 0 ? (stats.words.status.learning / stats.words.total) * 100 : 0}%` }"
              />
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">New</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ stats.words.status.new }}</span>
            </div>
            <div class="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-slate-400 dark:bg-slate-500"
                :style="{ width: `${stats.words.total > 0 ? (stats.words.status.new / stats.words.total) * 100 : 0}%` }"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly Activity -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Weekly Activity</h2>
        <div v-if="dailyStats.length" class="flex items-end justify-between h-32 gap-2">
          <div 
            v-for="day in dailyStats" 
            :key="day.date"
            class="flex-1 flex flex-col items-center"
          >
            <div 
              class="w-full bg-primary-500 rounded-t transition-all"
              :style="{ height: `${day.wordsReviewed > 0 ? Math.max(20, (day.wordsReviewed / Math.max(...dailyStats.map(d => d.wordsReviewed))) * 100) : 4}%` }"
            />
            <span class="text-xs text-slate-500 dark:text-slate-400 mt-2">{{ formatDate(day.date) }}</span>
            <span class="text-xs font-medium text-slate-700 dark:text-slate-300">{{ day.wordsReviewed }}</span>
          </div>
        </div>
        <p v-else class="text-slate-500 dark:text-slate-400 text-center py-4">No activity this week yet.</p>
      </div>

      <!-- Level Distribution -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Words by Level</h2>
        <div class="space-y-2">
          <div 
            v-for="(count, level) in stats.words.byLevel" 
            :key="level"
            class="flex items-center gap-3"
          >
            <span class="w-8 text-sm font-medium text-slate-600 dark:text-slate-400">{{ level }}</span>
            <div class="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-primary-500"
                :style="{ width: `${stats.words.total > 0 ? (count / stats.words.total) * 100 : 0}%` }"
              />
            </div>
            <span class="w-12 text-sm text-slate-600 dark:text-slate-400 text-right">{{ count }}</span>
          </div>
        </div>
      </div>

      <!-- XP Progress -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Experience</h2>
        <div class="flex items-center gap-4">
          <div class="text-4xl">⭐</div>
          <div class="flex-1">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">Level {{ stats.user.level }}</span>
              <span class="text-slate-600 dark:text-slate-400">{{ stats.user.totalXP }} XP</span>
            </div>
            <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-yellow-500 transition-all duration-500"
                :style="{ width: statsXpProgress + '%' }"
              />
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {{ statsXpNeeded }} XP to next level
            </p>
          </div>
        </div>
      </div>

      <!-- Study Modes -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Study Modes</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span class="text-2xl">📚</span>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">{{ stats.sessionTypes?.learn || 0 }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Learn Sessions</div>
            </div>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span class="text-2xl">🔄</span>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">{{ stats.sessionTypes?.review || 0 }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Review Sessions</div>
            </div>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span class="text-2xl">🧠</span>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">{{ stats.sessionTypes?.quiz || 0 }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Quizzes</div>
            </div>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span class="text-2xl">✍️</span>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">{{ stats.sessionTypes?.spelling || 0 }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Spelling</div>
            </div>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span class="text-2xl">📝</span>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">{{ stats.sessionTypes?.['fill-blank'] || 0 }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Fill Blanks</div>
            </div>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <span class="text-2xl">🎯</span>
            <div>
              <div class="font-semibold text-primary-600 dark:text-primary-400">{{ stats.user.totalSessions }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Total Sessions</div>
            </div>
          </div>
        </div>
      </div>
    </div>

      <!-- Activity Heatmap -->
      <div v-if="heatmapGrid.length > 0" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Activity Heatmap</h2>
        <div class="overflow-x-auto">
          <div class="flex gap-0.5 min-w-[600px]">
            <div v-for="(week, wi) in heatmapGrid" :key="wi" class="flex flex-col gap-0.5">
              <div
                v-for="(day, di) in week"
                :key="di"
                class="w-2.5 h-2.5 rounded-sm transition-colors"
                :class="heatmapColor(day.total)"
                :title="`${day.date}: ${day.total} words`"
              />
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 mt-3 text-xs text-slate-500 dark:text-slate-400">
          <span>Less</span>
          <div class="w-2.5 h-2.5 rounded-sm bg-slate-100 dark:bg-slate-800" />
          <div class="w-2.5 h-2.5 rounded-sm bg-green-200 dark:bg-green-900" />
          <div class="w-2.5 h-2.5 rounded-sm bg-green-400 dark:bg-green-700" />
          <div class="w-2.5 h-2.5 rounded-sm bg-green-600 dark:bg-green-500" />
          <div class="w-2.5 h-2.5 rounded-sm bg-green-800 dark:bg-green-300" />
          <span>More</span>
        </div>
      </div>

      <!-- Study Time -->
      <div v-if="studyTime" class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Study Time</h2>
        <div class="grid grid-cols-3 gap-4 mb-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ totalStudyHours }}h</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Total Study Time</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-slate-900 dark:text-white">{{ studyTime.totalSessions }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Sessions Completed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-secondary-600">{{ studyTime.avgSessionMinutes }}min</div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Avg per Session</div>
          </div>
        </div>
        <div v-if="studyTime.byType.length" class="space-y-2">
          <div v-for="t in studyTime.byType" :key="t.type" class="flex items-center gap-3">
            <span class="w-6 text-center">{{ sessionTypeEmoji[t.type] || '\ud83d\udccd' }}</span>
            <span class="w-20 text-sm text-slate-600 dark:text-slate-400 capitalize">{{ t.type.replace('-', ' ') }}</span>
            <div class="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full bg-primary-500 rounded-full" :style="{ width: studyTime.totalTimeMinutes > 0 ? (t.totalMinutes / studyTime.totalTimeMinutes * 100) + '%' : '0%' }" />
            </div>
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400 text-right">{{ t.totalMinutes }}min ({{ t.sessions }})</span>
          </div>
        </div>
      </div>
  </div>
</template>
