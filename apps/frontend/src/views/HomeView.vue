<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'
import { useWordsStore } from '@/stores/words'
import { useSprintStore } from '@/stores/sprint'
import { request, sprintApi, statsApi } from '@/lib/api'
import StreakDisplay from '@/components/progress/StreakDisplay.vue'
import DailyGoals from '@/components/progress/DailyGoals.vue'
import LevelProgress from '@/components/progress/LevelProgress.vue'
import CalendarHeatmap from '@/components/progress/CalendarHeatmap.vue'
import ThemeCard from '@/components/learning/ThemeCard.vue'
import WordOfDay from '@/components/learning/WordOfDay.vue'
import VocabDonut from '@/components/progress/VocabDonut.vue'
import { useRecentlyViewed } from '@/composables/useRecentlyViewed'
import { useNotifications } from '@/composables/useNotifications'
import { useToast } from '@/composables/useToast'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import { progressApi } from '@/lib/api'

const router = useRouter()
const { recentlyViewed } = useRecentlyViewed()
const notifications = useNotifications()

// Learning velocity
const velocity = ref<{ daily: { date: string; learned: number; reviewed: number }[]; avgLearnedPerDay: number; activeDays: number } | null>(null)

const toast = useToast()
const goalAlreadyCelebrated = ref(false)
const confettiActive = ref(false)

const authStore = useAuthStore()
const progressStore = useProgressStore()
const wordsStore = useWordsStore()
const sprintStore = useSprintStore()

// Watch for daily goal completion → trigger celebration
watch(() => progressStore.dashboard?.dailyGoal?.completed, (completed) => {
  if (completed && !goalAlreadyCelebrated.value) {
    goalAlreadyCelebrated.value = true
    confettiActive.value = true
    toast.success('🎯 Daily goal completed! Amazing work!')
    setTimeout(() => { confettiActive.value = false }, 5000)
  }
})

// Review schedule
const reviewSchedule = ref<{ overdue: number; days: Array<{ date: string; dayLabel: string; count: number; isToday: boolean }> } | null>(null)

// Smart review recommendations
const reviewRecs = ref<any>(null)
const freezeLoading = ref(false)
const freezeResult = ref<{ success: boolean; frozenUntil: string } | null>(null)

async function activateFreeze() {
  freezeLoading.value = true
  try {
    freezeResult.value = await progressApi.activateStreakFreeze()
    if (dashboard.value?.streak) {
      // Refetch dashboard to update streak state
      await progressStore.fetchDashboard()
    }
  } catch (e: any) {
    freezeResult.value = null
  } finally {
    freezeLoading.value = false
  }
}

// CEFR mastery data for donut chart
const masteryData = ref<{ levels: Array<{ level: string; total: number; mastered: number; learning: number; reviewing: number; unseen: number }> } | null>(null)

// Plateau detection
const plateau = ref<{ plateau: boolean; message: string | null; suggestions: string[]; currentStreak: number } | null>(null)
const nextReviewData = ref<{ dueNow: number; nextReview: { at: string; word: string } | null; upcoming24h: number } | null>(null)

// Compute recommended CEFR focus level
const learningPath = computed(() => {
  const levels = dashboard.value?.levelProgress
  if (!levels?.length) return null

  let focusLevel = 'A1'
  let focusReason = ''
  let nextMilestone = ''
  let pct = 0

  // Find the lowest level that isn't >= 80% mastered
  for (const level of levels) {
    if (level.progress < 80) {
      focusLevel = level.level
      pct = level.progress
      const remaining = level.total - level.learned
      focusReason = remaining <= 0 ? `Master ${level.level} — you're close!` : `${remaining} more words to 80% mastery`
      break
    }
  }

  // If all levels >= 80%, suggest the next unmastered
  if (levels.every(l => l.progress >= 80)) {
    const unmastered = levels.find(l => l.mastered < l.total)
    if (unmastered) {
      focusLevel = unmastered.level
      pct = unmastered.progress
      focusReason = `Almost fully mastered! ${unmastered.total - unmastered.mastered} words remaining`
    } else {
      focusLevel = 'C2'
      pct = 100
      focusReason = 'All levels mastered! Maintain with reviews'
    }
  }

  // Next milestone
  const currentLevel = levels.find(l => l.level === focusLevel)
  if (currentLevel) {
    const thresholds = [25, 50, 75, 100]
    const next = thresholds.find(t => currentLevel.progress < t)
    nextMilestone = next ? `${next}% of ${focusLevel}` : `${focusLevel} complete!`
  }

  return { focusLevel, pct, focusReason, nextMilestone }
})
const paceData = ref<{
  target: number
  deadline: string
  totalLearned: number
  wordsRemaining: number
  dailyPace: number
  requiredPace: number
  projectedTotal: number
  onTrack: boolean
  daysRemaining: number
  estimatedCompletion: string | null
  progress: number
} | null>(null)
const milestones = ref<any[]>([])

