<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppNavigation from '@/components/layout/AppNavigation.vue'
import ToastContainer from '@/components/ui/ToastContainer.vue'
import OfflineBanner from '@/components/ui/OfflineBanner.vue'
import GlobalSearch from '@/components/ui/GlobalSearch.vue'
import { useAuthStore } from '@/stores/auth'
import { usePageTitle } from '@/composables/usePageTitle'

const authStore = useAuthStore()
usePageTitle()

// Fetch user on app mount
onMounted(async () => {
  await authStore.fetchUser()
})
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900">
    <AppNavigation />
    <main class="container mx-auto px-4 py-6 pb-24 md:pb-6">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <ToastContainer />
    <OfflineBanner />
    <GlobalSearch />
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
