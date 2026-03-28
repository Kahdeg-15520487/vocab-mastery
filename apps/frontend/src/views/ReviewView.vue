<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useToast } from '@/composables/useToast'
import Flashcard from '@/components/learning/Flashcard.vue'
import ProgressBar from '@/components/learning/ProgressBar.vue'

import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

const sessionStore = useSessionStore()
const toast = useToast()

const sessionComplete = ref(false)
const sessionResult = ref<any>(null)
const cardFlipped = ref(false)
const confettiActive = ref(false)

function handleCardFlip(flipped: boolean) {
  cardFlipped.value = flipped
}

onMounted(async () => {
  await sessionStore.startSession({
    type: 'review',
    wordCount: 20,
  })
  window.addEventListener('keydown', handleKeydown)
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
  
  sessionStore.startSession({
    type: 'review',
    wordCount: 20,
  })
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-6">Review Session</h1>
    
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
