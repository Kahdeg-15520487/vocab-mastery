import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { calculateNextReview, responseToQuality, createInitialProgress } from '../lib/spaced-repetition.js';
import type { WordStatus } from '../lib/spaced-repetition.js';
import { checkAchievements } from '../lib/achievements.js';

// Import daily progress helper from progress routes (shared logic)
async function updateDailyProgress(userId: string, wordsLearned: number, wordsReviewed: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyGoal = await prisma.dailyGoal.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      wordsLearned,
      wordsReviewed,
      wordsToLearn: 10,
      wordsToReview: 20,
    },
    update: {
      wordsLearned: { increment: wordsLearned },
      wordsReviewed: { increment: wordsReviewed },
    },
  });

  // Update streak
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let streak = await prisma.userStreak.findUnique({ where: { userId } });
  if (!streak) {
    streak = await prisma.userStreak.create({
      data: { userId, currentStreak: 0, longestStreak: 0, lastActivityDate: today },
    });
  }

  const lastActive = streak.lastActivityDate ? new Date(streak.lastActivityDate) : null;
  if (lastActive) lastActive.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const lastStr = lastActive ? lastActive.toISOString().slice(0, 10) : '';

  if (lastStr !== todayStr) {
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const newStreak = lastStr === yesterdayStr ? streak.currentStreak + 1 : 1;
    await prisma.userStreak.update({
      where: { userId },
      data: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, streak.longestStreak),
        lastActivityDate: today,
      },
    });
  }
}

