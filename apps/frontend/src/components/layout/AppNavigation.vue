<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const navItems = [
  { path: '/', label: 'Home', icon: '🏠' },
  { path: '/learn', label: 'Learn', icon: '📚' },
  { path: '/review', label: 'Review', icon: '🔄' },
  { path: '/browse', label: 'Browse', icon: '📖' },
  { path: '/stats', label: 'Stats', icon: '📊' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <!-- Desktop Navigation -->
  <nav class="hidden md:block bg-white border-b border-slate-200 sticky top-0 z-50">
    <div class="container mx-auto px-4">
      <div class="flex items-center justify-between h-16">
        <RouterLink to="/" class="flex items-center gap-2">
          <span class="text-2xl">📚</span>
          <span class="font-bold text-xl text-primary-600">Vocab Master</span>
        </RouterLink>
        
        <div class="flex items-center gap-1">
          <RouterLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            :class="[
              'px-4 py-2 rounded-lg transition-colors',
              isActive(item.path)
                ? 'bg-primary-100 text-primary-700 font-medium'
                : 'text-slate-600 hover:bg-slate-100'
            ]"
          >
            {{ item.label }}
          </RouterLink>
        </div>
      </div>
    </div>
  </nav>

  <!-- Mobile Bottom Navigation -->
  <nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
    <div class="flex items-center justify-around py-2">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex flex-col items-center py-2 px-4 rounded-lg transition-colors',
          isActive(item.path)
            ? 'text-primary-600'
            : 'text-slate-500'
        ]"
      >
        <span class="text-xl">{{ item.icon }}</span>
        <span class="text-xs mt-1">{{ item.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
