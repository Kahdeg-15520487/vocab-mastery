<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useWordsStore } from '@/stores/words'
import { useToast } from '@/composables/useToast'
import { request } from '@/lib/api'
import { getLevelRange } from '@/lib/difficulty'
import Flashcard from '@/components/learning/Flashcard.vue'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import DifficultySelector from '@/components/learning/DifficultySelector.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
import ResumePrompt from '@/components/ui/ResumePrompt.vue'
import SingleTabWarning from '@/components/ui/SingleTabWarning.vue'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const wordsStore = useWordsStore()
const toast = useToast()

const theme = computed(() => route.params.theme as string | undefined)
const listId = computed(() => (route.query.list as string) || undefined)
const sprintId = computed(() => (route.query.sprintId as string) || undefined)
const sessionComplete = ref(false)
const sessionResult = ref<any>(null)

// Phase: setup | resume | playing | results
const phase = ref<'setup' | 'resume' | 'playing'>('setup')

// Settings
const wordCount = ref(10)
const wordCountOptions = [5, 10, 15, 20]
const difficulty = ref<'mixed' | 'easy' | 'medium' | 'hard'>('mixed')

// Track if card is flipped (for keyboard shortcuts)
const cardFlipped = ref(false)
const confettiActive = ref(false)

// Resume state
const showTabWarning = ref(false)
const resumeData = ref<{ answeredCount: number; totalWords: number } | null>(null)

function handleCardFlip(flipped: boolean) {
  cardFlipped.value = flipped
}

onMounted(async () => {
  // Load themes first
  await wordsStore.fetchThemes()

  // Check for active session
  try {
    const data = await request<any>('/sessions/active')
    if (data.active && data.type === 'learn') {
      resumeData.value = {
        answeredCount: data.answeredCount || 0,
        totalWords: data.totalWords || 0,
      }
      phase.value = 'resume'
      return
    }
  } catch {
    // Ignore — proceed to setup
  }

  // Auto-start if coming from a list or sprint query param
  if (route.query.auto === 'true' || route.query.list || route.query.sprintId) {
    await startNewSession()
  }
  // Otherwise show setup screen (phase is already 'setup')
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  // Don't handle if session is complete or no current word
  if (sessionComplete.value || !sessionStore.currentWord) return
  
  // Ignore if user is typing in an input/textarea
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    // Flip card by dispatching click on flashcard container
    const container = document.querySelector('.flashcard-container')
    if (container) (container as HTMLElement).click()
  } else if (cardFlipped.value) {
    // Only respond when card is flipped
    switch (e.key) {
      case '1':
        handleResponse('forgot')
        break
      case '2':
        handleResponse('hard')
        break
      case '3':
        handleResponse('medium')
        break
      case '4':
      case '0':
        handleResponse('easy')
        break
    }
  }
}

async function handleResponse(response: 'easy' | 'medium' | 'hard' | 'forgot') {
  await sessionStore.submitResponse(response)

  if (sessionStore.isComplete) {
    const result = await sessionStore.completeSession()
    sessionResult.value = result
    sessionComplete.value = true

    // Show achievement toast notifications
    if (result?.newAchievements?.length > 0) {
      for (const key of result.newAchievements) {
        const name = key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        toast.success(`🏆 ${name}`, 'Achievement Unlocked!')
      }
    }

    // Show level-up notification
    if (result?.leveledUp) {
      toast.success('🎉 You reached a new level!', 'Level Up!')
      confettiActive.value = true
      setTimeout(() => { confettiActive.value = false }, 4000)
    }
  }
}

function startNewSession() {
  sessionStore.reset()
  sessionComplete.value = false
  sessionResult.value = null
  
  let themeId: string | undefined
  if (theme.value) {
    const found = wordsStore.themes.find(t => t.slug === theme.value)
    themeId = found?.id
  }

  const levelRange = getLevelRange(difficulty.value)
  
  sessionStore.startSession({
    type: 'learn',
    themeId,
    listId: listId.value,
    sprintId: sprintId.value,
    wordCount: wordCount.value,
    levelRange,
  })

  phase.value = 'playing'
  window.addEventListener('keydown', handleKeydown)
}

