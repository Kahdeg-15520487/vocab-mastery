/**
 * useBrowserAI — global singleton composable for Browser AI Coach.
 *
 * Manages the Web Worker lifecycle, model loading state, and inference.
 * Persists the "enabled" preference in localStorage.
 */
import { ref, computed } from 'vue'

// ── Types ──────────────────────────────────────────────────────────
export type AIStatus = 'disabled' | 'idle' | 'checking' | 'downloading' | 'loading' | 'ready' | 'error'

export interface AIProgress {
  loaded: number
  total: number
  fileCount: number
}

// ── Singleton State ────────────────────────────────────────────────
const STORAGE_KEY = 'browser-ai-enabled'

const enabled = ref(loadEnabled())
const status = ref<AIStatus>(enabled.value ? 'idle' : 'disabled')
const progress = ref<AIProgress>({ loaded: 0, total: 0, fileCount: 0 })
const statusMessage = ref('')
const errorMessage = ref('')

let worker: Worker | null = null

// ── Computed ───────────────────────────────────────────────────────
const isReady = computed(() => status.value === 'ready')
const isLoading = computed(() => ['checking', 'downloading', 'loading'].includes(status.value))
const progressPercent = computed(() => {
  if (progress.value.total <= 0) return 0
  return Math.round((progress.value.loaded / progress.value.total) * 100)
})

// ── Public API ─────────────────────────────────────────────────────
export function useBrowserAI() {
  function setEnabled(value: boolean) {
    enabled.value = value
    saveEnabled(value)

    if (value) {
      startWorker()
    } else {
      stopWorker()
    }
  }

  async function generate(prompt: string | Array<{ role: string; content: string }>): Promise<string> {
    if (!worker || status.value !== 'ready') {
      throw new Error('Browser AI is not ready')
    }

    const promptPayload = typeof prompt === 'string' ? prompt : JSON.stringify(prompt)

    // Use MessageChannel for direct request/response — avoids shared pending map
    // which can be lost during HMR or other re-initialization
    const channel = new MessageChannel()

    return new Promise<string>((resolve) => {
      let settled = false

      channel.port1.onmessage = (e: MessageEvent) => {
        if (settled) return
        settled = true
        channel.port1.close()
        resolve(e.data.text || '')
      }

      // Send the prompt with the transferable port
      worker!.postMessage({ type: 'generate', prompt: promptPayload }, [channel.port2])

      // Timeout after 30s
      setTimeout(() => {
        if (settled) return
        settled = true
        channel.port1.close()
        resolve('')
      }, 30_000)
    })
  }

  return {
    enabled,
    status,
    statusMessage,
    errorMessage,
    progress,
    progressPercent,
    isReady,
    isLoading,
    setEnabled,
    generate,
  }
}

// ── Worker Lifecycle ───────────────────────────────────────────────
function startWorker() {
  if (worker) return

  status.value = 'checking'
  errorMessage.value = ''

  try {
    worker = new Worker(
      new URL('../workers/browser-ai-worker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e: MessageEvent) => {
      const { type } = e.data

      switch (type) {
        case 'status':
          statusMessage.value = e.data.status
          if (e.data.status === 'Loading model…' && status.value === 'checking') {
            status.value = 'loading'
          }
          break

        case 'progress':
          progress.value = {
            loaded: e.data.loaded || 0,
            total: e.data.total || 0,
            fileCount: e.data.fileCount || 0,
          }
          if (status.value !== 'downloading') {
            status.value = 'downloading'
          }
          break

        case 'ready':
          status.value = 'ready'
          statusMessage.value = 'AI Coach ready'
          progress.value = { loaded: 0, total: 0, fileCount: 0 }
          break

        case 'error':
          status.value = 'error'
          errorMessage.value = e.data.message
          statusMessage.value = ''
          break
      }
    }

    worker.onerror = (err) => {
      status.value = 'error'
      errorMessage.value = err.message || 'Worker error'
    }

    // Start loading the model
    worker.postMessage({ type: 'load' })
  } catch (err: any) {
    status.value = 'error'
    errorMessage.value = err.message || 'Failed to start worker'
  }
}

function stopWorker() {
  if (worker) {
    worker.postMessage({ type: 'unload' })
    worker.terminate()
    worker = null
  }
  status.value = 'disabled'
  statusMessage.value = ''
  errorMessage.value = ''
  progress.value = { loaded: 0, total: 0, fileCount: 0 }
}

// ── Persistence ────────────────────────────────────────────────────
function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function saveEnabled(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Ignore storage errors
  }
}

// ── Auto-start if previously enabled ───────────────────────────────
if (enabled.value && typeof window !== 'undefined') {
  // Defer to next tick so the app can mount first
  setTimeout(() => startWorker(), 100)
}
