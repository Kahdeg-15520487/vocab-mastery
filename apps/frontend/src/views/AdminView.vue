<script setup lang="ts">
import { ref } from 'vue'
import UserTable from '@/components/admin/UserTable.vue'
import ConfigPanel from '@/components/admin/ConfigPanel.vue'
import StatsPanel from '@/components/admin/StatsPanel.vue'

const activeTab = ref<'users' | 'stats' | 'config'>('users')

const tabs = [
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'stats', label: 'Stats', icon: '📊' },
  { key: 'config', label: 'Config', icon: '⚙️' },
]
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-slate-800">Admin Panel</h1>
      <p class="text-slate-600">Manage users, view statistics, and configure settings</p>
    </div>

    <!-- Tabs -->
    <div class="border-b border-slate-200 mb-6">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key as any"
          :class="[
            'py-3 px-1 border-b-2 font-medium text-sm transition-colors',
            activeTab === tab.key
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          ]"
        >
          <span class="mr-2">{{ tab.icon }}</span>
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div v-if="activeTab === 'users'">
      <UserTable />
    </div>

    <div v-else-if="activeTab === 'stats'">
      <StatsPanel />
    </div>

    <div v-else-if="activeTab === 'config'">
      <ConfigPanel />
    </div>
  </div>
</template>
