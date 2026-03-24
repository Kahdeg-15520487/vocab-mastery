<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useWordsStore } from '@/stores/words'
import LevelBadge from '@/components/learning/LevelBadge.vue'

const wordsStore = useWordsStore()

const search = ref('')
const selectedTheme = ref('')
const selectedLevel = ref('')
const page = ref(1)

onMounted(async () => {
  await Promise.all([
    wordsStore.fetchThemes(),
    wordsStore.fetchWords({ page: page.value, limit: 20 }),
  ])
})

async function loadWords() {
  await wordsStore.fetchWords({
    search: search.value || undefined,
    theme: selectedTheme.value || undefined,
    level: selectedLevel.value || undefined,
    page: page.value,
    limit: 20,
  })
}

watch([search, selectedTheme, selectedLevel], () => {
  page.value = 1
  loadWords()
})

function formatSynonyms(synonyms: string[]) {
  if (!synonyms || synonyms.length === 0) return ''
  return synonyms.slice(0, 3).join(' • ')
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-slate-900 mb-6">Browse Vocabulary</h1>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="md:col-span-2">
          <input
            v-model="search"
            type="text"
            placeholder="Search words..."
            class="input"
          />
        </div>
        <select v-model="selectedTheme" class="input">
          <option value="">All Themes</option>
          <option v-for="theme in wordsStore.themes" :key="theme.id" :value="theme.slug">
            {{ theme.icon }} {{ theme.name }}
          </option>
        </select>
        <select v-model="selectedLevel" class="input">
          <option value="">All Levels</option>
          <option value="A1">A1 - Beginner</option>
          <option value="A2">A2 - Elementary</option>
          <option value="B1">B1 - Intermediate</option>
          <option value="B2">B2 - Upper-Intermediate</option>
          <option value="C1">C1 - Advanced</option>
          <option value="C2">C2 - Proficient</option>
        </select>
      </div>
    </div>

    <!-- Word List -->
    <div v-if="wordsStore.words.length" class="space-y-3">
      <div
        v-for="word in wordsStore.words"
        :key="word.id"
        class="card hover:shadow-md transition-shadow"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-1">
              <h3 class="text-lg font-semibold text-slate-900">{{ word.word }}</h3>
              <LevelBadge :level="word.cefrLevel" />
              <span v-if="word.oxfordList === '3000'" class="badge badge-secondary">Oxford 3000</span>
              <span v-else class="badge badge-primary">Oxford 5000</span>
            </div>
            <p class="text-slate-500 text-sm mb-2">{{ word.phoneticUs }}</p>
            <p class="text-slate-700">{{ word.definition }}</p>
            <p v-if="word.synonyms?.length" class="text-sm text-slate-500 mt-2">
              {{ formatSynonyms(word.synonyms) }}
            </p>
          </div>
          <div class="ml-4 text-right">
            <span 
              v-if="word.progress"
              :class="[
                'badge',
                word.progress.status === 'mastered' ? 'badge-success' :
                word.progress.status === 'reviewing' ? 'badge-primary' :
                word.progress.status === 'learning' ? 'badge-warning' : 'badge-secondary'
              ]"
            >
              {{ word.progress.status }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!wordsStore.loading" class="text-center py-12">
      <div class="text-4xl mb-4">🔍</div>
      <p class="text-slate-600">No words found matching your criteria.</p>
    </div>

    <!-- Loading -->
    <div v-else class="text-center py-12">
      <div class="animate-spin text-4xl mb-4">📚</div>
      <p class="text-slate-600">Loading words...</p>
    </div>
  </div>
</template>
