import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';

export async function themeRoutes(app: FastifyInstance) {
  // Get all themes (public)
  app.get('/themes', async (request, reply) => {
    const themes = await prisma.theme.findMany({
      include: {
        _count: {
          select: { words: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return themes.map(theme => ({
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      icon: theme.icon,
      description: theme.description,
      wordCount: theme._count.words,
    }));
  });

  // Get theme by slug with words
  app.get('/themes/:slug', { preHandler: optionalAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const userId = request.user?.userId;

    const theme = await prisma.theme.findUnique({
      where: { slug },
      include: {
        words: {
          include: {
            word: {
              include: {
                progress: userId
                  ? { where: { userId } }
                  : false,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
        },
        _count: {
          select: { words: true },
        },
      },
    });

    if (!theme) {
      return reply.status(404).send({ error: 'Theme not found' });
    }

    const words = theme.words.map(wt => ({
      id: wt.word.id,
      word: wt.word.word,
      phoneticUs: wt.word.phoneticUs,
      phoneticUk: wt.word.phoneticUk,
      partOfSpeech: wt.word.partOfSpeech as string[],
      definition: wt.word.definition,
      examples: wt.word.examples as string[],
      synonyms: wt.word.synonyms as string[],
      antonyms: wt.word.antonyms as string[],
      oxfordList: wt.word.oxfordList,
      cefrLevel: wt.word.cefrLevel,
      frequency: wt.word.frequency,
      progress: wt.word.progress?.[0] || null,
    }));

    return {
      id: theme.id,
      name: theme.name,
      slug: theme.slug,
      icon: theme.icon,
      description: theme.description,
      wordCount: theme._count.words,
      words,
      pagination: {
        page,
        limit,
        total: theme._count.words,
        totalPages: Math.ceil(theme._count.words / limit),
      },
    };
  });

  // Get theme statistics
  app.get('/themes/:slug/stats', { preHandler: optionalAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const userId = request.user?.userId;

    const theme = await prisma.theme.findUnique({
      where: { slug },
      include: {
        words: {
          include: {
            word: {
              include: {
                progress: userId
                  ? { where: { userId } }
                  : false,
              },
            },
          },
        },
      },
    });

    if (!theme) {
      return reply.status(404).send({ error: 'Theme not found' });
    }

    const words = theme.words.map(wt => wt.word);
    const totalWords = words.length;
    
    const statusCounts = {
      new: 0,
      learning: 0,
      reviewing: 0,
      mastered: 0,
    };

    words.forEach(word => {
      const progress = word.progress?.[0];
      if (progress) {
        statusCounts[progress.status as keyof typeof statusCounts]++;
      } else {
        statusCounts.new++;
      }
    });

    const levelDistribution: Record<string, number> = {};
    words.forEach(word => {
      const level = word.cefrLevel;
      levelDistribution[level] = (levelDistribution[level] || 0) + 1;
    });

    return {
      themeId: theme.id,
      themeName: theme.name,
      totalWords,
      statusCounts,
      levelDistribution,
      progress: totalWords > 0 
        ? Math.round(((statusCounts.mastered + statusCounts.reviewing) / totalWords) * 100)
        : 0,
    };
  });
}
