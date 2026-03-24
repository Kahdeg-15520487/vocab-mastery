import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';

export async function wordRoutes(app: FastifyInstance) {
  // Get all words with filters
  app.get('/words', async (request, reply) => {
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
      where.themes = { some: { theme: { slug: theme } } };
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

  // Get single word
  app.get('/words/:id', async (request, reply) => {
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

  // Get words due for review
  app.get('/words/due', async (request, reply) => {
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

  // Search words
  app.get('/words/search', async (request, reply) => {
    const { q } = request.query as { q: string };

    if (!q || q.length < 2) {
      return reply.status(400).send({ error: 'Query must be at least 2 characters' });
    }

    const words = await prisma.word.findMany({
      where: {
        word: { contains: q, mode: 'insensitive' },
      },
      take: 10,
      select: {
        id: true,
        word: true,
        definition: true,
        cefrLevel: true,
      },
    });

    return words;
  });
}
