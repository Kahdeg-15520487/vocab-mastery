<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useWordsStore } from '@/stores/words'
import { useToast } from '@/composables/useToast'
import Flashcard from '@/components/learning/Flashcard.vue'
import ProgressBar from '@/components/learning/ProgressBar.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const wordsStore = useWordsStore()
const toast = useToast()

const theme = computed(() => route.params.theme as string | undefined)
const listId = computed(() => (route.query.list as string) || undefined)
const sessionComplete = ref(false)
const sessionResult = ref<any>(null)

// Track if card is flipped (for keyboard shortcuts)
const cardFlipped = ref(false)
const confettiActive = ref(false)

function handleCardFlip(flipped: boolean) {
  cardFlipped.value = flipped
}

onMounted(async () => {
  // Load themes first
  await wordsStore.fetchThemes()
  
  // Find theme ID if theme slug is provided
  let themeId: string | undefined
  if (theme.value) {
    const found = wordsStore.themes.find(t => t.slug === theme.value)
    themeId = found?.id
  }

  // Start session
  await sessionStore.startSession({
    type: 'learn',
    themeId,
    listId: listId.value,
    wordCount: 10,
  })

  // Add keyboard shortcuts
  window.addEventListener('keydown', handleKeydown)
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
  
  // Restart
  let themeId: string | undefined
  if (theme.value) {
    const found = wordsStore.themes.find(t => t.slug === theme.value)
    themeId = found?.id
  }
  
  sessionStore.startSession({
    type: 'learn',
    themeId,
    listId: listId.value,
    wordCount: 10,
  })
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
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
      <button @click="startNewSession" class="btn btn-primary">
        Start Learning
      </button>
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
