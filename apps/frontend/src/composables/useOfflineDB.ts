/**
 * IndexedDB-based offline data cache for PWA mode.
 * Stores word data, progress, and study lists for offline access.
 */

const DB_NAME = 'vocab-master-offline'
const DB_VERSION = 1

const STORES = {
  words: 'words',
  progress: 'progress',
  lists: 'lists',
  sessions: 'sessions',
  meta: 'meta',
} as const

type StoreName = typeof STORES[keyof typeof STORES]

let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Words store - key is word ID
      if (!db.objectStoreNames.contains(STORES.words)) {
        const wordStore = db.createObjectStore(STORES.words, { keyPath: 'id' })
        wordStore.createIndex('word', 'word', { unique: false })
        wordStore.createIndex('cefrLevel', 'cefrLevel', { unique: false })
      }

      // Progress store - key is "userId_wordId"
      if (!db.objectStoreNames.contains(STORES.progress)) {
        const progressStore = db.createObjectStore(STORES.progress, { keyPath: 'key' })
        progressStore.createIndex('userId', 'userId', { unique: false })
        progressStore.createIndex('status', 'status', { unique: false })
      }

      // Lists store
      if (!db.objectStoreNames.contains(STORES.lists)) {
        db.createObjectStore(STORES.lists, { keyPath: 'id' })
      }

      // Sessions store - for queuing offline mutations
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const sessionStore = db.createObjectStore(STORES.sessions, { keyPath: 'id', autoIncrement: true })
        sessionStore.createIndex('type', 'type', { unique: false })
        sessionStore.createIndex('timestamp', 'timestamp', { unique: false })
      }

      // Meta store - general key-value
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' })
      }
    }
  })
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function put(storeName: StoreName, value: any): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function putMany(storeName: StoreName, values: any[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    for (const value of values) {
      store.put(value)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function remove(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function count(storeName: StoreName): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.count()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getByIndex<T>(storeName: StoreName, indexName: string, value: IDBValidKey): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function clear(storeName: StoreName): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export interface CachedWord {
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
}

export interface CachedProgress {
  key: string // userId_wordId
  userId: string
  wordId: string
  status: string
  repetitions: number
  easeFactor: number
  interval: number
  nextReview: string
  totalReviews: number
  correctReviews: number
}

export interface OfflineAction {
  id?: number
  type: 'session_complete' | 'progress_update' | 'favorite' | 'list_add' | 'list_remove'
  payload: any
  timestamp: number
  synced: boolean
}

// Meta keys
const META_KEYS = {
  lastSync: 'lastSync',
  wordsSynced: 'wordsSynced',
  progressSynced: 'progressSynced',
} as const

export function useOfflineDB() {
  const isOnline = ref(navigator.onLine)

  function updateOnlineStatus() {
    isOnline.value = navigator.onLine
  }

  onMounted(() => {
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
  })

  onUnmounted(() => {
    window.removeEventListener('online', updateOnlineStatus)
    window.removeEventListener('offline', updateOnlineStatus)
  })

  // --- Words ---

  async function cacheWords(words: CachedWord[]): Promise<void> {
    await putMany(STORES.words, words)
    await put(STORES.meta, { key: META_KEYS.wordsSynced, value: Date.now() })
  }

  async function getCachedWord(id: string): Promise<CachedWord | undefined> {
    return get<CachedWord>(STORES.words, id)
  }

  async function searchCachedWords(query: string, limit = 20): Promise<CachedWord[]> {
    const all = await getAll<CachedWord>(STORES.words)
    const q = query.toLowerCase()
    return all
      .filter(w => w.word.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q))
      .slice(0, limit)
  }

  async function getCachedWordsForLevel(level: string, limit = 20): Promise<CachedWord[]> {
    return getByIndex<CachedWord>(STORES.words, 'cefrLevel', level)
      .then(words => words.sort(() => Math.random() - 0.5).slice(0, limit))
  }

  async function getWordsCount(): Promise<number> {
    return count(STORES.words)
  }

  // --- Progress ---

  async function cacheProgress(items: CachedProgress[]): Promise<void> {
    await putMany(STORES.progress, items)
    await put(STORES.meta, { key: META_KEYS.progressSynced, value: Date.now() })
  }

  async function getCachedProgress(userId: string): Promise<CachedProgress[]> {
    return getByIndex<CachedProgress>(STORES.progress, 'userId', userId)
  }

  async function getProgressForWord(userId: string, wordId: string): Promise<CachedProgress | undefined> {
    return get<CachedProgress>(STORES.progress, `${userId}_${wordId}`)
  }

  // --- Offline Action Queue ---

  async function queueAction(action: Omit<OfflineAction, 'id' | 'synced'>): Promise<void> {
    await put(STORES.sessions, { ...action, synced: false })
  }

  async function getPendingActions(): Promise<OfflineAction[]> {
    const all = await getAll<OfflineAction>(STORES.sessions)
    return all.filter(a => !a.synced)
  }

  async function markActionSynced(id: number): Promise<void> {
    const action = await get<OfflineAction>(STORES.sessions, id)
    if (action) {
      action.synced = true
      await put(STORES.sessions, action)
    }
  }

  async function clearSyncedActions(): Promise<void> {
    const all = await getAll<OfflineAction>(STORES.sessions)
    for (const action of all) {
      if (action.synced && action.id) {
        await remove(STORES.sessions, action.id)
      }
    }
  }

  // --- Full Sync ---

  async function getSyncStatus(): Promise<{ wordsCount: number; progressCount: number; pendingActions: number; lastSync: number | null }> {
    const [wordsCount, progressCount, pending] = await Promise.all([
      count(STORES.words),
      count(STORES.progress),
      getPendingActions().then(a => a.length),
    ])
    const meta = await get<{ key: string; value: number }>(STORES.meta, META_KEYS.lastSync)
    return {
      wordsCount,
      progressCount,
      pendingActions: pending,
      lastSync: meta?.value ?? null,
    }
  }

  async function setLastSync(): Promise<void> {
    await put(STORES.meta, { key: META_KEYS.lastSync, value: Date.now() })
  }

  // --- Clear all ---

  async function clearAll(): Promise<void> {
    await Promise.all([
      clear(STORES.words),
      clear(STORES.progress),
      clear(STORES.lists),
      clear(STORES.sessions),
      clear(STORES.meta),
    ])
  }

  return {
    isOnline,
    // Words
    cacheWords,
    getCachedWord,
    searchCachedWords,
    getCachedWordsForLevel,
    getWordsCount,
    // Progress
    cacheProgress,
    getCachedProgress,
    getProgressForWord,
    // Action queue
    queueAction,
    getPendingActions,
    markActionSynced,
    clearSyncedActions,
    // Sync
    getSyncStatus,
    setLastSync,
    clearAll,
  }
}

// Need to import ref/onMounted/onUnmounted
import { ref, onMounted, onUnmounted } from 'vue'
