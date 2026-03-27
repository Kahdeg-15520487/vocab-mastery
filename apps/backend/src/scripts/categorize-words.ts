import { PrismaClient } from '@prisma/client';
import { categorizeWordsBatch, checkLLMAvailability, clearLLMConfigCache, THEMES } from '../lib/llm.js';

const prisma = new PrismaClient();

const CHUNK_SIZE = 100; // Words per LLM request
const MAX_RETRIES = 2;  // Retries per chunk on failure

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
  
  // Count words to categorize
  const where: any = {};
  if (options.uncategorizedOnly) {
    where.themes = { none: {} };
  }
  
  const totalCount = await prisma.word.count({ where });
  const effectiveLimit = options.limit ? Math.min(options.limit, totalCount) : totalCount;
  
  console.log(`Found ${totalCount} words (processing ${effectiveLimit})\n`);
  
  if (effectiveLimit === 0) {
    console.log('✅ No words to categorize!');
    return;
  }
  
  // Stats
  const stats: Record<string, number> = {};
  for (const theme of THEMES) {
    stats[theme.slug] = 0;
  }
  
  let processed = 0;
  let tagged = 0;
  let errorCount = 0;
  const startTime = Date.now();
  const totalChunks = Math.ceil(effectiveLimit / CHUNK_SIZE);
  
  // Process in chunks — fetch from DB chunk by chunk
  for (let offset = 0; offset < effectiveLimit; offset += CHUNK_SIZE) {
    const chunkNum = Math.floor(offset / CHUNK_SIZE) + 1;
    const chunkSize = Math.min(CHUNK_SIZE, effectiveLimit - offset);
    
    console.log(`\n📦 Chunk ${chunkNum}/${totalChunks} (${chunkSize} words)`);
    console.log('─'.repeat(40));
    
    // Fetch chunk from DB
    const chunk = await prisma.word.findMany({
      where,
      select: {
        id: true,
        word: true,
        definition: true,
        partOfSpeech: true,
      },
      orderBy: { word: 'asc' },
      skip: offset,
      take: chunkSize,
    });
    
    if (chunk.length === 0) break;
    
    // Categorize with retries
    let results: Array<{ word: string; category: string }> | null = null;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        results = await categorizeWordsBatch(
          chunk.map(w => ({
            word: w.word,
            definition: w.definition || undefined,
            partOfSpeech: w.partOfSpeech as string[] | undefined,
          }))
        );
        break;
      } catch (err: any) {
        console.error(`   ❌ Attempt ${attempt + 1} failed: ${err.message}`);
        
        if (attempt < MAX_RETRIES) {
          const waitMs = 2000 * Math.pow(2, attempt);
          console.log(`   Retrying in ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
        } else {
          console.error(`   ❌ All retries exhausted for this chunk`);
          errorCount += chunk.length;
        }
      }
    }
    
    if (!results) {
      processed += chunk.length;
      continue;
    }
    
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
    
    // Prepare theme inserts (include 'general' to mark as categorized)
    const themeInserts: Array<{ wordId: string; themeId: string }> = [];
    
    for (const [wordId, category] of wordCategoryMap) {
      stats[category] = (stats[category] || 0) + 1;
      
      if (themeBySlug[category]) {
        themeInserts.push({
          wordId,
          themeId: themeBySlug[category].id,
        });
        if (category !== 'general') {
          tagged++;
        }
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
    const remaining = Math.round((effectiveLimit - processed) / rate);
    
    console.log(`\n📊 Progress: ${processed}/${effectiveLimit} (${Math.round(processed/effectiveLimit*100)}%)`);
    console.log(`   Time: ${elapsed}s | Est. remaining: ${remaining}s`);
    
    if (errorCount > 0) {
      console.log(`   ⚠️  Errors: ${errorCount}`);
    }
    
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
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
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
