<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProgressStore } from '@/stores/progress'
import { useWordsStore } from '@/stores/words'
import StreakDisplay from '@/components/progress/StreakDisplay.vue'
import DailyGoals from '@/components/progress/DailyGoals.vue'
import LevelProgress from '@/components/progress/LevelProgress.vue'
import CalendarHeatmap from '@/components/progress/CalendarHeatmap.vue'
import ThemeCard from '@/components/learning/ThemeCard.vue'
import WordOfDay from '@/components/learning/WordOfDay.vue'

const router = useRouter()
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

function selectTheme(theme: any) {
  router.push(`/learn/${theme.slug}`)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Loading State -->
    <div v-if="loading && !dashboard" class="text-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-2 text-slate-600">Loading dashboard...</p>
    </div>

    <template v-else>
      <!-- Welcome & Quick Stats -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-slate-900 mb-2">
          Welcome back! 👋
        </h1>
        <p class="text-slate-600">
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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <router-link to="/learn" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-4xl mb-2">📚</div>
          <div class="font-semibold text-slate-900 group-hover:text-primary-600">Learn</div>
          <div class="text-sm text-slate-500">Learn new words</div>
        </router-link>
        <router-link to="/review" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-4xl mb-2">🔄</div>
          <div class="font-semibold text-slate-900 group-hover:text-primary-600">Review</div>
          <div class="text-sm text-slate-500">Review due words</div>
        </router-link>
        <router-link to="/browse" class="card hover:shadow-md transition-shadow text-center group">
          <div class="text-4xl mb-2">📖</div>
          <div class="font-semibold text-slate-900 group-hover:text-primary-600">Browse</div>
          <div class="text-sm text-slate-500">Explore all words</div>
        </router-link>
      </div>

      <!-- Activity Calendar -->
      <CalendarHeatmap :activities="calendar" />

      <!-- Recent Achievements -->
      <div v-if="dashboard && dashboard.recentAchievements.length > 0">
        <h2 class="text-xl font-bold text-slate-900 mb-4">Recent Achievements</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <div
            v-for="achievement in dashboard.recentAchievements"
            :key="achievement.key"
            class="bg-white rounded-lg shadow-sm p-4 text-center"
          >
            <div class="text-3xl mb-2">{{ achievement.icon }}</div>
            <div class="font-medium text-sm text-slate-800">{{ achievement.name }}</div>
            <div class="text-xs text-slate-500 mt-1">
              {{ achievement.unlockedAt ? new Date(achievement.unlockedAt).toLocaleDateString() : '' }}
            </div>
          </div>
        </div>
        <div class="mt-4 text-center">
          <router-link to="/achievements" class="text-primary-600 hover:underline text-sm">
            View all achievements →
          </router-link>
        </div>
      </div>

      <!-- Themes Section -->
      <div>
        <h2 class="text-xl font-bold text-slate-900 mb-4">Learn by Theme</h2>
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
