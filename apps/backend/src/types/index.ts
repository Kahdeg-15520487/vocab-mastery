import { z } from 'zod';

// Word schemas
export const WordSchema = z.object({
  id: z.string(),
  word: z.string(),
  phoneticUs: z.string(),
  phoneticUk: z.string(),
  partOfSpeech: z.array(z.string()),
  definition: z.string(),
  examples: z.array(z.string()),
  synonyms: z.array(z.string()),
  antonyms: z.array(z.string()),
  oxfordList: z.enum(['3000', '5000']),
  cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  frequency: z.number(),
  themes: z.array(z.string()).optional(),
});

export const ThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: z.string(),
  description: z.string(),
  wordCount: z.number().optional(),
});

// Progress schemas
export const WordProgressSchema = z.object({
  wordId: z.string(),
  status: z.enum(['new', 'learning', 'reviewing', 'mastered']),
  interval: z.number(),
  easeFactor: z.number(),
  repetitions: z.number(),
  nextReview: z.coerce.date(),
  lastReview: z.coerce.date().nullable(),
  totalReviews: z.number(),
  correctReviews: z.number(),
});

// Session schemas
export const CreateSessionSchema = z.object({
  type: z.enum(['learn', 'review', 'quiz']),
  themeId: z.string().optional(),
  levelRange: z.tuple([
    z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
    z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  ]).optional(),
  wordCount: z.number().min(5).max(50).default(20),
});

export const SessionResponseSchema = z.object({
  sessionId: z.string(),
  wordId: z.string(),
  response: z.enum(['easy', 'medium', 'hard', 'forgot']),
  responseTime: z.number().optional(), // milliseconds
});

// Stats schemas
export const UserStatsSchema = z.object({
  totalWords: z.number(),
  masteredWords: z.number(),
  currentStreak: z.number(),
  longestStreak: z.number(),
  lastActiveDate: z.coerce.date(),
  totalXP: z.number(),
  level: z.number(),
});

// Query schemas
export const WordQuerySchema = z.object({
  theme: z.string().optional(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
  list: z.enum(['3000', '5000']).optional(),
  status: z.enum(['new', 'learning', 'reviewing', 'mastered']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Types
export type Word = z.infer<typeof WordSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type WordProgress = z.infer<typeof WordProgressSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type UserStats = z.infer<typeof UserStatsSchema>;
export type WordQuery = z.infer<typeof WordQuerySchema>;
