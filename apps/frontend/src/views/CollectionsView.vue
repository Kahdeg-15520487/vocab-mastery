<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { statsApi } from '@/lib/api'

type Badge = {
  topic: string; theme: string; themeSlug: string;
  total: number; learned: number; mastered: number;
  pct: number; masteredPct: number; tier: string
}

const loading = ref(true)
const badges = ref<Badge[]>([])
const summary = ref({ totalBadges: 0, platinum: 0, gold: 0, silver: 0, bronze: 0, totalTopics: 0 })
const filter = ref<'all' | 'earned' | 'none'>('all')
const groupBy = ref<'theme' | 'tier'>('theme')

onMounted(async () => {
  try {
    const res = await statsApi.getCollections()
    badges.value = res.badges
    summary.value = res.summary
  } catch { /* empty */ } finally {
    loading.value = false
  }
})

const filtered = computed(() => {
  let list = badges.value
  if (filter.value === 'earned') list = list.filter(b => b.tier !== 'none')
  if (filter.value === 'none') list = list.filter(b => b.tier === 'none')
  return list
})

const grouped = computed(() => {
  if (groupBy.value === 'theme') {
    const map = new Map<string, Badge[]>()
    for (const b of filtered.value) {
      if (!map.has(b.theme)) map.set(b.theme, [])
      map.get(b.theme)!.push(b)
    }
    return Array.from(map.entries()).map(([theme, items]) => ({ key: theme, items }))
  }
  // Group by tier
  const tierOrder = ['platinum', 'gold', 'silver', 'bronze', 'none']
  const map = new Map<string, Badge[]>()
  for (const b of filtered.value) {
    if (!map.has(b.tier)) map.set(b.tier, [])
    map.get(b.tier)!.push(b)
  }
  return tierOrder.filter(t => map.has(t)).map(t => ({ key: t, items: map.get(t)! }))
})

const tierColors: Record<string, string> = {
  platinum: 'from-slate-300 to-slate-100 dark:from-slate-500 dark:to-slate-400 border-slate-400',
  gold: 'from-yellow-400 to-amber-200 dark:from-yellow-600 dark:to-amber-400 border-yellow-500',
  silver: 'from-gray-300 to-gray-100 dark:from-gray-500 dark:to-gray-400 border-gray-400',
  bronze: 'from-orange-400 to-orange-200 dark:from-orange-600 dark:to-orange-400 border-orange-500',
  none: 'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-700 border-slate-200 dark:border-slate-600',
}

const tierEmoji: Record<string, string> = {
  platinum: '💎',
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  none: '⬜',
}

const tierLabel: Record<string, string> = {
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  none: 'Not Started',
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl">🏆</div>
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Word Collections</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">Earn badges by mastering vocabulary in each topic</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card text-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-slate-500">Loading collections...</p>
    </div>

    <template v-else>
      <!-- Summary -->
      <div class="card mb-6">
        <div class="grid grid-cols-5 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-slate-900 dark:text-white">{{ summary.totalBadges }}</div>
            <div class="text-xs text-slate-500">Badges</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-cyan-600">💎 {{ summary.platinum }}</div>
            <div class="text-xs text-slate-500">Platinum</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-yellow-600">🥇 {{ summary.gold }}</div>
            <div class="text-xs text-slate-500">Gold</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-gray-500">🥈 {{ summary.silver }}</div>
            <div class="text-xs text-slate-500">Silver</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-orange-600">🥉 {{ summary.bronze }}</div>
            <div class="text-xs text-slate-500">Bronze</div>
          </div>
        </div>
        <div class="mt-3 text-center">
          <div class="text-sm text-slate-500">
            {{ summary.totalBadges }} / {{ summary.totalTopics }} topics earned
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mt-2 max-w-md mx-auto">
            <div class="bg-amber-500 h-2 rounded-full transition-all" :style="{ width: (summary.totalTopics > 0 ? Math.round(summary.totalBadges / summary.totalTopics * 100) : 0) + '%' }"></div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex items-center gap-2 mb-4">
        <button
          v-for="f in (['all', 'earned', 'none'] as const)"
          :key="f"
          @click="filter = f"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="filter === f ? 'bg-primary-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
        >
          {{ f === 'all' ? 'All' : f === 'earned' ? 'Earned' : 'Not Started' }}
        </button>
        <div class="flex-1"></div>
        <button
          v-for="g in (['theme', 'tier'] as const)"
          :key="g"
          @click="groupBy = g"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="groupBy === g ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'"
        >
          {{ g === 'theme' ? 'By Topic' : 'By Tier' }}
        </button>
      </div>

      <!-- Badge Groups -->
      <div v-for="group in grouped" :key="group.key" class="mb-6">
        <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          {{ groupBy === 'tier' ? tierLabel[group.key] || group.key : group.key }}
          <span class="text-xs font-normal">({{ group.items.length }})</span>
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="badge in group.items"
            :key="badge.topic"
            class="rounded-xl border-2 p-4 transition-all hover:shadow-md"
            :class="tierColors[badge.tier]"
          >
            <div class="flex items-center gap-2 mb-2">
              <span class="text-2xl">{{ tierEmoji[badge.tier] }}</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm text-slate-900 dark:text-white truncate">{{ badge.topic }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400">{{ badge.theme }}</div>
              </div>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <div class="flex-1 bg-white/50 dark:bg-black/20 rounded-full h-1.5">
                <div class="h-1.5 rounded-full transition-all" :class="badge.masteredPct >= 60 ? 'bg-green-500' : badge.masteredPct >= 30 ? 'bg-amber-500' : 'bg-red-400'" :style="{ width: badge.pct + '%' }"></div>
              </div>
              <span class="text-xs font-medium text-slate-600 dark:text-slate-300">{{ badge.learned }}/{{ badge.total }}</span>
            </div>
            <div class="mt-1 flex justify-between">
              <span class="text-xs text-slate-500">Learned: {{ badge.pct }}%</span>
              <span class="text-xs text-slate-500">Mastered: {{ badge.masteredPct }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-if="filtered.length === 0" class="card text-center py-12">
        <div class="text-4xl mb-3">🏅</div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-1">No badges yet</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400">Start learning words in different topics to earn your first badge!</p>
        <router-link to="/learn" class="btn btn-primary mt-4 inline-block">Start Learning</router-link>
      </div>

      <!-- Legend -->
      <div class="card mt-6">
        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">How to Earn Badges</h3>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div class="flex items-center gap-2">
            <span>🥉</span>
            <span class="text-slate-600 dark:text-slate-400">Bronze: 10+ learned</span>
          </div>
          <div class="flex items-center gap-2">
            <span>🥈</span>
            <span class="text-slate-600 dark:text-slate-400">Silver: 40%+ mastered</span>
          </div>
          <div class="flex items-center gap-2">
            <span>🥇</span>
            <span class="text-slate-600 dark:text-slate-400">Gold: 60%+ mastered</span>
          </div>
          <div class="flex items-center gap-2">
            <span>💎</span>
            <span class="text-slate-600 dark:text-slate-400">Platinum: 80%+ mastered</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
