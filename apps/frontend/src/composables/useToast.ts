import { ref } from 'vue'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info' | 'warning'
  title?: string
  message: string
}

const toasts = ref<Toast[]>([])
let nextId = 0

function remove(id: number) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx !== -1) toasts.value.splice(idx, 1)
}

function addToast(type: Toast['type'], message: string, title?: string, duration = 4000) {
  const id = nextId++
  toasts.value.push({ id, type, message, title })

  if (duration > 0) {
    setTimeout(() => remove(id), duration)
  }

  return id
}

function success(message: string, title?: string) { return addToast('success', message, title) }
function error(message: string, title?: string) { return addToast('error', message, title, 6000) }
function info(message: string, title?: string) { return addToast('info', message, title) }
function warning(message: string, title?: string) { return addToast('warning', message, title, 5000) }

export function useToast() {
  return {
    toasts,
    success,
    error,
    info,
    warning,
    remove,
  }
}
