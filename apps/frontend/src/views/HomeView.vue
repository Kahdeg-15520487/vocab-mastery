<script setup lang="ts">
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'
import { useWordsStore } from '@/stores/words'
import { request } from '@/lib/api'
import StreakDisplay from '@/components/progress/StreakDisplay.vue'
import DailyGoals from '@/components/progress/DailyGoals.vue'
import LevelProgress from '@/components/progress/LevelProgress.vue'
import CalendarHeatmap from '@/components/progress/CalendarHeatmap.vue'
import ThemeCard from '@/components/learning/ThemeCard.vue'
import WordOfDay from '@/components/learning/WordOfDay.vue'

const router = useRouter()

const authStore = useAuthStore()
const progressStore = useProgressStore()
const wordsStore = useWordsStore()

// Review schedule
const reviewSchedule = ref<{ overdue: number; days: Array<{ date: string; dayLabel: string; count: number; isToday: boolean }> } | null>(null)

async function loadReviewSchedule() {
  try {
    reviewSchedule.value = await request<any>('/progress/review-schedule')
  } catch {
    // Non-critical
  }
}

onMounted(async () => {
  await Promise.all([
    progressStore.fetchDashboard(),
    progressStore.fetchCalendar(90),
    wordsStore.fetchThemes(),
    loadReviewSchedule(),
  ])
})

const themes = computed(() => wordsStore.themes)
const dashboard = computed(() => progressStore.dashboard)
const calendar = computed(() => progressStore.calendar)
const loading = computed(() => progressStore.loading)

const recentProgress = computed(() => {
  return dashboard.value?.recentProgress || []
})

function selectTheme(theme: any) {
  router.push(`/learn/${theme.slug}`)
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
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="card animate-pulse text-center py-6">
          <div class="h-10 bg-slate-200 dark:bg-slate-700 rounded w-10 mx-auto mb-3"></div>
          <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16 mx-auto mb-1"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24 mx-auto"></div>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Welcome & Quick Stats -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Welcome back, {{ authStore.user?.username || 'there' }}! 👋
        </h1>
        <p class="text-slate-600 dark:text-slate-400">
          Keep up the great work on your vocabulary journey!
        </p>
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
          
          <DailyGoals
            v-if="dashboard"
            :words-to-learn="dashboard.dailyGoal.wordsToLearn"
            :words-to-review="dashboard.dailyGoal.wordsToReview"
            :words-learned="dashboard.dailyGoal.wordsLearned"
            :words-reviewed="dashboard.dailyGoal.wordsReviewed"
            :completed="dashboard.dailyGoal.completed"
          />
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

      <!-- Quick Actions -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <router-link to="/learn" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-4xl mb-2">📚</div>
          <div class="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:text-primary-400">Learn</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Learn new words</div>
        </router-link>
        <router-link to="/review" class="card hover:shadow-md transition-shadow text-center group relative">
          <div class="text-4xl mb-2">🔄</div>
          <div class="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:text-primary-400">Review</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">
            {{ dashboard && dashboard.stats.wordsDueForReview > 0 ? `${dashboard.stats.wordsDueForReview} due` : 'Review due words' }}
          </div>
          <span
            v-if="dashboard && dashboard.stats.wordsDueForReview > 0"
            class="absolute top-2 right-2 inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-danger-500 rounded-full"
          >
            {{ dashboard.stats.wordsDueForReview > 99 ? '99+' : dashboard.stats.wordsDueForReview }}
          </span>
        </router-link>
        <router-link to="/quiz" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-4xl mb-2">🧠</div>
          <div class="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:text-primary-400">Quiz</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Test your knowledge</div>
        </router-link>
        <router-link to="/browse" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-4xl mb-2">📖</div>
          <div class="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 dark:text-primary-400">Browse</div>
          <div class="text-sm text-slate-500 dark:text-slate-400">Explore all words</div>
        </router-link>
      </div>

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
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4">Learn by Theme</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ThemeCard
            v-for="theme in themes"
            :key="theme.id"
            :theme="theme"
            @select="selectTheme"
          />
        </div>
      </div>
    </template>
  </div>
</template>
