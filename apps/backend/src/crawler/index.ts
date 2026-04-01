import { PrismaClient } from '@prisma/client';
import { crawlWord, sleep } from './oxford.js';
import type { CrawlerConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const prisma = new PrismaClient();

/**
 * Get words that need crawling (definition is empty)
 * Database IS the progress tracker - no external file needed
 */
async function getWordsToCrawl(config: CrawlerConfig): Promise<Array<{ id: string; word: string; definitionUrl: string | null }>> {
  const words = await prisma.word.findMany({
    where: {
      definition: '',
    },
    select: { id: true, word: true, definitionUrl: true },
    orderBy: { word: 'asc' },
    take: config.batchSize,
  });

  return words;
}

/**
 * Count remaining words to crawl
 */
async function getRemainingCount(): Promise<number> {
  return prisma.word.count({
    where: { definition: '' },
  });
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

  // Get count of remaining words
  const remainingCount = await getRemainingCount();
  console.log(`📊 Words remaining: ${remainingCount}`);

  // Get words to crawl
  console.log('📥 Fetching words from database...');
  const words = await getWordsToCrawl(config);
  console.log(`   Found ${words.length} words to crawl in this batch\n`);

  if (words.length === 0) {
    console.log('✅ No words to crawl. All done!');
    return;
  }

  // Stats for this run
  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  // Process each word
  for (let i = 0; i < words.length; i++) {
    const { id, word } = words[i];
    const num = i + 1;

    console.log(`[${num}/${words.length}] ${word}...`);

    try {
      const result = await crawlWord(word, words[i].definitionUrl);

      if (result.success) {
        if (!config.dryRun) {
          await updateWord(id, result);
        }
        successCount++;
        console.log(`   ✅ ${result.phoneticUs || ''} - ${result.definitions?.[0]?.slice(0, 60)}...`);
      } else {
        failCount++;
        console.log(`   ❌ ${result.error}`);
      }

      // Rate limiting
      if (i < words.length - 1) {
        await sleep(config.delayMs);
      }

    } catch (error: any) {
      failCount++;
      console.log(`   💥 Error: ${error.message}`);
      
      // Longer delay on error
      await sleep(3000);
    }

    // Print summary every 50 words
    if ((i + 1) % 50 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n📊 Batch Progress: ${successCount} ✅ | ${failCount} ❌ | ${elapsed}s elapsed\n`);
    }
  }

  // Print final summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const newRemaining = config.dryRun ? remainingCount : await getRemainingCount();
  
  console.log('\n==============================');
  console.log('📊 Batch Summary');
  console.log('==============================');
  console.log(`Processed: ${words.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⏱️  Time: ${elapsed}s`);
  console.log(`📈 Words remaining: ${newRemaining}`);
  
  if (config.dryRun) {
    console.log('\n⚠️  DRY RUN - No changes saved to database');
  }
  
  if (newRemaining > 0) {
    console.log(`\n💡 Run again to continue crawling (${newRemaining} words left)`);
  } else {
    console.log('\n🎉 All words crawled!');
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
    } else if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg === '--help') {
      console.log(`
Usage: npm run crawl [options]

Options:
  --batch=N     Number of words to process (default: 100)
  --delay=N     Delay between requests in ms (default: 1500)
  --dry-run     Test without saving to database
  --help        Show this help

The database tracks progress automatically:
- Words with empty 'definition' are crawled
- Words with definitions are skipped
- Just run 'npm run crawl' repeatedly until done
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
