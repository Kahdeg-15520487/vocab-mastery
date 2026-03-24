import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Word, Theme } from '@/types'
import { wordsApi, themesApi } from '@/lib/api'

export const useWordsStore = defineStore('words', () => {
  const words = ref<Word[]>([])
  const themes = ref<Theme[]>([])
  const currentWord = ref<Word | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all themes
  async function fetchThemes() {
    try {
      loading.value = true
      const data = await themesApi.getAll()
      themes.value = data
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Fetch words with filters
  async function fetchWords(params?: {
    theme?: string
    level?: string
    list?: string
    search?: string
    page?: number
    limit?: number
  }) {
    try {
      loading.value = true
      const data = await wordsApi.getAll(params)
      words.value = data.words
      return data
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      loading.value = false
    }
  }

  // Fetch single word
  async function fetchWord(id: string) {
    try {
      loading.value = true
      currentWord.value = await wordsApi.getById(id)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Fetch due words
  async function fetchDueWords(limit?: number) {
    try {
      loading.value = true
      return await wordsApi.getDue(limit)
    } catch (e: any) {
      error.value = e.message
      return []
    } finally {
      loading.value = false
    }
  }

  return {
    words,
    themes,
    currentWord,
    loading,
    error,
    fetchThemes,
    fetchWords,
    fetchWord,
    fetchDueWords,
  }
})
