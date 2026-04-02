/**
 * Offline-aware learning — provides words from IndexedDB cache
 * when the network is unavailable.
 */

import { ref, computed } from 'vue'
import { useOfflineDB, type CachedWord } from '@/composables/useOfflineDB'
import { useOfflineSync } from '@/composables/useOfflineSync'

export interface OfflineWord {
  id: string
  word: string
  definition: string
  cefrLevel: string
  partOfSpeech: string[]
  phoneticUs: string | null
  phoneticUk: string | null
  examples: string[]
  synonyms: string[]
  audioUs: string | null
  audioUk: string | null
  themes: string[]
}

export function useOfflineLearn() {
  const offlineSync = useOfflineSync()
  const isOnline = computed(() => offlineSync.isOnline.value)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Get words for an offline learning session.
   * Fetches from IndexedDB cache, filtered by level/status.
   */
  async function getOfflineWords(options?: {
    level?: string
    limit?: number
    status?: string
  }): Promise<OfflineWord[]> {
    loading.value = true
    error.value = null

    try {
      if (isOnline.value) {
        error.value = 'Online — use API instead'
        return []
      }

      const db = useOfflineDB()
      let words: CachedWord[]

      if (options?.level) {
        words = await db.getCachedWordsForLevel(options.level, options.limit || 10)
      } else {
        // Get a mix across levels
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
        const perLevel = Math.ceil((options?.limit || 10) / levels.length)
        const batches = await Promise.all(
          levels.map(l => db.getCachedWordsForLevel(l, perLevel))
        )
        words = batches.flat().sort(() => Math.random() - 0.5).slice(0, options?.limit || 10)
      }

      // Filter by progress status if requested
      if (options?.status && options.status !== 'all') {
        const filtered: OfflineWord[] = []
        for (const w of words) {
          const progress = await db.getProgressForWord('current', w.id)
          if (options.status === 'new' && (!progress || progress.status === 'new')) {
            filtered.push({ ...w, themes: [] })
          } else if (options.status === 'learning' && progress?.status === 'learning') {
            filtered.push({ ...w, themes: [] })
          } else if (options.status === 'reviewing' && progress?.status === 'reviewing') {
            filtered.push({ ...w, themes: [] })
          }
        }
        return filtered
      }

      return words.map(w => ({ ...w, themes: [] }))
    } catch (e: any) {
      error.value = e.message || 'Failed to load offline words'
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Get words due for review from the offline cache.
   */
  async function getOfflineDueWords(limit = 10): Promise<OfflineWord[]> {
    loading.value = true
    error.value = null

    try {
      if (isOnline.value) return []

      const db = useOfflineDB()
      const allProgress = await db.getCachedProgress('current')
      const now = new Date()

      // Find words that are due for review
      const dueWordIds = allProgress
        .filter(p => {
          if (p.status === 'new') return false
          const nextReview = new Date(p.nextReview)
          return nextReview <= now
        })
        .map(p => p.wordId)
        .slice(0, limit)

      // Fetch the cached word data
      const words: OfflineWord[] = []
      for (const id of dueWordIds) {
        const w = await db.getCachedWord(id)
        if (w) words.push({ ...w, themes: [] })
      }

      return words
    } catch (e: any) {
      error.value = e.message || 'Failed to load due words'
      return []
    } finally {
      loading.value = false
    }
  }

  /**
   * Queue a progress update for later sync.
   * Stores the update in IndexedDB and applies it locally.
   */
  async function queueProgressUpdate(wordId: string, response: string) {
    const db = useOfflineDB()
    await db.queueAction({
      type: 'progress_update',
      payload: { wordId, response, timestamp: Date.now() },
      timestamp: Date.now(),
    })
  }

  /**
   * Queue a session completion for later sync.
   */
  async function queueSessionComplete(sessionId: string, results: any) {
    const db = useOfflineDB()
    await db.queueAction({
      type: 'session_complete',
      payload: { sessionId, ...results, timestamp: Date.now() },
      timestamp: Date.now(),
    })
  }

  /**
   * Get the count of cached words.
   */
  async function getCachedWordCount(): Promise<number> {
    try {
      const db = useOfflineDB()
      return db.getWordsCount()
    } catch {
      return 0
    }
  }

  return {
    isOnline,
    loading,
    error,
    getOfflineWords,
    getOfflineDueWords,
    queueProgressUpdate,
    queueSessionComplete,
    getCachedWordCount,
  }
}
