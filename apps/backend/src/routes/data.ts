import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ExportedWord {
  word: string;
  phoneticUs: string;
  phoneticUk: string;
  partOfSpeech: string[];
  definition: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  oxfordList: string;
  cefrLevel: string;
  frequency: number;
  themes: string[];
}

export async function dataRoutes(app: FastifyInstance) {
  // Export words as JSON file
  app.get('/data/export', async (request, reply) => {
    const words = await prisma.word.findMany({
      include: {
        themes: {
          include: {
            theme: {
              select: { slug: true },
            },
          },
        },
      },
      orderBy: { word: 'asc' },
    });

    const exportedWords: ExportedWord[] = words.map((w) => ({
      word: w.word,
      phoneticUs: w.phoneticUs,
      phoneticUk: w.phoneticUk,
      partOfSpeech: w.partOfSpeech as string[],
      definition: w.definition,
      examples: w.examples as string[],
      synonyms: w.synonyms as string[],
      antonyms: w.antonyms as string[],
      oxfordList: w.oxfordList,
      cefrLevel: w.cefrLevel,
      frequency: w.frequency,
      themes: w.themes.map((t) => t.theme.slug),
    }));

    const withDefinition = exportedWords.filter((w) => w.definition).length;
    const byLevel: Record<string, number> = {};
    exportedWords.forEach((w) => {
      byLevel[w.cefrLevel] = (byLevel[w.cefrLevel] || 0) + 1;
    });

    const output = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      totalWords: exportedWords.length,
      stats: {
        withDefinition,
        byLevel,
      },
      words: exportedWords,
    };

    const filename = `vocab-export-${new Date().toISOString().split('T')[0]}.json`;

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    
    return output;
  });

  // Import words from JSON file
  app.post('/data/import', async (request, reply) => {
    const body = request.body as any;
    
    if (!body || !body.words || !Array.isArray(body.words)) {
      return reply.status(400).send({
        error: 'Invalid format. Expected { words: [...] }',
      });
    }

    const words: ImportedWord[] = body.words;
    const options = {
      merge: body.merge !== false, // Default to merge mode
    };

    // Get existing themes
    const existingThemes = await prisma.theme.findMany({
      select: { id: true, slug: true },
    });
    const themeMap = new Map(existingThemes.map((t) => [t.slug, t.id]));

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    // If not merge mode, clear existing data
    if (!options.merge) {
      await prisma.wordTheme.deleteMany();
      await prisma.wordProgress.deleteMany();
      await prisma.sessionWord.deleteMany();
      await prisma.word.deleteMany();
    }

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < words.length; i += batchSize) {
      const batch = words.slice(i, batchSize);

      for (const wordData of batch) {
        try {
          const existing = await prisma.word.findUnique({
            where: { word: wordData.word },
          });

          const word = await prisma.word.upsert({
            where: { word: wordData.word },
            update: {
              phoneticUs: wordData.phoneticUs || '',
              phoneticUk: wordData.phoneticUk || '',
              partOfSpeech: wordData.partOfSpeech || [],
              definition: wordData.definition || '',
              examples: wordData.examples || [],
              synonyms: wordData.synonyms || [],
              antonyms: wordData.antonyms || [],
              oxfordList: wordData.oxfordList || '3000',
              cefrLevel: wordData.cefrLevel || 'A1',
              frequency: wordData.frequency || 0,
            },
            create: {
              word: wordData.word,
              phoneticUs: wordData.phoneticUs || '',
              phoneticUk: wordData.phoneticUk || '',
              partOfSpeech: wordData.partOfSpeech || [],
              definition: wordData.definition || '',
              examples: wordData.examples || [],
              synonyms: wordData.synonyms || [],
              antonyms: wordData.antonyms || [],
              oxfordList: wordData.oxfordList || '3000',
              cefrLevel: wordData.cefrLevel || 'A1',
              frequency: wordData.frequency || 0,
            },
          });

          if (existing) {
            updated++;
          } else {
            created++;
          }

          // Link themes
          if (wordData.themes?.length) {
            for (const themeSlug of wordData.themes) {
              const themeId = themeMap.get(themeSlug);
              if (themeId) {
                await prisma.wordTheme.upsert({
                  where: {
                    wordId_themeId: { wordId: word.id, themeId },
                  },
                  update: {},
                  create: { wordId: word.id, themeId },
                });
              }
            }
          }
        } catch (error: any) {
          failed++;
          errors.push(`${wordData.word}: ${error.message}`);
        }
      }
    }

    return {
      success: true,
      totalProcessed: words.length,
      created,
      updated,
      failed,
      errors: errors.slice(0, 10), // Return first 10 errors
    };
  });

  // Get export stats (preview before downloading)
  app.get('/data/stats', async (request, reply) => {
    const total = await prisma.word.count();
    const withDefinition = await prisma.word.count({
      where: { definition: { not: '' } },
    });

    // For JSON fields, we need to use raw query or count differently
    const allWords = await prisma.word.findMany({
      select: { examples: true },
    });
    const withExamples = allWords.filter((w) => {
      const examples = w.examples as string[];
      return Array.isArray(examples) && examples.length > 0;
    }).length;

    const byLevel = await prisma.word.groupBy({
      by: ['cefrLevel'],
      _count: { id: true },
    });

    const byList = await prisma.word.groupBy({
      by: ['oxfordList'],
      _count: { id: true },
    });

    return {
      total,
      withDefinition,
      withExamples,
      byLevel: byLevel.reduce((acc, item) => {
        acc[item.cefrLevel] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
      byList: byList.reduce((acc, item) => {
        acc[item.oxfordList] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
    };
  });
}

interface ImportedWord {
  word: string;
  phoneticUs?: string;
  phoneticUk?: string;
  partOfSpeech?: string[];
  definition?: string;
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
  oxfordList?: string;
  cefrLevel?: string;
  frequency?: number;
  themes?: string[];
}
