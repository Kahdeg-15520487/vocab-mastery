<script setup lang="ts">
import { ref, onMounted } from 'vue'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7101/api'

interface DataStats {
  total: number
  withDefinition: number
  withExamples: number
  byLevel: Record<string, number>
  byList: Record<string, number>
}

const stats = ref<DataStats | null>(null)
const loading = ref(true)
const exporting = ref(false)
const importing = ref(false)
const error = ref<string | null>(null)
const importResult = ref<{
  success: boolean
  totalProcessed: number
  created: number
  updated: number
  failed: number
  errors: string[]
} | null>(null)

const mergeMode = ref(true)
const importFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function fetchStats() {
  loading.value = true
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/data/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to fetch stats')
    stats.value = await response.json()
  } catch (e: unknown) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function handleExport() {
  exporting.value = true
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/data/export`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to export data')

    const data = await response.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `vocab-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: unknown) {
    error.value = (e as Error).message
  } finally {
    exporting.value = false
  }
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    importFile.value = target.files[0]
    importResult.value = null
  }
}

async function handleImport() {
  if (!importFile.value) return

  importing.value = true
  error.value = null
  importResult.value = null

  try {
    const content = await importFile.value.text()
    const data = JSON.parse(content)

    // Add merge option to the data
    const payload = {
      ...data,
      merge: mergeMode.value,
    }

    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/data/import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to import data')
    }

    importResult.value = result

    // Refresh stats
    await fetchStats()

    // Clear file input
    importFile.value = null
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  } catch (e: unknown) {
    error.value = (e as Error).message
  } finally {
    importing.value = false
  }
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

onMounted(fetchStats)
</script>

<template>
  <div class="space-y-6">
    <!-- Stats Section -->
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold text-slate-800 mb-4">Word Database Stats</h2>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-4">
        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
      </div>

      <!-- Error -->
      <div v-else-if="error && !stats" class="text-red-600">
        {{ error }}
      </div>

      <!-- Stats Grid -->
      <div v-else-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-slate-50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-indigo-600">{{ formatNumber(stats.total) }}</div>
          <div class="text-sm text-slate-600">Total Words</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-green-600">{{ formatNumber(stats.withDefinition) }}</div>
          <div class="text-sm text-slate-600">With Definitions</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-blue-600">{{ formatNumber(stats.withExamples) }}</div>
          <div class="text-sm text-slate-600">With Examples</div>
        </div>
        <div class="bg-slate-50 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-purple-600">{{ Object.keys(stats.byLevel).length }}</div>
          <div class="text-sm text-slate-600">CEFR Levels</div>
        </div>
      </div>

      <!-- By Level -->
      <div v-if="stats && Object.keys(stats.byLevel).length > 0" class="mt-4">
        <h3 class="text-sm font-medium text-slate-700 mb-2">By CEFR Level</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(count, level) in stats.byLevel"
            :key="level"
            class="px-3 py-1 bg-slate-100 rounded-full text-sm"
          >
            {{ level }}: {{ formatNumber(count) }}
          </span>
        </div>
      </div>

      <!-- By List -->
      <div v-if="stats && Object.keys(stats.byList).length > 0" class="mt-4">
        <h3 class="text-sm font-medium text-slate-700 mb-2">By Oxford List</h3>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(count, list) in stats.byList"
            :key="list"
            class="px-3 py-1 bg-slate-100 rounded-full text-sm"
          >
            Oxford {{ list }}: {{ formatNumber(count) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Export Section -->
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold text-slate-800 mb-2">Export Words</h2>
      <p class="text-sm text-slate-600 mb-4">
        Download all words as a JSON file. The file includes word data, definitions, examples, and theme associations.
      </p>

      <button
        @click="handleExport"
        :disabled="exporting"
        class="btn btn-primary"
      >
        {{ exporting ? 'Exporting...' : '📥 Export Words' }}
      </button>
    </div>

    <!-- Import Section -->
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-lg font-semibold text-slate-800 mb-2">Import Words</h2>
      <p class="text-sm text-slate-600 mb-4">
        Import words from a JSON file. The file should match the export format with a <code class="bg-slate-100 px-1 rounded">words</code> array.
      </p>

      <!-- File Input -->
      <div class="space-y-4">
        <div class="flex items-center gap-4">
          <label class="flex-1">
            <input
              ref="fileInput"
              type="file"
              accept=".json"
              @change="handleFileSelect"
              class="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-indigo-50 file:text-indigo-700
                hover:file:bg-indigo-100"
            />
          </label>
        </div>

        <!-- Merge Mode Toggle -->
        <div class="flex items-center gap-2">
          <input
            id="mergeMode"
            type="checkbox"
            v-model="mergeMode"
            class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
          />
          <label for="mergeMode" class="text-sm text-slate-700">
            Merge mode (update existing words, keep others)
          </label>
        </div>
        <p v-if="!mergeMode" class="text-sm text-red-600">
          ⚠️ Warning: Without merge mode, all existing words will be deleted before import.
        </p>

        <!-- Import Button -->
        <button
          @click="handleImport"
          :disabled="!importFile || importing"
          class="btn btn-primary"
        >
          {{ importing ? 'Importing...' : '📤 Import Words' }}
        </button>
      </div>

      <!-- Import Result -->
      <div v-if="importResult" class="mt-4 p-4 rounded-lg" :class="importResult.success ? 'bg-green-50' : 'bg-red-50'">
        <h3 class="font-medium mb-2" :class="importResult.success ? 'text-green-800' : 'text-red-800'">
          Import {{ importResult.success ? 'Successful' : 'Failed' }}
        </h3>
        <div class="text-sm space-y-1" :class="importResult.success ? 'text-green-700' : 'text-red-700'">
          <p>Total processed: {{ importResult.totalProcessed }}</p>
          <p>Created: {{ importResult.created }}</p>
          <p>Updated: {{ importResult.updated }}</p>
          <p v-if="importResult.failed > 0">Failed: {{ importResult.failed }}</p>
        </div>
        <div v-if="importResult.errors.length > 0" class="mt-2 text-sm text-red-600">
          <p class="font-medium">Errors:</p>
          <ul class="list-disc list-inside">
            <li v-for="(err, i) in importResult.errors" :key="i">{{ err }}</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="bg-red-50 text-red-600 p-4 rounded-lg">
      {{ error }}
    </div>
  </div>
</template>
