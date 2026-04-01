<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listsApi } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const token = route.params.token as string
const loading = ref(true)
const importing = ref(false)
const imported = ref(false)
const list = ref<any>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    list.value = await listsApi.getShared(token)
  } catch (e: any) {
    error.value = e.message || 'Failed to load shared list'
  } finally {
    loading.value = false
  }
})

async function importList() {
  importing.value = true
  try {
    const result = await listsApi.importShared(token)
    imported.value = true
    toast.success(`Imported "${result.list.name}" with ${result.list.wordCount} words`)
    setTimeout(() => router.push(`/lists/${result.list.id}`), 1500)
  } catch (e: any) {
    toast.error(e.message || 'Failed to import list')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <LoadingSpinner v-if="loading" />

    <div v-else-if="error" class="card text-center py-12">
      <div class="text-4xl mb-4">🔗</div>
      <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Link Expired or Invalid</h2>
      <p class="text-slate-500 dark:text-slate-400">{{ error }}</p>
    </div>

    <template v-else-if="list">
      <!-- Header -->
      <div class="card">
        <div class="flex items-start gap-4">
          <div class="text-4xl">{{ list.icon }}</div>
          <div class="flex-1">
            <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{ list.name }}</h1>
            <p v-if="list.description" class="text-sm text-slate-500 dark:text-slate-400 mt-1">{{ list.description }}</p>
            <div class="flex items-center gap-3 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span>by {{ list.sharedBy }}</span>
              <span>{{ list.wordCount }} words</span>
            </div>
          </div>
        </div>

        <!-- Import button -->
        <div class="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            v-if="!imported"
            @click="importList"
            :disabled="importing"
            class="btn btn-primary w-full"
          >
            {{ importing ? 'Importing...' : 'Import to My Lists' }}
          </button>
          <div v-else class="text-center text-green-600 dark:text-green-400 font-medium">
            List imported successfully! Redirecting...
          </div>
        </div>
      </div>

      <!-- Words list -->
      <div class="card">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Words ({{ list.words.length }})</h2>
        <div class="space-y-2">
          <div
            v-for="w in list.words"
            :key="w.id"
            class="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-900 dark:text-white">{{ w.word }}</span>
                <LevelBadge v-if="w.cefrLevel" :level="w.cefrLevel" />
              </div>
              <p class="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{{ w.definition }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
