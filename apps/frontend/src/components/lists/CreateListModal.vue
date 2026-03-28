<script setup lang="ts">
import { ref } from 'vue'
import { useListsStore } from '@/stores/lists'

const emit = defineEmits<{
  close: []
}>()

const listsStore = useListsStore()

const form = ref({
  name: '',
  description: '',
  color: '#6366f1',
  icon: '📚'
})

const colors = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', 
  '#22c55e', '#06b6d4', '#14b8a6', '#8b5cf6',
  '#6366f1', '#ec4899', '#be185d'
]

const icons = ['📚', '📖', '📝', '⭐', '🔥', '💡', '🎯', '🏆']

const loading = ref(false)
const error = ref<string | null>(null)

async function handleSubmit() {
  if (!form.value.name.trim()) {
    error.value = 'Name is required'
    return
  }

  loading.value = true
  error.value = null

  try {
    await listsStore.createList({
    name: form.value.name.trim(),
    description: form.value.description.trim() || undefined,
    color: form.value.color,
    icon: form.value.icon
    })
    emit('close')
  } catch (e: unknown) {
    error.value = (e as Error).message || 'Failed to create list'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b">
        <h2 class="text-lg font-semibold">Create New List</h2>
        <button @click="emit('close')" class="text-slate-400 hover:text-slate-600 dark:text-slate-400">
          ✕
        </button>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="p-4 space-y-4">
        <!-- Error -->
        <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
          {{ error }}
        </div>

        <!-- Name -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name *</label>
          <input
            v-model="form.name"
            type="text"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="My Vocabulary List"
            required
          />
        </div>

        <!-- Description -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
          <textarea
            v-model="form.description"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Optional description..."
            rows="2"
          ></textarea>
        </div>

        <!-- Color -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Color</label>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="c in colors"
              :key="c"
              type="button"
              @click="form.color = c"
              class="w-8 h-8 rounded-full border-2 transition-transform"
              :class="form.color === c ? 'scale-110 border-slate-400' : 'border-transparent'"
              :style="{ backgroundColor: c }"
            ></button>
          </div>
        </div>

        <!-- Icon -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Icon</label>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="i in icons"
              :key="i"
              type="button"
              @click="form.icon = i"
              class="w-10 h-10 rounded-lg border-2 text-lg transition-transform"
              :class="form.icon === i ? 'scale-110 border-slate-400' : 'border-transparent'"
            >
              {{ i }}
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            @click="emit('close')"
            class="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {{ loading ? 'Creating...' : 'Create List' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
