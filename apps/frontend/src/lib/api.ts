import { authService } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

// Track if auth has expired (to prevent multiple redirects)
let authExpired = false

export function resetAuthExpired() {
  authExpired = false
}

function handleAuthExpired() {
  if (authExpired) return
  authExpired = true
  
  // Clear tokens immediately
  authService.clearTokens()
  sessionStorage.removeItem('accessToken')
  
  // Redirect to login - use replace to not add to history
  window.location.replace('/login')
}

// Track if we're currently refreshing to prevent multiple refresh calls
let isRefreshing = false
let refreshPromise: Promise<string> | null = null

// Queue of failed requests waiting for token refresh
type FailedRequest = {
  resolve: (token: string) => void
  reject: (error: Error) => void
}

let failedQueue: FailedRequest[] = []

function processQueue(error: Error | null, token: string | null) {
  failedQueue.forEach((request) => {
    if (error) {
      request.reject(error)
    } else {
      request.resolve(token!)
    }
  })
  failedQueue = []
}

async function refreshToken(): Promise<string> {
  // If already refreshing, return the existing promise
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  
  refreshPromise = (async () => {
    try {
      const newToken = await authService.refresh()
      processQueue(null, newToken)
      return newToken
    } catch (error) {
      processQueue(error as Error, null)
      // Handle auth expiration - clears tokens and redirects
      handleAuthExpired()
      throw error
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function request<T>(
  endpoint: string,
  options?: RequestInit,
  isRetry = false
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers as Record<string, string>,
  }

  // Add auth header if we have a token
  const token = authService.getAccessToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for refresh token
    })
  } catch (err) {
    throw new Error('Unable to connect to server. Please check your connection.')
  }

  // Handle 401 - try to refresh token and retry
  if (response.status === 401 && !isRetry) {
    // If this is an auth endpoint, don't retry (login, register, etc.)
    if (endpoint.startsWith('/auth/')) {
      const error = await response.json().catch(() => ({ error: 'Unauthorized' }))
      throw new Error(error.error || 'Unauthorized')
    }

    // Queue this request and wait for refresh
    return new Promise<T>((resolve, reject) => {
      failedQueue.push({
        resolve: async (token: string) => {
          // Retry the request with new token
          try {
            const retryHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
              ...options?.headers as Record<string, string>,
              'Authorization': `Bearer ${token}`,
            }
            
            const retryResponse = await fetch(url, {
              ...options,
              headers: retryHeaders,
              credentials: 'include',
            })

            if (!retryResponse.ok) {
              const error = await retryResponse.json().catch(() => ({ error: 'Unknown error' }))
              reject(new Error(error.error || `HTTP ${retryResponse.status}`))
              return
            }

            resolve(retryResponse.json())
          } catch (err) {
            reject(err)
          }
        },
        reject,
      })

      // Trigger refresh if not already doing so
      if (!isRefreshing) {
        refreshToken().catch(reject)
      }
    })
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

// Words API
export const wordsApi = {
  getAll: (params?: {
    theme?: string
    level?: string
    status?: string
    list?: string
    search?: string
    topic?: string
    subtopic?: string
    page?: number
    limit?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
    }
    return request<any>(`/words?${searchParams}`)
  },

  getById: (id: string) => request<any>(`/words/${id}`),

  getDue: (limit?: number) => request<any>(`/words/due?limit=${limit || 20}`),

  search: (query: string, limit?: number) => request<any>(`/words/search?q=${encodeURIComponent(query)}${limit ? '&limit=' + limit : ''}`),

  getDaily: () => request<any>('/words/daily'),

  toggleFavorite: (wordId: string) => request<{ favorited: boolean }>(`/words/${wordId}/favorite`, {
    method: 'POST',
    body: '{}',
  }),

  generateExamples: (wordId: string) => request<{ examples: string[]; cached: boolean }>(`/words/${wordId}/generate-examples`, {
    method: 'POST',
    body: '{}',
  }),

  getRelated: (wordId: string) => request<{ sameTopic: { id: string; word: string; definition: string; cefrLevel: string }[]; similar: { id: string; word: string; definition: string; cefrLevel: string }[]; family: { id: string; word: string; definition: string; cefrLevel: string }[] }>(`/words/${wordId}/related`),

  getEtymology: (wordId: string) => request<{ etymology: { origin: string; root: string; breakdown: Array<{part: string; meaning: string; type: string}>; story: string; related: string[] }; cached: boolean }>(`/words/${wordId}/etymology`, { method: 'POST', body: JSON.stringify({}) }),

  getContextExamples: (wordId: string) => request<{ examples: Record<string, string>; cached: boolean }>(`/words/${wordId}/context-examples`, { method: 'POST', body: JSON.stringify({}) }),

  getTranslations: (wordId: string, languages?: string[]) => request<{ translations: Record<string, string>; cached: boolean }>(`/words/${wordId}/translate`, { method: 'POST', body: JSON.stringify({ languages }) }),

  compareWords: (word1: string, word2: string) => request<{
    comparison: string
    word1: { word: string; meaning: string; usage: string; example: string; collocations: string[] }
    word2: { word: string; meaning: string; usage: string; example: string; collocations: string[] }
    memoryTip: string
    nuance: string
  }>('/words/compare', { method: 'POST', body: JSON.stringify({ word1, word2 }) }),

  // Encounters (Words in the Wild)
  getEncounters: (params?: { page?: number; limit?: number; source?: string }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    if (params?.source) q.set('source', params.source)
    return request<{ encounters: { id: string; userId: string; wordId: string; source: string; note: string | null; createdAt: string; word: { id: string; word: string; cefrLevel: string } }[]; total: number; page: number; limit: number }>(`/words/encounters?${q}`)
  },

  addEncounter: (wordId: string, source: string, note?: string) => request<{ encounter: { id: string; source: string; note: string | null; createdAt: string } }>(`/words/${wordId}/encounters`, {
    method: 'POST',
    body: JSON.stringify({ source, note }),
  }),

  getWordEncounters: (wordId: string) => request<{ encounters: { id: string; source: string; note: string | null; createdAt: string }[] }>(`/words/${wordId}/encounters`),

  deleteEncounter: (wordId: string, encounterId: string) => request<{ success: boolean }>(`/words/${wordId}/encounters/${encounterId}`, {
    method: 'DELETE',
  }),

  getFavorites: (params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value))
      })
    }
    return request<any>(`/words/favorites?${searchParams}`)
  },

  checkFavorite: (wordId: string) => request<{ favorited: boolean }>(`/words/${wordId}/favorite`),

  getCounts: () => request<{ total: number; levels: Record<string, number>; themes: Record<string, number>; statusCounts?: Record<string, number> }>('/words/counts'),
}

