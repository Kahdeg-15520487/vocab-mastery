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

  search: (query: string, limit?: number) => request<any>(`/words/search?q=${encodeURIComponent(query)}${limit ? '&limit=' + limit : ''}`),

  getDaily: () => request<any>('/words/daily'),

  toggleFavorite: (wordId: string) => request<{ favorited: boolean }>(`/words/${wordId}/favorite`, {
    method: 'POST',
    body: '{}',
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

  getCounts: () => request<{ total: number; levels: Record<string, number>; themes: Record<string, number> }>('/words/counts'),
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

  getAchievements: () => request<any>('/progress/achievements'),
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
    }),

  activateProvider: (id: string) =>
    request<any>(`/admin/llm/providers/${id}/activate`, {
      method: 'PUT',
    }),

  testProvider: (id: string) =>
    request<any>(`/admin/llm/providers/${id}/test`, {
      method: 'POST',
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
    }),

  deleteJob: (id: string) =>
    request<any>(`/admin/jobs/${id}`, {
      method: 'DELETE',
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
}
