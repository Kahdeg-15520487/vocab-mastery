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
  app.get('/data/export', async (_request, reply) => {
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
      const batch = validWords.slice(i, i + batchSize);

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
  app.get('/data/stats', async (_request, _reply) => {
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

  // Import Oxford JSON format (from datas/oxford-5000-vocabulary-audio-definition)
  app.post('/data/import-oxford-json', async (request, reply) => {
    const body = request.body as { 
      words: Record<string, OxfordJsonWord>; 
      list?: '3000' | '5000';
      merge?: boolean;
    };
    
    if (!body.words || typeof body.words !== 'object') {
      return reply.status(400).send({
        error: 'Invalid format. Expected { words: { "0": { word, type, cefr, ... }, ... } }',
      });
    }

    const wordEntries = Object.values(body.words);
    const list = body.list || '3000';
    const merge = body.merge !== false;

    if (wordEntries.length === 0) {
      return reply.status(400).send({
        error: 'No words found in the import data',
      });
    }

    if (wordEntries.length > 50000) {
      return reply.status(400).send({
        error: `Too many words. Maximum 50,000 per import. Got ${wordEntries.length}`,
      });
    }

    // Parse and validate words
    const validWords: ParsedOxfordJsonWord[] = [];
    const validationErrors: string[] = [];
    
    for (let i = 0; i < wordEntries.length; i++) {
      const w = wordEntries[i];
      if (!w.word || typeof w.word !== 'string') {
        validationErrors.push(`Entry ${i}: missing or invalid 'word' field`);
        continue;
      }
      
      const word = w.word.trim().toLowerCase();
      if (word.length === 0 || word.length > 100) {
        validationErrors.push(`Entry ${i}: word must be 1-100 characters`);
        continue;
      }

      // Parse CEFR level (convert to uppercase)
      const cefrLevel = (w.cefr || 'a1').toUpperCase();
      if (!['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(cefrLevel)) {
        validationErrors.push(`Entry ${i}: invalid CEFR level '${w.cefr}'`);
        continue;
      }

      // Parse part of speech
      const partOfSpeech = parsePartOfSpeech(w.type);
      
      // Parse example (may contain multiple sentences)
      const examples: string[] = [];
      if (w.example) {
        // Split by common delimiters and clean up
        const exampleText = w.example.replace(/\s+/g, ' ').trim();
        if (exampleText) {
          examples.push(exampleText);
        }
      }

      validWords.push({
        word,
        cefrLevel,
        partOfSpeech,
        definition: w.definition || '',
        examples,
        phoneticBr: w.phon_br || '',
        phoneticNam: w.phon_n_am || '',
        oxfordList: list,
      });
    }

    if (validWords.length === 0) {
      return reply.status(400).send({
        error: 'No valid words found',
        validationErrors: validationErrors.slice(0, 10),
      });
    }

    // Deduplicate words within the import (keep first occurrence)
    const uniqueWordMap = new Map<string, ParsedOxfordJsonWord>();
    for (const w of validWords) {
      if (!uniqueWordMap.has(w.word)) {
        uniqueWordMap.set(w.word, w);
      }
    }
    const uniqueWords = Array.from(uniqueWordMap.values());

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
      where: { word: { in: uniqueWords.map(w => w.word) } },
      select: { word: true, id: true },
    });
    const existingMap = new Map(existingWords.map(w => [w.word, w]));

    // Process in batches
    const batchSize = 500;
    for (let i = 0; i < uniqueWords.length; i += batchSize) {
      const batch = uniqueWords.slice(i, i + batchSize);
      
      const toCreate: ParsedOxfordJsonWord[] = [];
      const toUpdate: ParsedOxfordJsonWord[] = [];
      
      for (const wordData of batch) {
        const existing = existingMap.get(wordData.word);
        if (existing) {
          toUpdate.push(wordData);
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
                phoneticUs: w.phoneticNam,
                phoneticUk: w.phoneticBr,
                partOfSpeech: w.partOfSpeech,
                definition: w.definition,
                examples: w.examples,
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
                phoneticUs: w.phoneticNam,
                phoneticUk: w.phoneticBr,
                partOfSpeech: w.partOfSpeech,
                definition: w.definition,
                examples: w.examples,
                cefrLevel: w.cefrLevel,
                oxfordList: w.oxfordList,
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
      totalParsed: wordEntries.length,
      validWords: validWords.length,
      uniqueWords: uniqueWords.length,
      created,
      updated,
      skipped,
      validationErrors: validationErrors.slice(0, 10),
      stats: {
        A1: uniqueWords.filter(w => w.cefrLevel === 'A1').length,
        A2: uniqueWords.filter(w => w.cefrLevel === 'A2').length,
        B1: uniqueWords.filter(w => w.cefrLevel === 'B1').length,
        B2: uniqueWords.filter(w => w.cefrLevel === 'B2').length,
        C1: uniqueWords.filter(w => w.cefrLevel === 'C1').length,
        C2: uniqueWords.filter(w => w.cefrLevel === 'C2').length,
      },
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

    // Deduplicate words within the import (keep first occurrence)
    const uniqueWordMap = new Map<string, typeof parsedWords[0]>();
    for (const w of parsedWords) {
      if (!uniqueWordMap.has(w.word)) {
        uniqueWordMap.set(w.word, w);
      }
    }
    const uniqueParsedWords = Array.from(uniqueWordMap.values());
    
    if (uniqueParsedWords.length === 0) {
      return reply.status(400).send({
        error: 'No valid words found in the file. Make sure it\'s a valid Oxford word list format.',
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
      where: { word: { in: uniqueParsedWords.map(w => w.word) } },
      select: { word: true, cefrLevel: true, oxfordList: true },
    });
    const existingMap = new Map(existingWords.map(w => [w.word, w]));

    // Process in batches using transaction
    const batchSize = 500;
    for (let i = 0; i < uniqueParsedWords.length; i += batchSize) {
      const batch = uniqueParsedWords.slice(i, i + batchSize);
      
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
      totalParsed: uniqueParsedWords.length,
      created,
      updated,
      skipped,
      stats: {
        A1: uniqueParsedWords.filter(w => w.cefrLevel === 'A1').length,
        A2: uniqueParsedWords.filter(w => w.cefrLevel === 'A2').length,
        B1: uniqueParsedWords.filter(w => w.cefrLevel === 'B1').length,
        B2: uniqueParsedWords.filter(w => w.cefrLevel === 'B2').length,
        C1: uniqueParsedWords.filter(w => w.cefrLevel === 'C1').length,
        C2: uniqueParsedWords.filter(w => w.cefrLevel === 'C2').length,
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

// Oxford JSON format from datas/oxford-5000-vocabulary-audio-definition
interface OxfordJsonWord {
  word: string;
  type: string; // e.g., "indefinite article", "verb", "noun"
  cefr: string; // e.g., "a1", "b2"
  phon_br?: string; // British phonetic
  phon_n_am?: string; // American phonetic
  definition?: string;
  example?: string;
  uk?: string; // UK audio file
  us?: string; // US audio file
}

interface ParsedOxfordJsonWord {
  word: string;
  cefrLevel: string;
  partOfSpeech: string[];
  definition: string;
  examples: string[];
  phoneticBr: string;
  phoneticNam: string;
  oxfordList: string;
}

// Parse part of speech from Oxford JSON type field
function parsePartOfSpeech(type: string): string[] {
  const parts: string[] = [];
  const typeLower = type.toLowerCase().trim();
  
  // Direct mappings
  const typeMap: Record<string, string> = {
    'noun': 'noun',
    'verb': 'verb',
    'adjective': 'adjective',
    'adverb': 'adverb',
    'preposition': 'preposition',
    'conjunction': 'conjunction',
    'pronoun': 'pronoun',
    'determiner': 'determiner',
    'interjection': 'interjection',
    'exclamation': 'exclamation',
    'abbreviation': 'abbreviation',
    'modal verb': 'modal verb',
    'phrasal verb': 'phrasal verb',
    'indefinite article': 'article',
    'definite article': 'article',
    'ordinal number': 'number',
    'cardinal number': 'number',
    'symbol': 'symbol',
    'prefix': 'prefix',
    'suffix': 'suffix',
    'plural noun': 'plural noun',
    'singular noun': 'singular noun',
  };

  // Check for exact match first
  if (typeMap[typeLower]) {
    return [typeMap[typeLower]];
  }

  // Check for compound types (e.g., "noun, adjective")
  for (const [key, value] of Object.entries(typeMap)) {
    if (typeLower.includes(key) && !parts.includes(value)) {
      parts.push(value);
    }
  }

  // Handle special cases
  if (typeLower.includes('adjective') && typeLower.includes('adverb')) {
    if (!parts.includes('adjective')) parts.push('adjective');
    if (!parts.includes('adverb')) parts.push('adverb');
  }

  return parts.length > 0 ? parts : ['noun']; // Default to noun
}
