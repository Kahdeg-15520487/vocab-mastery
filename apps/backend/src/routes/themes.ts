import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { optionalAuth } from '../middleware/auth.js';

export async function themeRoutes(app: FastifyInstance) {
  // Get all themes (public)
  app.get('/themes', async (_request, _reply) => {
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
    const { page = 1, limit = 20, topic, subtopic } = request.query as { page?: number; limit?: number; topic?: string; subtopic?: string };
    const userId = request.user?.userId;

    const theme = await prisma.theme.findUnique({
      where: { slug },
      include: {
        words: {
          where: {
            ...(topic ? { topic } : {}),
            ...(subtopic ? { subtopic } : {}),
          },
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
      topic: wt.topic,
      subtopic: wt.subtopic,
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

  // GET /themes/:slug/topics — topics and subtopics for a theme
  app.get('/themes/:slug/topics', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const theme = await prisma.theme.findUnique({ where: { slug } });
    if (!theme) return reply.status(404).send({ error: 'Theme not found' });

    // Get all unique topic → subtopic combos with counts
    const wordThemes = await prisma.wordTheme.findMany({
      where: { themeId: theme.id, topic: { not: null } },
      select: { topic: true, subtopic: true },
    });

    // Build hierarchy
    const topics = new Map<string, Map<string, number>>();
    for (const wt of wordThemes) {
      if (!wt.topic) continue;
      if (!topics.has(wt.topic)) topics.set(wt.topic, new Map());
      const subs = topics.get(wt.topic)!;
      subs.set(wt.subtopic || 'General', (subs.get(wt.subtopic || 'General') || 0) + 1);
    }

    const result = [...topics.entries()].map(([topic, subs]) => ({
      name: topic,
      subtopics: [...subs.entries()].map(([name, count]) => ({ name, count })),
      totalCount: [...subs.values()].reduce((a, b) => a + b, 0),
    }));

    return { topics: result };
  });
}
