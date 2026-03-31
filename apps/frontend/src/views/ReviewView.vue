<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import { request } from '@/lib/api'
import { getLevelRange } from '@/lib/difficulty'
import Flashcard from '@/components/learning/Flashcard.vue'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import DifficultySelector from '@/components/learning/DifficultySelector.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import ResumePrompt from '@/components/ui/ResumePrompt.vue'
import SingleTabWarning from '@/components/ui/SingleTabWarning.vue'

const sessionStore = useSessionStore()
const toast = useToast()

// Phase: setup | resume | playing
const phase = ref<'setup' | 'resume' | 'playing'>('setup')

const sessionComplete = ref(false)
const sessionResult = ref<any>(null)
const cardFlipped = ref(false)
const confettiActive = ref(false)

// Settings
const wordCount = ref(20)
const wordCountOptions = [10, 15, 20, 30]
const difficulty = ref<'mixed' | 'easy' | 'medium' | 'hard'>('mixed')

// Resume state
const showTabWarning = ref(false)
const resumeData = ref<{ answeredCount: number; totalWords: number } | null>(null)

function handleCardFlip(flipped: boolean) {
  cardFlipped.value = flipped
}

onMounted(async () => {
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
  } catch { /* ignore */ }

  // No active session — show setup
  phase.value = 'setup'
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(e: KeyboardEvent) {
  if (sessionComplete.value || !sessionStore.currentWord) return
  
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    const container = document.querySelector('.flashcard-container')
    if (container) (container as HTMLElement).click()
  } else if (cardFlipped.value) {
    switch (e.key) {
      case '1': handleResponse('forgot'); break
      case '2': handleResponse('hard'); break
      case '3': handleResponse('medium'); break
      case '4': case '0': handleResponse('easy'); break
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
      toast.success(`🎉 You reached a new level!`, 'Level Up!')
      confettiActive.value = true
      setTimeout(() => { confettiActive.value = false }, 4000)
    }
  }
}

function startNewSession() {
  sessionStore.reset()
  sessionComplete.value = false
  sessionResult.value = null

  const levelRange = getLevelRange(difficulty.value)

  sessionStore.startSession({
    type: 'review',
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
    <div v-if="phase === 'resume' && resumeData" class="max-w-lg mx-auto mt-6">
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
        <div class="text-6xl mb-4">🔄</div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">Review Session</h1>
        <p class="text-slate-600 dark:text-slate-400">
          Review words that are due for practice using spaced repetition.
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
          {{ sessionStore.loading ? 'Loading...' : '🔄 Start Review' }}
        </button>
      </div>

      <div v-if="sessionStore.error" class="mt-4 text-center text-red-600 dark:text-red-400">
        {{ sessionStore.error }}
      </div>
    </div>

    <!-- ==================== PLAYING ==================== -->
    <template v-else-if="phase === 'playing'">

    <!-- Session Complete -->
    <div v-if="sessionComplete" class="text-center py-8">
      <div class="text-6xl mb-4">
        {{ sessionStore.stats.accuracy >= 90 ? '🏆' : sessionStore.stats.accuracy >= 70 ? '🎉' : sessionStore.stats.accuracy >= 50 ? '💪' : '📚' }}
      </div>
      <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
        {{ sessionStore.stats.accuracy >= 90 ? 'Outstanding!' : sessionStore.stats.accuracy >= 70 ? 'Review Complete!' : sessionStore.stats.accuracy >= 50 ? 'Keep Practicing!' : 'Don\'t Give Up!' }}
      </h2>
      <p class="text-slate-600 dark:text-slate-400 mb-6">
        {{ sessionStore.stats.accuracy >= 90 ? 'Incredible recall! These words are firmly in your memory.' : sessionStore.stats.accuracy >= 70 ? 'Good recall! Keep reviewing to strengthen your memory.' : sessionStore.stats.accuracy >= 50 ? 'These words need more practice. Try again soon.' : 'Repetition is key. These words will stick with more reviews.' }}
      </p>
      
      <div class="card mb-6">
        <div class="grid grid-cols-3 gap-4 text-center mb-4">
          <div>
            <div class="text-2xl font-bold text-primary-600 dark:text-primary-400">{{ sessionStore.stats.total }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Reviewed</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-secondary-600">{{ sessionStore.stats.correct }}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400">Remembered</div>
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
          Review More
        </button>
        <router-link to="/" class="btn btn-secondary">
          Back to Home
        </router-link>
      </div>
    </div>

    <!-- Active Session -->
    <div v-else-if="sessionStore.currentWord">
      <ProgressBar
        :current="sessionStore.progress.current"
        :total="sessionStore.progress.total"
        label="Review Progress"
        class="mb-6"
      />

      <Transition name="card" mode="out-in">
        <Flashcard
          :key="sessionStore.currentWord?.id"
          :word="sessionStore.currentWord"
          @response="handleResponse"
          @flip="handleCardFlip"
        />
      </Transition>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-else-if="sessionStore.loading" emoji="📚" text="Loading review words..." />

    <!-- No words due -->
    <div v-else class="text-center py-12">
      <div class="text-6xl mb-4">✨</div>
      <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">All caught up!</h2>
      <p class="text-slate-600 dark:text-slate-400 mb-6">No words are due for review right now.</p>
      <router-link to="/learn" class="btn btn-primary">
        Learn New Words
      </router-link>
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
