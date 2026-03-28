<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const authStore = useAuthStore()
const { isDark, toggleTheme } = useTheme()

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/learn', label: 'Learn', icon: '📚' },
  { path: '/review', label: 'Review', icon: '🔄' },
  { path: '/lists', label: 'Lists', icon: '📋' },
  { path: '/browse', label: 'Browse', icon: '📖' },
  { path: '/stats', label: 'Stats', icon: '📊' },
]

const adminNavItem = { path: '/admin', label: 'Admin', icon: '⚙️' }

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

async function handleLogout() {
  await authStore.logout()
  window.location.href = '/login'
}
</script>

<template>
  <!-- Desktop Navigation -->
  <nav class="hidden md:block bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 dark:bg-slate-800 dark:border-slate-700">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <RouterLink to="/" class="flex items-center gap-2">
          <span class="text-2xl">📚</span>
          <span class="font-bold text-xl text-primary-600 dark:text-primary-400">Vocab Master</span>
        </RouterLink>
        
        <div class="flex items-center gap-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="[
              'px-4 py-2 rounded-lg transition-colors',
              isActive(item.path)
                ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
            ]"
          >
            {{ item.label }}
          </RouterLink>
          
          <!-- Admin link (only for admins) -->
          <RouterLink
            v-if="authStore.isAdmin"
            :to="adminNavItem.path"
            :class="[
              'px-4 py-2 rounded-lg transition-colors',
              isActive(adminNavItem.path)
                ? 'bg-amber-100 text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-300'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
            ]"
          >
            {{ adminNavItem.label }}
          </RouterLink>
        </div>

        <!-- Auth section -->
        <div class="flex items-center gap-3">
          <button
            @click="toggleTheme"
            class="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            {{ isDark ? '☀️' : '🌙' }}
          </button>
          <template v-if="authStore.isAuthenticated">
            <RouterLink
              to="/settings"
              class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white dark:text-slate-400 dark:hover:text-slate-200"
            >
              {{ authStore.user?.username }}
            </RouterLink>
            <button
              @click="handleLogout"
              class="btn btn-secondary text-sm"
            >
              Logout
            </button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="btn btn-secondary text-sm">
              Login
            </RouterLink>
            <RouterLink to="/register" class="btn btn-primary text-sm">
              Sign Up
            </RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>

  <!-- Mobile Top Bar -->
  <nav class="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50 dark:bg-slate-800 dark:border-slate-700">
    <div class="flex items-center justify-between px-4 h-14">
      <RouterLink to="/" class="flex items-center gap-2">
        <span class="text-xl">📚</span>
        <span class="font-bold text-primary-600 dark:text-primary-400">Vocab Master</span>
      </RouterLink>

      <div class="flex items-center gap-2">
        <button
          @click="toggleTheme"
          class="p-1 rounded text-slate-600 dark:text-slate-400"
          :title="isDark ? '☀️' : '🌙'"
        >
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <template v-if="authStore.isAuthenticated">
          <RouterLink to="/settings" class="text-sm text-slate-600 dark:text-slate-400">{{ authStore.user?.username }}</RouterLink>
          <button
            @click="handleLogout"
            class="text-sm text-primary-600 dark:text-primary-400"
          >
            Logout
          </button>
        </template>
        <template v-else>
          <RouterLink to="/login" class="text-sm text-primary-600 dark:text-primary-400">
            Login
          </RouterLink>
        </template>
      </div>
    </div>
  </nav>

  <!-- Mobile Bottom Navigation -->
  <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50 dark:bg-slate-800 dark:border-slate-700">
    <div class="flex items-center justify-around py-2">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex flex-col items-center py-2 px-4 rounded-lg transition-colors',
          isActive(item.path)
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-slate-500 dark:text-slate-400'
        ]"
      >
        <span class="text-xl">{{ item.icon }}</span>
        <span class="text-xs mt-1">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
