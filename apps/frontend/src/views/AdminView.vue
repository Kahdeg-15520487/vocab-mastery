<script setup lang="ts">
import { ref } from 'vue'
import UserTable from '@/components/admin/UserTable.vue'
import ConfigPanel from '@/components/admin/ConfigPanel.vue'
import StatsPanel from '@/components/admin/StatsPanel.vue'
import DataPanel from '@/components/admin/DataPanel.vue'
import CategorizationPanel from '@/components/admin/CategorizationPanel.vue'

type TabKey = 'users' | 'content' | 'system'

const activeTab = ref<TabKey>('users')
const contentSection = ref<'data' | 'categorize'>('data')
const systemSection = ref<'stats' | 'config'>('stats')

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'content', label: 'Content', icon: '📦' },
  { key: 'system', label: 'System', icon: '⚙️' },
]
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-200">Admin Panel</h1>
      <p class="text-slate-600 dark:text-slate-400">Manage users, content, and system settings</p>
    </div>

    <!-- Main Tabs -->
    <div class="border-b border-slate-200 dark:border-slate-700 mb-6">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key"
          :class="[
            'py-3 px-1 border-b-2 font-medium text-sm transition-colors',
            activeTab === tab.key
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
          ]"
        >
          <span class="mr-2">{{ tab.icon }}</span>
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Users Tab -->
    <div v-if="activeTab === 'users'">
      <UserTable />
    </div>

    <!-- Content Tab: Data + Categorize sub-sections -->
    <div v-else-if="activeTab === 'content'">
      <div class="flex gap-2 mb-4">
        <button
          @click="contentSection = 'data'"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            contentSection === 'data'
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          ]"
        >
          📥 Import / Export
        </button>
        <button
          @click="contentSection = 'categorize'"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            contentSection === 'categorize'
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          ]"
        >
          🏷️ Categorize
        </button>
      </div>
      <DataPanel v-if="contentSection === 'data'" />
      <CategorizationPanel v-else />
    </div>

    <!-- System Tab: Stats + Config sub-sections -->
    <div v-else-if="activeTab === 'system'">
      <div class="flex gap-2 mb-4">
        <button
          @click="systemSection = 'stats'"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            systemSection === 'stats'
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          ]"
        >
          📊 Statistics
        </button>
        <button
          @click="systemSection = 'config'"
          :class="[
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            systemSection === 'config'
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
          ]"
        >
          ⚙️ LLM Config
        </button>
      </div>
      <StatsPanel v-if="systemSection === 'stats'" />
      <ConfigPanel v-else />
    </div>
  </div>
</template>
