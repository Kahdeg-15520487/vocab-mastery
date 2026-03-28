<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import Flashcard from '@/components/learning/Flashcard.vue'
import ProgressBar from '@/components/learning/ProgressBar.vue'

const sessionStore = useSessionStore()

const sessionComplete = ref(false)
const sessionResult = ref<any>(null)
const cardFlipped = ref(false)

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
    <h1 class="text-2xl font-bold text-slate-900 mb-6">Review Session</h1>
    
    <!-- Session Complete -->
    <div v-if="sessionComplete" class="text-center py-8">
      <div class="text-6xl mb-4">
        {{ sessionStore.stats.accuracy >= 90 ? '🏆' : sessionStore.stats.accuracy >= 70 ? '🎉' : sessionStore.stats.accuracy >= 50 ? '💪' : '📚' }}
      </div>
      <h2 class="text-2xl font-bold text-slate-900 mb-2">
        {{ sessionStore.stats.accuracy >= 90 ? 'Outstanding!' : sessionStore.stats.accuracy >= 70 ? 'Review Complete!' : sessionStore.stats.accuracy >= 50 ? 'Keep Practicing!' : 'Don\'t Give Up!' }}
      </h2>
      <p class="text-slate-600 mb-6">
        {{ sessionStore.stats.accuracy >= 90 ? 'Incredible recall! These words are firmly in your memory.' : sessionStore.stats.accuracy >= 70 ? 'Good recall! Keep reviewing to strengthen your memory.' : sessionStore.stats.accuracy >= 50 ? 'These words need more practice. Try again soon.' : 'Repetition is key. These words will stick with more reviews.' }}
      </p>
      
      <div class="card mb-6">
        <div class="grid grid-cols-3 gap-4 text-center mb-4">
          <div>
            <div class="text-2xl font-bold text-primary-600">{{ sessionStore.stats.total }}</div>
            <div class="text-sm text-slate-500">Reviewed</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-secondary-600">{{ sessionStore.stats.correct }}</div>
            <div class="text-sm text-slate-500">Remembered</div>
          </div>
          <div>
            <div class="text-2xl font-bold" :class="sessionStore.stats.accuracy >= 80 ? 'text-secondary-600' : 'text-warning-600'">
              {{ sessionStore.stats.accuracy }}%
            </div>
            <div class="text-sm text-slate-500">Accuracy</div>
          </div>
        </div>

        <!-- Response Breakdown -->
        <div class="grid grid-cols-4 gap-2 pt-4 border-t border-slate-200">
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
            <div class="text-sm font-bold text-primary-600">{{ sessionStore.responseBreakdown.medium }}</div>
            <div class="text-xs text-slate-400">Good</div>
          </div>
          <div class="text-center">
            <div class="text-lg">🚀</div>
            <div class="text-sm font-bold text-secondary-600">{{ sessionStore.responseBreakdown.easy }}</div>
            <div class="text-xs text-slate-400">Easy</div>
          </div>
        </div>
        
        <div v-if="sessionResult" class="mt-4 pt-4 border-t border-slate-200">
          <p class="text-primary-600 font-medium">+{{ sessionResult.xpEarned }} XP earned!</p>
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
    <div v-else-if="sessionStore.loading" class="text-center py-12">
      <div class="animate-spin text-4xl mb-4">📚</div>
      <p class="text-slate-600">Loading review words...</p>
    </div>

    <!-- No words due -->
    <div v-else class="text-center py-12">
      <div class="text-6xl mb-4">✨</div>
      <h2 class="text-xl font-bold text-slate-900 mb-2">All caught up!</h2>
      <p class="text-slate-600 mb-6">No words are due for review right now.</p>
      <router-link to="/learn" class="btn btn-primary">
        Learn New Words
      </router-link>
    </div>
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
