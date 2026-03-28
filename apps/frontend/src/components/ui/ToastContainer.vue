<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, remove } = useToast()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup
      name="toast"
      tag="div"
      class="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm"
        :class="{
          'bg-green-50 dark:bg-green-900/80 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200': t.type === 'success',
          'bg-red-50 dark:bg-red-900/80 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200': t.type === 'error',
          'bg-blue-50 dark:bg-blue-900/80 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200': t.type === 'info',
          'bg-yellow-50 dark:bg-yellow-900/80 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200': t.type === 'warning',
        }"
      >
        <span class="text-lg leading-none mt-0.5">
          {{ t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : t.type === 'warning' ? '⚠️' : 'ℹ️' }}
        </span>
        <div class="flex-1 min-w-0">
          <p v-if="t.title" class="font-medium text-sm">{{ t.title }}</p>
          <p class="text-sm" :class="{ 'mt-0.5': t.title }">{{ t.message }}</p>
        </div>
        <button
          @click="remove(t.id)"
          class="text-current opacity-50 hover:opacity-100 transition-opacity ml-2"
        >
          ✕
        </button>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
.toast-move {
  transition: transform 0.2s ease;
}
</style>
