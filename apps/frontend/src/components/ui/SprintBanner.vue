<template>
  <div v-if="sprintId" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 mb-4">
    <span class="text-sm">🏃</span>
    <span class="text-sm text-indigo-700 dark:text-indigo-300">
      Practicing <strong>sprint words</strong>
    </span>
    <router-link
      :to="`/sprints`"
      class="ml-auto text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
    >
      View Sprint →
    </router-link>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  sprintId?: string
}>()
</script>
