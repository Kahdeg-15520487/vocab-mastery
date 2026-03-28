<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { wordsApi } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import { useSpeech } from '@/composables/useSpeech'

interface FavoriteWord {
  id: string
  word: string
  phoneticUs: string
  definition: string
  cefrLevel: string
  partOfSpeech: string[]
}

interface Favorite {
  id: string
  createdAt: string
  word: FavoriteWord
}

const { speak } = useSpeech()
const toast = useToast()
const loading = ref(true)
const favorites = ref<Favorite[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const selectedWord = ref<FavoriteWord | null>(null)

const totalPages = computed(() => Math.ceil(total.value / limit))

async function loadFavorites() {
  loading.value = true
  try {
    const data = await wordsApi.getFavorites({ page: page.value, limit })
    favorites.value = data.favorites
    total.value = data.total
  } catch (e: any) {
    console.error('Failed to load favorites:', e)
  } finally {
    loading.value = false
  }
}

async function removeFavorite(fav: Favorite) {
  // Optimistic remove
  const backup = [...favorites.value]
  favorites.value = favorites.value.filter(f => f.id !== fav.id)
  total.value--

  try {
    await wordsApi.toggleFavorite(fav.word.id)
  } catch (e: any) {
    // Rollback
    favorites.value = backup
    total.value++
    toast.error('Failed to remove favorite')
  }
}

onMounted(() => {
  loadFavorites()
})
</script>

<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">❤️ Favorite Words</h1>
        <p class="text-slate-500 dark:text-slate-400">
          {{ total }} word{{ total !== 1 ? 's' : '' }} saved
        </p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <SkeletonLoader v-for="i in 5" :key="i" type="card" />
    </div>

    <!-- Empty State -->
    <div v-else-if="favorites.length === 0" class="text-center py-12">
      <div class="text-6xl mb-4">🤍</div>
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-2">No favorites yet</h2>
      <p class="text-slate-500 dark:text-slate-400 mb-6">
        Tap the heart icon on any word to save it here for quick review.
      </p>
      <router-link to="/browse" class="btn btn-primary">
        📖 Browse Words
      </router-link>
    </div>

    <!-- Favorites List -->
    <div v-else class="space-y-3">
      <div
        v-for="fav in favorites"
        :key="fav.id"
        class="card hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1 cursor-pointer" @click="selectedWord = fav.word">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">{{ fav.word.word }}</h3>
              <LevelBadge :level="fav.word.cefrLevel" />
            </div>
            <p class="text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2">
              {{ fav.word.phoneticUs }}
              <button
                @click.stop="speak(fav.word.word)"
                class="text-primary-500 hover:text-primary-700 transition-colors"
                title="Pronounce"
              >🔊</button>
            </p>
            <p class="text-slate-700 dark:text-slate-300 mt-1">{{ fav.word.definition }}</p>
          </div>
          <button
            @click="removeFavorite(fav)"
            class="text-xl ml-4 transition-transform hover:scale-125"
            title="Remove from favorites"
          >
            ❤️
          </button>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center gap-2">
      <button
        v-for="p in totalPages"
        :key="p"
        @click="page = p; loadFavorites()"
        class="px-3 py-1 rounded-lg text-sm font-medium transition-colors"
        :class="p === page ? 'bg-primary-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'"
      >
        {{ p }}
      </button>
    </div>

    <!-- Word Detail Modal -->
    <div
      v-if="selectedWord"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="selectedWord = null"
    >
      <div class="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <h2 class="text-2xl font-bold text-slate-900 dark:text-white">{{ selectedWord.word }}</h2>
              <LevelBadge :level="selectedWord.cefrLevel" />
            </div>
            <p class="text-slate-500 dark:text-slate-400 flex items-center gap-2">
              {{ selectedWord.phoneticUs }}
              <button @click="speak(selectedWord.word)" class="text-primary-500 hover:text-primary-700">🔊</button>
            </p>
          </div>
          <button @click="selectedWord = null" class="text-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">×</button>
        </div>
        <div class="space-y-4">
          <p class="text-slate-700 dark:text-slate-300">{{ selectedWord.definition }}</p>
          <div v-if="selectedWord.partOfSpeech?.length" class="text-sm text-slate-500 dark:text-slate-400">
            Part of speech: {{ selectedWord.partOfSpeech.join(', ') }}
          </div>
        </div>
        <div class="mt-6 flex gap-3">
          <router-link
            :to="`/browse?search=${selectedWord.word}`"
            class="btn btn-secondary text-sm"
          >
            View in Browse
          </router-link>
          <button @click="selectedWord = null" class="btn btn-primary text-sm">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>