// Themes API
export const themesApi = {
  getAll: () => request<any>('/themes'),

  getBySlug: (slug: string, page?: number, limit?: number) => {
    const params = new URLSearchParams()
    if (page) params.append('page', String(page))
    if (limit) params.append('limit', String(limit))
    return request<any>(`/themes/${slug}?${params}`)
  },

  getStats: (slug: string) => request<any>(`/themes/${slug}/stats`),
}

// Progress API
export const progressApi = {
  getAll: () => request<any>('/progress'),

  activateStreakFreeze: () => request<{ success: boolean; frozenUntil: string }>('/progress/streak/freeze', {
    method: 'POST',
    body: JSON.stringify({}),
  }),

  getByWordId: (wordId: string) => request<any>(`/progress/${wordId}`),

  update: (wordId: string, response: 'easy' | 'medium' | 'hard' | 'forgot', responseTime?: number) =>
    request<any>(`/progress/${wordId}`, {
      method: 'POST',
      body: JSON.stringify({ response, responseTime }),
    }),

  setStatus: (wordId: string, status: 'learning' | 'reviewing' | 'mastered' | 'new') =>
    request<any>(`/progress/${wordId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  updateNotes: (wordId: string, notes: string) =>
    request<{ success: boolean; notes: string }>(`/progress/${wordId}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes }),
    }),

  batchUpdate: (updates: Array<{ wordId: string; response: 'easy' | 'medium' | 'hard' | 'forgot' }>) =>
    request<any>('/progress/batch', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),

  getAchievements: () => request<any>('/progress/achievements'),

  getReviewRecommendations: () => request<{
    overdue: Array<{ id: string; word: string; definition: string; cefrLevel: string; partOfSpeech: string[]; nextReview: string; easeFactor: number; totalReviews: number; correctReviews: number; daysOverdue: number }>
    weak: Array<{ id: string; word: string; definition: string; cefrLevel: string; partOfSpeech: string[]; nextReview: string; easeFactor: number; totalReviews: number; correctReviews: number }>
    recentNew: Array<{ id: string; word: string; definition: string; cefrLevel: string; partOfSpeech: string[]; nextReview: string; totalReviews: number }>
    stats: { totalLearning: number; totalReviewing: number; totalMastered: number }
    recommendation: string
    priority: 'high' | 'medium' | 'low'
  }>('/progress/review-recommendations'),
}

