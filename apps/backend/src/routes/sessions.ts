import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';

export async function sessionRoutes(app: FastifyInstance) {
  // Start a new learning session
  app.post('/sessions', async (request, reply) => {
    const body = request.body as {
      type: 'learn' | 'review' | 'quiz';
      themeId?: string;
      levelRange?: [string, string];
      wordCount?: number;
    };
    const { type, themeId, levelRange, wordCount = 20 } = body;

    // Build query to get words for session
    const where: any = {};

    if (themeId) {
      where.themes = { some: { themeId } };
    }

    if (levelRange) {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const startIdx = levels.indexOf(levelRange[0]);
      const endIdx = levels.indexOf(levelRange[1]);
      where.cefrLevel = { in: levels.slice(startIdx, endIdx + 1) };
    }

    // For review sessions, get due words
    if (type === 'review') {
      where.progress = {
        some: {
          nextReview: { lte: new Date() },
        },
      };
    }

    // Get words
    const words = await prisma.word.findMany({
      where,
      include: {
        themes: { include: { theme: true } },
        progress: true,
      },
      take: wordCount,
      orderBy: type === 'review' ? { progress: { _count: 'asc' } } : { frequency: 'asc' },
    });

    if (words.length === 0) {
      return reply.status(400).send({ error: 'No words available for this session' });
    }

    // Create session
    const session = await prisma.learningSession.create({
      data: {
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

  // Get session by ID
  app.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const session = await prisma.learningSession.findUnique({
      where: { id },
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
    const { sessionId } = request.params as { sessionId: string };
    const body = request.body as {
      sessionId: string;
      wordId: string;
      response: 'easy' | 'medium' | 'hard' | 'forgot';
      responseTime?: number;
    };
    const { wordId, response, responseTime } = body;

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

  // Complete a session
  app.post('/sessions/:id/complete', async (request, reply) => {
    const { id } = request.params as { id: string };

    const session = await prisma.learningSession.findUnique({
      where: { id },
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
