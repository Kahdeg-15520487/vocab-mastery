<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import AppNavigation from '@/components/layout/AppNavigation.vue'
import ToastContainer from '@/components/ui/ToastContainer.vue'
import OfflineBanner from '@/components/ui/OfflineBanner.vue'
import { useAuthStore } from '@/stores/auth'
import { usePageTitle } from '@/composables/usePageTitle'

const authStore = useAuthStore()
const router = useRouter()
usePageTitle()

function handleGlobalKeydown(e: KeyboardEvent) {
  // Ctrl+K or Cmd+K → open search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    router.push('/browse?focus=search')
  }
}

// Fetch user on app mount
onMounted(async () => {
  await authStore.fetchUser()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900">
    <AppNavigation />
    <main class="container mx-auto px-4 py-6 pb-20 md:pb-6">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <ToastContainer />
    <OfflineBanner />
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
