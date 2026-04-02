<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'
import UserAvatar from '@/components/ui/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { isDark, toggleTheme } = useTheme()

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/learn', label: 'Learn', icon: '📚' },
  { path: '/review', label: 'Review', icon: '🔄' },
]

const practiceItems = [
  { path: '/quiz', label: 'Quiz', icon: '\u{1F9E0}' },
  { path: '/spelling', label: 'Spelling', icon: '\u270D\uFE0F' },
  { path: '/fill-blank', label: 'Fill Blank', icon: '\u{1F4DD}' },
  { path: '/listening', label: 'Listening', icon: '\u{1F3A7}' },
]

const statsItems = [
  { path: '/stats', label: 'Stats', icon: '📊' },
  { path: '/achievements', label: 'Achievements', icon: '🎖️' },
  { path: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { path: '/history', label: 'History', icon: '📜' },
]

const collectionItems = [
  { path: '/favorites', label: 'Favorites', icon: '❤️' },
  { path: '/encounters', label: 'Words in the Wild', icon: '🌍' },
  { path: '/lists', label: 'Lists', icon: '📋' },
  { path: '/sprints', label: 'Sprints', icon: '🏃' },
  { path: '/writing', label: 'Writing', icon: '✍️' },
  { path: '/speaking', label: 'Speaking', icon: '🎙️' },
  { path: '/reading', label: 'Reading', icon: '📚' },
  { path: '/sentence-review', label: 'Sentence Review', icon: '📝' },
]

const showPracticeMenu = ref(false)
const showStatsMenu = ref(false)
const showMoreMenu = ref(false)
const showMobilePracticeMenu = ref(false)

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const isGroupActive = (items: { path: string }[]) => items.some(i => isActive(i.path))

function closeMenus() {
  showPracticeMenu.value = false
  showStatsMenu.value = false
  showMoreMenu.value = false
}

function toggleMenu(menu: 'practice' | 'stats' | 'more') {
  const ref = menu === 'practice' ? showPracticeMenu : menu === 'stats' ? showStatsMenu : showMoreMenu
  const wasOpen = ref.value
  closeMenus()
  if (!wasOpen) ref.value = true
}

async function handleLogout() {
  await authStore.logout()
  window.location.href = '/login'
}

function openSearch() {
  router.push('/browse?focus=search')
}
</script>

<template>
  <!-- Desktop Navigation -->
  <nav class="hidden md:block bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <RouterLink to="/" class="flex items-center gap-2 shrink-0">
          <span class="text-2xl">📚</span>
          <span class="font-bold text-xl text-primary-600 dark:text-primary-400">Vocab Master</span>
        </RouterLink>

        <div class="flex items-center gap-1">
          <!-- Core nav items -->
          <RouterLink
            v-for="item in navItems"
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

          <!-- Practice dropdown -->
          <div class="relative" @mouseenter="showPracticeMenu = true" @mouseleave="showPracticeMenu = false">
            <button
              @click="toggleMenu('practice')"
              :class="[
                'px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-1',
                isGroupActive(practiceItems)
                  ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              ]"
            >
              Practice
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <div
              v-if="showPracticeMenu"
              class="absolute top-full left-0 pt-1 w-44 z-50"
            >
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <RouterLink
                v-for="item in practiceItems"
                :key="item.path"
                :to="item.path"
                @click="closeMenus"
                :class="[
                  'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                  isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                ]"
              >
                <span>{{ item.icon }}</span>
                {{ item.label }}
              </RouterLink>
            </div></div>
          </div>

          <!-- Stats dropdown -->
          <div class="relative" @mouseenter="showStatsMenu = true" @mouseleave="showStatsMenu = false">
            <button
              @click="toggleMenu('stats')"
              :class="[
                'px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-1',
                isGroupActive(statsItems)
                  ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              ]"
            >
              Stats
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
            </button>
            <div
              v-if="showStatsMenu"
              class="absolute top-full left-0 pt-1 w-44 z-50"
            >
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <RouterLink
                v-for="item in statsItems"
                :key="item.path"
                :to="item.path"
                @click="closeMenus"
                :class="[
                  'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                  isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                ]"
              >
                <span>{{ item.icon }}</span>
                {{ item.label }}
              </RouterLink>
            </div></div>
          </div>

          <!-- More dropdown (collections + admin) -->
          <div class="relative" @mouseenter="showMoreMenu = true" @mouseleave="showMoreMenu = false">
            <button
              @click="toggleMenu('more')"
              :class="[
                'px-3 py-2 rounded-lg transition-colors text-sm flex items-center gap-1',
                isGroupActive(collectionItems) || (authStore.isAdmin && isActive('/admin'))
                  ? 'bg-primary-100 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              ]"
            >
              •••
            </button>
            <div
              v-if="showMoreMenu"
              class="absolute top-full right-0 pt-1 w-44 z-50"
            >
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <RouterLink
                v-for="item in collectionItems"
                :key="item.path"
                :to="item.path"
                @click="closeMenus"
                :class="[
                  'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                  isActive(item.path)
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                ]"
              >
                <span>{{ item.icon }}</span>
                {{ item.label }}
              </RouterLink>
              <RouterLink
                v-if="authStore.isAdmin"
                to="/admin"
                @click="closeMenus"
                :class="[
                  'flex items-center gap-2 px-4 py-2 text-sm transition-colors',
                  isActive('/admin')
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                ]"
              >
                <span>⚙️</span>
                Admin
              </RouterLink>
            </div></div>
          </div>
        </div>

        <!-- Auth section -->
        <div class="flex items-center gap-3 shrink-0">
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
            <RouterLink
              to="/settings"
              class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
  <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-50" style="padding-bottom: env(safe-area-inset-bottom)">
    <div class="flex items-center justify-around py-2">
      <RouterLink
        v-for="item in [
          { path: '/', label: 'Home', icon: '🏠' },
          { path: '/learn', label: 'Learn', icon: '📚' },
          { path: '/review', label: 'Review', icon: '🔄' },
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

      <!-- Practice button (opens sheet) -->
      <button
        @click="showMobilePracticeMenu = !showMobilePracticeMenu"
        :class="[
          'flex flex-col items-center py-2 px-4 rounded-lg transition-colors',
          isGroupActive(practiceItems)
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-slate-500 dark:text-slate-400'
        ]"
      >
        <span class="text-xl">🧠</span>
        <span class="text-xs mt-1">Practice</span>
      </button>

      <RouterLink
        to="/stats"
        :class="[
          'flex flex-col items-center py-2 px-4 rounded-lg transition-colors',
          isActive('/stats')
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-slate-500 dark:text-slate-400'
        ]"
      >
        <span class="text-xl">📊</span>
        <span class="text-xs mt-1">Stats</span>
      </RouterLink>
    </div>

    <!-- Mobile Practice Sheet -->
    <div
      v-if="showMobilePracticeMenu"
      class="absolute bottom-full left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-lg"
    >
      <RouterLink
        v-for="item in practiceItems"
        :key="item.path"
        :to="item.path"
        @click="showMobilePracticeMenu = false"
        class="flex items-center gap-3 px-6 py-3 text-sm text-slate-700 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-700"
      >
        <span class="text-lg">{{ item.icon }}</span>
        {{ item.label }}
      </RouterLink>
    </div>
    <div
      v-if="showMobilePracticeMenu"
      class="fixed inset-0 -z-10"
      @click="showMobilePracticeMenu = false"
    ></div>
  </nav>
</template>
