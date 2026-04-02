<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const isOffline = ref(!navigator.onLine)
const wasOffline = ref(false)
const syncing = ref(false)
const wordsCached = ref(0)
let syncInterval: ReturnType<typeof setInterval> | null = null

// Periodic background sync — refresh cache every 30 minutes when online
const SYNC_INTERVAL = 30 * 60 * 1000

async function backgroundSync() {
  if (!navigator.onLine || syncing.value) return
  try {
    const { useOfflineSync } = await import('@/composables/useOfflineSync')
    const sync = useOfflineSync()
    const status = await sync.getSyncStatus()
    // Only sync if there are cached words (user has used offline mode)
    if (status.wordsCount > 0) {
      syncing.value = true
      await sync.syncProgress()
      syncing.value = false
    }
  } catch {
    syncing.value = false
  }
}

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
    loadCachedCount()
  }
}

async function loadCachedCount() {
  try {
    const { useOfflineDB } = await import('@/composables/useOfflineDB')
    const db = useOfflineDB()
    wordsCached.value = await db.getWordsCount()
  } catch {
    // IndexedDB not available
  }
}

function goToOffline() {
  router.push('/offline')
}

onMounted(() => {
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  if (isOffline.value) loadCachedCount()
  // Start periodic background sync
  syncInterval = setInterval(backgroundSync, SYNC_INTERVAL)
})

onUnmounted(() => {
  window.removeEventListener('online', update)
  window.removeEventListener('offline', update)
  if (syncInterval) clearInterval(syncInterval)
})
</script>

<template>
  <Transition name="slide-down">
    <div
      v-if="isOffline || syncing"
      class="fixed top-0 left-0 right-0 z-50 text-center py-2 text-sm font-medium transition-colors"
      :class="syncing ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white'"
    >
      <template v-if="syncing">
        ⏳ Syncing pending changes...
      </template>
      <template v-else>
        📡 You are offline
        <button
          v-if="wordsCached > 0"
          @click="goToOffline"
          class="ml-2 underline hover:text-amber-100 font-semibold"
        >
          Study Offline ({{ wordsCached }} words cached)
        </button>
        <span v-else class="ml-1 opacity-80">— some features unavailable</span>
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
