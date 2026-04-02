<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isOffline = ref(!navigator.onLine)
const wasOffline = ref(false)
const syncing = ref(false)

async function update() {
  const nowOnline = navigator.onLine
  isOffline.value = !nowOnline

  // When coming back online, auto-sync pending actions
  if (nowOnline && wasOffline.value) {
    syncing.value = true
    try {
      const { useOfflineSync } = await import('@/composables/useOfflineSync')
      const sync = useOfflineSync()
      const result = await sync.syncPendingActions()
      if (result.synced > 0) {
        // Dispatch a custom event so the app knows data changed
        window.dispatchEvent(new CustomEvent('offline-sync-complete', {
          detail: { synced: result.synced }
        }))
      }
    } catch {
      // Sync failed silently
    } finally {
      syncing.value = false
    }
    wasOffline.value = false
  }

  if (!nowOnline) {
    wasOffline.value = true
  }
}

onMounted(() => {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
})

onUnmounted(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
})
</script>

<template>
  <Transition name="slide-down">
    <div
      v-if="isOffline || syncing"
      class="fixed top-0 left-0 right-0 z-50 text-center py-2 text-sm font-medium transition-colors"
      :class="syncing ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'"
    >
      <template v-if="syncing">
        Syncing pending changes...
      </template>
      <template v-else>
        You are offline. Some features may not be available.
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