async function resumeActiveSession() {
  phase.value = 'playing'
  const ok = await sessionStore.resumeSession()
  if (ok) {
    showTabWarning.value = true
    window.addEventListener('keydown', handleKeydown)
  } else {
    await startNewSession()
  }
}

async function restartActiveSession() {
  try {
    await request('/sessions/abandon-active', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  } catch { /* ignore */ }
  phase.value = 'setup'
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <!-- Single Tab Warning -->
    <SingleTabWarning v-if="showTabWarning" @dismiss="showTabWarning = false" />

    <!-- Resume Prompt -->
    <div v-if="phase === 'resume' && resumeData" class="max-w-lg mx-auto">
      <ResumePrompt
        :answered-count="resumeData.answeredCount"
        :total-words="resumeData.totalWords"
        @resume="resumeActiveSession"
        @restart="restartActiveSession"
      />
    </div>

    <!-- ==================== SETUP PHASE ==================== -->
    <div v-else-if="phase === 'setup'" class="max-w-lg mx-auto">
      <div class="text-center mb-8">
        <div class="text-6xl mb-4">📚</div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Learn New Words</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Flashcard-based learning with spaced repetition. Rate how well you know each word.
        </p>
      </div>

      <div class="card space-y-6">
        <!-- Difficulty -->
        <DifficultySelector v-model="difficulty" />

        <!-- Word Count -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Number of words
          </label>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="count in wordCountOptions"
              :key="count"
              @click="wordCount = count"
              class="py-2 rounded-lg text-sm font-medium transition-colors"
              :class="wordCount === count
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'"
            >
              {{ count }}
            </button>
          </div>
        </div>

        <button
          @click="startNewSession"
          :disabled="sessionStore.loading"
          class="btn btn-primary w-full text-lg py-3"
        >
          {{ sessionStore.loading ? 'Loading...' : '📚 Start Learning' }}
        </button>
      </div>

      <div v-if="sessionStore.error" class="mt-4 text-center text-red-600 dark:text-red-400">
        {{ sessionStore.error }}
      </div>
    </div>

    <!-- ==================== PLAYING / RESULTS ==================== -->
    <template v-else-if="phase === 'playing'">

    <!-- Session Complete -->
    <div v-if="sessionComplete" class="text-center py-8">
      <div class="text-6xl mb-4">
        {{ sessionStore.stats.accuracy >= 90 ? '🏆' : sessionStore.stats.accuracy >= 70 ? '🎉' : sessionStore.stats.accuracy >= 50 ? '💪' : '📚' }}
      </div>
      <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        {{ sessionStore.stats.accuracy >= 90 ? 'Outstanding!' : sessionStore.stats.accuracy >= 70 ? 'Session Complete!' : sessionStore.stats.accuracy >= 50 ? 'Keep Practicing!' : 'Don\'t Give Up!' }}
      </h2>
      <p class="text-slate-600 dark:text-slate-400 mb-6">
        {{ sessionStore.stats.accuracy >= 90 ? 'Amazing accuracy! You\'re mastering these words.' : sessionStore.stats.accuracy >= 70 ? 'Great job! You\'re making solid progress.' : sessionStore.stats.accuracy >= 50 ? 'Every session counts. Try reviewing these words again.' : 'Repetition is key. Review these words to strengthen your memory.' }}
      </p>
      
      <div class="card mb-6">
        <div class="grid grid-cols-3 gap-4 text-center mb-4">
          <div>
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ sessionStore.stats.total }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Words</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-secondary-600">{{ sessionStore.stats.correct }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Correct</div>
          </div>
          <div>
            <div class="text-2xl font-bold" :class="sessionStore.stats.accuracy >= 80 ? 'text-secondary-600' : 'text-warning-600'">
              {{ sessionStore.stats.accuracy }}%
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Accuracy</div>
          </div>
        </div>

        <!-- Response Breakdown -->
        <div class="grid grid-cols-4 gap-2 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div class="text-center">
            <div class="text-lg">😵</div>
            <div class="text-sm font-bold text-danger-600">{{ sessionStore.responseBreakdown.forgot }}</div>
            <div class="text-xs text-slate-400">Forgot</div>
          </div>
          <div class="text-center">
            <div class="text-lg">😬</div>
            <div class="text-sm font-bold text-warning-600">{{ sessionStore.responseBreakdown.hard }}</div>
            <div class="text-xs text-slate-400">Hard</div>
          </div>
          <div class="text-center">
            <div class="text-lg">😊</div>
            <div class="text-sm font-bold text-primary-600 dark:text-primary-400">{{ sessionStore.responseBreakdown.medium }}</div>
            <div class="text-xs text-slate-400">Good</div>
          </div>
          <div class="text-center">
            <div class="text-lg">🚀</div>
            <div class="text-sm font-bold text-secondary-600">{{ sessionStore.responseBreakdown.easy }}</div>
            <div class="text-xs text-slate-400">Easy</div>
          </div>
        </div>
        
        <div v-if="sessionResult" class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2">
          <span class="text-2xl">⚡</span>
          <span class="text-lg font-bold text-primary-600 dark:text-primary-400">+{{ sessionResult.xpEarned }} XP</span>
        </div>
      </div>
      
      <div class="flex gap-4 justify-center">
        <button @click="startNewSession" class="btn btn-primary">
          Learn More
        </button>
        <router-link to="/" class="btn btn-secondary">
          Back to Home
        </router-link>
      </div>
    </div>

    <!-- Active Session -->
    <div v-else-if="sessionStore.currentWord">
      <!-- Progress -->
      <div class="mb-6">
        <ProgressBar
          :current="sessionStore.progress.current"
          :total="sessionStore.progress.total"
          label="Progress"
        />
      </div>

      <!-- Flashcard (key forces re-mount on word change) -->
        <Flashcard
          :key="sessionStore.currentWord?.id"
          :word="sessionStore.currentWord"
          @response="handleResponse"
          @flip="handleCardFlip"
        />
    </div>

    <!-- Loading -->
    <LoadingSpinner v-else-if="sessionStore.loading" emoji="📚" text="Loading words..." />

    <!-- Error -->
    <div v-else-if="sessionStore.error" class="text-center py-12">
      <div class="text-4xl mb-4">😕</div>
      <p class="text-slate-600 dark:text-slate-400 mb-4">{{ sessionStore.error }}</p>
      <button @click="router.push('/')" class="btn btn-primary">
        Back to Home
      </button>
    </div>

    <!-- Session loaded but no current word -->
    <div v-else-if="sessionStore.session" class="text-center py-12">
      <div class="text-4xl mb-4">⚠️</div>
      <p class="text-slate-600 dark:text-slate-400 mb-2">Session loaded but no words available</p>
      <p class="text-sm text-slate-400 mb-4">Words: {{ sessionStore.session.words?.length || 0 }}</p>
      <button @click="startNewSession" class="btn btn-primary">
        Try Again
      </button>
    </div>

    <!-- No session started -->
    <div v-else class="text-center py-12">
      <div class="text-4xl mb-4">📚</div>
      <p class="text-slate-600 dark:text-slate-400 mb-4">Starting learning session...</p>
      <button @click="phase = 'setup'" class="btn btn-primary">
        Start Learning
      </button>
    </div>

    </template>

    <ConfettiEffect :active="confettiActive" :duration="4000" />
  </div>
</template>

<style scoped>
.card-enter-active,
.card-leave-active {
  transition: all 0.3s ease;
}

.card-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.card-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
