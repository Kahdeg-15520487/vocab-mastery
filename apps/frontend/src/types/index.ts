// Word types
export interface Word {
  id: string
  word: string
  phoneticUs: string
  phoneticUk: string
  partOfSpeech: string[]
  definition: string
  examples: string[]
  synonyms: string[]
  antonyms: string[]
  oxfordList: '3000' | '5000'
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
  frequency: number
  themes?: string[]
  progress?: WordProgress | null
  favorited?: boolean
}

export interface WordProgress {
  status: 'new' | 'learning' | 'reviewing' | 'mastered'
  interval: number
  easeFactor: number
  repetitions: number
  nextReview: string
  lastReview: string | null
  totalReviews: number
  correctReviews: number
}

// Theme types
export interface Theme {
  id: string
  name: string
  slug: string
  icon: string
  description: string
  wordCount?: number
}

// Session types
export interface Session {
  sessionId: string
  type: 'learn' | 'review' | 'quiz'
  totalWords: number
  words: SessionWord[]
}

export interface SessionWord extends Word {
  index: number
  sessionWordId: string
}

export interface SessionResponse {
  sessionId: string
  wordId: string
  response: 'easy' | 'medium' | 'hard' | 'forgot'
  responseTime?: number
}

// Stats types
export interface UserStats {
  totalWords: number
  masteredWords: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: string
  totalXP: number
  level: number
  totalSessions: number
}

export interface DailyStats {
  date: string
  wordsReviewed: number
  correct: number
  incorrect: number
  sessions: number
}

export interface StatsResponse {
  user: UserStats
  words: {
    total: number
    learned: number
    status: StatusCounts
    byLevel: Record<string, number>
  }
  sessionTypes: Record<string, number>
  recentSessions: Array<{
    id: string
    type: string
    completedAt: string
    accuracy: number
  }>
}

export interface StatusCounts {
  new: number
  learning: number
  reviewing: number
  mastered: number
}

// API response types
export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface WordsResponse {
  words: Word[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