// Lists API
export const listsApi = {
  getAll: () => request<any[]>('/lists'),
  get: (id: string) => request<any>(`/lists/${id}`),
  create: (data: { name: string; description?: string; color?: string; icon?: string }) =>
    request<any>('/lists', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/lists/${id}`, { method: 'DELETE' }),
  addWord: (listId: string, wordId: string) =>
    request<void>(`/lists/${listId}/words`, { method: 'POST', body: JSON.stringify({ wordId }) }),
  removeWord: (listId: string, wordId: string) =>
    request<void>(`/lists/${listId}/words/${wordId}`, { method: 'DELETE' }),
  generateShareToken: (listId: string) =>
    request<{ shareToken: string; shareUrl: string }>(`/lists/${listId}/share-token`, { method: 'POST' }),
  revokeShare: (listId: string) =>
    request<{ success: boolean }>(`/lists/${listId}/share-token`, { method: 'DELETE' }),
  getShared: (token: string) =>
    request<any>(`/lists/shared/${token}`),
  importShared: (token: string, name?: string) =>
    request<{ success: boolean; list: { id: string; name: string; wordCount: number } }>(`/lists/import-shared/${token}`, { method: 'POST', body: JSON.stringify(name ? { name } : {}) }),
}

// Sessions API
export const sessionsApi = {
  create: (data: {
    type: 'learn' | 'review' | 'quiz'
    themeId?: string
    listId?: string
    sprintId?: string
    levelRange?: [string, string]
    wordCount?: number
  }) =>
    request<any>('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getById: (id: string) => request<any>(`/sessions/${id}`),

  respond: (sessionId: string, wordId: string, response: 'easy' | 'medium' | 'hard' | 'forgot', responseTime?: number) =>
    request<any>(`/sessions/${sessionId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, wordId, response, responseTime }),
    }),

  complete: (id: string) =>
    request<any>(`/sessions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getVocabSizeTest: () => request<{ bands: { level: string; estimatedTotal: number; totalInDb: number; words: { id: string; word: string; known: boolean }[] }[] }>('/sessions/vocab-size-test'),

  submitVocabSize: (responses: { wordId: string; known: boolean }[]) => request<{ estimatedVocabularySize: number; confidence: string; bands: { band: string; total: number; recognized: number; rate: number }[] }>('/sessions/vocab-size', {
    method: 'POST',
    body: JSON.stringify({ responses }),
  }),
}

export const writingApi = {
  getPrompts: (sprintId: string) =>
    request<{ prompts: any[] }>(`/writing/${sprintId}/prompts`),

  submitSentence: (sprintId: string, wordId: string, text: string) =>
    request<{ writing: any; valid: boolean; targetWord: string; inflections: string[] }>(`/writing/${sprintId}/sentence`, {
      method: 'POST',
      body: JSON.stringify({ wordId, text }),
    }),

  submitLongForm: (sprintId: string, text: string) =>
    request<{ writing: any; wordCount: number; sprintWordsUsed: number; sprintWordsTotal: number; coverage: number; usedWords: string[] }>(`/writing/${sprintId}/long-form`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  getWritings: (sprintId: string) =>
    request<{ writings: any[] }>(`/writing/${sprintId}/writings`),

  deleteWriting: (sprintId: string, writingId: string) =>
    request<{ success: boolean }>(`/writing/${sprintId}/writings/${writingId}`, {
      method: 'DELETE',
    }),

  getSentenceCards: (limit?: number) =>
    request<{ cards: Array<{ id: string; text: string; targetWord: string; usedWord: boolean; wordCount: number; sprintId: string; createdAt: string }>; total: number }>(`/writing/sentences/review${limit ? '?limit=' + limit : ''}`),

  getAIFeedback: (sentence: string, word: string, definition?: string, partOfSpeech?: string[]) =>
    request<{
      grammar: { score: number; note: string }
      usage: { score: number; note: string }
      clarity: { score: number; note: string }
      suggestion: string
    }>('/writing/feedback', {
      method: 'POST',
      body: JSON.stringify({ sentence, word, definition, partOfSpeech }),
    }),
}

export const readingApi = {
  analyze: (text: string, sprintId?: string) =>
    request<any>('/reading/analyze', {
      method: 'POST',
      body: JSON.stringify({ text, sprintId }),
    }),

  suggestions: () =>
    request<any>('/reading/suggestions'),
}

// Stats API
export const statsApi = {
  get: () => request<any>('/stats'),

  getDaily: (days?: number) => request<any>(`/stats/daily?days=${days || 7}`),

  getHeatmap: () => request<Array<{ date: string; wordsLearned: number; wordsReviewed: number }>>('/stats/heatmap'),

  getStudyTime: () => request<{ totalTimeMinutes: number; totalSessions: number; avgSessionMinutes: number; byType: { type: string; totalMinutes: number; sessions: number }[] }>('/stats/study-time'),

  getVelocity: () => request<{ daily: { date: string; learned: number; reviewed: number }[]; weekly: { week: string; level: string; count: number }[]; avgLearnedPerDay: number; avgReviewedPerDay: number; totalLearned: number; totalReviewed: number; activeDays: number }>('/stats/velocity'),

  getMastery: () => request<{
    levels: Array<{ level: string; total: number; mastered: number; learning: number; reviewing: number; unseen: number; masteryPercent: number; coveragePercent: number }>
    overall: { totalWords: number; totalMastered: number; totalSeen: number; masteryPercent: number; coveragePercent: number }
    estimatedLevel: string
  }>('/stats/mastery'),

  generateStudyPlan: () => request<{
    plan: {
      assessment: string
      weeklyGoal: string
      schedule: Array<{ day: string; focus: string; duration: string; tasks: string[] }>
      tips: string[]
      priorityWords: string
    }
    generatedAt: string
  }>('/stats/study-plan', { method: 'POST', body: JSON.stringify({}) }),

  getDailyChallenge: () => request<{
    challengeDay: string
    challengeName: string
    challengeType: string
    questions: Array<{ index: number; id: string; word: string; definition: string; cefrLevel: string; partOfSpeech: string[]; examples: string[]; type: string }>
    completed: boolean
    bonusXp: number
  }>('/stats/daily-challenge'),

  submitDailyChallenge: (answers: Array<{ wordId: string; correct: boolean }>) => request<{
    correct: number; total: number; accuracy: number; bonusXp: number
  }>('/stats/daily-challenge', { method: 'POST', body: JSON.stringify({ answers }) }),
}

// Admin API
export const adminApi = {
  getStats: () => request<any>('/admin/stats'),
  
  getUsers: (params?: { page?: number; limit?: number; search?: string; role?: string; tier?: string }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
    }
    return request<any>(`/admin/users?${searchParams}`)
  },

  updateUser: (userId: string, data: { role?: string; subscriptionTier?: string }) =>
    request<any>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteUser: (userId: string) =>
    request<any>(`/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': '' } as any,
    }),

  getConfig: () => request<any>('/admin/config'),

  updateConfig: (key: string, value: any) =>
    request<any>(`/admin/config/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  // LLM Categorization
  checkLLMStatus: () => request<any>('/admin/llm/status'),

  getLLMConfig: () => request<any>('/admin/llm/config'),

  updateLLMConfig: (config: { 
    provider?: string; 
    baseUrl?: string;
    model?: string; 
    apiKey?: string;
    context?: string;
  }) =>
    request<any>('/admin/llm/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  getCategorizationStats: () => request<any>('/admin/categorization/stats'),

  previewCategorization: (word: string) =>
    request<any>('/admin/categorize/preview', {
      method: 'POST',
      body: JSON.stringify({ word }),
    }),

  categorizeSingle: (wordId: string) =>
    request<any>('/admin/categorize/single', {
      method: 'POST',
      body: JSON.stringify({ wordId }),
    }),

  // LLM Providers
  getProviders: () => request<any>('/admin/llm/providers'),

  getProvider: (id: string) => request<any>(`/admin/llm/providers/${id}`),

  createProvider: (data: {
    name: string;
    provider: string;
    model: string;
    baseUrl?: string | null;
    apiKey?: string;
    context?: string | null;
    maxTokens?: number;
  }) =>
    request<any>('/admin/llm/providers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProvider: (id: string, data: {
    name?: string;
    provider?: string;
    model?: string;
    baseUrl?: string | null;
    apiKey?: string;
    context?: string | null;
    maxTokens?: number;
  }) =>
    request<any>(`/admin/llm/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteProvider: (id: string) =>
    request<any>(`/admin/llm/providers/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': '' } as any,
    }),

  activateProvider: (id: string) =>
    request<any>(`/admin/llm/providers/${id}/activate`, {
      method: 'PUT',
      body: JSON.stringify({}),
    }),

  testProvider: (id: string) =>
    request<any>(`/admin/llm/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  testLLMConfig: (config: {
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
  }) =>
    request<any>('/admin/llm/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Jobs
  getJobs: (params?: { type?: string; limit?: number }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
    }
    return request<any>(`/admin/jobs?${searchParams}`)
  },

  getJob: (id: string) => request<any>(`/admin/jobs/${id}`),

  createJob: (type: string, payload: any, priority?: number) =>
    request<any>('/admin/jobs', {
      method: 'POST',
      body: JSON.stringify({ type, payload, priority }),
    }),

  createCategorizeJob: (options?: { limit?: number; overwrite?: boolean; themeSlugs?: string[] }) =>
    request<any>('/admin/jobs/categorize', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  cancelJob: (id: string) =>
    request<any>(`/admin/jobs/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({}),
    }),

  deleteJob: (id: string) =>
    request<any>(`/admin/jobs/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': '' } as any,
    }),
}

// Data API (admin)
export const dataApi = {
  getStats: () => request<any>('/data/stats'),

  exportWords: () => request<any>('/data/export'),

  importWords: (data: any) =>
    request<any>('/data/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  importOxford: (data: { content: string; list: string; merge: boolean }) =>
    request<any>('/data/import-oxford', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  importOxfordJson: (data: { words: Record<string, any>; list?: string; merge?: boolean }) =>
    request<any>('/data/import-oxford-json', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// Sprint API
export const sprintApi = {
  getCurrent: () =>
    request<{ sprint: any; stats: any }>('/sprints/current'),

  list: () =>
    request<{ sprints: any[] }>('/sprints'),

  get: (id: string) =>
    request<{ sprint: any; stats: any }>(`/sprints/${id}`),

  create: (options?: { wordTarget?: number; durationDays?: number; cefrLevel?: string; themeId?: string }) =>
    request<{ sprint: any }>('/sprints', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  start: (id: string) =>
    request<{ sprint: any }>(`/sprints/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  abandon: (id: string) =>
    request<{ sprint: any }>(`/sprints/${id}/abandon`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  complete: (id: string) =>
    request<{ sprint: any; stats: any; report: any }>(`/sprints/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  getReport: (id: string) =>
    request<any>(`/sprints/${id}/report`),

  getPrompts: (id: string) =>
    request<{ prompts: any[] }>(`/sprints/${id}/prompts`),

  getPlateau: () =>
    request<{ plateau: boolean; message: string | null; suggestions: string[] }>('/sprints/insights/plateau'),

  getWords: (id: string) =>
    request<{ words: any[] }>(`/sprints/${id}/words`),

  getMilestones: () =>
    request<{ milestones: any[] }>('/sprints/milestones/all'),

  getDashboard: () =>
    request<{
      currentSprint: any
      sprintStats: any
      milestones: any[]
      totalSprints: number
      totalWordsLearned: number
      yearTarget: number
      yearProgress: number
    }>('/sprints/overview/dashboard'),

  getPace: () =>
    request<{
      target: number
      deadline: string
      totalLearned: number
      wordsRemaining: number
      dailyPace: number
      requiredPace: number
      projectedTotal: number
      onTrack: boolean
      daysRemaining: number
      estimatedCompletion: string | null
      progress: number
    }>('/sprints/pace'),

  getFocusRecommendations: () =>
    request<{
      quarter: string
      focusArea: string
      suggestedLevel: string
      totalLearned: number
      weakestThemes: string[]
      recommendation: string
    }>('/sprints/focus'),

  updateYearGoal: (data: { yearWordTarget?: number; yearTargetDate?: string }) =>
    request<{ success: boolean; pace: any }>('/sprints/year-goal', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getNextSuggestion: () =>
    request<{
      nextNumber: number
      isReviewSprint: boolean
      reviewReason: string | null
      totalLearned: number
      dailyPace: number
    }>('/sprints/suggestions/next'),
}
