<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useListsStore } from '@/stores/lists'
import ListCard from '@/components/lists/ListCard.vue'
import CreateListModal from '@/components/lists/CreateListModal.vue'
import GenerateListModal from '@/components/lists/GenerateListModal.vue'
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'

const listsStore = useListsStore()
const showCreateModal = ref(false)
const showGenerateModal = ref(false)

// Fetch lists on mount
onMounted(() => {
  listsStore.fetchLists()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-200">My Lists</h1>
        <p class="text-slate-600 dark:text-slate-400">Manage your vocabulary lists</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="btn btn-secondary"
      >
        + New List
      </button>
      <button
        @click="showGenerateModal = true"
        class="btn btn-primary"
      >
        🤖 Generate
      </button>
    </div>

    <!-- Loading -->
    <div v-if="listsStore.loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <SkeletonLoader v-for="i in 6" :key="i" variant="card" height="120px" />
    </div>

    <!-- Lists Grid -->
    <div v-else class="space-y-6">
      <!-- System Lists -->
      <div v-if="listsStore.systemLists.length > 0">
        <h2 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">System Lists</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ListCard
            v-for="list in listsStore.systemLists"
            :key="list.id"
            :list="list"
          />
        </div>
      </div>

      <!-- Custom Lists -->
      <div v-if="listsStore.customLists.length > 0">
        <h2 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">My Lists</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ListCard
            v-for="list in listsStore.customLists"
            :key="list.id"
            :list="list"
          />
        </div>
      </div>

      <!-- Shared Lists -->
      <div v-if="listsStore.sharedLists.length > 0">
        <h2 class="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">Shared with Me</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ListCard
            v-for="list in listsStore.sharedLists"
            :key="list.id"
            :list="list"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!listsStore.loading && listsStore.lists.length === 0" class="text-center py-12">
        <p class="text-slate-500 dark:text-slate-400">No lists yet. Create your first list to get started!</p>
        <button @click="showCreateModal = true" class="btn btn-primary">
          Create List
        </button>
      </div>
    </div>

    <!-- Create Modal -->
    <CreateListModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
    />

    <!-- Generate Modal -->
    <GenerateListModal
      v-if="showGenerateModal"
      @close="showGenerateModal = false"
    />
  </div>
</template>
