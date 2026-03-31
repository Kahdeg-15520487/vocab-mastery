import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, SessionWord } from '@/types'
import { sessionsApi, request } from '@/lib/api'

export const useSessionStore = defineStore('session', () => {
  const session = ref<Session | null>(null)
  const currentIndex = ref(0)
  const responses = ref<Map<string, { response: string; responseTime: number }>>(new Map())
  const loading = ref(false)
  const error = ref<string | null>(null)
  const sessionStartTime = ref<number>(0)
  const wordStartTime = ref<number>(0)
  const resumedFromServer = ref(false) // flag: did we resume an existing session?

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
    listId?: string
    levelRange?: [string, string]
    wordCount?: number
  }) {
    try {
      loading.value = true
      error.value = null
      resumedFromServer.value = false
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

  // Resume an existing active session from server
  async function resumeSession(): Promise<boolean> {
    try {
      loading.value = true
      const data = await request<any>('/sessions/active')

      if (!data.active || !data.words || data.type !== 'learn') {
        return false
      }

      // Rebuild Session format from active session data
      session.value = {
        sessionId: data.sessionId,
        type: data.type,
        totalWords: data.totalWords,
        words: data.words.map((w: any, index: number) => ({
          index,
          sessionWordId: `${data.sessionId}-${w.id}`,
          id: w.id,
          word: w.word,
          phoneticUs: w.phoneticUs,
          phoneticUk: w.phoneticUk,
          partOfSpeech: w.partOfSpeech,
          definition: w.definition,
          examples: w.examples,
          synonyms: w.synonyms,
          antonyms: w.antonyms,
          oxfordList: w.oxfordList,
          cefrLevel: w.cefrLevel,
          themes: w.themes,
        })),
      }

      // Restore responses from answered words
      responses.value = new Map()
      const answeredWords = data.words.filter((w: any) => w.answered && w.response)
      for (const w of answeredWords) {
        responses.value.set(w.id, { response: w.response, responseTime: 0 })
      }

      // Skip to first unanswered
      const firstUnanswered = data.words.findIndex((w: any) => !w.answered)
      currentIndex.value = firstUnanswered >= 0 ? firstUnanswered : data.totalWords

      resumedFromServer.value = true
      sessionStartTime.value = Date.now()
      wordStartTime.value = Date.now()
      return true
    } catch {
      return false
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

    // Move to next word immediately — don't block on API
    currentIndex.value++
    wordStartTime.value = Date.now()

    // Fire-and-forget: record session answer (backend handles SRS + XP + achievements)
    sessionsApi.respond(session.value!.sessionId, wordId, response, responseTime)
      .catch((e: any) => { error.value = e.message })
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

  // Response breakdown by type
  const responseBreakdown = computed(() => {
    let forgot = 0, hard = 0, medium = 0, easy = 0
    responses.value.forEach((r) => {
      switch (r.response) {
        case 'forgot': forgot++; break
        case 'hard': hard++; break
        case 'medium': medium++; break
        case 'easy': easy++; break
      }
    })
    return { forgot, hard, medium, easy }
  })

  return {
    session,
    currentIndex,
    currentWord,
    progress,
    isComplete,
    stats,
    responseBreakdown,
    loading,
    error,
    resumedFromServer,
    startSession,
    resumeSession,
    submitResponse,
    completeSession,
    reset,
  }
})
