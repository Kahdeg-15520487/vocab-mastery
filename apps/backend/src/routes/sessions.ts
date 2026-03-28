import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

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
    };
    const { themeId, listId, levelRange, questionCount = 10 } = body;

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

    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
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

    // If not enough, fill with any words
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

    // Get random wrong answer options from other words
    const allWordIds = new Set(quizWords.map(w => w.id));
    
    const wrongPool = await prisma.word.findMany({
      where: { id: { notIn: [...allWordIds] } },
      select: { id: true, word: true, definition: true },
      take: 100,
    });

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

      return {
        index,
        id: word.id,
        word: word.word,
        phoneticUs: word.phoneticUs,
        partOfSpeech: word.partOfSpeech as string[],
        definition: word.definition,
        examples: word.examples as string[],
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

    return { correct: isCorrect, correctId: body.wordId };
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
      xpEarned: session.totalCorrect * 5 + Math.round(accuracy / 10),
    };
  });
}
