<template>
  <div class="max-w-2xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">📝 Sentence Review</h1>
      <span v-if="total > 0" class="text-sm text-gray-500 dark:text-gray-400">
        {{ currentIndex + 1 }} / {{ total }}
      </span>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="loading" />

    <!-- No Sentences -->
    <div v-else-if="cards.length === 0" class="text-center py-16 space-y-4">
      <div class="text-6xl">📝</div>
      <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-300">No Sentences Yet</h2>
      <p class="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        Write sentences during your sprint writing exercises to review them here as flashcards.
      </p>
      <router-link v-if="sprintId" :to="`/writing?sprintId=${sprintId}`" class="btn-primary inline-block">
        Start Writing
      </router-link>
    </div>

    <!-- Flashcard -->
    <div v-else class="space-y-4">
      <!-- Card -->
      <div
        class="card min-h-[250px] flex flex-col items-center justify-center cursor-pointer transition-all duration-300"
        :class="{ 'rotate-y-180': flipped }"
        @click="flipped = !flipped"
      >
        <!-- Front: Show target word, hide sentence -->
        <div v-if="!flipped" class="text-center space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400">Can you recall your sentence?</p>
          <div class="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{{ currentCard.targetWord }}</div>
          <p class="text-sm text-gray-400 dark:text-gray-500">Click to reveal your sentence</p>
        </div>

        <!-- Back: Show the user's sentence with target word highlighted -->
        <div v-else class="text-center space-y-4">
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Your sentence:</p>
          <p class="text-lg text-gray-900 dark:text-white leading-relaxed" v-html="highlightedSentence"></p>
          <div class="flex items-center justify-center gap-2 mt-4">
            <span
              class="px-2 py-1 text-xs rounded-full"
              :class="currentCard.usedWord ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'"
            >
              {{ currentCard.usedWord ? '✓ Word used correctly' : '✗ Word not used' }}
            </span>
            <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              {{ currentCard.wordCount }} words
            </span>
          </div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="flex items-center justify-between">
        <button
          @click="prevCard"
          :disabled="currentIndex === 0"
          class="btn-secondary"
          :class="{ 'opacity-50 cursor-not-allowed': currentIndex === 0 }"
        >
          ← Previous
        </button>
        <button @click="flipCard" class="btn-secondary text-sm">
          {{ flipped ? 'Hide' : 'Reveal' }}
        </button>
        <button
          @click="nextCard"
          :disabled="currentIndex === cards.length - 1"
          class="btn-secondary"
          :class="{ 'opacity-50 cursor-not-allowed': currentIndex === cards.length - 1 }"
        >
          Next →
        </button>
      </div>

      <!-- Progress bar -->
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          class="bg-indigo-500 h-2 rounded-full transition-all duration-300"
          :style="{ width: progressPercent + '%' }"
        ></div>
      </div>

      <!-- Tips -->
      <div class="card bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700">
        <p class="text-sm text-blue-700 dark:text-blue-300">💡 Tip: Reviewing sentences you wrote yourself is one of the most effective ways to reinforce vocabulary. Try to recall your sentence before flipping!</p>
      </div>
    </div>

    <!-- Keyboard Shortcuts -->
    <div class="text-center text-xs text-gray-400 dark:text-gray-500">
      <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Space</kbd> flip ·
      <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">←</kbd> previous ·
      <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">→</kbd> next
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { writingApi } from '@/lib/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const route = useRoute()
const sprintId = computed(() => route.query.sprintId as string | undefined)

const cards = ref<Array<{ id: string; text: string; targetWord: string; usedWord: boolean; wordCount: number; sprintId: string; createdAt: string }>>([])
const currentIndex = ref(0)
const flipped = ref(false)
const loading = ref(true)
const total = ref(0)

const currentCard = computed(() => cards.value[currentIndex.value])
const progressPercent = computed(() => cards.value.length > 0 ? ((currentIndex.value + 1) / cards.value.length) * 100 : 0)

const highlightedSentence = computed(() => {
  if (!currentCard.value) return ''
  const text = currentCard.value.text
  const word = currentCard.value.targetWord
  // Highlight the target word (and common inflections) in the sentence
  const inflections = getInflections(word)
  let result = text
  for (const inf of inflections) {
    const regex = new RegExp(`\\b(${escapeRegex(inf)})\\b`, 'gi')
    result = result.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-700 px-1 rounded">$1</mark>')
  }
  return result
})

function getInflections(word: string): string[] {
  const lower = word.toLowerCase()
  const inflections = [lower]
  if (lower.endsWith('y') && !['ay','ey','oy','uy'].some(e => lower.endsWith(e))) {
    inflections.push(lower.slice(0, -1) + 'ies')
    inflections.push(lower.slice(0, -1) + 'ied')
  }
  if (lower.endsWith('e')) {
    inflections.push(lower + 'd')
    inflections.push(lower + 's')
    inflections.push(lower.slice(0, -1) + 'ing')
  } else {
    inflections.push(lower + 's')
    inflections.push(lower + 'ed')
    inflections.push(lower + 'ing')
  }
  return [...new Set(inflections)]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function flipCard() {
  flipped.value = !flipped.value
}

function nextCard() {
  if (currentIndex.value < cards.value.length - 1) {
    currentIndex.value++
    flipped.value = false
  }
}

function prevCard() {
  if (currentIndex.value > 0) {
    currentIndex.value--
    flipped.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    flipCard()
  } else if (e.key === 'ArrowRight') {
    nextCard()
  } else if (e.key === 'ArrowLeft') {
    prevCard()
  }
}

onMounted(async () => {
  try {
    const data = await writingApi.getSentenceCards(100)
    cards.value = data.cards
    total.value = data.total
  } catch {
    // Silently fail — show empty state
  } finally {
    loading.value = false
  }
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
