<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWordsStore } from '@/stores/words'
import { useStatsStore } from '@/stores/stats'
import ThemeCard from '@/components/learning/ThemeCard.vue'

const router = useRouter()
const wordsStore = useWordsStore()
const statsStore = useStatsStore()

onMounted(async () => {
  await Promise.all([
    wordsStore.fetchThemes(),
    statsStore.fetchStats(),
  ])
})

const themes = computed(() => wordsStore.themes)
const stats = computed(() => statsStore.stats)

function selectTheme(theme: any) {
  router.push(`/learn/${theme.slug}`)
}
</script>

<template>
  <div class="space-y-8">
    <!-- Header -->
    <div class="text-center">
      <h1 class="text-3xl font-bold text-slate-900 mb-2">
        Welcome to Vocab Master
      </h1>
      <p class="text-slate-600">
        Learn vocabulary with spaced repetition
      </p>
    </div>

    <!-- Quick Stats -->
    <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-2xl font-bold text-primary-600">{{ stats.user.totalWords }}</div>
        <div class="text-sm text-slate-500">Words Learned</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-secondary-600">{{ stats.user.masteredWords }}</div>
        <div class="text-sm text-slate-500">Mastered</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-warning-600">{{ stats.user.currentStreak }}</div>
        <div class="text-sm text-slate-500">Day Streak</div>
      </div>
      <div class="card text-center">
        <div class="text-2xl font-bold text-danger-600">{{ stats.words.status.new }}</div>
        <div class="text-sm text-slate-500">New Words</div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <router-link to="/learn" class="card hover:shadow-md transition-shadow text-center group">
        <div class="text-4xl mb-2">📚</div>
        <div class="font-semibold text-slate-900 group-hover:text-primary-600">Start Learning</div>
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

    <!-- Themes -->
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
  </div>
</template>
