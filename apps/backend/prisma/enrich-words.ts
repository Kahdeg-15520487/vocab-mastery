/**
 * Enrich Words Script
 * 
 * Reads dictionary/data/oxford_5000.json and:
 * 1. Inserts missing words (not yet in DB)
 * 2. Updates phonetics, definition, example, audio filenames for all existing words
 * 3. Sets frequency based on word position in the frequency list
 * 4. Fills in audio file references (uk/us mp3)
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Paths to data files
const DATA_DIR = path.resolve(__dirname, '../../../dictionary/data');
const AUDIO_DIR = path.resolve(__dirname, '../../../dictionary/audio');

// CEFR level normalization (JSON uses lowercase, DB uses uppercase)
function normalizeCefr(level: string): string {
  return level.toUpperCase();
}

interface OxfordEntry {
  word: string;
  type: string;
  cefr: string;
  phon_br: string;
  phon_n_am: string;
  definition: string;
  example: string;
  uk: string;
  us: string;
}

async function main() {
  console.log('=== Word Enrichment Script ===\n');

  // Load Oxford 5000 data
  const oxfordPath = path.join(DATA_DIR, 'oxford_5000.json');
  if (!fs.existsSync(oxfordPath)) {
    console.error('ERROR: oxford_5000.json not found at', oxfordPath);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(oxfordPath, 'utf-8'));
  const entries: OxfordEntry[] = Object.values(rawData).filter(
    (e: any) => e.word && e.word.trim()
  );
  console.log(`Loaded ${entries.length} entries from oxford_5000.json`);

  // Load Oxford 3000 to mark which words are 3000 vs 5000
  const oxford3000Path = path.join(DATA_DIR, 'oxford_3000.json');
  let oxford3000Words = new Set<string>();
  if (fs.existsSync(oxford3000Path)) {
    const raw3000 = JSON.parse(fs.readFileSync(oxford3000Path, 'utf-8'));
    Object.values(raw3000).forEach((e: any) => {
      if (e.word) oxford3000Words.add(e.word.toLowerCase().trim());
    });
    console.log(`Oxford 3000 word set: ${oxford3000Words.size} words`);
  }

  // Build a map by lowercase word for lookup
  const entryMap = new Map<string, OxfordEntry>();
  for (const entry of entries) {
    const key = entry.word.toLowerCase().trim();
    // Keep first occurrence (most common usage)
    if (!entryMap.has(key)) {
      entryMap.set(key, entry);
    }
  }

  // Get all existing words from DB
  const existingWords = await prisma.word.findMany({
    select: { id: true, word: true, phoneticUs: true, phoneticUk: true, definition: true, examples: true, frequency: true, audioUs: true, audioUk: true }
  });
  const existingMap = new Map<string, typeof existingWords[0]>();
  for (const w of existingWords) {
    existingMap.set(w.word.toLowerCase(), w);
  }
  console.log(`Existing words in DB: ${existingWords.length}`);

  // Identify missing words
  const missingWords: OxfordEntry[] = [];
  for (const [key, entry] of entryMap) {
    if (!existingMap.has(key)) {
      missingWords.push(entry);
    }
  }
  console.log(`Missing words to insert: ${missingWords.length}`);

  // Also check if audio files actually exist
  const ukAudioDir = path.join(AUDIO_DIR, 'uk_audio_split_24m');
  const usAudioDir = path.join(AUDIO_DIR, 'us_audio_split_24m');
  const ukFiles = fs.existsSync(ukAudioDir) ? new Set(fs.readdirSync(ukAudioDir)) : new Set<string>();
  const usFiles = fs.existsSync(usAudioDir) ? new Set(fs.readdirSync(usAudioDir)) : new Set<string>();
  console.log(`UK audio files available: ${ukFiles.size}`);
  console.log(`US audio files available: ${usFiles.size}`);

  // Track stats
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  // === Phase 1: Insert missing words ===
  console.log('\n--- Phase 1: Insert Missing Words ---');
  const insertBatchSize = 100;
  for (let i = 0; i < missingWords.length; i += insertBatchSize) {
    const batch = missingWords.slice(i, i + insertBatchSize);
    try {
      await prisma.$transaction(
        batch.map((entry, idx) => {
          const key = entry.word.toLowerCase().trim();
          const isOxford3000 = oxford3000Words.has(key);
          const globalIndex = i + idx;
          const frequency = entries.length - globalIndex; // Higher = more frequent

          return prisma.word.create({
            data: {
              word: entry.word.trim(),
              phoneticUs: entry.phon_n_am || '',
              phoneticUk: entry.phon_br || '',
              partOfSpeech: entry.type ? [entry.type] : [],
              definition: entry.definition || '',
              examples: entry.example ? [entry.example] : [],
              synonyms: [],
              antonyms: [],
              oxfordList: isOxford3000 ? '3000' : '5000',
              cefrLevel: normalizeCefr(entry.cefr),
              frequency,
              audioUs: usFiles.has(entry.us) ? entry.us : null,
              audioUk: ukFiles.has(entry.uk) ? entry.uk : null,
            },
          });
        })
      );
      inserted += batch.length;
      console.log(`  Inserted ${inserted}/${missingWords.length} missing words...`);
    } catch (err: any) {
      console.error(`  Error inserting batch at ${i}:`, err.message);
      errors += batch.length;
    }
  }

  // === Phase 2: Update existing words with enriched data ===
  console.log('\n--- Phase 2: Update Existing Words ---');
  
  for (const existingWord of existingWords) {
    const key = existingWord.word.toLowerCase();
    const entry = entryMap.get(key);
    if (!entry) {
      unchanged++;
      continue;
    }

    // Determine what needs updating
    const needsPhonUs = !existingWord.phoneticUs && entry.phon_n_am;
    const needsPhonUk = !existingWord.phoneticUk && entry.phon_br;
    const needsDef = !existingWord.definition && entry.definition;
    const needsAudioUs = !existingWord.audioUs && usFiles.has(entry.us);
    const needsAudioUk = !existingWord.audioUk && ukFiles.has(entry.uk);
    const needsExamples = Array.isArray(existingWord.examples) && existingWord.examples.length === 0 && entry.example;

    // Also check if we can enrich existing data
    const canEnrichPhonUs = existingWord.phoneticUs !== (entry.phon_n_am || '') && entry.phon_n_am;
    const canEnrichPhonUk = existingWord.phoneticUk !== (entry.phon_br || '') && entry.phon_br;

    if (!needsPhonUs && !needsPhonUk && !needsDef && !needsAudioUs && !needsAudioUk && !needsExamples && !canEnrichPhonUs && !canEnrichPhonUk) {
      unchanged++;
      continue;
    }

    // Build update object — only update fields that are missing or empty
    const updateData: any = {};
    
    if (canEnrichPhonUs) updateData.phoneticUs = entry.phon_n_am;
    if (canEnrichPhonUk) updateData.phoneticUk = entry.phon_br;
    if (needsDef) updateData.definition = entry.definition;
    if (needsAudioUs) updateData.audioUs = entry.us;
    if (needsAudioUk) updateData.audioUk = entry.uk;
    if (needsExamples) updateData.examples = [entry.example];

    if (Object.keys(updateData).length > 0) {
      try {
        await prisma.word.update({
          where: { id: existingWord.id },
          data: updateData,
        });
        updated++;
      } catch (err: any) {
        console.error(`  Error updating "${existingWord.word}":`, err.message);
        errors++;
      }
    } else {
      unchanged++;
    }

    if ((updated + errors + unchanged) % 500 === 0) {
      console.log(`  Processed ${updated + errors + unchanged}/${existingWords.length} existing words...`);
    }
  }

  // === Phase 3: Set frequency for all words ===
  console.log('\n--- Phase 3: Set Frequency ---');
  
  // Build frequency map from oxford_5000.json (position = frequency rank)
  // Words appearing earlier are more frequent
  const frequencyMap = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i].word.toLowerCase().trim();
    if (!frequencyMap.has(key)) {
      frequencyMap.set(key, entries.length - i); // Higher = more frequent
    }
  }

  // Update frequency for all words in batch
  const allWords = await prisma.word.findMany({
    select: { id: true, word: true, frequency: true }
  });

  let freqUpdated = 0;
  const freqBatchSize = 500;
  const wordsToUpdate = allWords.filter(w => {
    const freq = frequencyMap.get(w.word.toLowerCase());
    return freq !== undefined && w.frequency !== freq;
  });

  console.log(`  Words needing frequency update: ${wordsToUpdate.length}`);

  for (let i = 0; i < wordsToUpdate.length; i += freqBatchSize) {
    const batch = wordsToUpdate.slice(i, i + freqBatchSize);
    await prisma.$transaction(
      batch.map(w =>
        prisma.word.update({
          where: { id: w.id },
          data: { frequency: frequencyMap.get(w.word.toLowerCase())! },
        })
      )
    );
    freqUpdated += batch.length;
    console.log(`  Updated frequency for ${freqUpdated}/${wordsToUpdate.length} words...`);
  }

  // === Phase 4: Update audio paths for all words ===
  console.log('\n--- Phase 4: Update Audio Paths ---');
  
  const wordsWithoutAudio = await prisma.word.findMany({
    where: {
      OR: [
        { audioUs: null },
        { audioUk: null },
      ]
    },
    select: { id: true, word: true, audioUs: true, audioUk: true }
  });

  console.log(`  Words needing audio update: ${wordsWithoutAudio.length}`);
  let audioUpdated = 0;

  for (let i = 0; i < wordsWithoutAudio.length; i += freqBatchSize) {
    const batch = wordsWithoutAudio.slice(i, i + freqBatchSize);
    const updates: any[] = [];

    for (const w of batch) {
      const key = w.word.toLowerCase();
      const entry = entryMap.get(key);
      if (!entry) continue;

      const data: any = {};
      if (!w.audioUs && usFiles.has(entry.us)) data.audioUs = entry.us;
      if (!w.audioUk && ukFiles.has(entry.uk)) data.audioUk = entry.uk;

      if (Object.keys(data).length > 0) {
        updates.push(
          prisma.word.update({ where: { id: w.id }, data })
        );
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(updates);
      audioUpdated += updates.length;
    }
  }
  console.log(`  Audio paths updated: ${audioUpdated}`);

  // === Summary ===
  console.log('\n=== Enrichment Summary ===');
  console.log(`Words inserted:   ${inserted}`);
  console.log(`Words updated:    ${updated}`);
  console.log(`Words unchanged:  ${unchanged}`);
  console.log(`Frequency set:    ${freqUpdated}`);
  console.log(`Audio paths set:  ${audioUpdated}`);
  console.log(`Errors:           ${errors}`);
  
  const totalNow = await prisma.word.count();
  console.log(`\nTotal words in DB now: ${totalNow}`);

  // Final stats
  const withAudio = await prisma.word.count({ where: { audioUs: { not: null } } });
  const withDef = await prisma.word.count({ where: { definition: { not: '' } } });
  const withPhon = await prisma.word.count({ where: { phoneticUs: { not: '' } } });
  console.log(`With audio:       ${withAudio}/${totalNow}`);
  console.log(`With definition:  ${withDef}/${totalNow}`);
  console.log(`With phonetics:   ${withPhon}/${totalNow}`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
