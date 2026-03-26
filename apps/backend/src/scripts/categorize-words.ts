import { PrismaClient } from '@prisma/client';
import { categorizeWord, checkLLMAvailability, THEMES } from '../lib/llm.js';

const prisma = new PrismaClient();

// Get theme ID by slug
const themeMap = new Map<string, string>();

async function loadThemes() {
  const themes = await prisma.theme.findMany();
  for (const theme of themes) {
    themeMap.set(theme.slug, theme.id);
  }
  console.log(`Loaded ${themes.length} themes`);
}

async function getWordsToCategorize(options: { limit?: number; uncategorizedOnly?: boolean }) {
  const where: any = {};
  
  if (options.uncategorizedOnly) {
    where.themes = { none: {} };
  }
  
  const words = await prisma.word.findMany({
    where,
    select: {
      id: true,
      word: true,
      definition: true,
      partOfSpeech: true,
    },
    take: options.limit,
    orderBy: { word: 'asc' },
  });
  
  return words;
}

async function categorizeWords(options: { limit?: number; uncategorizedOnly?: boolean; dryRun?: boolean }) {
  console.log('🏷️  Word Categorization with LLM');
  console.log('================================\n');
  
  // Check LLM availability
  console.log('Checking LLM availability...');
  const status = await checkLLMAvailability();
  
  if (!status.available) {
    console.error(`❌ LLM not available: ${status.error}`);
    console.log('\nTo use OpenAI:');
    console.log('  1. Get API key from https://platform.openai.com/api-keys');
    console.log('  2. Set OPENAI_API_KEY in .env or configure in Admin Panel');
    console.log('\nOr configure via Admin Panel > Config tab');
    process.exit(1);
  }
  
  console.log(`✅ Using ${status.provider} (${status.model})\n`);
  
  // Load themes
  await loadThemes();
  
  // Get words
  console.log('Fetching words...');
  const words = await getWordsToCategorize(options);
  console.log(`Found ${words.length} words to categorize\n`);
  
  if (words.length === 0) {
    console.log('✅ No words to categorize!');
    return;
  }
  
  // Stats
  const stats: Record<string, number> = { general: 0 };
  for (const theme of THEMES) {
    stats[theme.slug] = 0;
  }
  
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  
  // Process words
  for (const wordData of words) {
    processed++;
    console.log(`[${processed}/${words.length}] ${wordData.word}...`);
    
    try {
      const category = await categorizeWord(
        wordData.word,
        wordData.definition || undefined,
        wordData.partOfSpeech as string[] | undefined
      );
      
      stats[category] = (stats[category] || 0) + 1;
      console.log(`   → ${category}`);
      
      // Save to database (unless dry run)
      if (!options.dryRun && category !== 'general') {
        const themeId = themeMap.get(category);
        if (themeId) {
          await prisma.wordTheme.upsert({
            where: {
              wordId_themeId: {
                wordId: wordData.id,
                themeId,
              },
            },
            update: {},
            create: {
              wordId: wordData.id,
              themeId,
            },
          });
        }
      }
      
      // Small delay to avoid overwhelming the LLM
      await new Promise(r => setTimeout(r, 100));
      
    } catch (error: any) {
      errors++;
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    // Progress every 50 words
    if (processed % 50 === 0) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n📊 Progress: ${processed}/${words.length} (${elapsed}s)\n`);
    }
  }
  
  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n================================');
  console.log('📊 Categorization Complete');
  console.log('================================');
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`\nCategories:`);
  
  for (const [cat, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    if (count > 0) {
      console.log(`  ${cat}: ${count}`);
    }
  }
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN - No changes saved to database');
  }
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: undefined as number | undefined,
    uncategorizedOnly: true,
    dryRun: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--all') {
      options.uncategorizedOnly = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help') {
      console.log(`
Usage: npm run categorize [options]

Options:
  --limit=N     Only process N words
  --all         Process all words (default: only uncategorized)
  --dry-run     Test without saving to database
  --help        Show this help

Environment:
  LLM_PROVIDER   "openai" (default) or "anthropic"
  LLM_MODEL      Model to use (default: gpt-4o-mini)
  OPENAI_API_KEY Required if LLM_PROVIDER=openai
`);
      process.exit(0);
    }
  }
  
  return options;
}

// Run
categorizeWords(parseArgs())
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
