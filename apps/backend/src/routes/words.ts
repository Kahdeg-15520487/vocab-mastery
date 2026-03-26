import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { optionalAuth, authenticate } from '../middleware/auth.js';

export async function wordRoutes(app: FastifyInstance) {
  // Get all words with filters (requires auth)
  app.get('/words', { preHandler: authenticate }, async (request, reply) => {
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
          progress: true,
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

  // Get single word - guests get limited fields, authenticated users get full data
  app.get('/words/:id', { preHandler: optionalAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const word = await prisma.word.findUnique({
      where: { id },
      include: {
        themes: { include: { theme: true } },
        progress: true,
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
    };
  });

  // Get words due for review (requires auth)
  app.get('/words/due', { preHandler: authenticate }, async (request, reply) => {
    const { limit = 20 } = request.query as { limit?: number };

    const dueWords = await prisma.word.findMany({
      where: {
        progress: {
          some: {
            nextReview: { lte: new Date() },
          },
        },
      },
      include: {
        themes: { include: { theme: true } },
        progress: true,
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
}
