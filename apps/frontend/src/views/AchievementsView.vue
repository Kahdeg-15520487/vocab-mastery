<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useProgressStore } from '@/stores/progress'
import AchievementsGrid from '@/components/progress/AchievementsGrid.vue'

import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const progressStore = useProgressStore()

onMounted(async () => {
  await progressStore.fetchAchievements()
})

const achievements = computed(() => progressStore.achievements)
const loading = computed(() => progressStore.loading)
const unlockedCount = computed(() =>
  achievements.value.filter(a => a.unlocked).length
)
const totalXP = computed(() =>
  achievements.value
    .filter(a => a.unlocked)
    .reduce((sum, a) => sum + a.xpReward, 0)
)
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Achievements</h1>
        <p class="text-slate-600 mt-1">Track your learning milestones</p>
      </div>
      <div class="text-right">
        <div class="text-2xl font-bold text-yellow-600">
          {{ unlockedCount }} / {{ achievements.length }}
        </div>
        <div class="text-sm text-slate-500">
          ⭐ {{ totalXP }} XP earned from achievements
        </div>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="mb-6">
      <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full transition-all duration-500"
          :style="{ width: `${achievements.length ? (unlockedCount / achievements.length * 100) : 0}%` }"
        ></div>
      </div>
      <div class="text-xs text-slate-500 mt-1 text-right">
        {{ achievements.length ? Math.round(unlockedCount / achievements.length * 100) : 0 }}% complete
      </div>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="loading && achievements.length === 0" text="Loading achievements..." />

    <!-- Achievements Grid -->
    <AchievementsGrid v-else :achievements="achievements" />

    <!-- Back -->
    <div class="mt-6 text-center">
      <router-link to="/" class="text-primary-600 hover:underline text-sm">
        ← Back to Dashboard
      </router-link>
    </div>
  </div>
</template>
