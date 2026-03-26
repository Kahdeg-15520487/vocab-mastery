<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

interface LLMProvider {
  id: string
  name: string
  provider: string
  model: string
  baseUrl: string | null
  apiKey: string | null
  context: string | null
  isActive: boolean
  hasApiKey: boolean
  createdAt: string
  updatedAt: string
}

interface LLMStatus {
  available: boolean
  provider?: string
  model?: string
  error?: string
}

const providers = ref<LLMProvider[]>([])
const llmStatus = ref<LLMStatus | null>(null)
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

// Form state
const showForm = ref(false)
const editingProvider = ref<LLMProvider | null>(null)
const formData = ref({
  name: '',
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
  context: '',
})
const showApiKey = ref(false)
const customModel = ref('')

const presets = [
  { 
    name: 'OpenAI', 
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  { 
    name: 'Anthropic', 
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
  },
  { 
    name: 'Groq', 
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
  },
  { 
    name: 'OpenRouter', 
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku', 'meta-llama/llama-3.1-8b-instruct'],
  },
  { 
    name: 'Custom', 
    provider: 'custom',
    baseUrl: '',
    models: [],
  },
]

const selectedPreset = computed(() => {
  return presets.find(p => p.provider === formData.value.provider) || presets[presets.length - 1]
})

onMounted(async () => {
  await Promise.all([loadProviders(), checkLLMStatus()])
})

async function loadProviders() {
  loading.value = true
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch('/api/admin/llm/providers', {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to fetch providers')
    providers.value = await response.json()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function checkLLMStatus() {
  testing.value = true
  
  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch('/api/admin/llm/status', {
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    })
    llmStatus.value = await response.json()
  } catch (e: any) {
    llmStatus.value = { available: false, error: e.message }
  } finally {
    testing.value = false
  }
}

function openAddForm() {
  editingProvider.value = null
  formData.value = {
    name: '',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    context: '',
  }
  customModel.value = ''
  showApiKey.value = false
  showForm.value = true
}

function openEditForm(provider: LLMProvider) {
  editingProvider.value = provider
  formData.value = {
    name: provider.name,
    provider: provider.provider,
    baseUrl: provider.baseUrl || '',
    apiKey: '', // Don't prefill masked key
    model: provider.model,
    context: provider.context || '',
  }
  
  // Check if model is in preset list
  const preset = presets.find(p => p.provider === provider.provider)
  if (preset && !preset.models.includes(provider.model)) {
    customModel.value = provider.model
    formData.value.model = preset.models[0]
  } else {
    customModel.value = ''
  }
  
  showApiKey.value = false
  showForm.value = true
}

function onPresetChange() {
  const preset = selectedPreset.value
  formData.value.baseUrl = preset.baseUrl
  if (preset.models.length > 0) {
    formData.value.model = preset.models[0]
    customModel.value = ''
  }
}

function closeForm() {
  showForm.value = false
  editingProvider.value = null
}

async function saveProvider() {
  saving.value = true
  error.value = null
  success.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const url = editingProvider.value 
      ? `/api/admin/llm/providers/${editingProvider.value.id}`
      : '/api/admin/llm/providers'
    const method = editingProvider.value ? 'PUT' : 'POST'

    const body: any = {
      name: formData.value.name,
      provider: formData.value.provider,
      baseUrl: formData.value.baseUrl || null,
      model: customModel.value || formData.value.model,
      context: formData.value.context || null,
    }

    // Only include API key if it's a new value
    if (formData.value.apiKey && !formData.value.apiKey.startsWith('••••')) {
      body.apiKey = formData.value.apiKey
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to save provider')
    }

    success.value = editingProvider.value 
      ? 'Provider updated successfully!' 
      : 'Provider created successfully!'
    
    closeForm()
    await loadProviders()
  } catch (e: any) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function deleteProvider(provider: LLMProvider) {
  if (!confirm(`Delete provider "${provider.name}"?`)) return

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`/api/admin/llm/providers/${provider.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to delete provider')
    }

    success.value = 'Provider deleted!'
    await loadProviders()
  } catch (e: any) {
    error.value = e.message
  }
}

async function activateProvider(provider: LLMProvider) {
  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`/api/admin/llm/providers/${provider.id}/activate`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to activate provider')

    success.value = `${provider.name} is now active!`
    await Promise.all([loadProviders(), checkLLMStatus()])
  } catch (e: any) {
    error.value = e.message
  }
}

async function testProvider(provider: LLMProvider) {
  testing.value = true
  error.value = null
  success.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`/api/admin/llm/providers/${provider.id}/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    })

    const result = await response.json()
    
    if (result.success) {
      success.value = `Connection to ${provider.name} successful!`
    } else {
      error.value = `Connection failed: ${result.error}`
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    testing.value = false
  }
}

async function testNewProvider() {
  if (!formData.value.provider || !formData.value.model) {
    error.value = 'Provider and model are required to test'
    return
  }

  testing.value = true
  error.value = null
  success.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch('/api/admin/llm/test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        provider: formData.value.provider,
        model: customModel.value || formData.value.model,
        apiKey: formData.value.apiKey || undefined,
        baseUrl: formData.value.baseUrl || undefined,
      }),
    })

    const result = await response.json()
    
    if (result.success) {
      success.value = 'Connection successful!'
    } else {
      error.value = `Connection failed: ${result.error}`
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-slate-800">LLM Providers</h2>
        <p class="text-sm text-slate-600">Configure multiple OpenAI-compatible API providers.</p>
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
    <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
      {{ error }}
    </div>

    <!-- Success -->
    <div v-if="success" class="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
      {{ success }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-2 text-slate-600">Loading providers...</p>
    </div>

    <!-- Provider List -->
    <div v-else class="space-y-4">
      <!-- Providers -->
      <div v-if="providers.length > 0" class="space-y-3">
        <div 
          v-for="provider in providers" 
          :key="provider.id"
          :class="[
            'card transition-all',
            provider.isActive ? 'ring-2 ring-primary-500 bg-primary-50/50' : ''
          ]"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-slate-800">{{ provider.name }}</h3>
                <span v-if="provider.isActive" class="badge badge-primary">Active</span>
              </div>
              <div class="mt-1 text-sm text-slate-600 space-y-1">
                <div>
                  <span class="text-slate-500">Provider:</span> 
                  <span class="font-medium">{{ provider.provider }}</span>
                </div>
                <div>
                  <span class="text-slate-500">Model:</span> 
                  <span class="font-mono text-xs bg-slate-100 px-1 rounded">{{ provider.model }}</span>
                </div>
                <div v-if="provider.baseUrl">
                  <span class="text-slate-500">Base URL:</span> 
                  <span class="font-mono text-xs">{{ provider.baseUrl }}</span>
                </div>
                <div>
                  <span class="text-slate-500">API Key:</span> 
                  <span :class="provider.hasApiKey ? 'text-green-600' : 'text-red-600'">
                    {{ provider.hasApiKey ? '✓ Configured' : '✗ Not set' }}
                  </span>
                </div>
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              <button
                v-if="!provider.isActive"
                @click="activateProvider(provider)"
                class="btn btn-primary text-sm"
              >
                Activate
              </button>
              <button
                @click="testProvider(provider)"
                :disabled="testing"
                class="btn btn-secondary text-sm"
              >
                Test
              </button>
              <button
                @click="openEditForm(provider)"
                class="btn btn-secondary text-sm"
              >
                Edit
              </button>
              <button
                @click="deleteProvider(provider)"
                class="btn bg-red-100 hover:bg-red-200 text-red-700 text-sm"
                :disabled="provider.isActive"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-8 text-slate-500">
        <p>No providers configured yet.</p>
        <p class="text-sm mt-1">Add a provider to get started.</p>
      </div>

      <!-- Add Provider Button -->
      <button
        @click="openAddForm"
        class="btn btn-primary w-full"
      >
        + Add Provider
      </button>
    </div>

    <!-- Provider Form Modal -->
    <div v-if="showForm" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-slate-800">
              {{ editingProvider ? 'Edit Provider' : 'Add Provider' }}
            </h3>
            <button @click="closeForm" class="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>

          <div class="space-y-4">
            <!-- Name -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input
                v-model="formData.name"
                type="text"
                placeholder="My OpenAI Provider"
                class="input"
              />
            </div>

            <!-- Provider Preset -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Provider Type</label>
              <select 
                v-model="formData.provider" 
                @change="onPresetChange"
                class="input"
              >
                <option v-for="preset in presets" :key="preset.provider" :value="preset.provider">
                  {{ preset.name }}
                </option>
              </select>
            </div>

            <!-- Base URL -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Base URL</label>
              <input
                v-model="formData.baseUrl"
                type="url"
                placeholder="https://api.example.com/v1"
                class="input"
              />
            </div>

            <!-- API Key -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">API Key</label>
              <div class="relative">
                <input
                  v-model="formData.apiKey"
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
              <p v-if="editingProvider?.hasApiKey" class="text-xs text-slate-500 mt-1">
                Leave empty to keep existing key
              </p>
            </div>

            <!-- Model -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Model *</label>
              
              <!-- Preset Models -->
              <template v-if="selectedPreset.models.length > 0">
                <select v-model="formData.model" class="input mb-2">
                  <option v-for="m in selectedPreset.models" :key="m" :value="m">
                    {{ m }}
                  </option>
                </select>
                <p class="text-xs text-slate-500 mb-2">Or enter a custom model:</p>
              </template>
              
              <input
                v-model="customModel"
                type="text"
                :placeholder="selectedPreset.models.length > 0 ? 'Custom model (optional)' : 'model-name'"
                class="input"
              />
            </div>

            <!-- Context -->
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">System Prompt</label>
              <textarea
                v-model="formData.context"
                rows="2"
                placeholder="You are a helpful assistant."
                class="input resize-none"
              />
            </div>

            <!-- Actions -->
            <div class="flex gap-3 pt-2">
              <button
                @click="saveProvider"
                :disabled="saving || !formData.name || (!customModel && !formData.model)"
                class="btn btn-primary flex-1"
              >
                {{ saving ? 'Saving...' : (editingProvider ? 'Update' : 'Create') }}
              </button>
              <button
                @click="testNewProvider"
                :disabled="testing"
                class="btn btn-secondary"
              >
                {{ testing ? 'Testing...' : 'Test' }}
              </button>
              <button
                @click="closeForm"
                class="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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
        <div class="flex justify-between items-center py-1">
          <span class="font-medium">Local (LM Studio)</span>
          <code class="text-xs bg-slate-200 px-2 py-0.5 rounded">http://localhost:1234/v1</code>
        </div>
      </div>
    </div>
  </div>
</template>
