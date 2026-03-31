<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">🏃 Sprints</h1>
      <button
        v-if="!hasActiveSprint && !hasPlannedSprint"
        @click="showCreate = true"
        class="btn-primary"
      >
        + New Sprint
      </button>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="loading && !dashboard" />

    <!-- No Sprint State -->
    <div v-else-if="!currentSprint" class="text-center py-16 space-y-4">
      <div class="text-6xl">🏃‍♂️</div>
      <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300">No Active Sprint</h2>
      <p class="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Create a sprint to start learning words in focused 2-week bursts.
        Each sprint targets a set of words to learn and review.
      </p>
      <button @click="showCreate = true" class="btn-primary mt-4">
        Create Your First Sprint
      </button>
    </div>

    <!-- Active/Planned Sprint Card -->
    <div v-else class="space-y-6">
      <!-- Sprint Header -->
      <div class="card bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div class="flex items-center justify-between mb-3">
          <div>
            <span class="text-sm font-medium opacity-80">Sprint #{{ currentSprint.number }}</span>
            <h2 class="text-xl font-bold">
              {{ currentSprint.status === 'PLANNED' ? '📋 Ready to Start' : currentSprint.phase === 'ACQUISITION' ? '📖 Acquisition Phase' : '✍️ Application Phase' }}
            </h2>
          </div>
          <span :class="statusBadgeClass">{{ currentSprint.status }}</span>
        </div>

        <!-- Progress Bar -->
        <div class="mt-4">
          <div class="flex justify-between text-sm mb-1">
            <span>{{ sprintStats?.wordsLearned ?? 0 }} / {{ currentSprint.wordTarget }} words</span>
            <span>{{ sprintProgress }}%</span>
          </div>
          <div class="w-full bg-white/20 rounded-full h-3">
            <div
              class="bg-white rounded-full h-3 transition-all duration-500"
              :style="{ width: Math.max(2, sprintProgress) + '%' }"
            ></div>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div class="bg-white/10 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold">{{ sprintStats?.daysRemaining ?? 0 }}</div>
            <div class="text-xs opacity-80">Days Left</div>
          </div>
          <div class="bg-white/10 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold">{{ sprintStats?.dailyPace ?? 0 }}</div>
            <div class="text-xs opacity-80">Words/Day</div>
          </div>
          <div class="bg-white/10 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold">{{ sprintStats?.wordsNew ?? 0 }}</div>
            <div class="text-xs opacity-80">New</div>
          </div>
          <div class="bg-white/10 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold">{{ sprintStats?.wordsMastered ?? 0 }}</div>
            <div class="text-xs opacity-80">Mastered</div>
          </div>
        </div>

        <!-- On Track Indicator -->
        <div v-if="sprintStats" class="mt-3 flex items-center gap-2 text-sm">
          <span v-if="sprintStats.onTrack" class="flex items-center gap-1">
            ✅ On track for target
          </span>
          <span v-else class="flex items-center gap-1">
            ⚠️ Behind pace — {{ Math.ceil((currentSprint.wordTarget - (sprintStats.wordsLearned ?? 0)) / Math.max(1, sprintStats.daysRemaining)) }} words/day needed
          </span>
        </div>

        <!-- Actions -->
        <div class="mt-4 flex gap-3">
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/learn?sprintId=${currentSprint.id}`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            📖 Study Sprint Words
          </button>
          <button
            v-if="currentSprint.status === 'PLANNED'"
            @click="handleStart"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            ▶ Start Sprint
          </button>
          <button
            v-if="currentSprint.status === 'ACTIVE'"
            @click="handleAbandon"
            class="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30"
          >
            Abandon Sprint
          </button>
        </div>
      </div>

      <!-- Sprint Words Preview -->
      <div class="card">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-3">
          📚 Sprint Words ({{ currentSprint._count?.words ?? currentSprint.words?.length ?? 0 }})
        </h3>
        <div v-if="currentSprint.words?.length" class="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          <span
            v-for="sw in currentSprint.words.slice(0, 50)"
            :key="sw.id"
            class="px-2 py-1 text-sm rounded-full"
            :class="getWordStatusClass(sw)"
          >
            {{ sw.word?.word }}
          </span>
          <span v-if="currentSprint.words.length > 50" class="px-2 py-1 text-sm text-gray-400">
            +{{ currentSprint.words.length - 50 }} more...
          </span>
        </div>
      </div>
    </div>

    <!-- Milestones -->
    <div v-if="milestones.length" class="card">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">🎯 Milestones</h3>
      <div class="space-y-3">
        <div
          v-for="m in milestones"
          :key="m.id"
          class="flex items-center gap-4"
        >
          <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg"
               :class="m.achieved ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'">
            {{ m.achieved ? '🏆' : '📌' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <span class="font-medium text-gray-900 dark:text-white">{{ m.name }}</span>
              <span class="text-sm text-gray-500">{{ m.progress }}%</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-1">
              <div
                class="h-2 rounded-full transition-all duration-500"
                :class="m.achieved ? 'bg-green-500' : 'bg-indigo-500'"
                :style="{ width: Math.max(2, m.progress) + '%' }"
              ></div>
            </div>
            <div class="text-xs text-gray-500 mt-1">
              {{ m.current.toLocaleString() }} / {{ m.wordTarget.toLocaleString() }} words
              · {{ m.daysRemaining > 0 ? m.daysRemaining + ' days left' : 'Deadline passed' }}
              <span v-if="m.focusArea"> · {{ m.focusArea }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sprint History -->
    <div v-if="sprints.length > 1" class="card">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-3">📜 Sprint History</h3>
      <div class="space-y-2">
        <div
          v-for="s in sprints.filter(s => s.id !== currentSprint?.id)"
          :key="s.id"
          class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
        >
          <div>
            <span class="font-medium text-gray-900 dark:text-white">Sprint #{{ s.number }}</span>
            <span class="text-sm text-gray-500 ml-2">{{ s._count?.words ?? 0 }} words</span>
          </div>
          <span :class="getHistoryStatusClass(s.status)">{{ s.status }}</span>
        </div>
      </div>
    </div>

    <!-- Create Sprint Modal -->
    <teleport to="body">
      <div v-if="showCreate" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="showCreate = false">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">Create New Sprint</h2>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Word Target</label>
              <input
                v-model.number="newSprint.wordTarget"
                type="number"
                min="10"
                max="500"
                class="input-field"
                placeholder="265"
              />
              <p class="text-xs text-gray-500 mt-1">Recommended: 265 words per 2-week sprint</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (days)</label>
              <select v-model.number="newSprint.durationDays" class="input-field">
                <option :value="7">1 Week</option>
                <option :value="14">2 Weeks</option>
                <option :value="21">3 Weeks</option>
                <option :value="28">4 Weeks</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CEFR Level (optional)</label>
              <select v-model="newSprint.cefrLevel" class="input-field">
                <option value="">All levels</option>
                <option value="A1">A1 - Beginner</option>
                <option value="A2">A2 - Elementary</option>
                <option value="B1">B1 - Intermediate</option>
                <option value="B2">B2 - Upper Intermediate</option>
                <option value="C1">C1 - Advanced</option>
                <option value="C2">C2 - Proficiency</option>
              </select>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button @click="showCreate = false" class="btn-secondary flex-1">Cancel</button>
            <button @click="handleCreate" :disabled="creating" class="btn-primary flex-1">
              {{ creating ? 'Creating...' : 'Create Sprint' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSprintStore } from '@/stores/sprint'
import { useToast } from '@/composables/useToast'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const store = useSprintStore()
const toast = useToast()

const showCreate = ref(false)
const creating = ref(false)
const newSprint = ref({
  wordTarget: 265,
  durationDays: 14,
  cefrLevel: '',
})

const currentSprint = computed(() => store.currentSprint)
const sprintStats = computed(() => store.sprintStats)
const milestones = computed(() => store.milestones)
const sprints = computed(() => store.sprints)
const loading = computed(() => store.loading)
const hasActiveSprint = computed(() => store.hasActiveSprint)
const hasPlannedSprint = computed(() => store.hasPlannedSprint)
const sprintProgress = computed(() => store.sprintProgress)
const dashboard = computed(() => store.dashboard)

const statusBadgeClass = computed(() => {
  const s = currentSprint.value?.status
  if (s === 'ACTIVE') return 'px-2 py-1 text-xs font-medium rounded-full bg-green-400/20 text-green-100'
  if (s === 'PLANNED') return 'px-2 py-1 text-xs font-medium rounded-full bg-yellow-400/20 text-yellow-100'
  return 'px-2 py-1 text-xs font-medium rounded-full bg-gray-400/20 text-gray-100'
})

function getWordStatusClass(sw: any) {
  const progress = sw.word?.progress?.[0]
  if (!progress || progress.status === 'new') return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  if (progress.status === 'mastered') return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
}

function getHistoryStatusClass(status: string) {
  if (status === 'COMPLETED') return 'text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  if (status === 'ABANDONED') return 'text-xs font-medium px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
  return 'text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
}

async function handleCreate() {
  creating.value = true
  try {
    await store.createSprint({
      wordTarget: newSprint.value.wordTarget,
      durationDays: newSprint.value.durationDays,
      cefrLevel: newSprint.value.cefrLevel || undefined,
    })
    showCreate.value = false
    toast.success('Sprint created! Ready to start.')
    store.fetchSprints()
  } catch (e: any) {
    toast.error(e.message || 'Failed to create sprint')
  } finally {
    creating.value = false
  }
}

async function handleStart() {
  if (!currentSprint.value) return
  try {
    await store.startSprint(currentSprint.value.id)
    toast.success('Sprint started! Let\'s learn!')
  } catch (e: any) {
    toast.error(e.message || 'Failed to start sprint')
  }
}

async function handleAbandon() {
  if (!currentSprint.value) return
  if (!confirm('Are you sure you want to abandon this sprint?')) return
  try {
    await store.abandonSprint(currentSprint.value.id)
    toast.success('Sprint abandoned')
    store.fetchDashboard()
    store.fetchSprints()
  } catch (e: any) {
    toast.error(e.message || 'Failed to abandon sprint')
  }
}

onMounted(() => {
  store.fetchDashboard()
  store.fetchSprints()
})
</script>
