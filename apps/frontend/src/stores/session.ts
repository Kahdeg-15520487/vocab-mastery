import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, SessionWord } from '@/types'
import { sessionsApi, progressApi } from '@/lib/api'

export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(null)
  const currentIndex = ref(0)
  const responses = ref<Map<string, { response: string; responseTime: number }>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionStartTime = ref<number>(0)
  const wordStartTime = ref<number>(0)

  const currentWord = computed<SessionWord | null>(() => {
    if (!session.value || currentIndex.value >= session.value.words.length) {
      return null
    }
    return session.value.words[currentIndex.value]
  })

  const progress = computed(() => {
    if (!session.value) return { current: 0, total: 0, percent: 0 }
    return {
      current: currentIndex.value + 1,
      total: session.value.totalWords,
      percent: Math.round(((currentIndex.value + 1) / session.value.totalWords) * 100),
    }
  })

  const isComplete = computed(() => {
    if (!session.value) return false
    return currentIndex.value >= session.value.totalWords
  })

  // Start a new session
  async function startSession(data: {
    type: 'learn' | 'review' | 'quiz'
    themeId?: string
    levelRange?: [string, string]
    wordCount?: number
  }) {
    try {
      loading.value = true
      error.value = null
      const data_response = await sessionsApi.create(data)
      session.value = data_response
      currentIndex.value = 0
      responses.value = new Map()
      sessionStartTime.value = Date.now()
      wordStartTime.value = Date.now()
      return data_response
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Submit response for current word
  async function submitResponse(response: 'easy' | 'medium' | 'hard' | 'forgot') {
    if (!session.value || !currentWord.value) return

    const responseTime = Date.now() - wordStartTime.value
    const wordId = currentWord.value.id

    // Store response locally
    responses.value.set(wordId, { response, responseTime })

    try {
      // Send to API
      await sessionsApi.respond(session.value.sessionId, wordId, response, responseTime)
      
      // Update progress on backend
      await progressApi.update(wordId, response, responseTime)
    } catch (e: any) {
      error.value = e.message
    }

    // Move to next word
    currentIndex.value++
    wordStartTime.value = Date.now()
  }

  // Complete session
  async function completeSession() {
    if (!session.value) return null

    try {
      loading.value = true
      const result = await sessionsApi.complete(session.value.sessionId)
      return result
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Reset session
  function reset() {
    session.value = null
    currentIndex.value = 0
    responses.value = new Map()
    error.value = null
  }

  // Get session stats
  const stats = computed(() => {
    const total = responses.value.size
    let correct = 0
    responses.value.forEach((r) => {
      if (r.response !== 'forgot') correct++
    })
    return {
      total,
      correct,
      incorrect: total - correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    }
  })

  return {
    session,
    currentIndex,
    currentWord,
    progress,
    isComplete,
    stats,
    loading,
    error,
    startSession,
    submitResponse,
    completeSession,
    reset,
  }
})
