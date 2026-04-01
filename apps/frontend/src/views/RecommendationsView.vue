<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { statsApi } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import LevelBadge from '@/components/learning/LevelBadge.vue'

const toast = useToast()

type RecWord = {
  id: string; word: string; definition: string; cefr_level: string;
  part_of_speech: any; topic: string; theme_name: string;
  reason: string; priority: number
}

const loading = ref(true)
const recommendations = ref<RecWord[]>([])
const insights = ref<{
  weakTopics: Array<{ topic: string; theme: string; total: number; learned: number; pct: number }>
  cefrGaps: Array<{ level: string; total: number; learned: number; pct: number }>
}>({ weakTopics: [], cefrGaps: [] })
const selectedWords = ref<Set<string>>(new Set())

onMounted(async () => {
const loading = ref(true)
  try {
    const res = await statsApi.getRecommendations(20)
    recommendations.value = res.recommendations
    insights.value = res.insights
  } catch (e: any) {
    toast.error('Failed to load recommendations')
  } finally {
    loading.value = false
  }
})

function toggleWord(id: string) {
  if (selectedWords.value.has(id)) {
    selectedWords.value.delete(id)
  } else {
    selectedWords.value.add(id)
  }
}

function selectAll() {
  if (selectedWords.value.size === recommendations.value.length) {
    selectedWords.value.clear()
  } else {
    selectedWords.value = new Set(recommendations.value.map(r => r.id))
  }
}

async function startLearning() {
  const selected = recommendations.value.filter(r => selectedWords.value.has(r.id))
  if (selected.length === 0) {
    toast.warning('Select at least one word')
    return
  }
  // Navigate to learn session
  window.location.href = '/learn'
}

const reasonIcon = (reason: string) => {
  if (reason.includes('Weak topic')) return '🎯'
  if (reason.includes('Gap at')) return '📊'
  return '💡'
}

const reasonColor = (reason: string) => {
  if (reason.includes('Weak topic')) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20'
  if (reason.includes('Gap at')) return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
  return 'text-purple-600 bg-purple-50 dark:bg-purple-900/20'
}
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xl">🎯</div>
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Smart Recommendations</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400">Words picked for you based on weak topics and level gaps</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card text-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-slate-500 dark:text-slate-400">Analyzing your progress...</p>
    </div>

    <template v-else>
      <!-- Insights -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- Weak Topics -->
        <div v-if="insights.weakTopics.length > 0" class="card">
          <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Weak Topics</h2>
          <div class="space-y-2">
            <div v-for="topic in insights.weakTopics" :key="topic.topic" class="flex items-center gap-3">
              <span class="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate" :title="topic.topic">{{ topic.topic }}</span>
              <div class="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div class="bg-amber-500 h-2 rounded-full" :style="{ width: topic.pct + '%' }"></div>
              </div>
              <span class="text-xs text-slate-500 w-12 text-right">{{ topic.learned }}/{{ topic.total }}</span>
            </div>
          </div>
        </div>

        <!-- CEFR Gaps -->
        <div v-if="insights.cefrGaps.length > 0" class="card">
          <h2 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Level Gaps</h2>
          <div class="space-y-2">
            <div v-for="gap in insights.cefrGaps" :key="gap.level" class="flex items-center gap-3">
              <LevelBadge :level="gap.level" />
              <div class="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div class="bg-blue-500 h-2 rounded-full" :style="{ width: gap.pct + '%' }"></div>
              </div>
              <span class="text-xs text-slate-500 w-16 text-right">{{ gap.learned }}/{{ gap.total }} words</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <button @click="selectAll" class="text-sm text-primary-600 dark:text-primary-400 hover:underline">
            {{ selectedWords.size === recommendations.length ? 'Deselect All' : 'Select All' }}
          </button>
          <span class="text-sm text-slate-500">{{ selectedWords.size }} selected</span>
        </div>
        <button
          @click="startLearning"
          :disabled="selectedWords.size === 0"
          class="btn btn-primary text-sm"
          :class="{ 'opacity-50 cursor-not-allowed': selectedWords.size === 0 }"
        >
          Learn Selected ({{ selectedWords.size }})
        </button>
      </div>

      <!-- Word List -->
      <div class="space-y-2">
        <div
          v-for="rec in recommendations"
          :key="rec.id"
          @click="toggleWord(rec.id)"
          class="card cursor-pointer flex items-center gap-4 transition-all hover:shadow-md"
          :class="{ 'ring-2 ring-primary-500 bg-primary-50/50 dark:bg-primary-900/10': selectedWords.has(rec.id) }"
        >
          <!-- Checkbox -->
          <div class="w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
            :class="selectedWords.has(rec.id) ? 'bg-primary-500 border-primary-500' : 'border-slate-300 dark:border-slate-600'">
            <svg v-if="selectedWords.has(rec.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <!-- Word Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-slate-900 dark:text-white">{{ rec.word }}</span>
              <LevelBadge v-if="rec.cefr_level" :level="rec.cefr_level" />
              <span class="text-xs px-1.5 py-0.5 rounded-full" :class="reasonColor(rec.reason)">
                {{ reasonIcon(rec.reason) }} {{ rec.reason }}
              </span>
            </div>
            <p class="text-sm text-slate-500 dark:text-slate-400 truncate">{{ rec.definition }}</p>
          </div>

          <!-- Link -->
          <router-link
            :to="`/words/${rec.id}`"
            @click.stop
            class="text-sm text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
          >
            View
          </router-link>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="recommendations.length === 0" class="card text-center py-12">
        <div class="text-4xl mb-3">🎉</div>
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-1">No recommendations</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400">You've already started learning words across all topics and levels. Keep it up!</p>
      </div>
    </template>
  </div>
</template>
