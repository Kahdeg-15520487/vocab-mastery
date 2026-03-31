/**
 * Import Oxford Topic Words
 * 
 * Replaces existing LLM-categorized themes with Oxford topic categories.
 * - 18 categories → Theme entries
 * - 3,611 overlapping words get WordTheme associations (replacing old LLM themes)
 * - 18,525 new words get Word + WordTheme entries (minimal data, no definitions)
 * - topic/subtopic stored on WordTheme join table
 * 
 * Usage: npx tsx prisma/import-oxford-topics.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface TopicWord {
  word: string;
  pos: string;
  cefr: string;
  category: string;
  topic: string;
  subtopic: string;
  definitionUrl: string;
}

// Category → icon mapping
const CATEGORY_ICONS: Record<string, string> = {
  'Animals': '🐾',
  'Appearance': '👤',
  'Communication': '💬',
  'Culture': '🎭',
  'Food and drink': '🍽️',
  'Functions': '🔀',
  'Health': '🏥',
  'Homes and buildings': '🏠',
  'Leisure': '🎮',
  'Notions': '💡',
  'People': '👥',
  'Politics and society': '🏛️',
  'Science and technology': '🔬',
  'Sport': '⚽',
  'The natural world': '🌍',
  'Time and space': '⏰',
  'Travel': '✈️',
  'Work and business': '💼',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function main() {
  const dataPath = path.resolve(import.meta.dirname, '../../../../oxford_topics_dict/output/words_flat.json');
  console.log(`Loading data from ${dataPath}...`);
  
  const rawData: TopicWord[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`Loaded ${rawData.length} entries (${new Set(rawData.map(w => w.word.toLowerCase())).size} unique words)`);

  // Group by unique word → entries (a word can appear in multiple categories)
  const wordEntries = new Map<string, TopicWord[]>();
  for (const entry of rawData) {
    const key = entry.word.toLowerCase();
    if (!wordEntries.has(key)) wordEntries.set(key, []);
    wordEntries.get(key)!.push(entry);
  }
  const uniqueWords = [...wordEntries.keys()];
  console.log(`Unique lowercased words: ${uniqueWords.length}`);

  // ─── Step 1: Clear old themes and word_themes ───
  console.log('\n📦 Step 1: Clearing old themes...');
  const deletedWT = await prisma.wordTheme.deleteMany({});
  console.log(`  Deleted ${deletedWT.count} word_theme associations`);
  const deletedThemes = await prisma.theme.deleteMany({});
  console.log(`  Deleted ${deletedThemes.count} old themes`);

  // ─── Step 2: Create 18 category Themes ───
  console.log('\n🏷️  Step 2: Creating category themes...');
  const categories = [...new Set(rawData.map(w => w.category))];
  
  const themeMap = new Map<string, string>(); // category name → theme ID
  for (const cat of categories) {
    const slug = slugify(cat);
    const theme = await prisma.theme.create({
      data: {
        name: cat,
        slug,
        icon: CATEGORY_ICONS[cat] || '📝',
        description: `Oxford topic category: ${cat}`,
      },
    });
    themeMap.set(cat, theme.id);
  }
  console.log(`  Created ${categories.length} themes`);

  // ─── Step 3: Find overlapping words (already in DB) ───
  console.log('\n🔍 Step 3: Finding overlapping words...');
  
  // Process in batches to avoid memory issues
  const BATCH_SIZE = 500;
  const existingWordMap = new Map<string, string>(); // lowercase word → word ID
  
  // First get all existing words
  const totalExisting = await prisma.word.count();
  console.log(`  Total existing words in DB: ${totalExisting}`);
  
  for (let offset = 0; offset < totalExisting; offset += BATCH_SIZE) {
    const batch = await prisma.word.findMany({
      select: { id: true, word: true },
      skip: offset,
      take: BATCH_SIZE,
    });
    for (const w of batch) {
      existingWordMap.set(w.word.toLowerCase(), w.id);
    }
  }
  console.log(`  Loaded ${existingWordMap.size} existing words`);

  // ─── Step 4: Process overlapping words — add WordTheme ───
  console.log('\n🔗 Step 4: Adding themes to existing words...');
  
  const overlapWords = uniqueWords.filter(w => existingWordMap.has(w));
  console.log(`  Overlapping words: ${overlapWords.length}`);
  
  let overlapProcessed = 0;
  const wordThemeBatch: Array<{ wordId: string; themeId: string; topic: string; subtopic: string }> = [];
  
  for (const wordLower of overlapWords) {
    const wordId = existingWordMap.get(wordLower)!;
    const entries = wordEntries.get(wordLower)!;
    
    // A word can belong to multiple categories — create one WordTheme per category
    const seenCategories = new Set<string>();
    for (const entry of entries) {
      const catKey = entry.category;
      if (seenCategories.has(catKey)) continue;
      seenCategories.add(catKey);
      
      wordThemeBatch.push({
        wordId,
        themeId: themeMap.get(catKey)!,
        topic: entry.topic,
        subtopic: entry.subtopic,
      });
    }
  }
  
  // Batch insert WordThemes for existing words
  for (let i = 0; i < wordThemeBatch.length; i += BATCH_SIZE) {
    const batch = wordThemeBatch.slice(i, i + BATCH_SIZE);
    await prisma.wordTheme.createMany({ data: batch, skipDuplicates: true });
    overlapProcessed += batch.length;
    if (overlapProcessed % 1000 < BATCH_SIZE) {
      console.log(`  Processed ${overlapProcessed}/${wordThemeBatch.length} theme links`);
    }
  }
  console.log(`  Created ${overlapProcessed} WordTheme links for existing words`);

  // ─── Step 5: Create new words + WordTheme ───
  console.log('\n✨ Step 5: Creating new words...');
  
  const newWords = uniqueWords.filter(w => !existingWordMap.has(w));
  console.log(`  New words to create: ${newWords.length}`);
  
  let newCreated = 0;
  let newThemeLinks = 0;
  
  // For new words, we need to pick one "primary" entry for word data (pos, cefr)
  // but create WordTheme for all categories
  
  for (let i = 0; i < newWords.length; i += BATCH_SIZE) {
    const batch = newWords.slice(i, i + BATCH_SIZE);
    const wordRecords: Array<{
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
      definitionUrl: string;
    }> = [];
    const themeLinks: Array<{ wordKey: string; themeId: string; topic: string; subtopic: string }> = [];
    
    for (const wordLower of batch) {
      const entries = wordEntries.get(wordLower)!;
      const primary = entries[0]; // Use first entry for word data
      
      wordRecords.push({
        word: primary.word, // Keep original case
        phoneticUs: '',
        phoneticUk: '',
        partOfSpeech: [primary.pos],
        definition: primary.definitionUrl, // Store URL as placeholder
        examples: [],
        synonyms: [],
        antonyms: [],
        oxfordList: 'oxford_topics',
        cefrLevel: primary.cefr,
        frequency: cefrToFrequency(primary.cefr),
        definitionUrl: primary.definitionUrl,
      });
      
      // Theme links for all categories
      const seenCategories = new Set<string>();
      for (const entry of entries) {
        if (seenCategories.has(entry.category)) continue;
        seenCategories.add(entry.category);
        themeLinks.push({
          wordKey: wordLower,
          themeId: themeMap.get(entry.category)!,
          topic: entry.topic,
          subtopic: entry.subtopic,
        });
      }
    }
    
    // Create words
    const created = await prisma.$transaction(
      wordRecords.map(w => 
        prisma.word.create({
          data: {
            word: w.word,
            phoneticUs: w.phoneticUs,
            phoneticUk: w.phoneticUk,
            partOfSpeech: w.partOfSpeech,
            definition: w.definition,
            examples: w.examples,
            synonyms: w.synonyms,
            antonyms: w.antonyms,
            oxfordList: w.oxfordList,
            cefrLevel: w.cefrLevel,
            frequency: w.frequency,
          },
          select: { id: true, word: true },
        })
      )
    );
    
    // Map word key → created ID
    const createdMap = new Map<string, string>();
    created.forEach((w, idx) => createdMap.set(batch[idx], w.id));
    
    // Create theme links
    const wtData = themeLinks
      .filter(l => createdMap.has(l.wordKey))
      .map(l => ({
        wordId: createdMap.get(l.wordKey)!,
        themeId: l.themeId,
        topic: l.topic,
        subtopic: l.subtopic,
      }));
    
    await prisma.wordTheme.createMany({ data: wtData, skipDuplicates: true });
    
    newCreated += created.length;
    newThemeLinks += wtData.length;
    
    if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE || i + BATCH_SIZE >= newWords.length) {
      console.log(`  Created ${newCreated}/${newWords.length} words, ${newThemeLinks} theme links`);
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Overlapping words linked: ${overlapWords.length}`);
  console.log(`   New words created: ${newCreated}`);
  console.log(`   Total theme links: ${overlapProcessed + newThemeLinks}`);
  
  // Verify
  const totalWords = await prisma.word.count();
  const totalThemes = await prisma.wordTheme.count();
  const themeCount = await prisma.theme.count();
  console.log(`\n📊 Database totals:`);
  console.log(`   Words: ${totalWords}`);
  console.log(`   Themes: ${themeCount}`);
  console.log(`   Word-Theme links: ${totalThemes}`);
}

function cefrToFrequency(cefr: string): number {
  const map: Record<string, number> = {
    a1: 5000, a2: 4000, b1: 3000, b2: 2000, c1: 1000, c2: 500,
  };
  return map[cefr.toLowerCase()] || 1000;
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
