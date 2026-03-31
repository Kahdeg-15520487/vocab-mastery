import { ref } from 'vue'
import { request } from '@/lib/api'

export interface ActiveSessionData {
  active: boolean
  sessionId?: string
  type?: string
  totalCorrect?: number
  totalIncorrect?: number
  totalWords?: number
  answeredCount?: number
  questions?: any[]   // quiz questions
  words?: any[]       // learn/spelling/fillblank words
}

const showTabWarning = ref(false)
const tabWarningDismissed = ref(false)

export function useActiveSession() {
  const activeSession = ref<ActiveSessionData | null>(null)
  const checking = ref(true)

  async function checkActiveSession(): Promise<ActiveSessionData | null> {
    try {
      const data = await request<ActiveSessionData>('/sessions/active')
      activeSession.value = data
      return data.active ? data : null
    } catch {
      return null
    } finally {
      checking.value = false
    }
  }

  async function abandonActiveSession(): Promise<void> {
    try {
      await request<{ abandoned: boolean }>('/sessions/abandon-active', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      activeSession.value = null
    } catch {
      // Non-critical
    }
  }

  function showSingleTabWarning() {
    if (!tabWarningDismissed.value) {
      showTabWarning.value = true
    }
  }

  function dismissTabWarning() {
    showTabWarning.value = false
    tabWarningDismissed.value = true
  }

  return {
    activeSession,
    checking,
    checkActiveSession,
    abandonActiveSession,
    showSingleTabWarning,
    showTabWarning,
    dismissTabWarning,
  }
}
