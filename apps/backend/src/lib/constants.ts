/**
 * Shared constants for the Vocab Mastery backend
 */

// Word progress statuses
export const WORD_STATUS = {
  NEW: 'new',
  LEARNING: 'learning',
  REVIEWING: 'reviewing',
  MASTERED: 'mastered',
} as const;

export type WordStatus = (typeof WORD_STATUS)[keyof typeof WORD_STATUS];

// Session types
export const SESSION_TYPE = {
  LEARN: 'learn',
  REVIEW: 'review',
  QUIZ: 'quiz',
} as const;

// Response types
export const RESPONSE_TYPE = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
  FORGOT: 'forgot',
} as const;
