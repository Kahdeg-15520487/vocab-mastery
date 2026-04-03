<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppNavigation from '@/components/layout/AppNavigation.vue'
import ToastContainer from '@/components/ui/ToastContainer.vue'
import OfflineBanner from '@/components/ui/OfflineBanner.vue'
import InstallBanner from '@/components/ui/InstallBanner.vue'
import GlobalSearch from '@/components/ui/GlobalSearch.vue'
import ShortcutHelp from '@/components/ui/ShortcutHelp.vue'
import { useAuthStore } from '@/stores/auth'
import { usePageTitle } from '@/composables/usePageTitle'
import { useTheme } from '@/composables/useTheme'

const authStore = useAuthStore()
const theme = useTheme()
usePageTitle()

// Global keyboard shortcuts
function handleGlobalKeydown(e: KeyboardEvent) {
  // Ctrl+D = toggle dark mode
  if (e.ctrlKey && e.key === 'd') {
    e.preventDefault()
    theme.toggleTheme()
  }
}

// Fetch user on app mount
onMounted(async () => {
  await authStore.fetchUser()
  document.addEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900">
    <AppNavigation />
    <main class="container mx-auto px-4 py-6 pb-24 md:pb-6" role="main" aria-label="Main content">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <ToastContainer />
    <OfflineBanner />
    <InstallBanner />
    <GlobalSearch />
    <ShortcutHelp />
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
