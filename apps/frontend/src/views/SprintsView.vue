<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">🏃 Sprints</h1>
      <button
        v-if="!hasActiveSprint && !hasPlannedSprint"
        @click="showCreate = true"
        class="btn-secondary"
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
      <button @click="showCreate = true" class="btn-secondary mt-4">
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

        <!-- Retention Rate -->
        <div v-if="sprintStats && sprintStats.retentionRate != null" class="mt-2 flex items-center gap-3 text-sm">
          <div class="flex items-center gap-1">
            <span v-if="sprintStats.retentionRate >= 0.85">🧠</span>
            <span v-else>⚠️</span>
            <span>Retention: {{ Math.round(sprintStats.retentionRate * 100) }}%</span>
            <span v-if="sprintStats.retentionRate >= 0.85" class="text-green-200">✓ Target met</span>
            <span v-else class="text-yellow-200">— Below 85% target, review recommended</span>
          </div>
          <span class="opacity-70">({{ sprintStats.wordsCorrect }}/{{ sprintStats.wordsQuizzed }} correct)</span>
        </div>

        <!-- Actions -->
        <div class="mt-4 flex flex-wrap gap-3">
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/learn?sprintId=${currentSprint.id}`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            📖 Study Words
          </button>
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/review?sprintId=${currentSprint.id}`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            🔄 Review
          </button>
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/quiz?sprintId=${currentSprint.id}&auto=true`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            🧠 Quiz
          </button>
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/spelling?sprintId=${currentSprint.id}`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            ✍️ Spelling
          </button>
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/fill-blank?sprintId=${currentSprint.id}`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            📝 Fill Blanks
          </button>
          <button
            v-if="currentSprint?.status === 'ACTIVE'"
            @click="$router.push(`/writing?sprintId=${currentSprint.id}`)"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            📝 Writing
          </button>
          <button
            v-if="currentSprint.status === 'PLANNED'"
            @click="handleStart"
            class="px-4 py-2 bg-white text-indigo-600 font-semibold rounded-lg hover:bg-gray-100"
          >
            ▶ Start Sprint
          </button>
          <button
            v-if="currentSprint?.status === 'ACTIVE' && sprintProgress >= 100"
            @click="handleComplete"
            class="px-4 py-2 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600"
          >
            ✓ Complete Sprint
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

      <!-- Writing Prompts -->
      <div v-if="currentSprint?.status === 'ACTIVE' && prompts.length" class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900 dark:text-white">✍️ Writing Prompts</h3>
          <button @click="refreshPrompts" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            🔄 New prompts
          </button>
        </div>
        <div class="space-y-3">
          <div
            v-for="(prompt, i) in prompts.slice(0, 5)"
            :key="i"
            class="p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-indigo-300 dark:hover:border-indigo-500 cursor-pointer transition-colors"
            @click="usePromptAction(prompt)"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-medium px-2 py-0.5 rounded-full"
                :class="promptTypeClass(prompt.type)">
                {{ promptTypeLabel(prompt.type) }}
              </span>
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300">{{ prompt.description }}</p>
            <div class="flex flex-wrap gap-1 mt-2">
              <span v-for="w in prompt.words" :key="w"
                class="px-1.5 py-0.5 text-xs rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                {{ w }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sprint Words Preview -->
      <div class="card">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-3">
          📚 Sprint Words ({{ currentSprint._count?.words ?? currentSprint.words?.length ?? 0 }})
        </h3>
        <div v-if="currentSprint.words?.length" class="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          <router-link
            v-for="sw in currentSprint.words.slice(0, 50)"
            :key="sw.id"
            :to="`/words/${sw.word?.id}`"
            class="px-2 py-1 text-sm rounded-full hover:opacity-80 transition-opacity"
            :class="getWordStatusClass(sw)"
          >
            {{ sw.word?.word }}
          </router-link>
          <span v-if="currentSprint.words.length > 50" class="px-2 py-1 text-sm text-gray-400 dark:text-gray-500">
            +{{ currentSprint.words.length - 50 }} more...
          </span>
        </div>
      </div>
    </div>

    <!-- AI Coach Status -->
    <AICoachPanel />

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
              <span class="text-sm text-gray-500 dark:text-gray-300">{{ m.progress }}%</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mt-1">
              <div
                class="h-2 rounded-full transition-all duration-500"
                :class="m.achieved ? 'bg-green-500' : 'bg-indigo-500'"
                :style="{ width: Math.max(2, m.progress) + '%' }"
              ></div>
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
            <span class="text-sm text-gray-500 dark:text-gray-300 ml-2">{{ s._count?.words ?? 0 }} words</span>
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
            <!-- Review Sprint Suggestion -->
            <div v-if="nextSuggestion?.isReviewSprint" class="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700">
              <p class="text-sm font-medium text-indigo-700 dark:text-indigo-300">🔄 Review Sprint</p>
              <p class="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{{ nextSuggestion.reviewReason }}</p>
            </div>

            <!-- Focus Recommendations -->
            <div v-if="focusRecommendation" class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
              <p class="text-sm font-medium text-amber-700 dark:text-amber-300">🎯 {{ focusRecommendation.quarter }} Focus</p>
              <p class="text-xs text-amber-600 dark:text-amber-400">{{ focusRecommendation.focusArea }}</p>
              <p class="text-xs text-amber-500 dark:text-amber-300 mt-1">Suggested level: {{ focusRecommendation.suggestedLevel }}</p>
              <p v-if="focusRecommendation.weakestThemes?.length" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Weakest themes: {{ focusRecommendation.weakestThemes.join(', ') }}
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">💡 {{ focusRecommendation.recommendation }}</p>
            </div>

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
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Recommended: 265 words per 2-week sprint</p>
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

    <!-- Sprint Completion Report Modal -->
    <SprintCompletionModal
      v-if="showCompletion && completionReport"
      :report="completionReport"
      @close="showCompletion = false"
      @create-next="handleCreateNext"
    />

    <!-- Confetti -->
    <ConfettiEffect :active="showConfetti" @done="showConfetti = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSprintStore } from '@/stores/sprint'
import { useToast } from '@/composables/useToast'
import { sprintApi } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
import AICoachPanel from '@/components/writing/AICoachPanel.vue'
import SprintCompletionModal from '@/components/sprints/SprintCompletionModal.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

const store = useSprintStore()
const toast = useToast()
const router = useRouter()

const showCreate = ref(false)
const creating = ref(false)
const completionReport = ref<any>(null)
const showCompletion = ref(false)
const showConfetti = ref(false)
const prompts = ref<any[]>([])
const nextSuggestion = ref<{ nextNumber: number; isReviewSprint: boolean; reviewReason: string | null } | null>(null)
const focusRecommendation = ref<{ quarter: string; focusArea: string; suggestedLevel: string; totalLearned: number; weakestThemes: string[]; recommendation: string } | null>(null)
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

function promptTypeClass(type: string) {
  if (type === 'sentence') return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  if (type === 'paragraph') return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
  if (type === 'story') return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
}

function promptTypeLabel(type: string) {
  if (type === 'sentence') return '📝 Sentence'
  if (type === 'paragraph') return '📄 Paragraph'
  if (type === 'story') return '📖 Story'
  if (type === 'opinion') return '💬 Opinion'
  return type
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

async function handleComplete() {
  if (!currentSprint.value) return
  if (!confirm('Complete this sprint and see your results?')) return
  try {
    const result = await store.completeSprint(currentSprint.value.id)
    if (result?.report) {
      completionReport.value = result.report
      showCompletion.value = true
      showConfetti.value = true
    }
    await store.fetchDashboard()
    await store.fetchSprints()
  } catch (e: any) {
    toast.error(e.message || 'Failed to complete sprint')
  }
}

async function refreshPrompts() {
  if (!currentSprint.value) return
  try {
    const data = await sprintApi.getPrompts(currentSprint.value.id)
    prompts.value = data.prompts ?? []
  } catch {
    // Non-critical
  }
}

function usePromptAction(prompt: any) {
  router.push({ path: '/writing', query: { prompt: JSON.stringify(prompt) } })
}

onMounted(async () => {
  await store.fetchDashboard()
  await store.fetchSprints()
  // Load suggestion + prompts + focus in parallel
  Promise.all([
    sprintApi.getNextSuggestion().then(s => { nextSuggestion.value = s }).catch(() => {}),
    sprintApi.getFocusRecommendations().then(f => { focusRecommendation.value = f }).catch(() => {}),
    store.currentSprint?.id
      ? sprintApi.getPrompts(store.currentSprint.id).then(d => { prompts.value = d.prompts ?? [] }).catch(() => {})
      : Promise.resolve(),
  ])
})

async function handleCreateNext() {
  showCompletion.value = false
  showCreate.value = true
}
</script>
