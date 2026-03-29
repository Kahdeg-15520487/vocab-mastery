import { ref } from 'vue'

interface ViewedWord {
  id: string
  word: string
  cefrLevel: string
  viewedAt: number // timestamp
}

const STORAGE_KEY = 'vocab-master-recently-viewed'
const MAX_ITEMS = 20

const recentlyViewed = ref<ViewedWord[]>(loadFromStorage())

function loadFromStorage(): ViewedWord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recentlyViewed.value))
}

export function useRecentlyViewed() {
  function addViewedWord(id: string, word: string, cefrLevel: string) {
    // Remove existing entry for this word (avoid duplicates)
    const filtered = recentlyViewed.value.filter(w => w.id !== id)
    
    // Add to front
    filtered.unshift({
      id,
      word,
      cefrLevel,
      viewedAt: Date.now(),
    })

    // Trim to max items
    recentlyViewed.value = filtered.slice(0, MAX_ITEMS)
    saveToStorage()
  }

  function clearRecentlyViewed() {
    recentlyViewed.value = []
    saveToStorage()
  }

  return {
    recentlyViewed,
    addViewedWord,
    clearRecentlyViewed,
  }
}