export async function sessionRoutes(app: FastifyInstance) {
  // All session routes require authentication
  app.addHook('preHandler', authenticate);

  // Helper: auto-abandon any existing incomplete session for this user
  async function abandonExistingSession(userId: string) {
    const existing = await prisma.learningSession.findFirst({
      where: { userId, completedAt: null },
    });
    if (existing) {
      await prisma.learningSession.update({
        where: { id: existing.id },
        data: { completedAt: new Date() },
      });
    }
  }

  // Start a new learning session
  app.post('/sessions', async (request, reply) => {
    const userId = request.user!.userId;

    // Auto-abandon any existing incomplete session
    await abandonExistingSession(userId);

    const body = request.body as {
      type: 'learn' | 'review' | 'quiz';
      themeId?: string;
      listId?: string;
      sprintId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { type, themeId, listId, sprintId, levelRange, wordCount = 20 } = body;

    // Build query to get words for session
    const where: any = {};

    if (themeId) {
      where.themes = { some: { themeId } };
    }

    if (listId) {
      // Verify user has access to this list
      const list = await prisma.studyList.findUnique({
        where: { id: listId },
      });
      if (!list) {
        return reply.status(404).send({ error: 'List not found' });
      }
      if (list.userId !== userId) {
        // Check if list is shared with user
        const shared = await prisma.sharedList.findUnique({
          where: { listId_sharedWith: { listId, sharedWith: userId } },
        });
        if (!shared) {
          return reply.status(403).send({ error: 'Access denied' });
        }
      }
      where.studyListWords = { some: { listId } };
    }

    if (sprintId) {
      // Get word IDs from sprint
      const sprintWords = await prisma.sprintWord.findMany({
        where: { sprintId },
        select: { wordId: true },
      });
      const sprintWordIds = sprintWords.map(sw => sw.wordId);
      if (sprintWordIds.length === 0) {
        return reply.status(400).send({ error: 'Sprint has no words' });
      }
      where.id = { in: sprintWordIds };
    }

    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
    }

    // For review sessions, get due words for THIS user
    if (type === 'review') {
      where.progress = {
        some: {
          userId,
          nextReview: { lte: new Date() },
        },
      };
    }

    // Get words
    let words;
    if (type === 'learn') {
      // For learn sessions, prefer unseen words, then fallback to learning words
      const unseenWhere = { ...where };
      delete (unseenWhere as any).progress;
      
      const unseenWords = await prisma.word.findMany({
        where: { ...unseenWhere, progress: { none: { userId } } },
        include: {
          themes: { include: { theme: true } },
          progress: { where: { userId } },
        },
        take: wordCount,
        orderBy: { frequency: 'asc' },
      });

      if (unseenWords.length >= wordCount) {
        words = unseenWords;
      } else {
        // Fill remaining with learning-status words
        const remaining = wordCount - unseenWords.length;
        const seenIds = unseenWords.map(w => w.id);
        const learningWords = await prisma.word.findMany({
          where: {
            ...unseenWhere,
            id: { notIn: seenIds },
            progress: {
              some: {
                userId,
                status: { in: ['learning'] },
              },
            },
          },
          include: {
            themes: { include: { theme: true } },
            progress: { where: { userId } },
          },
          take: remaining,
          orderBy: { frequency: 'asc' },
        });
        words = [...unseenWords, ...learningWords];
      }
    } else {
      words = await prisma.word.findMany({
        where,
        include: {
          themes: { include: { theme: true } },
          progress: {
            where: { userId },
          },
        },
        take: wordCount,
        orderBy: type === 'review' ? { progress: { _count: 'asc' } } : { frequency: 'asc' },
      });
    }

    if (words.length === 0) {
      return reply.status(400).send({ error: 'No words available for this session' });
    }

    // Create session with userId
    const session = await prisma.learningSession.create({
      data: {
        userId,
        type,
        themeId,
        sprintId,
        sessionWords: {
          create: words.map(word => ({
            wordId: word.id,
          })),
        },
      },
      include: {
        sessionWords: {
          include: {
            word: {
              include: {
                themes: { include: { theme: true } },
              },
            },
          },
        },
      },
    });

    return {
      sessionId: session.id,
      type: session.type,
      totalWords: session.sessionWords.length,
      words: session.sessionWords.map((sw, index) => ({
        index,
        sessionWordId: sw.id,
        id: sw.word.id,
        word: sw.word.word,
        phoneticUs: sw.word.phoneticUs,
        phoneticUk: sw.word.phoneticUk,
        audioUs: sw.word.audioUs,
        audioUk: sw.word.audioUk,
        partOfSpeech: sw.word.partOfSpeech as string[],
        definition: sw.word.definition,
        examples: sw.word.examples as string[],
        synonyms: sw.word.synonyms as string[],
        antonyms: sw.word.antonyms as string[],
        oxfordList: sw.word.oxfordList,
        cefrLevel: sw.word.cefrLevel,
        themes: sw.word.themes.map(t => t.theme.slug),
      })),
    };
  });

  // ============================================
  // POST /sessions/level-test — Vocabulary level assessment
  // ============================================
  app.post('/sessions/level-test', async (request, reply) => {
    const userId = request.user!.userId;

    await abandonExistingSession(userId);

    const body = request.body as { questionCount?: number };
    const questionCount = Math.min(body.questionCount || 24, 40);

    // Get words from each CEFR level, ensuring coverage
    const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const wordsPerLevel = Math.ceil(questionCount / cefrLevels.length);

    const levelWords: any[] = [];
    for (const level of cefrLevels) {
      const words = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; partOfSpeech: any; cefrLevel: string }>>`
        SELECT id, word, definition, part_of_speech as "partOfSpeech", cefr_level as "cefrLevel"
        FROM words
        WHERE cefr_level = ${level}
        ORDER BY RANDOM()
        LIMIT ${wordsPerLevel + 2}
      `;
      levelWords.push(...words);
    }

    // Shuffle and take the target count
    const shuffled = levelWords.sort(() => Math.random() - 0.5).slice(0, questionCount);

    if (shuffled.length < 4) {
      return reply.status(400).send({ error: 'Not enough words for a level test' });
    }

    // Get wrong answer pool
    const allIds = new Set(shuffled.map((w: any) => w.id));
    const wrongPool = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string }>>`
      SELECT id, word, definition FROM words
      WHERE id NOT IN (${Prisma.join([...allIds])})
      ORDER BY RANDOM()
      LIMIT 200
    `;

    function sanitizeDef(word: string, definition: string): string {
      let sanitized = definition;
      const w = word.toLowerCase().replace(/[^a-z]/g, '');
      const patterns = [w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'er', w + 'ly'];
      patterns.sort((a, b) => b.length - a.length);
      for (const variant of patterns) {
        if (variant.length >= 2) {
          const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`\\b${escaped}\\b`, 'gi');
          sanitized = sanitized.replace(re, '____');
        }
      }
      return sanitized;
    }

    // Build questions
    const questions = shuffled.map((word: any, index: number) => {
      const wrongAnswers = [...wrongPool].sort(() => Math.random() - 0.5).slice(0, 3).map(w => ({
        id: w.id, word: w.word, definition: w.definition,
      }));

      const options = [
        { id: word.id, word: word.word, definition: word.definition, correct: true },
        ...wrongAnswers.map(w => ({ ...w, correct: false })),
      ].sort(() => Math.random() - 0.5);

      return {
        index,
        id: word.id,
        word: word.word,
        partOfSpeech: word.partOfSpeech as string[],
        definition: sanitizeDef(word.word, word.definition || ''),
        cefrLevel: word.cefrLevel,
        options,
      };
    });

    const session = await prisma.learningSession.create({
      data: {
        userId,
        type: 'quiz',
        sessionWords: { create: shuffled.map((w: any) => ({ wordId: w.id })) },
      },
    });

    return {
      sessionId: session.id,
      questionCount: questions.length,
      questions,
      isLevelTest: true,
    };
  });

  // Generate quiz questions
  app.post('/sessions/quiz', async (request, reply) => {
    const userId = request.user!.userId;

    // Auto-abandon any existing incomplete session
    await abandonExistingSession(userId);

    const body = request.body as {
      themeId?: string;
      listId?: string;
      sprintId?: string;
      levelRange?: [string, string];
      questionCount?: number;
      adaptive?: boolean;
    };
    const { themeId, listId, sprintId, levelRange, questionCount = 10, adaptive = true } = body;

    // ── Adaptive difficulty: compute recent accuracy ──
    let adaptiveLevel: 'easy' | 'medium' | 'hard' = 'medium';
    if (adaptive) {
      const recentSessions = await prisma.learningSession.findMany({
        where: {
          userId,
          type: 'quiz',
          completedAt: { not: null },
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { totalCorrect: true, totalIncorrect: true },
      });

      if (recentSessions.length >= 2) {
        const totalCorrect = recentSessions.reduce((sum, s) => sum + s.totalCorrect, 0);
        const totalQuestions = recentSessions.reduce((sum, s) => sum + s.totalCorrect + s.totalIncorrect, 0);
        const accuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0.5;

        if (accuracy >= 0.85) adaptiveLevel = 'hard';
        else if (accuracy >= 0.6) adaptiveLevel = 'medium';
        else adaptiveLevel = 'easy';
      }
    }

    // Build query to get words
    const where: any = {};

    if (themeId) {
      where.themes = { some: { themeId } };
    }

    if (listId) {
      const list = await prisma.studyList.findUnique({ where: { id: listId } });
      if (!list) {
        return reply.status(404).send({ error: 'List not found' });
      }
      if (list.userId !== userId) {
        const shared = await prisma.studyList.findUnique({
          where: { id: listId },
        });
        if (!shared) {
          return reply.status(403).send({ error: 'Access denied' });
        }
      }
      where.studyListWords = { some: { listId } };
    }

    if (sprintId) {
      const sprintWords = await prisma.sprintWord.findMany({
        where: { sprintId },
        select: { wordId: true },
      });
      where.id = { in: sprintWords.map(sw => sw.wordId) };
    }

    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
    }

    // Adaptive difficulty: adjust CEFR levels for word selection
    const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    let adaptiveCefr: string[] = cefrLevels;
    if (adaptive && !levelRange && !sprintId) {
      if (adaptiveLevel === 'easy') {
        adaptiveCefr = ['A1', 'A2', 'B1']; // Easier words
      } else if (adaptiveLevel === 'hard') {
        adaptiveCefr = ['B2', 'C1', 'C2']; // Harder words
      }
      // medium = all levels
      if (adaptiveCefr.length < cefrLevels.length) {
        where.cefrLevel = { in: adaptiveCefr };
      }
    }

    // Adaptive difficulty: adjust word status selection
    // Easy: prefer mastered/known words (easy wins to build confidence)
    // Hard: prefer learning/new words (challenge)
    // Medium: mixed
    const statusOrder = adaptiveLevel === 'easy'
      ? ['mastered', 'known', 'learning', 'new']
      : adaptiveLevel === 'hard'
        ? ['learning', 'new', 'known', 'mastered']
        : ['learning', 'known', 'mastered', 'new'];

    // Get quiz words (prefer words user has some progress with)
    let quizWords = await prisma.word.findMany({
      where: {
        ...where,
        progress: { some: { userId, status: { not: 'new' } } },
      },
      take: questionCount,
      orderBy: { frequency: 'asc' },
    });

    // If not enough, fill with any words (randomized)
    if (quizWords.length < questionCount) {
      const existingIds = quizWords.map(w => w.id);
      const moreWords = await prisma.word.findMany({
        where: { ...where, id: { notIn: existingIds } },
        take: questionCount - quizWords.length,
        orderBy: { frequency: 'asc' },
      });
      quizWords = [...quizWords, ...moreWords];
    }

    if (quizWords.length < 4) {
      return reply.status(400).send({ error: 'Not enough words for a quiz (need at least 4)' });
    }

    // Shuffle quiz words so they're not always in frequency order
    quizWords = quizWords.sort(() => Math.random() - 0.5);

    // Get random wrong answer options from other words
    const allWordIds = new Set(quizWords.map(w => w.id));
    
    // Adaptive: for hard difficulty, use same-CEFR-level wrong answers (more confusing)
    let wrongPool: Array<{ id: string; word: string; definition: string }>;
    if (adaptive && adaptiveLevel === 'hard') {
      // Hard: wrong answers from same CEFR levels as quiz words
      const quizCefrLevels = [...new Set(quizWords.map(w => w.cefrLevel).filter(Boolean))];
      if (quizCefrLevels.length > 0) {
        wrongPool = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string }>>`
          SELECT id, word, definition FROM words
          WHERE id NOT IN (${Prisma.join([...allWordIds])})
          AND cefr_level = ANY(${quizCefrLevels}::text[])
          ORDER BY RANDOM()
          LIMIT 100
        `;
      } else {
        wrongPool = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string }>>`
          SELECT id, word, definition FROM words
          WHERE id NOT IN (${Prisma.join([...allWordIds])})
          ORDER BY RANDOM()
          LIMIT 100
        `;
      }
    } else {
      wrongPool = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string }>>`
        SELECT id, word, definition FROM words
        WHERE id NOT IN (${Prisma.join([...allWordIds])})
        ORDER BY RANDOM()
        LIMIT 100
      `;
    }

    // Helper: sanitize definition to hide the answer word for quiz questions
    function sanitizeDefinition(word: string, definition: string): string {
      let sanitized = definition;
      const w = word.toLowerCase().replace(/[^a-z]/g, '');
      
      // Variants to mask: the word itself, common forms, and split forms
      const patterns: string[] = [];
      
      // Exact word and common inflections
      patterns.push(w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'er', w + 'ly');
      // -y → -ies, -ied
      if (w.endsWith('y')) {
        const base = w.slice(0, -1);
        patterns.push(base + 'ies', base + 'ied', base + 'ier', base + 'iest');
      }
      // -e → -ed, -ing, -er
      if (w.endsWith('e')) {
        const base = w.slice(0, -1);
        patterns.push(base + 'ing', base + 'ed', base + 'er', base + 'est');
      }
      // Split form: "cannot" → "can not", "onto" → "on to"
      if (w.length >= 4) {
        for (let i = 2; i <= w.length - 2; i++) {
          const part1 = w.slice(0, i);
          const part2 = w.slice(i);
          // Only add if both parts are at least 2 chars and look like real words
          if (part2.length >= 2) {
            patterns.push(part1 + ' ' + part2);
            patterns.push(part1 + '-' + part2);
          }
        }
      }
      
      // Sort by length descending so longer matches are replaced first
      patterns.sort((a, b) => b.length - a.length);
      
      for (const variant of patterns) {
        if (variant.length >= 2) {
          const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Match whole words only, case-insensitive
          const re = new RegExp(`\\b${escaped}\\b`, 'gi');
          sanitized = sanitized.replace(re, '____');
        }
      }
      
      return sanitized;
    }

    // Build questions
    const questions = quizWords.map((word, index) => {
      // Pick 3 random wrong answers
      const shuffled = [...wrongPool].sort(() => Math.random() - 0.5);
      const wrongAnswers = shuffled.slice(0, 3).map(w => ({
        id: w.id,
        word: w.word,
        definition: w.definition,
      }));

      // Randomize option order
      const options = [
        { id: word.id, word: word.word, definition: word.definition, correct: true },
        ...wrongAnswers.map(w => ({ ...w, correct: false })),
      ].sort(() => Math.random() - 0.5);

      // Sanitize definition: hide the answer word and its variants/split forms
      const safeDefinition = sanitizeDefinition(word.word, word.definition || '');

      // Sanitize examples too: remove any that contain the answer word
      const safeExamples = (word.examples as string[] || []).filter(ex => {
        const exLower = ex.toLowerCase();
        const wLower = word.word.toLowerCase();
        // Keep example if it doesn't contain the word
        return !exLower.includes(wLower) && !exLower.includes(wLower.replace(/ /g, ''));
      });

      return {
        index,
        id: word.id,
        word: word.word,
        phoneticUs: word.phoneticUs,
        phoneticUk: word.phoneticUk,
        audioUs: word.audioUs,
        audioUk: word.audioUk,
        partOfSpeech: word.partOfSpeech as string[],
        definition: safeDefinition,
        examples: safeExamples,
        cefrLevel: word.cefrLevel,
        options,
      };
    });

    // Create a quiz session
    const session = await prisma.learningSession.create({
      data: {
        userId,
        type: 'quiz',
        themeId,
        sprintId,
        sessionWords: {
          create: quizWords.map(word => ({ wordId: word.id })),
        },
      },
    });

    return {
      sessionId: session.id,
      questionCount: questions.length,
      questions,
      adaptive: adaptive ? {
        enabled: true,
        level: adaptiveLevel,
        cefrRange: adaptiveCefr,
      } : undefined,
    };
  });

  // Submit quiz answer
  app.post('/sessions/quiz/:sessionId/answer', async (request, reply) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as {
      wordId: string;
      selectedId: string;
      responseTime?: number;
    };

    const session = await prisma.learningSession.findFirst({
      where: { id: sessionId, userId, type: 'quiz' },
    });
    if (!session) {
      return reply.status(404).send({ error: 'Quiz session not found' });
    }

    const isCorrect = body.wordId === body.selectedId;

    // Update session word
    const sessionWord = await prisma.sessionWord.findFirst({
      where: { sessionId, wordId: body.wordId },
    });
    if (sessionWord) {
      await prisma.sessionWord.update({
        where: { id: sessionWord.id },
        data: {
          shown: true,
          response: isCorrect ? 'easy' : 'forgot',
          responseTime: body.responseTime,
        },
      });
    }

    // Update session counts
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        totalCorrect: { increment: isCorrect ? 1 : 0 },
        totalIncorrect: { increment: isCorrect ? 0 : 1 },
      },
    });

    // Update word progress (spaced repetition) for quiz answers
    await updateWordProgress(userId, body.wordId, isCorrect);

    // Mark sprint word as quizzed if this is a sprint session
    if (session.sprintId) {
      await prisma.sprintWord.updateMany({
        where: { sprintId: session.sprintId, wordId: body.wordId },
        data: { quizzed: true, quizCorrect: isCorrect },
      }).catch(() => {});
    }

    return { correct: isCorrect, correctId: body.wordId };
  });

  // GET /sessions/level-test/:sessionId/results — Compute CEFR level from level test
  app.get('/sessions/level-test/:sessionId/results', async (request, reply) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };

    const session = await prisma.learningSession.findFirst({
      where: { id: sessionId, userId, type: 'quiz' },
      include: {
        sessionWords: {
          include: {
            word: {
              select: { id: true, word: true, cefrLevel: true },
            },
          },
        },
      },
    });
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Calculate per-level accuracy
    const levelResults: Record<string, { total: number; correct: number }> = {};
    const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

    for (const sw of session.sessionWords) {
      const level = sw.word.cefrLevel || 'unknown';
      if (!levelResults[level]) levelResults[level] = { total: 0, correct: 0 };
      levelResults[level].total++;
      if (sw.response === 'easy') levelResults[level].correct++;
    }

    // Find the highest level where accuracy >= 60%
    let estimatedLevel = 'A1';
    for (const level of cefrLevels) {
      const result = levelResults[level];
      if (result && result.total > 0 && (result.correct / result.total) >= 0.6) {
        estimatedLevel = level;
      }
    }

    // Compute overall accuracy
    const totalQuestions = session.totalCorrect + session.totalIncorrect;
    const overallAccuracy = totalQuestions > 0 ? session.totalCorrect / totalQuestions : 0;

    return {
      sessionId,
      totalQuestions,
      totalCorrect: session.totalCorrect,
      totalIncorrect: session.totalIncorrect,
      accuracy: Math.round(overallAccuracy * 100),
      estimatedLevel,
      levelBreakdown: cefrLevels.map(level => ({
        level,
        total: levelResults[level]?.total || 0,
        correct: levelResults[level]?.correct || 0,
        accuracy: levelResults[level] && levelResults[level].total > 0
          ? Math.round((levelResults[level].correct / levelResults[level].total) * 100)
          : null,
      })).filter(l => l.total > 0),
    };
  });

  // ============================================
  // Spelling Practice Mode
  // ============================================

  // Start spelling practice session
  app.post('/sessions/spelling', async (request, reply) => {
    const userId = request.user!.userId;

    // Auto-abandon any existing incomplete session
    await abandonExistingSession(userId);

    const body = request.body as {
      themeId?: string;
      listId?: string;
      sprintId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { themeId, listId, sprintId, levelRange, wordCount = 15 } = body;

    const where: any = {};

    if (themeId) {
      where.themes = { some: { themeId } };
    }

    if (listId) {
      const list = await prisma.studyList.findUnique({ where: { id: listId } });
      if (!list) return reply.status(404).send({ error: 'List not found' });
      if (list.userId !== userId) {
        const shared = await prisma.sharedList.findUnique({
          where: { listId_sharedWith: { listId, sharedWith: userId } },
        });
        if (!shared) return reply.status(403).send({ error: 'Access denied' });
      }
      where.studyListWords = { some: { listId } };
    }

    if (sprintId) {
      const sprintWords = await prisma.sprintWord.findMany({
        where: { sprintId },
        select: { wordId: true },
      });
      where.id = { in: sprintWords.map(sw => sw.wordId) };
    }

    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
    }

    // Prefer words the user has started learning (not new)
    let spellWords = await prisma.word.findMany({
      where: {
        ...where,
        progress: { some: { userId, status: { in: ['learning', 'reviewing'] } } },
      },
      take: wordCount,
      orderBy: { frequency: 'asc' },
    });

    // Fill with new words if not enough
    if (spellWords.length < wordCount) {
      const existingIds = spellWords.map(w => w.id);
      const moreWords = await prisma.word.findMany({
        where: { ...where, id: { notIn: existingIds } },
        take: wordCount - spellWords.length,
        orderBy: { frequency: 'asc' },
      });
      spellWords = [...spellWords, ...moreWords];
    }

    if (spellWords.length === 0) {
      return reply.status(400).send({ error: 'No words available for spelling practice' });
    }

    // Shuffle
    spellWords = spellWords.sort(() => Math.random() - 0.5);

    // Create session
    const session = await prisma.learningSession.create({
      data: {
        userId,
        type: 'learn',
        themeId,
        sprintId,
        sessionWords: {
          create: spellWords.map(word => ({ wordId: word.id })),
        },
      },
    });

    // Return words with definition visible but word HIDDEN
    const questions = spellWords.map((word, index) => ({
      index,
      id: word.id,
      // DO NOT send word text — that's what the user needs to type
      definition: word.definition,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      audioUs: word.audioUs,
      audioUk: word.audioUk,
      partOfSpeech: word.partOfSpeech as string[],
      examples: (word.examples as string[] || []).map(ex => {
        // Mask the word in examples
        const re = new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        return ex.replace(re, '____');
      }),
      synonyms: word.synonyms as string[] || [],
      cefrLevel: word.cefrLevel,
      letterCount: word.word.length,
      firstLetter: word.word[0],
    }));

    return {
      sessionId: session.id,
      questionCount: questions.length,
      questions,
    };
  });

  // Check spelling answer
  app.post('/sessions/spelling/:sessionId/check', async (request, reply) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as {
      wordId: string;
      answer: string;
      responseTime?: number;
    };

    const session = await prisma.learningSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const word = await prisma.word.findUnique({ where: { id: body.wordId } });
    if (!word) return reply.status(404).send({ error: 'Word not found' });

    // Check answer — case-insensitive, trimmed
    const userAnswer = body.answer.trim().toLowerCase();
    const correctAnswer = word.word.trim().toLowerCase();
    const isCorrect = userAnswer === correctAnswer;

    // Also accept common alternate spellings (e.g., "organise" ↔ "organize")
    let isClose = false;
    if (!isCorrect) {
      // Levenshtein distance check for "close" answers (1-2 chars off)
      const dist = levenshtein(userAnswer, correctAnswer);
      isClose = dist > 0 && dist <= 2 && dist < correctAnswer.length / 3;
    }

    // Update session word
    const sessionWord = await prisma.sessionWord.findFirst({
      where: { sessionId, wordId: body.wordId },
    });
    if (sessionWord) {
      await prisma.sessionWord.update({
        where: { id: sessionWord.id },
        data: {
          shown: true,
          response: isCorrect ? 'easy' : 'forgot',
          responseTime: body.responseTime,
        },
      });
    }

    // Update session counts
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        totalCorrect: { increment: isCorrect ? 1 : 0 },
        totalIncorrect: { increment: isCorrect ? 0 : 1 },
      },
    });

    // Update word progress (spaced repetition)
    await updateWordProgress(userId, body.wordId, isCorrect);

    // Mark sprint word as quizzed if this is a sprint session
    if (session.sprintId) {
      await prisma.sprintWord.updateMany({
        where: { sprintId: session.sprintId, wordId: body.wordId },
        data: { quizzed: true, quizCorrect: isCorrect },
      }).catch(() => {});
    }

    return {
      correct: isCorrect,
      close: isClose,
      correctAnswer: word.word,
      word: word.word, // reveal the word
    };
  });

  // ============================================
  // Fill-in-the-Blank Practice Mode
  // ============================================

  app.post('/sessions/fill-blank', async (request, reply) => {
    const userId = request.user!.userId;

    // Auto-abandon any existing incomplete session
    await abandonExistingSession(userId);

    const body = request.body as {
      themeId?: string;
      listId?: string;
      sprintId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { themeId, listId, sprintId, levelRange, wordCount = 15 } = body;

    const where: any = {};
    if (themeId) where.themes = { some: { themeId } };
    if (listId) {
      const list = await prisma.studyList.findUnique({ where: { id: listId } });
      if (!list) return reply.status(404).send({ error: 'List not found' });
      if (list.userId !== userId) {
        const shared = await prisma.sharedList.findUnique({
          where: { listId_sharedWith: { listId, sharedWith: userId } },
        });
        if (!shared) return reply.status(403).send({ error: 'Access denied' });
      }
      where.studyListWords = { some: { listId } };
    }
    if (sprintId) {
      const sprintWords = await prisma.sprintWord.findMany({
        where: { sprintId },
        select: { wordId: true },
      });
      where.id = { in: sprintWords.map(sw => sw.wordId) };
    }
    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
    }

    // Get words that have examples (use array_contains to filter JSON field)
    let fillWords = await prisma.word.findMany({
      where: {
        ...where,
        NOT: { examples: { equals: [] } },
      },
      take: wordCount * 3, // over-fetch since some may not have good examples
      orderBy: { frequency: 'asc' },
    });

    // Filter to words with actual non-empty examples
    fillWords = fillWords.filter(w => {
      const examples = w.examples as string[] || [];
      return examples.length > 0;
    }).slice(0, wordCount);

    if (fillWords.length < 3) {
      return reply.status(400).send({ error: 'Not enough words with examples for fill-in-the-blank' });
    }

    fillWords = fillWords.sort(() => Math.random() - 0.5);

    const session = await prisma.learningSession.create({
      data: {
        userId,
        type: 'learn',
        themeId,
        sprintId,
        sessionWords: {
          create: fillWords.map(word => ({ wordId: word.id })),
        },
      },
    });

    const questions = fillWords.map((word, index) => {
      const examples = (word.examples as string[] || []);
      // Pick a random example
      const sentence = examples[Math.floor(Math.random() * examples.length)] || '';
      // Mask the word in the sentence, handling common inflected forms
      // e.g. "accumulate" → also match "accumulated", "accumulating", "accumulates"
      const escapedWord = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const w = word.word.toLowerCase();
      const forms = new Set([escapedWord]);
      // Verb forms: -s, -es, -ed, -ing
      forms.add(escapedWord + 's');
      forms.add(escapedWord + 'es');
      forms.add(escapedWord + 'ed');
      forms.add(escapedWord + 'd');
      forms.add(escapedWord + 'ing');
      // Drop silent e before -ed/-ing: accumulate → accumulated, accumulating
      if (w.endsWith('e')) {
        const base = escapedWord.slice(0, -1);
        forms.add(base + 'ed');
        forms.add(base + 'ing');
        forms.add(base + 'es');
      }
      // Consonant doubling (e.g. stop → stopped, stopping)
      if (w.length >= 2 && /[bcdfghjklmnpqrstvwxyz]$/.test(w.slice(-1)) && /[aeiou]$/.test(w.slice(-2, -1))) {
        const doubled = escapedWord + w.slice(-1);
        forms.add(doubled + 'ed');
        forms.add(doubled + 'ing');
      }
      // -y → -ied/-ies: vary → varied, varies
      if (w.endsWith('y') && w.length > 1 && !/[aeiou]/.test(w.slice(-2, -1))) {
        const ies = escapedWord.slice(0, -1) + 'i';
        forms.add(ies + 'ed');
        forms.add(ies + 'es');
      }
      // Noun plural: -s, -es, -ies (already covered above for most)
      if (w.endsWith('y') && w.length > 1 && !/[aeiou]/.test(w.slice(-2, -1))) {
        forms.add(escapedWord.slice(0, -1) + 'ies');
      }
      if (w.endsWith('s') || w.endsWith('x') || w.endsWith('ch') || w.endsWith('sh')) {
        forms.add(escapedWord + 'es');
      }

      const pattern = [...forms].join('|');
      const maskedSentence = sentence.replace(
        new RegExp(`\\b(${pattern})\\b`, 'gi'),
        '________'
      );

      return {
        index,
        id: word.id,
        word: word.word,
        sentence: maskedSentence,
        definition: word.definition,
        partOfSpeech: word.partOfSpeech as string[],
        cefrLevel: word.cefrLevel,
      };
    });

    return {
      sessionId: session.id,
      questionCount: questions.length,
      questions,
    };
  });

  // Check fill-blank answer (reuses spelling check logic)
  app.post('/sessions/fill-blank/:sessionId/check', async (request, reply) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as {
      wordId: string;
      answer: string;
      responseTime?: number;
    };

    const session = await prisma.learningSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) return reply.status(404).send({ error: 'Session not found' });

    const word = await prisma.word.findUnique({ where: { id: body.wordId } });
    if (!word) return reply.status(404).send({ error: 'Word not found' });

    const userAnswer = body.answer.trim().toLowerCase();
    const correctAnswer = word.word.trim().toLowerCase();
    const isCorrect = userAnswer === correctAnswer;

    let isClose = false;
    if (!isCorrect) {
      const dist = levenshtein(userAnswer, correctAnswer);
      isClose = dist > 0 && dist <= 2 && dist < correctAnswer.length / 3;
    }

    const sessionWord = await prisma.sessionWord.findFirst({
      where: { sessionId, wordId: body.wordId },
    });
    if (sessionWord) {
      await prisma.sessionWord.update({
        where: { id: sessionWord.id },
        data: {
          shown: true,
          response: isCorrect ? 'easy' : 'forgot',
          responseTime: body.responseTime,
        },
      });
    }

    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        totalCorrect: { increment: isCorrect ? 1 : 0 },
        totalIncorrect: { increment: isCorrect ? 0 : 1 },
      },
    });

    // Update word progress (spaced repetition)
    await updateWordProgress(userId, body.wordId, isCorrect);

    // Mark sprint word as quizzed if this is a sprint session
    if (session.sprintId) {
      await prisma.sprintWord.updateMany({
        where: { sprintId: session.sprintId, wordId: body.wordId },
        data: { quizzed: true, quizCorrect: isCorrect },
      }).catch(() => {});
    }

    return {
      correct: isCorrect,
      close: isClose,
      correctAnswer: word.word,
    };
  });

  // ============================================
  // Listening Comprehension Session
  // ============================================

  app.post('/sessions/listening', async (request, reply) => {
    const userId = request.user!.userId;
    await abandonExistingSession(userId);

    const body = request.body as {
      themeId?: string;
      listId?: string;
      sprintId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { themeId, listId, sprintId, levelRange, wordCount = 15 } = body;

    // Only pick words that have audio
    const where: any = {
      OR: [
        { audioUs: { not: null } },
        { audioUk: { not: null } },
      ],
    };

    if (themeId) where.themes = { some: { themeId } };
    if (listId) {
      const list = await prisma.studyList.findUnique({ where: { id: listId } });
      if (!list) return reply.status(404).send({ error: 'List not found' });
      if (list.userId !== userId) {
        const shared = await prisma.sharedList.findUnique({
          where: { listId_sharedWith: { listId, sharedWith: userId } },
        });
        if (!shared) return reply.status(403).send({ error: 'Access denied' });
      }
      where.studyListWords = { some: { listId } };
    }
    if (sprintId) {
      const sprintWords = await prisma.sprintWord.findMany({
        where: { sprintId },
        select: { wordId: true },
      });
      where.id = { in: sprintWords.map(sw => sw.wordId) };
    }
    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      if (startIdx >= 0 && endIdx >= startIdx) {
        where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
      }
    }

    // Prefer single words (no spaces/hyphens) and reasonable length
    const words = await prisma.$queryRaw<Array<{
      id: string; word: string; definition: string;
      phonetic_us: string | null; phonetic_uk: string | null;
      audio_us: string | null; audio_uk: string | null;
      part_of_speech: any; examples: any; synonyms: any;
      cefr_level: string; oxford_list: string | null;
    }>>`
      SELECT id, word, definition, phonetic_us, phonetic_uk,
             audio_us, audio_uk, part_of_speech, examples,
             synonyms, cefr_level, oxford_list
      FROM words
      WHERE (audio_us IS NOT NULL OR audio_uk IS NOT NULL)
        AND word NOT LIKE '% %'
        AND LENGTH(word) >= 3
        ${themeId ? Prisma.sql`AND id IN (SELECT wt."wordId" FROM word_themes wt JOIN themes th ON wt."themeId" = th.id WHERE th.id = ${themeId})` : Prisma.empty}
        ${listId ? Prisma.sql`AND id IN (SELECT slw."wordId" FROM study_list_words slw WHERE slw."listId" = ${listId})` : Prisma.empty}
        ${sprintId ? Prisma.sql`AND id IN (SELECT sw."wordId" FROM sprint_words sw WHERE sw."sprintId" = ${sprintId})` : Prisma.empty}
      ORDER BY RANDOM()
      LIMIT ${wordCount}
    `;

    if (words.length === 0) {
      return reply.status(400).send({ error: 'No words with audio available. Try a different filter.' });
    }

    const session = await prisma.learningSession.create({
      data: {
        userId,
        type: 'learn',
        themeId: themeId || null,
        sprintId: sprintId || null,
        sessionWords: {
          create: words.map((w, index) => ({
            wordId: w.id,
            wordIndex: index,
          })),
        },
      },
    });

    return {
      sessionId: session.id,
      words: words.map((w, index) => ({
        index,
        id: w.id,
        word: w.word,
        audioUs: w.audio_us,
        audioUk: w.audio_uk,
        phoneticUs: w.phonetic_us,
        phoneticUk: w.phonetic_uk,
        partOfSpeech: w.part_of_speech as string[],
        definition: w.definition,
        examples: (w.examples as string[]) || [],
        synonyms: (w.synonyms as string[]) || [],
        cefrLevel: w.cefr_level,
        letterCount: w.word.length,
      })),
    };
  });

  app.post('/sessions/listening/:sessionId/check', async (request, reply) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as { wordId: string; answer: string };

    if (!body.wordId || !body.answer) {
      return reply.status(400).send({ error: 'wordId and answer required' });
    }

    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
      include: { sessionWords: true },
    });

    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const sessionWord = session.sessionWords.find(sw => sw.wordId === body.wordId);
    if (!sessionWord) {
      return reply.status(404).send({ error: 'Word not in session' });
    }
    if (sessionWord.response) {
      return reply.status(400).send({ error: 'Already answered' });
    }

    const word = await prisma.word.findUnique({ where: { id: body.wordId } });
    if (!word) return reply.status(404).send({ error: 'Word not found' });

    const userAnswer = body.answer.trim().toLowerCase();
    const correctAnswer = word.word.toLowerCase();
    const isCorrect = userAnswer === correctAnswer;

    // Close match: same letters, maybe wrong case or minor typo
    const isClose = !isCorrect && (
      levenshtein(userAnswer, correctAnswer) <= 1 ||
      correctAnswer.startsWith(userAnswer) ||
      userAnswer.startsWith(correctAnswer)
    );

    const quality = isCorrect ? 4 : isClose ? 2 : 1;
    const response = isCorrect ? 'easy' : isClose ? 'hard' : 'forgot';

    // Update session word
    await prisma.sessionWord.update({
      where: { id: sessionWord.id },
      data: {
        response,
        responseTime: Date.now() - sessionWord.createdAt.getTime(),
      },
    });

    // Update session stats
    if (isCorrect) {
      await prisma.learningSession.update({
        where: { id: sessionId },
        data: { totalCorrect: { increment: 1 } },
      });
    } else {
      await prisma.learningSession.update({
        where: { id: sessionId },
        data: { totalIncorrect: { increment: 1 } },
      });
    }

    // Update word progress (spaced repetition)
    await updateWordProgress(userId, body.wordId, isCorrect);

    return {
      correct: isCorrect,
      close: isClose,
      correctAnswer: word.word,
      phoneticUs: word.phoneticUs,
      definition: word.definition,
    };
  });

  // Helper: Levenshtein distance
  function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  // Get active (incomplete) session for current user
  app.get('/sessions/active', async (request, reply) => {
    const userId = request.user!.userId;

    const session = await prisma.learningSession.findFirst({
      where: { userId, completedAt: null },
      include: {
        sessionWords: {
          include: {
            word: {
              include: {
                themes: { include: { theme: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      return { active: false };
    }

    const answeredIds = new Set(
      session.sessionWords.filter(sw => sw.response).map(sw => sw.wordId)
    );

    // Build response based on session type
    const base = {
      active: true,
      sessionId: session.id,
      type: session.type,
      totalCorrect: session.totalCorrect,
      totalIncorrect: session.totalIncorrect,
      totalWords: session.sessionWords.length,
      answeredCount: answeredIds.size,
    };

    if (session.type === 'quiz') {
      // Rebuild quiz questions with options
      const quizWords = session.sessionWords.map(sw => sw.word);
      const allWordIds = new Set(quizWords.map(w => w.id));

      // Get wrong answer pool
      const wrongPool = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string }>>`
        SELECT id, word, definition FROM words
        WHERE id NOT IN (${Prisma.join([...allWordIds])})
        ORDER BY RANDOM()
        LIMIT 100
      `;

      function sanitizeDefinition(word: string, definition: string): string {
        let sanitized = definition;
        const w = word.toLowerCase().replace(/[^a-z]/g, '');
        const patterns: string[] = [w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'er', w + 'ly'];
        if (w.endsWith('y')) { const b = w.slice(0, -1); patterns.push(b + 'ies', b + 'ied'); }
        if (w.endsWith('e')) { const b = w.slice(0, -1); patterns.push(b + 'ing', b + 'ed'); }
        patterns.sort((a, b) => b.length - a.length);
        for (const v of patterns) {
          if (v.length >= 2) {
            const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            sanitized = sanitized.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '____');
          }
        }
        return sanitized;
      }

      const questions = quizWords.map((word, index) => {
        const shuffled = [...wrongPool].sort(() => Math.random() - 0.5);
        const wrongAnswers = shuffled.slice(0, 3).map(w => ({
          id: w.id, word: w.word, definition: w.definition,
        }));
        const options = [
          { id: word.id, word: word.word, definition: word.definition, correct: true },
          ...wrongAnswers.map(w => ({ ...w, correct: false })),
        ].sort(() => Math.random() - 0.5);

        const safeDefinition = sanitizeDefinition(word.word, word.definition || '');
        const safeExamples = (word.examples as string[] || []).filter(ex => {
          const exLower = ex.toLowerCase();
          const wLower = word.word.toLowerCase();
          return !exLower.includes(wLower);
        });

        // Find the user's selected answer if already answered
        const sessionWord = session.sessionWords.find(sw => sw.wordId === word.id);
        let selectedId: string | null = null;
        if (sessionWord?.response) {
          selectedId = sessionWord.response === 'easy' ? word.id : null;
        }

        return {
          index,
          id: word.id,
          word: word.word,
          phoneticUs: word.phoneticUs,
          phoneticUk: word.phoneticUk,
          audioUs: word.audioUs,
          audioUk: word.audioUk,
          partOfSpeech: word.partOfSpeech as string[],
          definition: safeDefinition,
          examples: safeExamples,
          cefrLevel: word.cefrLevel,
          options,
          answered: answeredIds.has(word.id),
          correct: sessionWord?.response === 'easy',
        };
      });

      return { ...base, questions };
    }

    if (session.type === 'learn') {
      // Could be spelling or fill-blank (both stored as type 'learn') or actual learn
      // Check by the first session word to determine which view this came from
      // We'll return generic data and let the frontend figure it out
      const words = session.sessionWords.map((sw, index) => {
        const word = sw.word;
        const examples = (word.examples as string[] || []);
        const escapedWord = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        return {
          index,
          id: word.id,
          word: word.word,
          audioUs: word.audioUs,
          audioUk: word.audioUk,
          phoneticUs: word.phoneticUs,
          phoneticUk: word.phoneticUk,
          partOfSpeech: word.partOfSpeech as string[],
          definition: word.definition,
          examples,
          synonyms: word.synonyms as string[] || [],
          antonyms: word.antonyms as string[] || [],
          oxfordList: word.oxfordList,
          cefrLevel: word.cefrLevel,
          themes: word.themes.map(t => t.theme.slug),
          // Fill-blank specific
          sentence: examples.length > 0
            ? examples[Math.floor(Math.random() * examples.length)].replace(
                new RegExp(`\\b${escapedWord}\\b`, 'gi'), '________'
              )
            : null,
          // Spelling specific
          letterCount: word.word.length,
          firstLetter: word.word[0],
          maskedExamples: examples.map(ex =>
            ex.replace(new RegExp(`\\b${escapedWord}\\b`, 'gi'), '____')
          ),
          // Session state
          answered: answeredIds.has(word.id),
          response: sw.response,
        };
      });

      return { ...base, words };
    }

    // Generic fallback
    return base;
  });

  // Abandon (auto-complete with zero stats) the active incomplete session
  app.post('/sessions/abandon-active', async (request, reply) => {
    const userId = request.user!.userId;

    const session = await prisma.learningSession.findFirst({
      where: { userId, completedAt: null },
    });

    if (!session) {
      return { abandoned: false };
    }

    await prisma.learningSession.update({
      where: { id: session.id },
      data: { completedAt: new Date() },
    });

    return { abandoned: true, sessionId: session.id };
  });

  app.get('/sessions', async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string | undefined>;
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const type = query.type;

    const where: any = { userId, completedAt: { not: null } };
    if (type) where.type = type;

    const [sessions, total] = await Promise.all([
      prisma.learningSession.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { sessionWords: true } },
        },
      }),
      prisma.learningSession.count({ where }),
    ]);

    return {
      sessions: sessions.map(s => ({
        id: s.id,
        type: s.type,
        themeId: s.themeId,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        totalCorrect: s.totalCorrect,
        totalIncorrect: s.totalIncorrect,
        wordCount: s._count.sessionWords,
        accuracy: s.totalCorrect + s.totalIncorrect > 0
          ? Math.round((s.totalCorrect / (s.totalCorrect + s.totalIncorrect)) * 100)
          : 0,
        duration: s.completedAt
          ? Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)
          : 0,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  });

  // Get session by ID (only own sessions)
  app.get('/sessions/:id', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const session = await prisma.learningSession.findFirst({
      where: { id, userId },
      include: {
        sessionWords: {
          include: {
            word: true,
          },
        },
      },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return {
      id: session.id,
      type: session.type,
      themeId: session.themeId,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      totalCorrect: session.totalCorrect,
      totalIncorrect: session.totalIncorrect,
      progress: {
        total: session.sessionWords.length,
        completed: session.sessionWords.filter(sw => sw.response).length,
      },
    };
  });

  // Submit response for a word in session
  app.post('/sessions/:sessionId/respond', async (request, reply) => {
    const userId = request.user!.userId;
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as {
      wordId: string;
      response: 'easy' | 'medium' | 'hard' | 'forgot';
      responseTime?: number;
    };
    const { wordId, response, responseTime } = body;

    // Verify session belongs to user
    const session = await prisma.learningSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const sessionWord = await prisma.sessionWord.findFirst({
      where: { sessionId, wordId },
    });

    if (!sessionWord) {
      return reply.status(404).send({ error: 'Word not in session' });
    }

    await prisma.sessionWord.update({
      where: { id: sessionWord.id },
      data: {
        shown: true,
        response,
        responseTime,
      },
    });

    // Update session counts
    const isCorrect = response !== 'forgot';
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        totalCorrect: { increment: isCorrect ? 1 : 0 },
        totalIncorrect: { increment: isCorrect ? 0 : 1 },
      },
    });

    // Update SM-2 spaced repetition progress (combined with session respond)
    const progressResult = await updateWordProgressFull(userId, wordId, response);

    return { success: true, ...progressResult };
  });

  // Complete a session (only own sessions)
  app.post('/sessions/:id/complete', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const session = await prisma.learningSession.findFirst({
      where: { id, userId },
      include: {
        sessionWords: true,
      },
    });

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    if (session.completedAt) {
      return reply.status(400).send({ error: 'Session already completed' });
    }

    const completedSession = await prisma.learningSession.update({
      where: { id },
      data: {
        completedAt: new Date(),
      },
    });

    // Calculate stats
    const accuracy = session.sessionWords.length > 0
      ? Math.round((session.totalCorrect / session.sessionWords.length) * 100)
      : 0;

    // Check achievements after session completion
    const newAchievementKeys = await checkSessionAchievements(
      userId, session.totalCorrect, accuracy, completedSession.type
    ).catch((err: Error) => {
      console.error('Achievement check failed:', err);
      return [];
    });

    // Award XP and check for level up
    const xpEarned = session.totalCorrect * 5 + Math.round(accuracy / 10);
    let leveledUp = false;
    if (xpEarned > 0) {
      leveledUp = await awardXp(userId, xpEarned);
    }

    return {
      success: true,
      session: {
        id: completedSession.id,
        type: completedSession.type,
        startedAt: completedSession.startedAt,
        completedAt: completedSession.completedAt,
        totalWords: session.sessionWords.length,
        totalCorrect: completedSession.totalCorrect,
        totalIncorrect: completedSession.totalIncorrect,
        accuracy,
      },
      xpEarned,
      leveledUp,
      newAchievements: newAchievementKeys,
    };
  });

  // GET /sessions/vocab-size-test — Vocabulary size estimation test words
  app.get('/sessions/vocab-size-test', async (request, reply) => {
    const userId = request.user!.userId;

    // Sample words from each CEFR level
    const cefrBands = [
      { level: 'A1', estimatedTotal: 500 },
      { level: 'A2', estimatedTotal: 1000 },
      { level: 'B1', estimatedTotal: 2000 },
      { level: 'B2', estimatedTotal: 4000 },
      { level: 'C1', estimatedTotal: 8000 },
      { level: 'C2', estimatedTotal: 16000 },
    ];

    const results: { level: string; estimatedTotal: number; totalInDb: number; words: { id: string; word: string; known: boolean }[] }[] = [];

    for (const band of cefrBands) {
      const countResult = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) as c FROM words WHERE cefr_level = '${band.level}'`
      );
      const totalInDb = Number(countResult[0]?.c || 0);
      if (totalInDb === 0) continue;

      const wordsData = await prisma.$queryRawUnsafe<Array<{ id: string; word: string }>>(
        `SELECT id, word FROM words WHERE cefr_level = '${band.level}' ORDER BY RANDOM() LIMIT 10`
      );

      // Check which words the user already knows
      const ids = wordsData.map((w: any) => w.id);
      const progress = await prisma.wordProgress.findMany({
        where: { userId, wordId: { in: ids }, status: { not: 'new' } },
        select: { wordId: true },
      });
      const knownIds = new Set(progress.map((p: any) => p.wordId));

      results.push({
        level: band.level,
        estimatedTotal: band.estimatedTotal,
        totalInDb,
        words: wordsData.map((w: any) => ({ id: w.id, word: w.word, known: knownIds.has(w.id) })),
      });
    }

    return { bands: results };
  });

    // POST /sessions/vocab-size — Calculate estimated vocabulary size from responses
  app.post('/sessions/vocab-size', async (request, reply) => {
    const userId = request.user!.userId;
    const { responses } = request.body as { responses: { wordId: string; known: boolean }[] };

    // Get word CEFR levels
    const words = await prisma.word.findMany({
      where: { id: { in: responses.map((r: any) => r.wordId) } },
      select: { id: true, cefrLevel: true },
    });

    // Group by CEFR level and compute recognition rate
    const levelMap = new Map<string, { total: number; recognized: number }>();
    const levelSizes: Record<string, number> = {
      A1: 500,
      A2: 1000,
      B1: 2000,
      B2: 4000,
      C1: 8000,
      C2: 16000,
    };

    for (const r of responses) {
      const word = words.find((w: any) => w.id === r.wordId);
      if (!word || !word.cefrLevel) continue;

      const level = word.cefrLevel;
      const current = levelMap.get(level) || { total: 0, recognized: 0 };
      current.total++;
      if (r.known) current.recognized++;
      levelMap.set(level, current);
    }

    // Estimate: for each level, known words = rate * estimated_total_for_level
    let estimatedTotal = 0;
    const results: { band: string; total: number; recognized: number; rate: number }[] = [];

    for (const [level, size] of Object.entries(levelSizes)) {
      const data = levelMap.get(level);
      if (data && data.total > 0) {
        const rate = data.recognized / data.total;
        estimatedTotal += Math.round(rate * size);
        results.push({ band: level, total: data.total, recognized: data.recognized, rate: Math.round(rate * 100) });
      }
    }

    return {
      estimatedVocabularySize: estimatedTotal,
      confidence: responses.length >= 40 ? 'high' : responses.length >= 20 ? 'medium' : 'low',
      bands: results,
    };
  });
}

/**
 * Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

/**
 * Award XP and auto-level up the user
 * Level thresholds: level N requires sum(25*i for i in 1..N-1) XP
 */
/**
 * Update word progress using spaced repetition after a correct/incorrect answer
 */
async function updateWordProgress(userId: string, wordId: string, isCorrect: boolean) {
  const existingProgress = await prisma.wordProgress.findUnique({
    where: { userId_wordId: { userId, wordId } },
  });

  if (existingProgress) {
    const response = isCorrect ? 'easy' : 'forgot';
    const quality = responseToQuality(response);
    const updated = calculateNextReview({
      wordId,
      status: existingProgress.status as WordStatus,
      interval: existingProgress.interval,
      easeFactor: existingProgress.easeFactor,
      repetitions: existingProgress.repetitions,
      nextReview: existingProgress.nextReview,
      lastReview: existingProgress.lastReview,
      totalReviews: existingProgress.totalReviews,
      correctReviews: existingProgress.correctReviews,
    }, quality);
    await prisma.wordProgress.update({
      where: { id: existingProgress.id },
      data: {
        status: updated.status,
        interval: updated.interval,
        easeFactor: updated.easeFactor,
        repetitions: updated.repetitions,
        nextReview: updated.nextReview,
        lastReview: updated.lastReview,
        totalReviews: updated.totalReviews,
        correctReviews: updated.correctReviews,
      },
    });
  } else if (isCorrect) {
    // New word answered correctly — mark as learning
    await prisma.wordProgress.create({
      data: {
        userId,
        wordId,
        status: 'learning',
        interval: 1,
        easeFactor: 2.5,
        repetitions: 1,
        nextReview: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
}

// Full SM-2 progress update with daily goals and achievements
// Used by Learn tab respond endpoint (combines session respond + progress into 1 call)
async function updateWordProgressFull(
  userId: string,
  wordId: string,
  response: 'easy' | 'medium' | 'hard' | 'forgot',
): Promise<{ progress?: any; achievementsUnlocked?: string[] }> {
  const quality = responseToQuality(response);
  const isCorrect = response !== 'forgot';

  // Get or create progress
  let existingProgress = await prisma.wordProgress.findUnique({
    where: { userId_wordId: { userId, wordId } },
  });

  if (!existingProgress) {
    const initial = createInitialProgress(wordId);
    existingProgress = await prisma.wordProgress.create({
      data: {
        userId,
        wordId,
        status: initial.status,
        interval: initial.interval,
        easeFactor: initial.easeFactor,
        repetitions: initial.repetitions,
        nextReview: initial.nextReview,
        lastReview: initial.lastReview,
        totalReviews: initial.totalReviews,
        correctReviews: initial.correctReviews,
      },
    });
  }

  const wasNew = existingProgress.status === 'new';
  const wasNotMastered = existingProgress.status !== 'mastered';

  const updated = calculateNextReview(
    {
      wordId: existingProgress.wordId,
      status: existingProgress.status as any,
      interval: existingProgress.interval,
      easeFactor: existingProgress.easeFactor,
      repetitions: existingProgress.repetitions,
      nextReview: existingProgress.nextReview,
      lastReview: existingProgress.lastReview,
      totalReviews: existingProgress.totalReviews,
      correctReviews: existingProgress.correctReviews,
    },
    quality,
  );

  const progress = await prisma.wordProgress.update({
    where: { id: existingProgress.id },
    data: {
      status: updated.status,
      interval: updated.interval,
      easeFactor: updated.easeFactor,
      repetitions: updated.repetitions,
      nextReview: updated.nextReview,
      lastReview: updated.lastReview,
      totalReviews: updated.totalReviews,
      correctReviews: updated.correctReviews,
    },
  });

  // Update daily goal and streak
  const dailyLearned = wasNew && updated.status !== 'new' ? 1 : 0;
  const dailyReviewed = !wasNew ? 1 : 0;
  await updateDailyProgress(userId, dailyLearned, dailyReviewed);

  // Check achievements
  const unlockedAchievements: string[] = [];

  if (wasNew && updated.status !== 'new') {
    const totalLearned = await prisma.wordProgress.count({
      where: { userId, status: { not: 'new' } },
    });
    const newUnlocked = await checkAchievements({
      userId,
      type: 'words_learned',
      value: totalLearned,
    });
    unlockedAchievements.push(...newUnlocked);
  }

  if (wasNotMastered && updated.status === 'mastered') {
    const totalMastered = await prisma.wordProgress.count({
      where: { userId, status: 'mastered' },
    });
    const newUnlocked = await checkAchievements({
      userId,
      type: 'words_mastered',
      value: totalMastered,
    });
    unlockedAchievements.push(...newUnlocked);
  }

  const reviewUnlocked = await checkAchievements({
    userId,
    type: 'total_reviews',
    value: updated.totalReviews,
  });
  unlockedAchievements.push(...reviewUnlocked);

  return {
    progress: {
      status: progress.status,
      interval: progress.interval,
      nextReview: progress.nextReview,
    },
    achievementsUnlocked: unlockedAchievements,
  };
}

async function awardXp(userId: string, xp: number): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totalXp: true, level: true },
  });
  if (!user) return false;

  const newTotalXp = user.totalXp + xp;

  // Calculate new level (each level requires progressively more XP)
  // Level 1→2: 100 XP, Level 2→3: 150 XP, Level 3→4: 200 XP, etc.
  // Formula: level N requires 50*(N+1) cumulative XP from previous levels
  let newLevel = 1;
  let xpNeeded = 0;
  while (true) {
    xpNeeded += 50 * (newLevel + 1);
    if (newTotalXp >= xpNeeded) {
      newLevel++;
    } else {
      break;
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      totalXp: newTotalXp,
      level: newLevel,
    },
  });

  return newLevel > user.level;
}

/**
 * Check and unlock achievements after session completion
 */
async function checkSessionAchievements(
  userId: string,
  totalCorrect: number,
  accuracy: number,
  sessionType: string
): Promise<string[]> {
  const [wordsLearned, reviewAggregate, sessionsCompleted] = await Promise.all([
    prisma.wordProgress.count({ where: { userId, status: { not: 'new' } } }),
    prisma.wordProgress.aggregate({ where: { userId }, _sum: { totalReviews: true } }),
    prisma.learningSession.count({ where: { userId, completedAt: { not: null } } }),
  ]);

  const reviewCount = reviewAggregate._sum.totalReviews || 0;
  const allUnlocked: string[] = [];

  // Words learned
  if (wordsLearned > 0) {
    const unlocked = await checkAchievements({ userId, type: 'words_learned', value: wordsLearned });
    allUnlocked.push(...unlocked);
  }

  // Total reviews
  if (reviewCount > 0) {
    const unlocked = await checkAchievements({ userId, type: 'total_reviews', value: reviewCount });
    allUnlocked.push(...unlocked);
  }

  // Sessions completed
  const unlocked = await checkAchievements({ userId, type: 'sessions_completed', value: sessionsCompleted });
  allUnlocked.push(...unlocked);

  // Perfect session (100% accuracy, at least 5 words)
  if (accuracy === 100 && totalCorrect >= 5 && sessionType !== 'quiz') {
    const perfect = await checkAchievements({ userId, type: 'perfect_session', value: totalCorrect });
    allUnlocked.push(...perfect);
  }

  return allUnlocked;
  return allUnlocked;
}



