<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'
import { useWordsStore } from '@/stores/words'
import StreakDisplay from '@/components/progress/StreakDisplay.vue'
import DailyGoals from '@/components/progress/DailyGoals.vue'
import LevelProgress from '@/components/progress/LevelProgress.vue'
import CalendarHeatmap from '@/components/progress/CalendarHeatmap.vue'
import ThemeCard from '@/components/learning/ThemeCard.vue'
import WordOfDay from '@/components/learning/WordOfDay.vue'

const router = useRouter()
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const authStore = useAuthStore()
const progressStore = useProgressStore()
const wordsStore = useWordsStore()

onMounted(async () => {
  await Promise.all([
    progressStore.fetchDashboard(),
    progressStore.fetchCalendar(90),
    wordsStore.fetchThemes(),
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
    <LoadingSpinner v-if="loading && !dashboard" text="Loading dashboard..." />

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
