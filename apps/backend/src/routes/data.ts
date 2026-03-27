import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';

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
  // All data routes require admin access
  app.addHook('preHandler', requireAdmin);

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

    // Validate word data
    const words: ImportedWord[] = body.words;
    if (words.length > 50000) {
      return reply.status(400).send({
        error: `Too many words. Maximum 50,000 per import. Got ${words.length}`,
      });
    }

    // Validate each word entry
    const validWords: ImportedWord[] = [];
    const validationErrors: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!w.word || typeof w.word !== 'string') {
        validationErrors.push(`Row ${i}: missing or invalid 'word' field`);
        continue;
      }
      const trimmed = w.word.trim().toLowerCase();
      if (trimmed.length === 0 || trimmed.length > 100) {
        validationErrors.push(`Row ${i}: word must be 1-100 characters`);
        continue;
      }
      validWords.push({ ...w, word: trimmed });
    }

    if (validWords.length === 0) {
      return reply.status(400).send({
        error: 'No valid words found in import data',
        validationErrors: validationErrors.slice(0, 10),
      });
    }

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
      await prisma.sessionWord.deleteMany();
      await prisma.word.deleteMany();
    }

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < validWords.length; i += batchSize) {
      const batch = validWords.slice(i, batchSize);

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
      totalProcessed: validWords.length,
      created,
      updated,
      failed,
      validationErrors: validationErrors.slice(0, 10),
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

  // Import Oxford word list (text file content)
  app.post('/data/import-oxford', async (request, reply) => {
    const body = request.body as { content?: string; list?: '3000' | '5000'; merge?: boolean };
    
    if (!body.content || !body.list) {
      return reply.status(400).send({
        error: 'Invalid request. Expected { content: string, list: "3000" | "5000" }',
      });
    }

    const { content, list, merge = true } = body;
    
    // Parse the content
    const parsedWords = parseOxfordContent(content, list);
    
    if (parsedWords.length === 0) {
      return reply.status(400).send({
        error: 'No words found in the file. Make sure it\'s a valid Oxford word list format.',
      });
    }

    // If not merge mode, clear existing words for this list only
    if (!merge) {
      await prisma.wordTheme.deleteMany({
        where: { word: { oxfordList: list } },
      });
      await prisma.wordProgress.deleteMany({
        where: { word: { oxfordList: list } },
      });
      await prisma.sessionWord.deleteMany({
        where: { word: { oxfordList: list } },
      });
      await prisma.word.deleteMany({
        where: { oxfordList: list },
      });
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Get existing words in batch
    const existingWords = await prisma.word.findMany({
      where: { word: { in: parsedWords.map(w => w.word) } },
      select: { word: true, cefrLevel: true, oxfordList: true },
    });
    const existingMap = new Map(existingWords.map(w => [w.word, w]));

    // Process in batches using transaction
    const batchSize = 500;
    for (let i = 0; i < parsedWords.length; i += batchSize) {
      const batch = parsedWords.slice(i, batchSize);
      
      const toCreate: ParsedOxfordWord[] = [];
      const toUpdate: ParsedOxfordWord[] = [];
      
      for (const wordData of batch) {
        const existing = existingMap.get(wordData.word);
        if (existing) {
          if (existing.cefrLevel !== wordData.cefrLevel || existing.oxfordList !== wordData.oxfordList) {
            toUpdate.push(wordData);
          } else {
            skipped++;
          }
        } else {
          toCreate.push(wordData);
        }
      }

      // Batch create new words
      if (toCreate.length > 0) {
        await prisma.$transaction(
          toCreate.map((w) =>
            prisma.word.create({
              data: {
                word: w.word,
                phoneticUs: '',
                phoneticUk: '',
                partOfSpeech: w.partOfSpeech,
                definition: '',
                examples: [],
                synonyms: [],
                antonyms: [],
                oxfordList: w.oxfordList,
                cefrLevel: w.cefrLevel,
                frequency: 0,
              },
            })
          )
        );
        created += toCreate.length;
      }

      // Batch update existing words
      if (toUpdate.length > 0) {
        await prisma.$transaction(
          toUpdate.map((w) =>
            prisma.word.update({
              where: { word: w.word },
              data: {
                cefrLevel: w.cefrLevel,
                oxfordList: w.oxfordList,
                partOfSpeech: w.partOfSpeech,
              },
            })
          )
        );
        updated += toUpdate.length;
      }
    }

    return {
      success: true,
      list,
      totalParsed: parsedWords.length,
      created,
      updated,
      skipped,
      stats: {
        A1: parsedWords.filter(w => w.cefrLevel === 'A1').length,
        A2: parsedWords.filter(w => w.cefrLevel === 'A2').length,
        B1: parsedWords.filter(w => w.cefrLevel === 'B1').length,
        B2: parsedWords.filter(w => w.cefrLevel === 'B2').length,
        C1: parsedWords.filter(w => w.cefrLevel === 'C1').length,
        C2: parsedWords.filter(w => w.cefrLevel === 'C2').length,
      },
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

// Part of speech mapping for Oxford format
const POS_MAP: Record<string, string> = {
  'n.': 'noun',
  'v.': 'verb',
  'adj.': 'adjective',
  'adv.': 'adverb',
  'prep.': 'preposition',
  'conj.': 'conjunction',
  'pron.': 'pronoun',
  'det.': 'determiner',
  'int.': 'interjection',
  'exclam.': 'exclamation',
  'modal.': 'modal verb',
  'phrasal v.': 'phrasal verb',
  'pl.': 'plural noun',
  'sing.': 'singular noun',
  'abbr.': 'abbreviation',
};

interface ParsedOxfordWord {
  word: string;
  cefrLevel: string;
  partOfSpeech: string[];
  oxfordList: '3000' | '5000';
}

function parseOxfordContent(content: string, oxfordList: '3000' | '5000'): ParsedOxfordWord[] {
  const words: ParsedOxfordWord[] = [];
  // Handle both Unix (\n) and Windows (\r\n) line endings
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  
  let currentLevel = '';
  const levelPattern = /^(A1|A2|B1|B2|C1|C2)$/;
  const wordPattern = /^([a-zA-Z\-']+)(?:\s+(.+))?$/;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and headers
    if (!trimmed || trimmed.startsWith('©') || trimmed.startsWith('The Oxford')) {
      continue;
    }
    
    // Skip page numbers
    if (/^\d+\s*\/\s*\d+$/.test(trimmed)) {
      continue;
    }
    
    // Check for CEFR level
    if (levelPattern.test(trimmed)) {
      currentLevel = trimmed;
      continue;
    }
    
    if (!currentLevel) continue;
    
    // Parse word line
    const match = trimmed.match(wordPattern);
    if (match) {
      const word = match[1].toLowerCase();
      const posText = match[2] || '';
      
      if (/\d/.test(word) || word.startsWith('the ')) continue;
      
      // Parse parts of speech
      const partsOfSpeech: string[] = [];
      if (posText) {
        for (const [abbrev, full] of Object.entries(POS_MAP)) {
          if (posText.includes(abbrev) && !partsOfSpeech.includes(full)) {
            partsOfSpeech.push(full);
          }
        }
      }
      
      words.push({
        word,
        cefrLevel: currentLevel,
        partOfSpeech: partsOfSpeech.length > 0 ? partsOfSpeech : ['noun'],
        oxfordList,
      });
    }
  }

  return words;
}
