<template>
  <div v-if="ai.enabled.value" class="card">
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <span class="text-lg">🤖</span>
        <h3 class="text-sm font-semibold text-slate-900 dark:text-white">AI Coach</h3>
      </div>
      <!-- Status pill -->
      <div class="flex items-center gap-1.5 text-xs">
        <span class="w-2 h-2 rounded-full" :class="{
          'bg-green-500': ai.isReady.value,
          'bg-amber-500 animate-pulse': ai.isLoading.value,
          'bg-red-500': ai.status.value === 'error',
          'bg-slate-400': ai.status.value === 'idle',
        }"></span>
        <span :class="{
          'text-green-600 dark:text-green-300': ai.isReady.value,
          'text-amber-600 dark:text-amber-300': ai.isLoading.value,
          'text-red-600 dark:text-red-300': ai.status.value === 'error',
          'text-slate-500 dark:text-slate-400': ai.status.value === 'idle',
        }">
          <template v-if="ai.isReady.value">Ready</template>
          <template v-else-if="ai.status.value === 'downloading'">Downloading {{ ai.progressPercent.value }}%</template>
          <template v-else-if="ai.status.value === 'loading'">Loading…</template>
          <template v-else-if="ai.status.value === 'error'">Error</template>
          <template v-else>Idle</template>
        </span>
      </div>
    </div>

    <!-- Progress bar during download -->
    <div v-if="ai.isLoading.value">
      <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary-500 rounded-full transition-all duration-300"
          :style="{ width: `${ai.progressPercent.value}%` }"
        />
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
        {{ ai.status.value === 'downloading'
          ? `${formatBytes(ai.progress.value.loaded)} / ${formatBytes(ai.progress.value.total)} · ${ai.progress.value.fileCount || 0} files`
          : ai.statusMessage.value || 'Preparing…'
        }}
      </p>
    </div>

    <!-- Error -->
    <p v-else-if="ai.status.value === 'error' && ai.errorMessage.value"
      class="text-xs text-red-600 dark:text-red-300">
      {{ ai.errorMessage.value }}
    </p>

    <!-- Ready hint -->
    <p v-else-if="ai.isReady.value" class="text-xs text-slate-500 dark:text-slate-400">
      AI feedback will appear automatically when you submit sentences in writing practice.
    </p>

    <!-- Settings link -->
    <router-link to="/settings" class="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-2 inline-block">
      Manage AI Coach settings →
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { useBrowserAI } from '../../composables/useBrowserAI'

const ai = useBrowserAI()

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${units[i]}`
}
</script>
