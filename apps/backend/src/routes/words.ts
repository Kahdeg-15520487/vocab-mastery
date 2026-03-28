import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { optionalAuth, authenticate } from '../middleware/auth.js';

export async function wordRoutes(app: FastifyInstance) {
  // Get all words with filters (requires auth)
  app.get('/words', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string | undefined>;
    const theme = query.theme;
    const level = query.level;
    const list = query.list;
    const search = query.search;
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);

    const where: any = {};
    
    if (level) where.cefrLevel = level;
    if (list) where.oxfordList = list;
    if (search) {
      where.word = { contains: search, mode: 'insensitive' };
    }
    if (theme) {
      // Special case: 'none' means uncategorized words (no themes)
      if (theme === 'none') {
        where.themes = { none: {} };
      } else {
        where.themes = { some: { theme: { slug: theme } } };
      }
    }

    const [words, total] = await Promise.all([
      prisma.word.findMany({
        where,
        include: {
          themes: { include: { theme: true } },
          progress: {
            where: { userId },
          },
          favorites: {
            where: { userId },
            select: { id: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { frequency: 'asc' },
      }),
      prisma.word.count({ where }),
    ]);

    const formattedWords = words.map(word => ({
      id: word.id,
      word: word.word,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      partOfSpeech: word.partOfSpeech as string[],
      definition: word.definition,
      examples: word.examples as string[],
      synonyms: word.synonyms as string[],
      antonyms: word.antonyms as string[],
      oxfordList: word.oxfordList,
      cefrLevel: word.cefrLevel,
      frequency: word.frequency,
      themes: word.themes.map(t => t.theme.slug),
      progress: word.progress?.[0] ? {
        status: word.progress[0].status,
        interval: word.progress[0].interval,
        nextReview: word.progress[0].nextReview,
      } : null,
      favorited: word.favorites.length > 0,
    }));

    return {
      words: formattedWords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Word of the Day - deterministic based on date (MUST be before /:id)
  app.get('/words/daily', { preHandler: optionalAuth }, async (request, _reply) => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );

    // Get total word count for modulo
    const totalWords = await prisma.word.count();

    if (totalWords === 0) {
      return { word: null };
    }

    // Deterministic offset based on day of year
    const offset = dayOfYear % totalWords;

    const word = await prisma.word.findMany({
      take: 1,
      skip: offset,
      include: {
        themes: { include: { theme: true } },
        progress: request.user
          ? { where: { userId: request.user.userId } }
          : false,
      },
      orderBy: { frequency: 'asc' },
    });

    if (word.length === 0) {
      return { word: null };
    }

    const w = word[0];
    return {
      id: w.id,
      word: w.word,
      phoneticUs: w.phoneticUs,
      phoneticUk: w.phoneticUk,
      partOfSpeech: w.partOfSpeech as string[],
      definition: w.definition,
      examples: (w.examples as string[])?.slice(0, 2) || [],
      synonyms: (w.synonyms as string[])?.slice(0, 5) || [],
      cefrLevel: w.cefrLevel,
      oxfordList: w.oxfordList,
      themes: w.themes.map(t => ({ id: t.theme.id, name: t.theme.name, slug: t.theme.slug })),
      progress: request.user && w.progress?.[0] ? {
        status: w.progress[0].status,
        interval: w.progress[0].interval,
        nextReview: w.progress[0].nextReview,
      } : null,
    };
  });

  // Get words due for review (requires auth)
  app.get('/words/due', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { limit = 20 } = request.query as { limit?: number };

    const dueWords = await prisma.word.findMany({
      where: {
        progress: {
          some: {
            userId,
            nextReview: { lte: new Date() },
          },
        },
      },
      include: {
        themes: { include: { theme: true } },
        progress: {
          where: { userId },
        },
      },
      take: limit,
      orderBy: {
        progress: {
          _count: 'asc',
        },
      },
    });

    return dueWords.map(word => ({
      id: word.id,
      word: word.word,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      partOfSpeech: word.partOfSpeech as string[],
      definition: word.definition,
      examples: word.examples as string[],
      synonyms: word.synonyms as string[],
      antonyms: word.antonyms as string[],
      oxfordList: word.oxfordList,
      cefrLevel: word.cefrLevel,
      themes: word.themes.map(t => t.theme.slug),
      progress: word.progress[0],
    }));
  });

  // Search words (requires auth)
  app.get('/words/search', { preHandler: authenticate }, async (request, reply) => {
    const { q, limit } = request.query as { q: string; limit?: string };

    if (!q || q.length < 2) {
      return reply.status(400).send({ error: 'Query must be at least 2 characters' });
    }

    const takeLimit = Math.min(parseInt(limit || '20', 10), 50);

    const words = await prisma.word.findMany({
      where: {
        word: { contains: q, mode: 'insensitive' },
      },
      take: takeLimit,
      select: {
        id: true,
        word: true,
        definition: true,
        cefrLevel: true,
        phoneticUs: true,
      },
    });

    return words;
  });

  // Get single word - guests get limited fields, authenticated users get full data
  app.get('/words/:id', { preHandler: optionalAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const word = await prisma.word.findUnique({
      where: { id },
      include: {
        themes: { include: { theme: true } },
        progress: request.user
          ? { where: { userId: request.user.userId } }
          : false,
        favorites: request.user
          ? { where: { userId: request.user.userId }, select: { id: true } }
          : false,
      },
    });

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // If user is not authenticated (guest), return limited fields only
    if (!request.user) {
      return {
        id: word.id,
        word: word.word,
        phoneticUs: word.phoneticUs,
        phoneticUk: word.phoneticUk,
        cefrLevel: word.cefrLevel,
        oxfordList: word.oxfordList,
        definition: word.definition,
        // NO examples, synonyms, antonyms, themes for guests
      };
    }

    // Authenticated user gets full data
    return {
      id: word.id,
      word: word.word,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      partOfSpeech: word.partOfSpeech as string[],
      definition: word.definition,
      examples: word.examples as string[],
      synonyms: word.synonyms as string[],
      antonyms: word.antonyms as string[],
      oxfordList: word.oxfordList,
      cefrLevel: word.cefrLevel,
      frequency: word.frequency,
      themes: word.themes.map(t => ({ id: t.theme.id, name: t.theme.name, slug: t.theme.slug })),
      progress: word.progress?.[0] || null,
      favorited: request.user ? (word.favorites as any[])?.length > 0 : false,
    };
  });

  // ============================================
  // WORD FAVORITES
  // ============================================

  // GET /words/favorites - List user's favorite words
  app.get('/words/favorites', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string | undefined>;
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);

    const [favorites, total] = await Promise.all([
      prisma.wordFavorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          word: {
            select: {
              id: true,
              word: true,
              phoneticUs: true,
              definition: true,
              cefrLevel: true,
              partOfSpeech: true,
            },
          },
        },
      }),
      prisma.wordFavorite.count({ where: { userId } }),
    ]);

    return {
      favorites: favorites.map(f => ({
        id: f.id,
        createdAt: f.createdAt,
        word: f.word,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  });

  // POST /words/:wordId/favorite - Toggle favorite
  app.post('/words/:wordId/favorite', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    // Check word exists
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // Check if already favorited
    const existing = await prisma.wordFavorite.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    if (existing) {
      // Remove favorite
      await prisma.wordFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    } else {
      // Add favorite
      await prisma.wordFavorite.create({
        data: { userId, wordId },
      });
      return { favorited: true };
    }
  });

  // GET /words/:wordId/favorite - Check if word is favorited
  app.get('/words/:wordId/favorite', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    const favorite = await prisma.wordFavorite.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    return { favorited: !!favorite };
  });
}
