import { registerJobHandler, type JobPayload, type JobResult } from './jobs.js';
import prisma from './prisma.js';
import { categorizeWordsBatch, clearLLMConfigCache, THEMES } from './llm.js';

const CHUNK_SIZE = 100; // Words per LLM request

interface CategorizePayload {
  limit?: number;
  overwrite?: boolean;
  themeSlugs?: string[];
}

interface CategorizeResult extends JobResult {
  message: string;
  total: number;
  tagged: number;
  categoryCounts: Record<string, number>;
}

/**
 * Categorize words job handler
 */
registerJobHandler('CATEGORIZE_WORDS', async ({ payload, updateProgress, checkCancelled }) => {
  const config = payload as CategorizePayload;
  const limit = config.limit || 1000;
  const overwrite = config.overwrite || false;
  const themeSlugs = config.themeSlugs || THEMES.map(t => t.slug);

  // Clear LLM config cache to get fresh config
  clearLLMConfigCache();

  // Get themes
  const themes = await prisma.theme.findMany({
    where: { slug: { in: themeSlugs } },
  });
  const themeBySlug = Object.fromEntries(themes.map(t => [t.slug, t]));

  // Get words to categorize
  const words = await prisma.word.findMany({
    where: overwrite ? {} : { themes: { none: {} } },
    select: {
      id: true,
      word: true,
      definition: true,
      partOfSpeech: true,
    },
    take: limit,
  });

  if (words.length === 0) {
    return {
      message: 'No words to categorize',
      total: 0,
      tagged: 0,
      categoryCounts: {},
    };
  }

  const totalWords = words.length;
  const categoryCounts: Record<string, number> = {};
  let tagged = 0;

  // Process in chunks
  const chunks: typeof words[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE));
  }

  for (let i = 0; i < chunks.length; i++) {
    // Check if cancelled
    if (await checkCancelled()) {
      return {
        message: 'Job cancelled',
        total: totalWords,
        tagged,
        categoryCounts,
      };
    }

    const chunk = chunks[i];
    const processedSoFar = i * CHUNK_SIZE;

    // Update progress
    await updateProgress(processedSoFar, totalWords);

    // Categorize chunk
    const chunkResults = await categorizeWordsBatch(
      chunk.map(w => ({
        word: w.word,
        definition: w.definition || undefined,
        partOfSpeech: w.partOfSpeech as string[] | undefined,
      }))
    );

    // Build wordId -> category map
    const wordCategoryMap = new Map(
      chunkResults.map((r, idx) => [chunk[idx].id, r.category])
    );

    // Clear existing themes if overwrite
    if (overwrite) {
      await prisma.wordTheme.deleteMany({
        where: { wordId: { in: chunk.map(w => w.id) } },
      });
    }

    // Insert new theme associations
    const themeInserts: Array<{ wordId: string; themeId: string }> = [];
    
    for (const [wordId, category] of wordCategoryMap) {
      if (category !== 'general' && themeBySlug[category]) {
        themeInserts.push({
          wordId,
          themeId: themeBySlug[category].id,
        });
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        tagged++;
      } else {
        categoryCounts['general'] = (categoryCounts['general'] || 0) + 1;
      }
    }

    // Batch insert themes
    if (themeInserts.length > 0) {
      await prisma.wordTheme.createMany({
        data: themeInserts,
        skipDuplicates: true,
      });
    }
  }

  // Final progress update
  await updateProgress(totalWords, totalWords);

  return {
    message: `Categorized ${totalWords} words`,
    total: totalWords,
    tagged,
    categoryCounts,
  } as CategorizeResult;
});

console.log('Categorize words job handler registered');
