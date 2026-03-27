import { registerJobHandler, type JobResult } from './jobs.js';
import prisma from './prisma.js';
import { categorizeWordsBatch, checkLLMAvailability, clearLLMConfigCache, THEMES } from './llm.js';

const CHUNK_SIZE = 100; // Words per LLM request
const MAX_RETRIES = 2;  // Retries per chunk on failure

interface CategorizePayload {
  limit?: number;
  overwrite?: boolean;
  themeSlugs?: string[];
}

interface CategorizeResult extends JobResult {
  message: string;
  total: number;
  tagged: number;
  errors: number;
  categoryCounts: Record<string, number>;
}

/**
 * Categorize words job handler
 */
registerJobHandler('CATEGORIZE_WORDS', async ({ payload, updateProgress, checkCancelled }) => {
  const config = payload as CategorizePayload;
  const limit = config.limit || 0; // 0 = all
  const overwrite = config.overwrite || false;
  const themeSlugs = config.themeSlugs || THEMES.map(t => t.slug);

  // Clear LLM config cache to get fresh config
  clearLLMConfigCache();

  // 1. Check LLM availability first
  console.log('[categorize-job] Checking LLM availability...');
  const status = await checkLLMAvailability();

  if (!status.available) {
    throw new Error(`LLM not available: ${status.error}. Configure a provider in Admin > Config.`);
  }

  console.log(`[categorize-job] Using ${status.provider} (${status.model})`);

  // 2. Get themes
  const themes = await prisma.theme.findMany({
    where: { slug: { in: themeSlugs } },
  });
  const themeBySlug = Object.fromEntries(themes.map(t => [t.slug, t]));

  // 3. Count words to process
  const totalCount = await prisma.word.count({
    where: overwrite ? {} : { themes: { none: {} } },
  });

  if (totalCount === 0) {
    return {
      message: 'No words to categorize',
      total: 0,
      tagged: 0,
      errors: 0,
      categoryCounts: {},
    };
  }

  const effectiveLimit = limit > 0 ? Math.min(limit, totalCount) : totalCount;
  console.log(`[categorize-job] Processing ${effectiveLimit} words (${totalCount} available, chunks of ${CHUNK_SIZE})`);

  // 4. Process in chunks — fetch from DB chunk by chunk to save memory
  const categoryCounts: Record<string, number> = {};
  let processed = 0;
  let tagged = 0;
  let errors = 0;

  for (let offset = 0; offset < effectiveLimit; offset += CHUNK_SIZE) {
    // Check if cancelled
    if (await checkCancelled()) {
      console.log(`[categorize-job] Cancelled at ${processed}/${effectiveLimit}`);
      return {
        message: `Job cancelled after processing ${processed} words`,
        total: processed,
        tagged,
        errors,
        categoryCounts,
      } as CategorizeResult;
    }

    // Update progress
    await updateProgress(processed, effectiveLimit);

    // Fetch chunk from DB (ordered for consistency)
    const chunk = await prisma.word.findMany({
      where: overwrite ? {} : { themes: { none: {} } },
      select: {
        id: true,
        word: true,
        definition: true,
        partOfSpeech: true,
      },
      orderBy: { word: 'asc' },
      skip: offset,
      take: Math.min(CHUNK_SIZE, effectiveLimit - offset),
    });

    if (chunk.length === 0) break;

    console.log(`[categorize-job] Chunk ${Math.floor(offset / CHUNK_SIZE) + 1}: ${chunk.length} words`);

    // Categorize with retries
    let chunkResults: Array<{ word: string; category: string }> | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        chunkResults = await categorizeWordsBatch(
          chunk.map(w => ({
            word: w.word,
            definition: w.definition || undefined,
            partOfSpeech: w.partOfSpeech as string[] | undefined,
          }))
        );
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err.message;
        console.error(`[categorize-job] Chunk failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError}`);
        
        if (attempt < MAX_RETRIES) {
          // Wait before retry (exponential backoff)
          const waitMs = 2000 * Math.pow(2, attempt);
          console.log(`[categorize-job] Retrying in ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    }

    if (!chunkResults) {
      // All retries failed — mark chunk as errors, continue with next chunk
      console.error(`[categorize-job] Chunk at offset ${offset} failed after ${MAX_RETRIES + 1} attempts: ${lastError}`);
      errors += chunk.length;
      processed += chunk.length;
      continue;
    }

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

    // Insert new theme associations (include 'general' to mark as categorized)
    const themeInserts: Array<{ wordId: string; themeId: string }> = [];

    for (const [wordId, category] of wordCategoryMap) {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;

      // Save all categories including 'general' to mark as categorized
      if (themeBySlug[category]) {
        themeInserts.push({
          wordId,
          themeId: themeBySlug[category].id,
        });
        if (category !== 'general') {
          tagged++;
        }
      }
    }

    // Batch insert themes
    if (themeInserts.length > 0) {
      await prisma.wordTheme.createMany({
        data: themeInserts,
        skipDuplicates: true,
      });
    }

    processed += chunk.length;

    console.log(
      `[categorize-job] Progress: ${processed}/${effectiveLimit} ` +
      `(${Math.round(processed / effectiveLimit * 100)}%) ` +
      `| Tagged: ${tagged} | Errors: ${errors}`
    );
  }

  // Final progress update
  await updateProgress(processed, effectiveLimit);

  const message = errors > 0
    ? `Categorized ${processed} words (${errors} errors, ${tagged} tagged)`
    : `Categorized ${processed} words (${tagged} tagged)`;

  console.log(`[categorize-job] ${message}`);

  return {
    message,
    total: processed,
    tagged,
    errors,
    categoryCounts,
  } as CategorizeResult;
});

console.log('Categorize words job handler registered');
