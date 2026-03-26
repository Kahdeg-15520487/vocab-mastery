<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminApi } from '@/lib/api'

interface LLMConfig {
  provider: string
  baseUrl: string
  apiKey: string | null
  model: string
  context: string
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
  baseUrl: '',
  apiKey: null,
  model: '',
  context: '',
  hasApiKey: false,
})
const llmStatus = ref<LLMStatus | null>(null)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const presets = [
  { 
    name: 'OpenAI', 
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    context: 'You are a helpful assistant.'
  },
  { 
    name: 'Anthropic', 
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
    context: 'You are a helpful assistant.'
  },
  { 
    name: 'Groq', 
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    context: 'You are a helpful assistant.'
  },
  { 
    name: 'OpenRouter', 
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku', 'meta-llama/llama-3.1-8b-instruct'],
    context: 'You are a helpful assistant.'
  },
  { 
    name: 'Custom', 
    provider: 'custom',
    baseUrl: '',
    models: [],
    context: 'You are a helpful assistant.'
  },
]

const selectedPreset = ref(0)
const showApiKey = ref(false)
const customModel = ref('')

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
    const data = await response.json()
    llmConfig.value = data
    
    // Find matching preset
    const presetIndex = presets.findIndex(p => 
      p.baseUrl === data.baseUrl || p.provider === data.provider
    )
    selectedPreset.value = presetIndex >= 0 ? presetIndex : presets.length - 1 // Custom
    
    if (data.model && !getCurrentPreset().models.includes(data.model)) {
      customModel.value = data.model
    }
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

function getCurrentPreset() {
  return presets[selectedPreset.value] || presets[presets.length - 1]
}

function onPresetChange() {
  const preset = getCurrentPreset()
  llmConfig.value.provider = preset.provider
  llmConfig.value.baseUrl = preset.baseUrl
  llmConfig.value.context = preset.context
  if (preset.models.length > 0) {
    llmConfig.value.model = preset.models[0]
    customModel.value = ''
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
        baseUrl: llmConfig.value.baseUrl,
        model: customModel.value || llmConfig.value.model,
        apiKey: llmConfig.value.apiKey || undefined,
        context: llmConfig.value.context || undefined,
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
</script>

<template>
  <div class="space-y-6">
    <!-- LLM Configuration -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-800">LLM Provider Configuration</h2>
          <p class="text-sm text-slate-600">Configure any OpenAI-compatible API provider.</p>
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
        <!-- Provider Preset -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Provider Preset</label>
          <select 
            v-model="selectedPreset" 
            @change="onPresetChange"
            class="input"
          >
            <option v-for="(preset, index) in presets" :key="index" :value="index">
              {{ preset.name }}
            </option>
          </select>
        </div>

        <!-- Base URL -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
          <input
            v-model="llmConfig.baseUrl"
            type="url"
            placeholder="https://api.example.com/v1"
            class="input"
          />
          <p class="text-xs text-slate-500 mt-1">
            OpenAI-compatible API endpoint
          </p>
        </div>

        <!-- API Key -->
        <div>
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

        <!-- Model -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Model</label>
          
          <!-- Preset Models -->
          <template v-if="getCurrentPreset().models.length > 0">
            <select v-model="llmConfig.model" class="input mb-2">
              <option v-for="m in getCurrentPreset().models" :key="m" :value="m">
                {{ m }}
              </option>
            </select>
            <p class="text-xs text-slate-500 mb-2">Or enter a custom model:</p>
          </template>
          
          <input
            v-model="customModel"
            type="text"
            :placeholder="getCurrentPreset().models.length > 0 ? 'Custom model name (optional)' : 'model-name'"
            class="input"
          />
        </div>

        <!-- Context / System Prompt -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">System Prompt / Context</label>
          <textarea
            v-model="llmConfig.context"
            rows="3"
            placeholder="You are a helpful assistant."
            class="input resize-none"
          />
          <p class="text-xs text-slate-500 mt-1">
            System prompt sent with each request (optional)
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

    <!-- Provider Examples -->
    <div class="card bg-slate-50 border border-slate-200">
      <h3 class="font-semibold text-slate-700 mb-3">📋 Popular OpenAI-Compatible Providers</h3>
      
      <div class="text-sm text-slate-600 space-y-2">
        <div class="flex justify-between items-center py-1 border-b border-slate-200">
          <span class="font-medium">OpenAI</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">https://api.openai.com/v1</code>
        </div>
        <div class="flex justify-between items-center py-1 border-b border-slate-200">
          <span class="font-medium">Anthropic</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">https://api.anthropic.com/v1</code>
        </div>
        <div class="flex justify-between items-center py-1 border-b border-slate-200">
          <span class="font-medium">Groq</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">https://api.groq.com/openai/v1</code>
        </div>
        <div class="flex justify-between items-center py-1 border-b border-slate-200">
          <span class="font-medium">OpenRouter</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">https://openrouter.ai/api/v1</code>
        </div>
        <div class="flex justify-between items-center py-1 border-b border-slate-200">
          <span class="font-medium">Azure OpenAI</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">https://YOUR_RESOURCE.openai.azure.com</code>
        </div>
        <div class="flex justify-between items-center py-1">
          <span class="font-medium">Local (LM Studio, etc)</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">http://localhost:1234/v1</code>
        </div>
      </div>
    </div>
  </div>
</template>
