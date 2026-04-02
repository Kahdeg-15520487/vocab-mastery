/**
 * Offline sync service — downloads word data and progress to IndexedDB
 * for offline study sessions. Syncs pending actions back when online.
 */

import { request } from '@/lib/api'
import { useOfflineDB, type CachedWord, type CachedProgress } from '@/composables/useOfflineDB'

const SYNC_BATCH_SIZE = 500

export function useOfflineSync() {
  const db = useOfflineDB()
  let syncing = false

  async function syncWords(): Promise<{ synced: number; total: number }> {
    // Fetch all words in batches
    let totalSynced = 0
    let totalAvailable = 0

    // First get the count
    const counts = await request<{ total: number; levels: Record<string, number> }>('/words/counts')
    totalAvailable = counts.total

    // Sync words in batches by CEFR level for efficiency
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

    for (const level of levels) {
      let page = 0
      let hasMore = true

      while (hasMore) {
        try {
          const data = await request<{
            words: any[]
            total: number
            page: number
            totalPages: number
          }>(`/words?level=${level}&page=${page}&limit=${SYNC_BATCH_SIZE}`)

          if (!data.words?.length) {
            hasMore = false
            continue
          }

          const cached: CachedWord[] = data.words.map((w: any) => ({
            id: w.id,
            word: w.word,
            definition: w.definition || '',
            cefrLevel: w.cefrLevel || level,
            partOfSpeech: w.partOfSpeech || [],
            phoneticUs: w.phoneticUs || null,
            phoneticUk: w.phoneticUk || null,
            examples: w.examples || [],
            synonyms: w.synonyms || [],
            audioUs: w.audioUs || null,
            audioUk: w.audioUk || null,
          }))

          await db.cacheWords(cached)
          totalSynced += cached.length
          page++

          if (page >= data.totalPages) {
            hasMore = false
          }
        } catch {
          hasMore = false
        }
      }
    }

    return { synced: totalSynced, total: totalAvailable }
  }

  async function syncProgress(): Promise<{ synced: number }> {
    try {
      const data = await request<{
        words: Array<{
          wordId: string
          status: string
          repetitions: number
          easeFactor: number
          interval: number
          nextReview: string
          totalReviews: number
          correctReviews: number
        }>
        userId: string
      }>('/progress/batch?limit=10000')

      if (!data.words?.length) return { synced: 0 }

      const cached: CachedProgress[] = data.words.map(w => ({
        key: `${data.userId}_${w.wordId}`,
        userId: data.userId,
        wordId: w.wordId,
        status: w.status,
        repetitions: w.repetitions,
        easeFactor: w.easeFactor,
        interval: w.interval,
        nextReview: w.nextReview,
        totalReviews: w.totalReviews,
        correctReviews: w.correctReviews,
      }))

      await db.cacheProgress(cached)
      return { synced: cached.length }
    } catch {
      return { synced: 0 }
    }
  }

  async function syncPendingActions(): Promise<{ synced: number; failed: number }> {
    const actions = await db.getPendingActions()
    let synced = 0
    let failed = 0

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'progress_update':
            await request('/progress/batch', {
              method: 'POST',
              body: JSON.stringify(action.payload),
            })
            break
          case 'session_complete':
            await request(`/sessions/${action.payload.sessionId}/complete`, {
              method: 'POST',
              body: JSON.stringify(action.payload),
            })
            break
          case 'favorite':
            await request(`/words/${action.payload.wordId}/favorite`, {
              method: 'POST',
              body: JSON.stringify({}),
            })
            break
          case 'list_add':
            await request(`/lists/${action.payload.listId}/words`, {
              method: 'POST',
              body: JSON.stringify({ wordId: action.payload.wordId }),
            })
            break
          case 'list_remove':
            await request(`/lists/${action.payload.listId}/words/${action.payload.wordId}`, {
              method: 'DELETE',
            })
            break
        }

        if (action.id) await db.markActionSynced(action.id)
        synced++
      } catch {
        failed++
      }
    }

    await db.clearSyncedActions()
    return { synced, failed }
  }

  async function fullSync(): Promise<{
    words: { synced: number; total: number }
    progress: { synced: number }
    pending: { synced: number; failed: number }
  }> {
    if (syncing) throw new Error('Sync already in progress')
    syncing = true

    try {
      // 1. Push pending actions first
      const pending = await syncPendingActions()

      // 2. Pull words
      const words = await syncWords()

      // 3. Pull progress
      const progress = await syncProgress()

      // 4. Update last sync timestamp
      await db.setLastSync()

      return { words, progress, pending }
    } finally {
      syncing = false
    }
  }

  return {
    isOnline: db.isOnline,
    fullSync,
    syncWords,
    syncProgress,
    syncPendingActions,
    getSyncStatus: db.getSyncStatus,
    clearAll: db.clearAll,
    getWordsCount: db.getWordsCount,
    // Expose word/progress access for offline mode
    getCachedWord: db.getCachedWord,
    searchCachedWords: db.searchCachedWords,
    getCachedWordsForLevel: db.getCachedWordsForLevel,
    getCachedProgress: db.getCachedProgress,
    queueAction: db.queueAction,
  }
}
