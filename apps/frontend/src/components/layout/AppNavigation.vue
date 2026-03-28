<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import UserAvatar from '@/components/ui/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { isDark, toggleTheme } = useTheme()

const openDropdown = ref<string | null>(null)

function toggleDropdown(name: string) {
  openDropdown.value = openDropdown.value === name ? null : name
}

function closeDropdown() {
  openDropdown.value = null
}

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

function isGroupActive(paths: string[]) {
  return paths.some(p => isActive(p))
}

async function handleLogout() {
  await authStore.logout()
  window.location.href = '/login'
}

function openSearch() {
  router.push('/browse?focus=search')
}

function onDocClick(e: MouseEvent) {
  if (openDropdown.value) {
    const target = e.target as HTMLElement
    if (!target.closest('[data-dropdown]')) {
      openDropdown.value = null
    }
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <!-- Desktop Navigation -->
  <nav class="hidden md:block bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <!-- Logo -->
        <RouterLink to="/" class="flex items-center gap-2 flex-shrink-0">
          <span class="text-2xl">📚</span>
          <span class="font-bold text-xl text-primary-600 dark:text-primary-400">Vocab Master</span>
        </RouterLink>

        <!-- Center Nav -->
        <div class="flex items-center gap-1">
          <!-- Core items (always visible) -->
          <RouterLink
            v-for="item in [
              { path: '/', label: 'Home' },
              { path: '/learn', label: 'Learn' },
              { path: '/review', label: 'Review' },
              { path: '/browse', label: 'Browse' },
            ]"
            :key="item.path"
            :to="item.path"
            :class="[
              'px-3 py-2 rounded-lg transition-colors text-sm',
              isActive(item.path)
                ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            ]"
          >
            {{ item.label }}
          </RouterLink>

          <!-- Practice Dropdown -->
          <div class="relative" data-dropdown="practice">
            <button
              @click.stop="toggleDropdown('practice')"
              :class="[
                'px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-1',
                isGroupActive(['/quiz', '/spelling', '/fill-blank'])
                  ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              ]"
            >
              Practice
              <svg class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': openDropdown === 'practice' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <Transition name="dropdown">
              <div
                v-if="openDropdown === 'practice'"
                class="absolute left-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50"
              >
                <RouterLink
                  v-for="item in [
                    { path: '/quiz', icon: '🧠', label: 'Quiz' },
                    { path: '/spelling', icon: '✍️', label: 'Spelling' },
                    { path: '/fill-blank', icon: '📝', label: 'Fill Blanks' },
                  ]"
                  :key="item.path"
                  :to="item.path"
                  @click="closeDropdown"
                  class="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                  :class="isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                >
                  <span class="w-5 text-center">{{ item.icon }}</span>
                  {{ item.label }}
                </RouterLink>
              </div>
            </Transition>
          </div>

          <!-- More Dropdown -->
          <div class="relative" data-dropdown="more">
            <button
              @click.stop="toggleDropdown('more')"
              :class="[
                'px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-1',
                isGroupActive(['/favorites', '/lists', '/stats', '/leaderboard', '/history'])
                  ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              ]"
            >
              More
              <svg class="w-3.5 h-3.5 transition-transform" :class="{ 'rotate-180': openDropdown === 'more' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <Transition name="dropdown">
              <div
                v-if="openDropdown === 'more'"
                class="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50"
              >
                <RouterLink
                  v-for="item in [
                    { path: '/favorites', icon: '❤️', label: 'Favorites' },
                    { path: '/lists', icon: '📋', label: 'My Lists' },
                    { path: '/stats', icon: '📊', label: 'Statistics' },
                    { path: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
                    { path: '/history', icon: '📜', label: 'History' },
                  ]"
                  :key="item.path"
                  :to="item.path"
                  @click="closeDropdown"
                  class="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                  :class="isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'"
                >
                  <span class="w-5 text-center">{{ item.icon }}</span>
                  {{ item.label }}
                </RouterLink>
              </div>
            </Transition>
          </div>

          <!-- Admin link (only for admins) -->
          <RouterLink
            v-if="authStore.isAdmin"
            to="/admin"
            :class="[
              'px-3 py-2 rounded-lg transition-colors text-sm',
              isActive('/admin')
                ? 'bg-amber-100 text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-300'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            ]"
          >
            Admin
          </RouterLink>
        </div>

        <!-- Right Section -->
        <div class="flex items-center gap-3 flex-shrink-0">
          <!-- Search shortcut -->
          <button
            @click="openSearch"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span>🔍</span>
            <span class="hidden lg:inline">Search...</span>
            <kbd class="hidden lg:inline text-xs bg-slate-100 dark:bg-slate-600 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>

          <button
            @click="toggleTheme"
            class="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            {{ isDark ? '☀️' : '🌙' }}
          </button>

          <template v-if="authStore.isAuthenticated">
            <RouterLink to="/settings" class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400">
              <UserAvatar v-if="authStore.user?.username" :username="authStore.user.username" size="sm" />
              <div class="hidden lg:block">
                <div class="font-medium leading-tight">{{ authStore.user?.username }}</div>
                <div v-if="authStore.user?.level" class="text-xs text-primary-500">Lv.{{ authStore.user.level }}</div>
              </div>
            </RouterLink>
            <button
              @click="handleLogout"
              class="btn btn-secondary text-sm"
            >
              Logout
            </button>
          </template>
          <template v-else>
            <RouterLink to="/login" class="btn btn-secondary text-sm">Login</RouterLink>
            <RouterLink to="/register" class="btn btn-primary text-sm">Sign Up</RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>

  <!-- Mobile Top Bar -->
  <nav class="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
    <div class="flex items-center justify-between px-4 h-14">
      <RouterLink to="/" class="flex items-center gap-2">
        <span class="text-xl">📚</span>
        <span class="font-bold text-primary-600 dark:text-primary-400">Vocab Master</span>
      </RouterLink>

      <div class="flex items-center gap-2">
        <button
          @click="openSearch"
          class="p-1.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          🔍
        </button>
        <button
          @click="toggleTheme"
          class="p-1 rounded text-slate-600 dark:text-slate-400"
          :title="isDark ? '☀️' : '🌙'"
        >
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <template v-if="authStore.isAuthenticated">
          <RouterLink to="/settings" class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400">
            <UserAvatar v-if="authStore.user?.username" :username="authStore.user.username" size="sm" />
            <div>
              <div class="font-medium">{{ authStore.user?.username }}</div>
              <div v-if="authStore.user?.level" class="text-xs text-primary-500">Lv.{{ authStore.user.level }}</div>
            </div>
          </RouterLink>
          <button @click="handleLogout" class="text-sm text-primary-600 dark:text-primary-400">Logout</button>
        </template>
        <template v-else>
          <RouterLink to="/login" class="text-sm text-primary-600 dark:text-primary-400">Login</RouterLink>
        </template>
      </div>
    </div>
  </nav>

  <!-- Mobile Bottom Navigation -->
  <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50" style="padding-bottom: env(safe-area-inset-bottom)">
    <div class="flex items-center justify-around py-2">
      <RouterLink
        v-for="item in [
          { path: '/', label: 'Home', icon: '🏠' },
          { path: '/learn', label: 'Learn', icon: '📚' },
          { path: '/review', label: 'Review', icon: '🔄' },
          { path: '/quiz', label: 'Quiz', icon: '🧠' },
          { path: '/browse', label: 'Browse', icon: '📖' },
        ]"
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

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