async function loadReviewSchedule() {
  try {
    reviewSchedule.value = await request<any>('/progress/review-schedule')
  } catch {
    // Non-critical
  }
}

async function loadReviewRecommendations() {
  try {
    reviewRecs.value = await progressApi.getReviewRecommendations()
  } catch {
    // Non-critical
  }
}

onMounted(async () => {
  await Promise.all([
    progressStore.fetchDashboard(),
    statsApi.getVelocity().then(v => velocity.value = v).catch(() => {}),
    statsApi.getMastery().then(d => masteryData.value = d).catch(() => {}),
    progressStore.fetchCalendar(90),
    wordsStore.fetchThemes(),
    loadReviewSchedule(),
    loadReviewRecommendations(),
    progressApi.getNextReview().then(d => nextReviewData.value = d).catch(() => {}),
    sprintStore.fetchCurrent(),
  ])

  // Start notification reminder check
  if (notifications.supported && notifications.permission.value === 'granted') {
    notifications.startReminderCheck(() => progressStore.dashboard?.stats.wordsDueForReview ?? 0)
  }

  // Check for plateau (non-blocking)
  request('/sprints/insights/plateau').then((data: any) => {
    if (data.plateau || data.suggestions?.length) plateau.value = data
  }).catch(() => {})

  // Load pace calculator (non-blocking)
  sprintApi.getPace().then((data) => {
    if (data && data.target > 0) paceData.value = data
  }).catch(() => {})

  // Load milestones (non-blocking)
  sprintApi.getMilestones().then((data) => {
    if (data.milestones?.length) milestones.value = data.milestones
  }).catch(() => {})
})

const themes = computed(() => wordsStore.themes)
const dashboard = computed(() => progressStore.dashboard)
const calendar = computed(() => progressStore.calendar)

const cefrSegments = computed(() => {
  if (!masteryData.value) return []
  const colors: Record<string, string> = { A1: '#22c55e', A2: '#3b82f6', B1: '#f59e0b', B2: '#ef4444', C1: '#8b5cf6', C2: '#ec4899' }
  return masteryData.value.levels
    .filter(l => l.mastered + l.learning + l.reviewing > 0)
    .map(l => ({ label: l.level, value: l.mastered + l.learning + l.reviewing, color: colors[l.level] || '#94a3b8' }))
})
const loading = computed(() => progressStore.loading)

const sprintData = computed(() => sprintStore.currentSprint)
const sprintStats = computed(() => sprintStore.sprintStats)

const recentProgress = computed(() => {
  return dashboard.value?.recentProgress || []
})

// XP calculations
const xpForLevel = (level: number) => {
  // Same formula as backend: level N requires 50*(N+1) cumulative XP
  let total = 0
  for (let i = 1; i < level; i++) {
    total += 50 * (i + 1)
  }
  return total
}

const xpForNextLevel = computed(() => {
  const level = dashboard.value?.stats?.level ?? 1
  return xpForLevel(level + 1)
})

const xpProgressPercent = computed(() => {
  const totalXp = dashboard.value?.stats?.totalXp ?? 0
  const level = dashboard.value?.stats?.level ?? 1
  const currentLevelXp = xpForLevel(level)
  const nextLevelXp = xpForLevel(level + 1)
  const progress = nextLevelXp - currentLevelXp
  if (progress === 0) return 100
  return Math.min(100, Math.round(((totalXp - currentLevelXp) / progress) * 100))
})

