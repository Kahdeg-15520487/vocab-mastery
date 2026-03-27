import { PrismaClient } from '@prisma/client';
import { categorizeWordsBatch, checkLLMAvailability, clearLLMConfigCache, THEMES } from '../lib/llm.js';

const prisma = new PrismaClient();

const CHUNK_SIZE = 100; // Words per LLM request

async function categorizeWords(options: { 
  limit?: number; 
  uncategorizedOnly?: boolean; 
  dryRun?: boolean;
  verbose?: boolean;
}) {
  console.log('🏷️  Word Categorization with LLM');
  console.log('================================\n');
  
  // Clear config cache to get fresh LLM config
  clearLLMConfigCache();
  
  // Check LLM availability
  console.log('Checking LLM availability...');
  const status = await checkLLMAvailability();
  
  if (!status.available) {
    console.error(`❌ LLM not available: ${status.error}`);
    console.log('\nTo configure LLM:');
    console.log('  1. Go to Admin Panel > Config tab');
    console.log('  2. Add an LLM provider (OpenAI, Anthropic, Groq, etc.)');
    console.log('  3. Activate the provider');
    console.log('\nOr set environment variables:');
    console.log('  OPENAI_API_KEY=sk-...');
    process.exit(1);
  }
  
  console.log(`✅ Using ${status.provider} (${status.model})\n`);
  
  // Get themes
  const themes = await prisma.theme.findMany();
  const themeBySlug = Object.fromEntries(themes.map(t => [t.slug, t]));
  console.log(`Loaded ${themes.length} themes`);
  
  // Get words to categorize
  const where: any = {};
  if (options.uncategorizedOnly) {
    where.themes = { none: {} };
  }
  
  const totalUncategorized = await prisma.word.count({ where });
  const limit = options.limit || totalUncategorized;
  
  console.log(`Fetching words (limit: ${limit})...`);
  
  const words = await prisma.word.findMany({
    where,
    select: {
      id: true,
      word: true,
      definition: true,
      partOfSpeech: true,
    },
    take: limit,
    orderBy: { word: 'asc' },
  });
  
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
  let tagged = 0;
  const startTime = Date.now();
  
  // Process in chunks
  const chunks: typeof words[] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE));
  }
  
  console.log(`Processing ${chunks.length} chunk(s) of ${CHUNK_SIZE} words each...\n`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNum = i + 1;
    
    console.log(`\n📦 Chunk ${chunkNum}/${chunks.length} (${chunk.length} words)`);
    console.log('─'.repeat(40));
    
    // Categorize batch
    const results = await categorizeWordsBatch(
      chunk.map(w => ({
        word: w.word,
        definition: w.definition || undefined,
        partOfSpeech: w.partOfSpeech as string[] | undefined,
      }))
    );
    
    // Build wordId -> category map
    const wordCategoryMap = new Map(
      results.map((r, idx) => [chunk[idx].id, r.category])
    );
    
    // Clear existing themes if not uncategorizedOnly
    if (!options.uncategorizedOnly && !options.dryRun) {
      await prisma.wordTheme.deleteMany({
        where: { wordId: { in: chunk.map(w => w.id) } },
      });
    }
    
    // Prepare theme inserts
    const themeInserts: Array<{ wordId: string; themeId: string }> = [];
    
    for (const [wordId, category] of wordCategoryMap) {
      stats[category] = (stats[category] || 0) + 1;
      
      if (category !== 'general' && themeBySlug[category]) {
        themeInserts.push({
          wordId,
          themeId: themeBySlug[category].id,
        });
        tagged++;
      }
      
      if (options.verbose) {
        const word = chunk.find(w => w.id === wordId);
        console.log(`  ${word?.word} → ${category}`);
      }
    }
    
    // Batch insert themes
    if (!options.dryRun && themeInserts.length > 0) {
      await prisma.wordTheme.createMany({
        data: themeInserts,
        skipDuplicates: true,
      });
    }
    
    processed += chunk.length;
    
    // Progress
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = processed / (elapsed || 1);
    const remaining = Math.round((words.length - processed) / rate);
    
    console.log(`\n📊 Progress: ${processed}/${words.length} (${Math.round(processed/words.length*100)}%)`);
    console.log(`   Time: ${elapsed}s | Est. remaining: ${remaining}s`);
    
    // Show chunk summary
    const chunkStats: Record<string, number> = {};
    for (const r of results) {
      chunkStats[r.category] = (chunkStats[r.category] || 0) + 1;
    }
    console.log(`   This chunk: ${Object.entries(chunkStats).map(([c, n]) => `${c}:${n}`).join(', ')}`);
  }
  
  // Summary
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n================================');
  console.log('📊 Categorization Complete');
  console.log('================================');
  console.log(`Processed: ${processed}`);
  console.log(`Tagged: ${tagged}`);
  console.log(`Time: ${elapsed}s (${Math.round(processed / (elapsed || 1))} words/s)`);
  
  console.log(`\nCategories:`);
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    if (count > 0) {
      const pct = Math.round(count / processed * 100);
      console.log(`  ${cat.padEnd(12)} ${count.toString().padStart(5)} (${pct}%)`);
    }
  }
  
  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN - No changes saved to database');
  } else {
    console.log(`\n✅ Saved ${tagged} theme associations to database`);
  }
}

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: undefined as number | undefined,
    uncategorizedOnly: true,
    dryRun: false,
    verbose: false,
  };
  
  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--all') {
      options.uncategorizedOnly = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npm run categorize -w apps/backend [options]

Options:
  --limit=N       Only process N words
  --all           Process all words, including already categorized
  --dry-run       Test without saving to database
  --verbose, -v   Show each word categorization
  --help, -h      Show this help

Examples:
  npm run categorize -w apps/backend                    # Categorize all uncategorized
  npm run categorize -w apps/backend --limit=100        # First 100 uncategorized
  npm run categorize -w apps/backend --all --limit=500  # 500 words, re-categorize
  npm run categorize -w apps/backend --dry-run -v       # Test with verbose output

Configuration:
  Set up LLM provider in Admin Panel > Config tab
  Or use environment variables:
    OPENAI_API_KEY=sk-...
    LLM_MODEL=gpt-4o-mini
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
