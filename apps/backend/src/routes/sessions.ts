import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { calculateNextReview, responseToQuality } from '../lib/spaced-repetition.js';
import type { WordStatus } from '../lib/spaced-repetition.js';
import { checkAchievements } from '../lib/achievements.js';

export async function sessionRoutes(app: FastifyInstance) {
  // All session routes require authentication
  app.addHook('preHandler', authenticate);

  // Start a new learning session
  app.post('/sessions', async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      type: 'learn' | 'review' | 'quiz';
      themeId?: string;
      listId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { type, themeId, listId, levelRange, wordCount = 20 } = body;

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

  // Generate quiz questions
  app.post('/sessions/quiz', async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      themeId?: string;
      listId?: string;
      levelRange?: [string, string];
      questionCount?: number;
      wordIds?: string[];
    };
    const { themeId, listId, levelRange, questionCount = 10, wordIds } = body;

    // Build query to get words
    const where: any = {};

    // If specific word IDs provided (e.g. for "practice mistakes")
    if (wordIds && wordIds.length > 0) {
      where.id = { in: wordIds };
    } else {
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

      if (levelRange) {
        const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
        const startIdx = levels.indexOf(levelRange[0]);
        const endIdx = levels.indexOf(levelRange[1]);
        where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
      }
    }

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
    
    // Use raw query for true randomness (Prisma doesn't support ORDER BY RANDOM())
    const wrongPool = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string }>>`
      SELECT id, word, definition FROM words
      WHERE id NOT IN (${Prisma.join([...allWordIds])})
      ORDER BY RANDOM()
      LIMIT 100
    `;

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
        sessionWords: {
          create: quizWords.map(word => ({ wordId: word.id })),
        },
      },
    });

    return {
      sessionId: session.id,
      questionCount: questions.length,
      questions,
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

    return { correct: isCorrect, correctId: body.wordId };
  });

  // ============================================
  // Spelling Practice Mode
  // ============================================

  // Start spelling practice session
  app.post('/sessions/spelling', async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      themeId?: string;
      listId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { themeId, listId, levelRange, wordCount = 15 } = body;

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
        type: 'learn', // reuse learn type for simplicity
        themeId,
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
    const body = request.body as {
      themeId?: string;
      listId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { themeId, listId, levelRange, wordCount = 15 } = body;

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
    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
    }

    // Get words (over-fetch since we filter by examples after)
    let fillWords = await prisma.word.findMany({
      where,
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
        sessionWords: {
          create: fillWords.map(word => ({ wordId: word.id })),
        },
      },
    });

    const questions = fillWords.map((word, index) => {
      const examples = (word.examples as string[] || []);
      // Pick a random example
      const sentence = examples[Math.floor(Math.random() * examples.length)] || '';
      // Mask the word and common inflections in the sentence
      const maskedSentence = maskWordInText(word.word, sentence);

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

    return {
      correct: isCorrect,
      close: isClose,
      correctAnswer: word.word,
    };
  });

  // Get session history (paginated list)
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

    return { success: true };
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
 * Mask a word (and its common inflections) in a text string
 */
function maskWordInText(word: string, text: string): string {
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [w, w + 's', w + 'es', w + 'ed', w + 'ing', w + 'er', w + 'ly', w + 'ers', w + 'est'];
  // -y → -ies/-ied
  if (w.endsWith('y')) {
    const base = w.slice(0, -1);
    patterns.push(base + 'ies', base + 'ied', base + 'ier', base + 'iest');
  }
  // -e → -ing/-ed/-er
  if (w.endsWith('e')) {
    const base = w.slice(0, -1);
    patterns.push(base + 'ing', base + 'ed', base + 'er', base + 'est');
  }
  // Deduplicate and sort by length desc (longest match first)
  const unique = [...new Set(patterns)].sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${unique.join('|')})\\b`, 'gi');
  return text.replace(re, '________');
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
}
