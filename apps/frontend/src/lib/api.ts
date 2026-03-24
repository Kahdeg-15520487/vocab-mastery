const API_BASE = import.meta.env.VITE_API_URL || '/api'

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// Words API
export const wordsApi = {
  getAll: (params?: {
    theme?: string
    level?: string
    list?: string
    search?: string
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

  search: (query: string) => request<any>(`/words/search?q=${encodeURIComponent(query)}`),
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

  getByWordId: (wordId: string) => request<any>(`/progress/${wordId}`),

  update: (wordId: string, response: 'easy' | 'medium' | 'hard' | 'forgot', responseTime?: number) =>
    request<any>(`/progress/${wordId}`, {
      method: 'POST',
      body: JSON.stringify({ response, responseTime }),
    }),

  batchUpdate: (updates: Array<{ wordId: string; response: 'easy' | 'medium' | 'hard' | 'forgot' }>) =>
    request<any>('/progress/batch', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),
}

// Sessions API
export const sessionsApi = {
  create: (data: {
    type: 'learn' | 'review' | 'quiz'
    themeId?: string
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
    }),
}

// Stats API
export const statsApi = {
  get: () => request<any>('/stats'),

  getDaily: (days?: number) => request<any>(`/stats/daily?days=${days || 7}`),

  getWeekly: (weeks?: number) => request<any>(`/stats/weekly?weeks=${weeks || 4}`),

  getLevelDistribution: () => request<any>('/stats/level-distribution'),
}
