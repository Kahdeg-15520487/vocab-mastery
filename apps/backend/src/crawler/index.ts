import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { crawlWord, sleep } from './oxford.js';
import type { CrawlerConfig, CrawlProgress } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Progress file path
const PROGRESS_FILE = path.join(__dirname, '../../../.crawl-progress.json');

/**
 * Load progress from file
 */
function loadProgress(): CrawlProgress | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load progress file:', error);
  }
  return null;
}

/**
 * Save progress to file
 */
function saveProgress(progress: CrawlProgress): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error('Failed to save progress file:', error);
  }
}

/**
 * Get words that need crawling
 */
async function getWordsToCrawl(config: CrawlerConfig): Promise<Array<{ id: string; word: string }>> {
  const where: any = {
    definition: '',
  };

  // If resuming, start from last word
  if (config.resume && config.startFrom) {
    where.word = { gt: config.startFrom };
  }

  const words = await prisma.word.findMany({
    where,
    select: { id: true, word: true },
    orderBy: { word: 'asc' },
    take: config.batchSize,
  });

  return words;
}

/**
 * Update word in database with crawl results
 */
async function updateWord(
  wordId: string,
  result: Awaited<ReturnType<typeof crawlWord>>
): Promise<void> {
  if (!result.success) return;

  await prisma.word.update({
    where: { id: wordId },
    data: {
      phoneticUs: result.phoneticUs || '',
      phoneticUk: result.phoneticUk || '',
      partOfSpeech: result.partOfSpeech || [],
      definition: result.definitions?.join('\n\n') || '',
      examples: result.examples || [],
      synonyms: result.synonyms || [],
      antonyms: result.antonyms || [],
    },
  });
}

/**
 * Main crawler function
 */
async function runCrawler(config: CrawlerConfig = DEFAULT_CONFIG): Promise<void> {
  console.log('🕷️  Oxford Dictionary Crawler');
  console.log('==============================\n');

  // Load previous progress if resuming
  let progress: CrawlProgress;
  if (config.resume) {
    const saved = loadProgress();
    if (saved) {
      progress = saved;
      config.startFrom = saved.lastWord;
      console.log(`📂 Resuming from: ${saved.lastWord}`);
      console.log(`   Previous: ${saved.successCount} success, ${saved.failCount} failed\n`);
    } else {
      progress = {
        totalProcessed: 0,
        successCount: 0,
        failCount: 0,
        skippedCount: 0,
        lastWord: '',
        startTime: new Date().toISOString(),
      };
    }
  } else {
    progress = {
      totalProcessed: 0,
      successCount: 0,
      failCount: 0,
      skippedCount: 0,
      lastWord: '',
      startTime: new Date().toISOString(),
    };
  }

  // Get words to crawl
  console.log('📥 Fetching words from database...');
  const words = await getWordsToCrawl(config);
  console.log(`   Found ${words.length} words to crawl\n`);

  if (words.length === 0) {
    console.log('✅ No words to crawl. All done!');
    return;
  }

  // Process each word
  for (let i = 0; i < words.length; i++) {
    const { id, word } = words[i];
    const num = i + 1;

    console.log(`[${num}/${words.length}] ${word}...`);

    try {
      const result = await crawlWord(word);

      if (result.success) {
        if (!config.dryRun) {
          await updateWord(id, result);
        }
        progress.successCount++;
        console.log(`   ✅ ${result.phoneticUs || ''} - ${result.definitions?.[0]?.slice(0, 60)}...`);
      } else {
        progress.failCount++;
        console.log(`   ❌ ${result.error}`);
      }

      progress.totalProcessed++;
      progress.lastWord = word;

      // Save progress every 10 words
      if (progress.totalProcessed % 10 === 0) {
        saveProgress(progress);
      }

      // Rate limiting
      if (i < words.length - 1) {
        await sleep(config.delayMs);
      }

    } catch (error: any) {
      progress.failCount++;
      console.log(`   💥 Error: ${error.message}`);
      
      // Longer delay on error
      await sleep(3000);
    }

    // Print summary every 50 words
    if (progress.totalProcessed % 50 === 0) {
      console.log(`\n📊 Progress: ${progress.successCount} ✅ | ${progress.failCount} ❌\n`);
    }
  }

  // Final save
  progress.endTime = new Date().toISOString();
  saveProgress(progress);

  // Print final summary
  console.log('\n==============================');
  console.log('📊 Final Summary');
  console.log('==============================');
  console.log(`Total processed: ${progress.totalProcessed}`);
  console.log(`✅ Success: ${progress.successCount}`);
  console.log(`❌ Failed: ${progress.failCount}`);
  console.log(`⏱️  Started: ${progress.startTime}`);
  console.log(`⏱️  Ended: ${progress.endTime}`);
  
  if (config.dryRun) {
    console.log('\n⚠️  DRY RUN - No changes saved to database');
  }
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CrawlerConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (const arg of args) {
    if (arg.startsWith('--batch=')) {
      config.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--delay=')) {
      config.delayMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--no-resume') {
      config.resume = false;
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--help') {
      console.log(`
Usage: npm run crawl [options]

Options:
  --batch=N     Number of words to process (default: 100)
  --delay=N     Delay between requests in ms (default: 1500)
  --no-resume   Start from beginning instead of resuming
  --dry-run     Test without saving to database
  --help        Show this help
`);
      process.exit(0);
    }
  }

  return config;
}

// Run crawler
runCrawler(parseArgs())
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