function selectTheme(theme: any) {
  router.push(`/learn/${theme.slug}`)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours < 24) return `${hours}h ${mins}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading && !dashboard" class="space-y-6">
      <!-- Skeleton Welcome -->
      <div class="text-center animate-pulse">
        <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded w-64 mx-auto mb-2"></div>
        <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-48 mx-auto"></div>
      </div>

      <!-- Skeleton Dashboard Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="space-y-6">
          <!-- Skeleton Streak -->
          <div class="card animate-pulse">
            <div class="h-5 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-4"></div>
            <div class="flex items-center justify-around">
              <div class="text-center">
                <div class="h-10 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-1"></div>
                <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20"></div>
              </div>
              <div class="text-center">
                <div class="h-10 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-1"></div>
                <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20"></div>
              </div>
            </div>
          </div>
          <!-- Skeleton Goals -->
          <div class="card animate-pulse">
            <div class="h-5 bg-slate-200 dark:bg-slate-700 rounded w-28 mb-4"></div>
            <div class="space-y-3">
              <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
              <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
            </div>
          </div>
        </div>
        <!-- Skeleton Level Progress -->
        <div class="lg:col-span-2 card animate-pulse">
          <div class="h-5 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-4"></div>
          <div class="space-y-3">
            <div v-for="i in 4" :key="i" class="flex items-center gap-3">
              <div class="h-6 bg-slate-200 dark:bg-slate-700 rounded-full w-8"></div>
              <div class="flex-1 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
              <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-12"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Skeleton Quick Actions -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div v-for="i in 6" :key="i" class="card animate-pulse text-center py-6">
          <div class="h-10 bg-slate-200 dark:bg-slate-700 rounded w-10 mx-auto mb-3"></div>
          <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16 mx-auto mb-1"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24 mx-auto"></div>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Review Alert Banner -->
      <div
        v-if="dashboard && dashboard.stats.wordsDueForReview > 0"
        class="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-600 dark:to-primary-700 text-white rounded-xl p-4 flex items-center justify-between"
      >
        <div class="flex items-center gap-3">
          <span class="text-3xl">🔄</span>
          <div>
            <div class="font-semibold">You have {{ dashboard.stats.wordsDueForReview }} words to review</div>
            <div class="text-sm text-primary-100">Keep your streak alive — review now!</div>
          </div>
        </div>
        <router-link
          to="/review"
          class="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors text-sm"
        >
          Review Now →
        </router-link>
      </div>

      <!-- Plateau Alert -->
      <div
        v-if="plateau && plateau.plateau"
        class="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl p-4 flex items-start justify-between"
      >
        <div class="flex items-start gap-3">
          <span class="text-3xl">📊</span>
          <div>
            <div class="font-semibold">Learning Pace Slowing Down</div>
            <div class="text-sm text-amber-100 mt-1">{{ plateau.message }}</div>
            <div v-if="plateau.suggestions?.length" class="mt-2 space-y-1">
              <div v-for="s in plateau.suggestions" :key="s" class="text-sm text-amber-100">· {{ s }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Next Review Timer -->
      <div
        v-if="nextReviewData && nextReviewData.dueNow === 0 && nextReviewData.nextReview"
        class="bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-indigo-600 dark:to-purple-600 text-white rounded-xl p-4 flex items-center justify-between"
      >
        <div class="flex items-center gap-3">
          <span class="text-3xl">⏰</span>
          <div>
            <div class="font-semibold">Next review in ~{{ formatTimeUntil(nextReviewData.nextReview.at) }}</div>
            <div class="text-sm text-indigo-100">{{ nextReviewData.upcoming24h }} reviews scheduled in the next 24h</div>
          </div>
        </div>
        <div class="text-right">
          <div class="text-xs text-indigo-200">Next word</div>
          <div class="text-lg font-bold">{{ nextReviewData.nextReview.word }}</div>
        </div>
      </div>

      <!-- Welcome & Quick Stats -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Welcome back, {{ authStore.user?.username || 'there' }}! {{ dashboard?.streak?.current ? '🔥' : '👋' }}
        </h1>
        <p class="text-slate-600 dark:text-slate-400">
          <template v-if="(dashboard?.streak?.current ?? 0) >= 7">
            Amazing {{ dashboard!.streak!.current }}-day streak! You're on fire!
          </template>
          <template v-else-if="dashboard?.dailyGoal?.completed">
            Today's goal complete! Great work! 🎉
          </template>
          <template v-else-if="(dashboard?.stats?.wordsDueForReview ?? 0) > 0">
            You have words waiting for review. Let's keep the momentum going!
          </template>
          <template v-else>
            Keep up the great work on your vocabulary journey!
          </template>
        </p>
        <p v-if="dashboard && (dashboard.dailyGoal.wordsLearned > 0 || dashboard.dailyGoal.wordsReviewed > 0)" class="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Today: {{ dashboard.dailyGoal.wordsLearned }} learned · {{ dashboard.dailyGoal.wordsReviewed }} reviewed
        </p>
      </div>

      <!-- Today Summary (mobile-compact) -->
      <div v-if="dashboard" class="grid grid-cols-4 gap-2 text-center">
        <div class="card py-2 px-1">
          <div class="text-lg font-bold text-orange-500">{{ dashboard.streak.current }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Streak</div>
        </div>
        <div class="card py-2 px-1">
          <div class="text-lg font-bold text-primary-600 dark:text-primary-400">{{ dashboard.stats.totalXp }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">XP</div>
        </div>
        <div class="card py-2 px-1">
          <div class="text-lg font-bold text-purple-600 dark:text-purple-400">{{ dashboard.stats.level }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Level</div>
        </div>
        <div class="card py-2 px-1">
          <div class="text-lg font-bold text-green-600 dark:text-green-400">{{ dashboard.stats.totalWordsLearned }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400">Learned</div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <router-link to="/learn" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">📚</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Learn</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Learn new words</div>
        </router-link>
        <router-link to="/review" class="card hover:shadow-md transition-shadow text-center group relative">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🔄</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Review</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">
            {{ dashboard && dashboard.stats.wordsDueForReview > 0 ? `${dashboard.stats.wordsDueForReview} due` : 'Review due words' }}
          </div>
          <span
            v-if="dashboard && dashboard.stats.wordsDueForReview > 0"
            class="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 text-xs font-bold text-white bg-danger-500 rounded-full"
          >
            {{ dashboard.stats.wordsDueForReview > 99 ? '99+' : dashboard.stats.wordsDueForReview }}
          </span>
        </router-link>
        <router-link to="/quiz" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🧠</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Quiz</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Test your knowledge</div>
        </router-link>
        <router-link to="/spelling" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">✍️</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Spelling</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Type the word</div>
        </router-link>
        <router-link to="/fill-blank" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">📝</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Fill Blanks</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Context practice</div>
        </router-link>
        <router-link to="/speaking" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🎙️</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Speaking</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Pronunciation</div>
        </router-link>
        <router-link to="/listening" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🎧</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Listening</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Audio comprehension</div>
        </router-link>
        <router-link to="/browse" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">📖</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Browse</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Explore all words</div>
        </router-link>
        <router-link to="/sprints" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🏃</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Sprints</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Focused learning</div>
        </router-link>
        <router-link to="/reading" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">📚</div>
          <div class="font-semibold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">Reading</div>
          <div class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Text analysis</div>
        </router-link>
        <router-link to="/daily-challenge" class="card hover:shadow-md transition-shadow text-center group bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🎯</div>
          <div class="font-semibold text-sm sm:text-base text-amber-700 dark:text-amber-300">Daily Challenge</div>
          <div class="text-xs sm:text-sm text-amber-500 dark:text-amber-400 hidden sm:block">+75 bonus XP</div>
        </router-link>
        <router-link to="/word-chain" class="card hover:shadow-md transition-shadow text-center group bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🔗</div>
          <div class="font-semibold text-sm sm:text-base text-purple-700 dark:text-purple-300">Word Chain</div>
          <div class="text-xs sm:text-sm text-purple-500 dark:text-purple-400 hidden sm:block">Chain game</div>
        </router-link>
        <router-link to="/speed-round" class="card hover:shadow-md transition-shadow text-center group bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">⚡</div>
          <div class="font-semibold text-sm sm:text-base text-red-700 dark:text-red-300">Speed Round</div>
          <div class="text-xs sm:text-sm text-red-500 dark:text-red-400 hidden sm:block">Timed challenge</div>
        </router-link>
        <router-link to="/recommendations" class="card hover:shadow-md transition-shadow text-center group bg-teal-50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800">
          <div class="text-3xl sm:text-4xl mb-1 sm:mb-2">🎯</div>
          <div class="font-semibold text-sm sm:text-base text-teal-700 dark:text-teal-300">For You</div>
          <div class="text-xs sm:text-sm text-teal-500 dark:text-teal-400 hidden sm:block">Smart picks</div>
        </router-link>
      </div>

      <!-- Recently Viewed Words -->
      <div v-if="recentlyViewed.length > 0" class="mt-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-slate-900 dark:text-white">🕐 Recently Viewed</h2>
          <router-link to="/browse" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            Browse all →
          </router-link>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-2">
          <RouterLink
            v-for="w in recentlyViewed.slice(0, 12)"
            :key="w.id"
            :to="`/words/${w.id}`"
            class="flex-shrink-0 px-3 py-2 rounded-xl text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all"
          >
            <span class="font-medium text-slate-900 dark:text-white">{{ w.word }}</span>
            <span class="ml-1.5 text-xs text-slate-400">{{ w.cefrLevel }}</span>
          </RouterLink>
        </div>
      </div>

      <!-- Dashboard Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Column: Streak & Goals -->
        <div class="space-y-6">
          <StreakDisplay
            v-if="dashboard"
            :current="dashboard.streak.current"
            :longest="dashboard.streak.longest"
          />

          <!-- Streak Freeze -->
          <div v-if="dashboard && dashboard.streak.current >= 2" class="card flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-xl">🧊</span>
              <div>
                <p class="text-sm font-medium text-slate-900 dark:text-white">Streak Freeze</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">Protect your streak for one day</p>
              </div>
            </div>
            <button
              v-if="freezeResult?.success"
              disabled
              class="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm font-medium"
            >
              Active ✅
            </button>
            <button
              v-else
              @click="activateFreeze"
              :disabled="freezeLoading"
              class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {{ freezeLoading ? '...' : 'Activate' }}
            </button>
          </div>
          
          <DailyGoals
            v-if="dashboard"
            :words-to-learn="dashboard.dailyGoal.wordsToLearn"
            :words-to-review="dashboard.dailyGoal.wordsToReview"
            :words-learned="dashboard.dailyGoal.wordsLearned"
            :words-reviewed="dashboard.dailyGoal.wordsReviewed"
            :completed="dashboard.dailyGoal.completed"
          />

          <!-- Weekly Progress -->
          <div v-if="dashboard?.weeklyProgress" class="card">
            <h3 class="font-semibold text-slate-900 dark:text-white mb-3">📊 This Week</h3>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div>
                <div class="text-xl font-bold text-green-600 dark:text-green-400">{{ dashboard.weeklyProgress.wordsLearned }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Learned</div>
              </div>
              <div>
                <div class="text-xl font-bold text-blue-600 dark:text-blue-400">{{ dashboard.weeklyProgress.wordsReviewed }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Reviewed</div>
              </div>
              <div>
                <div class="text-xl font-bold text-orange-500">{{ dashboard.weeklyProgress.daysActive }}<span class="text-sm text-slate-400">/7</span></div>
                <div class="text-xs text-slate-500 dark:text-slate-400">Days Active</div>
              </div>
            </div>
          </div>

          <!-- Learning Velocity -->
          <div v-if="velocity && velocity.daily.length > 0" class="card">
            <h3 class="font-semibold text-slate-900 dark:text-white mb-3">\ud83d\udcc8 Learning Velocity</h3>
            <div class="flex items-center gap-4 mb-3">
              <div class="text-center">
                <div class="text-xl font-bold text-green-600 dark:text-green-400">{{ velocity.avgLearnedPerDay }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">words/day avg</div>
              </div>
              <div class="text-center">
                <div class="text-xl font-bold text-blue-600 dark:text-blue-400">{{ velocity.activeDays }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">active days (30d)</div>
              </div>
            </div>
            <div class="flex items-end gap-1 h-16">
              <div
                v-for="(day, i) in velocity.daily.slice(-14)"
                :key="i"
                class="flex-1 rounded-t transition-all"
                :class="day.learned > 0 ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'"
                :style="{ height: day.learned > 0 ? Math.max(15, (day.learned / Math.max(...velocity.daily.map(d => d.learned))) * 100) + '%' : '4px' }"
                :title="day.date.split('T')[0] + ': ' + day.learned + ' learned'"
              />
            </div>
            <div class="flex justify-between text-xs text-slate-400 mt-1">
              <span>14 days ago</span>
              <span>Today</span>
            </div>
          </div>

          <!-- Sprint Progress -->
          <div v-if="sprintData" class="card border-l-4 border-indigo-500">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-semibold text-slate-900 dark:text-white">🏃 Sprint #{{ sprintData.number }}</h3>
              <router-link to="/sprints" class="text-xs text-primary-600 dark:text-primary-400 hover:underline">View →</router-link>
            </div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">{{ sprintStats?.wordsLearned ?? 0 }} / {{ sprintData.wordTarget }} words</span>
              <span class="font-medium text-indigo-600 dark:text-indigo-400">{{ sprintStats?.progress ?? 0 }}%</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
              <div class="bg-indigo-500 h-2 rounded-full transition-all duration-500" :style="{ width: Math.max(2, sprintStats?.progress ?? 0) + '%' }"></div>
            </div>
            <div class="flex justify-between text-xs text-slate-500 mt-1.5">
              <span>{{ sprintStats?.daysRemaining ?? 0 }} days left</span>
              <span>{{ sprintStats?.dailyPace ?? 0 }} words/day</span>
            </div>
          </div>

          <!-- XP & Level -->
          <div v-if="dashboard" class="card">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-slate-900 dark:text-white">Level & XP</h3>
              <span class="badge badge-primary">Lv. {{ dashboard.stats.level }}</span>
            </div>
            <div class="flex items-center gap-3 mb-2">
              <div class="text-3xl">⚡</div>
              <div class="flex-1">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-600 dark:text-slate-400">{{ dashboard.stats.totalXp }} XP</span>
                  <span class="text-slate-400 text-xs">Next: {{ xpForNextLevel }} XP</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                  <div
                    class="bg-primary-500 h-2.5 rounded-full transition-all duration-500"
                    :style="{ width: xpProgressPercent + '%' }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Overall Progress -->
          <div v-if="dashboard" class="card">
            <h3 class="font-semibold text-slate-900 dark:text-white mb-3">Overall Progress</h3>
            <div class="space-y-3">
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-600 dark:text-slate-400">Words Learned</span>
                  <span class="font-medium text-slate-900 dark:text-white">
                    {{ dashboard.stats.totalWordsLearned }} / {{ dashboard.stats.totalWordsInDb || '?' }}
                  </span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                  <div
                    class="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                    :style="{ width: (dashboard.stats.totalWordsInDb ? Math.round((dashboard.stats.totalWordsLearned / dashboard.stats.totalWordsInDb) * 100) : 0) + '%' }"
                  ></div>
                </div>
                <p class="text-xs text-slate-400 mt-1">
                  {{ dashboard.stats.totalWordsInDb ? Math.round((dashboard.stats.totalWordsLearned / dashboard.stats.totalWordsInDb) * 100) : 0 }}% of all words
                </p>
              </div>
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-600 dark:text-slate-400">Mastered</span>
                  <span class="font-medium text-slate-900 dark:text-white">
                    {{ dashboard.stats.totalWordsMastered }} / {{ dashboard.stats.totalWordsInDb || '?' }}
                  </span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                  <div
                    class="bg-primary-500 h-2.5 rounded-full transition-all duration-500"
                    :style="{ width: (dashboard.stats.totalWordsInDb ? Math.round((dashboard.stats.totalWordsMastered / dashboard.stats.totalWordsInDb) * 100) : 0) + '%' }"
                  ></div>
                </div>
                <p class="text-xs text-slate-400 mt-1">
                  {{ dashboard.stats.totalWordsInDb ? Math.round((dashboard.stats.totalWordsMastered / dashboard.stats.totalWordsInDb) * 100) : 0 }}% mastered
                </p>
              </div>
            </div>
          </div>

          <!-- CEFR Distribution -->
          <div v-if="cefrSegments.length" class="card">
            <h3 class="font-semibold text-slate-900 dark:text-white mb-3">Vocabulary by Level</h3>
            <div class="flex justify-center">
              <VocabDonut :segments="cefrSegments" :size="140" :stroke-width="18" />
            </div>
          </div>

          <!-- Year Goal Pace Tracker -->
          <div v-if="paceData" class="card border-l-4" :class="paceData.onTrack ? 'border-green-500' : 'border-amber-500'">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-semibold text-slate-900 dark:text-white">🎯 Year Goal</h3>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="paceData.onTrack ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'">
                {{ paceData.onTrack ? '✅ On Track' : '⚠️ Behind' }}
              </span>
            </div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-600 dark:text-slate-400">Progress</span>
              <span class="font-medium text-slate-900 dark:text-white">{{ paceData.totalLearned }} / {{ paceData.target }} words</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-2">
              <div
                class="h-3 rounded-full transition-all duration-500"
                :class="paceData.onTrack ? 'bg-green-500' : 'bg-amber-500'"
                :style="{ width: paceData.progress + '%' }"
              ></div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p class="text-slate-500 dark:text-slate-400">Daily Pace</p>
                <p class="font-semibold text-slate-900 dark:text-white">{{ paceData.dailyPace }}/day</p>
              </div>
              <div>
                <p class="text-slate-500 dark:text-slate-400">Required</p>
                <p class="font-semibold" :class="paceData.dailyPace >= paceData.requiredPace ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">{{ paceData.requiredPace }}/day</p>
              </div>
              <div>
                <p class="text-slate-500 dark:text-slate-400">Days Left</p>
                <p class="font-semibold text-slate-900 dark:text-white">{{ paceData.daysRemaining }}</p>
              </div>
            </div>
            <p v-if="paceData.estimatedCompletion && !paceData.onTrack" class="text-xs text-amber-600 dark:text-amber-400 mt-2">
              At current pace, you'll reach your goal by {{ formatDate(paceData.estimatedCompletion) }}
            </p>
            <p v-else-if="paceData.onTrack && paceData.dailyPace > 0" class="text-xs text-green-600 dark:text-green-400 mt-2">
              {{ paceData.projectedTotal }} words projected by deadline — keep it up! 🚀
            </p>
          </div>

          <!-- Milestone Tracker -->
          <div v-if="milestones.length" class="card">
            <h3 class="font-semibold text-slate-900 dark:text-white mb-3">🎯 Milestones</h3>
            <div class="space-y-3">
              <div v-for="m in milestones" :key="m.id">
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-700 dark:text-slate-300">
                    {{ m.achieved ? '🏆' : m.progress > 0 ? '🔵' : '⚪' }} {{ m.name }}
                  </span>
                  <span class="text-slate-500 dark:text-slate-400">{{ m.current?.toLocaleString() ?? 0 }} / {{ m.wordTarget?.toLocaleString() }}</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    class="h-2 rounded-full transition-all duration-500"
                    :class="m.achieved ? 'bg-green-500' : 'bg-indigo-500'"
                    :style="{ width: m.progress + '%' }"
                  ></div>
                </div>
                <div class="flex justify-between mt-0.5">
                  <span class="text-xs text-slate-400">{{ m.progress }}%</span>
                  <span class="text-xs" :class="m.daysRemaining < 30 && !m.achieved ? 'text-amber-500' : 'text-slate-400'">
                    {{ m.achieved ? '✅ Achieved!' : `${m.daysRemaining} days left` }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Stats -->
          <div v-if="dashboard" class="card">
            <h3 class="font-semibold text-slate-900 dark:text-white mb-3">Quick Stats</h3>
            <div class="space-y-2">
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600 dark:text-slate-400">❤️ Favorites</span>
                <span class="font-medium text-slate-900 dark:text-white">{{ dashboard.stats.favoriteCount || 0 }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600 dark:text-slate-400">🎯 Sessions</span>
                <span class="font-medium text-slate-900 dark:text-white">{{ dashboard.stats.totalSessions || 0 }}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600 dark:text-slate-400">📚 Words in DB</span>
                <span class="font-medium text-slate-900 dark:text-white">{{ dashboard.stats.totalWordsInDb?.toLocaleString() || '?' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Middle Column: CEFR Progress -->
        <div class="lg:col-span-2">
          <LevelProgress
            v-if="dashboard"
            :levels="dashboard.levelProgress"
          />
        </div>
      </div>

      <!-- Word of the Day -->
      <WordOfDay />

      <!-- Activity Calendar -->
      <CalendarHeatmap :activities="calendar" />

      <!-- Upcoming Review Schedule -->
      <div v-if="reviewSchedule && (reviewSchedule.overdue > 0 || reviewSchedule.days.some(d => d.count > 0))">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">📅 Upcoming Reviews</h2>
          <router-link to="/review" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            Review now →
          </router-link>
        </div>
        <div class="grid grid-cols-7 gap-1">
          <div
            v-for="day in reviewSchedule.days"
            :key="day.date"
            class="text-center p-2 rounded-lg"
            :class="day.count > 0 ? 'bg-primary-50 dark:bg-primary-900/20' : 'bg-slate-50 dark:bg-slate-800'"
          >
            <div class="text-xs text-slate-500 dark:text-slate-400">
              {{ day.dayLabel.split(', ')[0] }}
            </div>
            <div class="text-xs text-slate-400">
              {{ day.dayLabel.split(', ')[1] }}
            </div>
            <div
              class="text-sm font-bold mt-1"
              :class="(day.isToday && day.count > 0) ? 'text-red-600' : day.count > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-300 dark:text-slate-600'"
            >
              {{ day.count || '—' }}
            </div>
          </div>
        </div>
        <div v-if="reviewSchedule.overdue > 0" class="mt-2 text-center text-sm text-red-600 dark:text-red-400">
          ⚠️ {{ reviewSchedule.overdue }} word{{ reviewSchedule.overdue !== 1 ? 's' : '' }} overdue for review
        </div>
      </div>

      <!-- Smart Review Recommendations -->
      <div v-if="reviewRecs && (reviewRecs.overdue.length > 0 || reviewRecs.weak.length > 0)" class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-slate-900 dark:text-white">🎯 Review Focus</h3>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="{
              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300': reviewRecs.priority === 'high',
              'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300': reviewRecs.priority === 'medium',
              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300': reviewRecs.priority === 'low',
            }"
          >
            {{ reviewRecs.priority }} priority
          </span>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-400 mb-3">{{ reviewRecs.recommendation }}</p>

        <!-- Overdue words -->
        <div v-if="reviewRecs.overdue.length > 0" class="mb-3">
          <h4 class="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">⏰ Overdue ({{ reviewRecs.overdue.length }})</h4>
          <div class="flex flex-wrap gap-1.5">
            <router-link
              v-for="w in reviewRecs.overdue.slice(0, 8)"
              :key="w.id"
              :to="`/words/${w.id}`"
              class="px-2 py-1 text-xs rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              {{ w.word }}
              <span v-if="w.daysOverdue > 1" class="text-red-400 dark:text-red-500">(+{{ w.daysOverdue }}d)</span>
            </router-link>
          </div>
        </div>

        <!-- Weak words -->
        <div v-if="reviewRecs.weak.length > 0">
          <h4 class="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">💪 Needs Practice ({{ reviewRecs.weak.length }})</h4>
          <div class="flex flex-wrap gap-1.5">
            <router-link
              v-for="w in reviewRecs.weak.slice(0, 6)"
              :key="w.id"
              :to="`/words/${w.id}`"
              class="px-2 py-1 text-xs rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              {{ w.word }}
            </router-link>
          </div>
        </div>

        <router-link
          to="/review"
          class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          Start Review →
        </router-link>
      </div>

      <!-- Adaptive Learning Path -->
      <div v-if="learningPath" class="card">
        <h3 class="font-semibold text-slate-900 dark:text-white mb-3">🧭 Learning Path</h3>
        <div class="flex items-center gap-4 mb-3">
          <div class="text-center">
            <div class="text-3xl font-bold" :class="{
              'text-emerald-600 dark:text-emerald-400': ['A1','A2'].includes(learningPath.focusLevel),
              'text-blue-600 dark:text-blue-400': ['B1','B2'].includes(learningPath.focusLevel),
              'text-purple-600 dark:text-purple-400': ['C1','C2'].includes(learningPath.focusLevel),
            }">
              {{ learningPath.focusLevel }}
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400">Focus Level</div>
          </div>
          <div class="flex-1">
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-2">
              <div
                class="h-2.5 rounded-full transition-all"
                :class="learningPath.pct >= 75 ? 'bg-green-500' : learningPath.pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'"
                :style="{ width: learningPath.pct + '%' }"
              />
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-400">{{ learningPath.focusReason }}</p>
            <p class="text-xs text-slate-400 mt-1">Next milestone: {{ learningPath.nextMilestone }}</p>
          </div>
        </div>
        <router-link
          to="/browse"
          class="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          Browse {{ learningPath.focusLevel }} words →
        </router-link>
      </div>

      <!-- Recently Learned Words -->
      <div v-if="dashboard && dashboard.stats.totalWordsLearned > 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Recent Words</h2>
          <router-link to="/browse" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            View all →
          </router-link>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="wp in recentProgress"
            :key="wp.wordId"
            class="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <span class="font-semibold text-slate-900 dark:text-white">{{ wp.word }}</span>
                <span v-if="wp.cefrLevel" class="ml-2 text-xs text-slate-400">{{ wp.cefrLevel }}</span>
              </div>
              <span
                class="text-xs font-medium px-2 py-0.5 rounded-full"
                :class="{
                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300': wp.status === 'learning',
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300': wp.status === 'reviewing',
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300': wp.status === 'mastered',
                }"
              >
                {{ wp.status }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Achievements -->
      <div v-if="dashboard && dashboard.recentAchievements.length > 0">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4">Recent Achievements</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div
            v-for="achievement in dashboard.recentAchievements"
            :key="achievement.key"
            class="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 text-center"
          >
            <div class="text-3xl mb-2">{{ achievement.icon }}</div>
            <div class="font-medium text-sm text-slate-800 dark:text-slate-200">{{ achievement.name }}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {{ achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : '' }}
            </div>
          </div>
        </div>
        <div class="mt-4 text-center">
          <router-link to="/achievements" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">
            View all achievements →
          </router-link>
        </div>
      </div>

      <!-- Themes Section -->
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Learn by Topic</h2>
          <router-link to="/browse" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">
            Browse all {{ themes.length }} →
          </router-link>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ThemeCard
            v-for="theme in themes.slice(0, 6)"
            :key="theme.id"
            :theme="theme"
            @select="selectTheme"
          />
        </div>
      </div>
    </template>
  </div>
  <ConfettiEffect :active="confettiActive" :duration="5000" />
</template>
