<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { adminApi } from '@/lib/api'

interface LLMConfig {
  provider: string
  model: string
  apiKey: string | null
  baseUrl: string | null
  hasApiKey: boolean
}

interface LLMStatus {
  available: boolean
  provider: string
  model?: string
  error?: string
}

const llmConfig = ref<LLMConfig>({
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKey: null,
  baseUrl: null,
  hasApiKey: false,
})
const llmStatus = ref<LLMStatus | null>(null)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const providers = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'] },
  { value: 'ollama', label: 'Ollama (Local)', models: ['llama3.2', 'llama3.1', 'mistral', 'codellama'] },
]

const currentProvider = computed(() => 
  providers.find(p => p.value === llmConfig.value.provider) || providers[0]
)

const showApiKey = ref(false)

onMounted(async () => {
  await Promise.all([loadLLMConfig(), checkLLMStatus()])
})

async function loadLLMConfig() {
  loading.value = true
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch('/api/admin/llm/config', {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to fetch LLM config')
    llmConfig.value = await response.json()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function checkLLMStatus() {
  testing.value = true
  
  try {
    llmStatus.value = await adminApi.checkLLMStatus()
  } catch (e: any) {
    llmStatus.value = { available: false, provider: 'unknown', error: e.message }
  } finally {
    testing.value = false
  }
}

async function saveLLMConfig() {
  saving.value = true
  error.value = null
  success.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch('/api/admin/llm/config', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        provider: llmConfig.value.provider,
        model: llmConfig.value.model,
        apiKey: llmConfig.value.apiKey || undefined,
        baseUrl: llmConfig.value.baseUrl || undefined,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to save config')
    }

    llmConfig.value = await response.json()
    success.value = 'LLM configuration saved!'
    
    // Re-check status after saving
    await checkLLMStatus()
  } catch (e: any) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  success.value = null
  await checkLLMStatus()
  
  if (llmStatus.value?.available) {
    success.value = `Connection successful! Using ${llmStatus.value.provider} (${llmStatus.value.model})`
  }
}

function onProviderChange() {
  // Set default model for provider
  llmConfig.value.model = currentProvider.value.models[0]
  
  // Clear API key if switching to Ollama
  if (llmConfig.value.provider === 'ollama') {
    llmConfig.value.baseUrl = llmConfig.value.baseUrl || 'http://localhost:11434'
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- LLM Configuration -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-800">LLM Provider Configuration</h2>
          <p class="text-sm text-slate-600">Configure the AI provider for word categorization.</p>
        </div>
        
        <!-- Status Badge -->
        <div class="flex items-center gap-2">
          <span 
            :class="[
              'w-2.5 h-2.5 rounded-full',
              llmStatus?.available ? 'bg-green-500' : 'bg-red-500'
            ]"
          />
          <span class="text-sm text-slate-600">
            {{ llmStatus?.available ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
        {{ error }}
      </div>

      <!-- Success -->
      <div v-if="success" class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
        {{ success }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        <p class="mt-2 text-slate-600">Loading configuration...</p>
      </div>

      <!-- Config Form -->
      <div v-else class="space-y-4">
        <!-- Provider Selection -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Provider</label>
          <select 
            v-model="llmConfig.provider" 
            @change="onProviderChange"
            class="input"
          >
            <option v-for="p in providers" :key="p.value" :value="p.value">
              {{ p.label }}
            </option>
          </select>
        </div>

        <!-- Model Selection -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Model</label>
          <select v-model="llmConfig.model" class="input">
            <option v-for="m in currentProvider.models" :key="m" :value="m">
              {{ m }}
            </option>
          </select>
        </div>

        <!-- API Key (for OpenAI/Anthropic) -->
        <div v-if="llmConfig.provider !== 'ollama'">
          <label class="block text-sm font-medium text-slate-700 mb-1">API Key</label>
          <div class="relative">
            <input
              v-model="llmConfig.apiKey"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="sk-..."
              class="input pr-20"
            />
            <button
              type="button"
              @click="showApiKey = !showApiKey"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-500 hover:text-slate-700"
            >
              {{ showApiKey ? 'Hide' : 'Show' }}
            </button>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            {{ llmConfig.hasApiKey ? 'API key is set' : 'No API key configured' }}
          </p>
        </div>

        <!-- Base URL (for Ollama) -->
        <div v-if="llmConfig.provider === 'ollama'">
          <label class="block text-sm font-medium text-slate-700 mb-1">Ollama Base URL</label>
          <input
            v-model="llmConfig.baseUrl"
            type="text"
            placeholder="http://localhost:11434"
            class="input"
          />
          <p class="text-xs text-slate-500 mt-1">
            Make sure Ollama is running: <code class="bg-slate-100 px-1 rounded">ollama serve</code>
          </p>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-2">
          <button
            @click="saveLLMConfig"
            :disabled="saving"
            class="btn btn-primary"
          >
            {{ saving ? 'Saving...' : 'Save Configuration' }}
          </button>
          <button
            @click="testConnection"
            :disabled="testing"
            class="btn btn-secondary"
          >
            {{ testing ? 'Testing...' : 'Test Connection' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Connection Details -->
    <div v-if="llmStatus" class="card">
      <h3 class="font-semibold text-slate-700 mb-3">Connection Details</h3>
      
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-slate-500">Provider:</span>
          <span class="ml-2 font-medium text-slate-700">{{ llmStatus.provider }}</span>
        </div>
        <div>
          <span class="text-slate-500">Model:</span>
          <span class="ml-2 font-medium text-slate-700">{{ llmStatus.model || 'Unknown' }}</span>
        </div>
      </div>

      <div v-if="llmStatus.error" class="mt-3 p-3 bg-red-50 rounded-lg">
        <p class="text-sm text-red-700">
          <span class="font-medium">Error:</span> {{ llmStatus.error }}
        </p>
      </div>
    </div>

    <!-- Setup Instructions -->
    <div class="card bg-blue-50 border border-blue-200">
      <h3 class="font-semibold text-blue-800 mb-2">📋 Setup Instructions</h3>
      
      <div class="text-sm text-blue-700 space-y-3">
        <div>
          <p class="font-medium">OpenAI:</p>
          <ol class="list-decimal list-inside ml-2 space-y-1">
            <li>Get an API key from <a href="https://platform.openai.com/api-keys" target="_blank" class="underline">platform.openai.com</a></li>
            <li>Paste the API key above</li>
            <li>Click "Test Connection" to verify</li>
          </ol>
        </div>
        
        <div>
          <p class="font-medium">Ollama (Free, Local):</p>
          <ol class="list-decimal list-inside ml-2 space-y-1">
            <li>Install Ollama from <a href="https://ollama.ai" target="_blank" class="underline">ollama.ai</a></li>
            <li>Run: <code class="bg-blue-100 px-1 rounded">ollama pull llama3.2</code></li>
            <li>Run: <code class="bg-blue-100 px-1 rounded">ollama serve</code></li>
            <li>Select "Ollama (Local)" as provider</li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>
