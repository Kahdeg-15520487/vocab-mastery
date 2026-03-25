<script setup lang="ts">
import { ref, onMounted } from 'vue'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface ConfigItem {
  key: string
  value: string
  editing: boolean
  newValue: string
}

const configs = ref<ConfigItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const savingKey = ref<string | null>(null)

// Default config keys with descriptions
const configDescriptions: Record<string, string> = {
  'llm.api_key': 'API key for LLM service',
  'llm.base_url': 'Base URL for LLM API',
  'llm.model': 'Model name for LLM',
  'llm.max_tokens': 'Maximum tokens for LLM responses',
  'features.word_generation': 'Enable AI word generation feature',
}

async function fetchConfig() {
  loading.value = true
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/admin/config`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to fetch config')
    const data = await response.json()

    // Convert to array format
    configs.value = Object.entries(data).map(([key, value]) => ({
      key,
      value: value as string,
      editing: false,
      newValue: value as string,
    }))
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function startEdit(config: ConfigItem) {
  config.editing = true
  config.newValue = config.value
}

function cancelEdit(config: ConfigItem) {
  config.editing = false
  config.newValue = config.value
}

async function saveConfig(config: ConfigItem) {
  savingKey.value = config.key
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/admin/config/${config.key}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ value: config.newValue }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to save config')
    }

    config.value = config.newValue
    config.editing = false
  } catch (e: any) {
    error.value = e.message
  } finally {
    savingKey.value = null
  }
}

function maskValue(value: string): string {
  if (value.length <= 8) return '••••••••'
  return value.slice(0, 4) + '••••••••' + value.slice(-4)
}

function getDescription(key: string): string {
  return configDescriptions[key] || ''
}

onMounted(fetchConfig)
</script>

<template>
  <div>
    <!-- Header -->
    <div class="bg-white rounded-lg shadow p-6 mb-4">
      <h2 class="text-lg font-semibold text-slate-800">System Configuration</h2>
      <p class="text-sm text-slate-600 mt-1">
        Manage system-wide settings like LLM API keys and feature flags.
      </p>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-2 text-slate-600">Loading configuration...</p>
    </div>

    <!-- Config List -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div v-if="configs.length === 0" class="p-6 text-center text-slate-500">
        No configuration items found. Add items directly via API or database.
      </div>

      <div v-else class="divide-y divide-slate-200">
        <div
          v-for="config in configs"
          :key="config.key"
          class="p-4 hover:bg-slate-50"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="font-medium text-slate-900">{{ config.key }}</h3>
              <p v-if="getDescription(config.key)" class="text-sm text-slate-500">
                {{ getDescription(config.key) }}
              </p>

              <!-- View Mode -->
              <div v-if="!config.editing" class="mt-2">
                <code class="text-sm bg-slate-100 px-2 py-1 rounded">
                  {{ config.key.includes('key') || config.key.includes('secret') ? maskValue(config.value) : config.value }}
                </code>
              </div>

              <!-- Edit Mode -->
              <div v-else class="mt-2">
                <input
                  v-model="config.newValue"
                  type="text"
                  class="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  :placeholder="'Enter value for ' + config.key"
                />
              </div>
            </div>

            <!-- Actions -->
            <div class="ml-4 flex items-center gap-2">
              <template v-if="!config.editing">
                <button
                  @click="startEdit(config)"
                  class="text-indigo-600 hover:text-indigo-900 text-sm"
                >
                  Edit
                </button>
              </template>
              <template v-else>
                <button
                  @click="cancelEdit(config)"
                  class="text-slate-600 hover:text-slate-900 text-sm"
                  :disabled="savingKey === config.key"
                >
                  Cancel
                </button>
                <button
                  @click="saveConfig(config)"
                  class="text-green-600 hover:text-green-900 text-sm"
                  :disabled="savingKey === config.key"
                >
                  {{ savingKey === config.key ? 'Saving...' : 'Save' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add New Config (Future) -->
    <div class="mt-4 text-center text-sm text-slate-500">
      <p>To add new configuration items, use the API directly:</p>
      <code class="text-xs bg-slate-100 px-2 py-1 rounded">
        PUT /api/admin/config/:key {"value": "..."}
      </code>
    </div>
  </div>
</template>
