import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

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

interface ImportFile {
  exportedAt?: string;
  totalWords?: number;
  words: ImportedWord[];
}

async function importWords(inputPath: string, options: { merge: boolean; dryRun: boolean }) {
  console.log('📥 Importing words to database...\n');

  // Check file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }

  // Read and parse file
  console.log(`📂 Reading: ${inputPath}`);
  const fileContent = fs.readFileSync(inputPath, 'utf-8');
  const data: ImportFile = JSON.parse(fileContent);

  const words = data.words;
  console.log(`   Found ${words.length} words in file\n`);

  if (words.length === 0) {
    console.log('⚠️  No words to import');
    return;
  }

  // Get existing themes
  const existingThemes = await prisma.theme.findMany({
    select: { id: true, slug: true },
  });
  const themeMap = new Map(existingThemes.map((t) => [t.slug, t.id]));

  // If not merge mode, clear existing data
  if (!options.merge && !options.dryRun) {
    console.log('🗑️  Clearing existing words (merge mode disabled)...');
    await prisma.wordTheme.deleteMany();
    await prisma.wordProgress.deleteMany();
    await prisma.sessionWord.deleteMany();
    await prisma.word.deleteMany();
    console.log('   Done\n');
  }

  // Stats
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Process in batches
  const batchSize = 100;
  for (let i = 0; i < words.length; i += batchSize) {
    const batch = words.slice(i, batchSize);

    for (const wordData of batch) {
      try {
        if (options.dryRun) {
          // Just count
          const existing = await prisma.word.findUnique({
            where: { word: wordData.word },
          });
          if (existing) {
            skipped++;
          } else {
            created++;
          }
          continue;
        }

        // Upsert word
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

        // Track if created or updated
        const wasCreated = await prisma.word.count({
          where: { word: wordData.word },
        });
        if (wasCreated) {
          if (options.merge) {
            updated++;
          } else {
            created++;
          }
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

        created++;
      } catch (error: any) {
        failed++;
        console.log(`   ❌ ${wordData.word}: ${error.message}`);
      }
    }

    // Progress update
    const processed = Math.min(i + batchSize, words.length);
    console.log(`   Progress: ${processed}/${words.length} (${created} ✅, ${failed} ❌)`);
  }

  // Final summary
  console.log('\n==============================');
  console.log('📊 Import Summary');
  console.log('==============================');
  console.log(`Total processed: ${words.length}`);
  console.log(`✅ Created: ${created}`);
  console.log(`📝 Updated: ${updated}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);

  if (options.dryRun) {
    console.log('\n⚠️  DRY RUN - No changes saved to database');
  }
}

// Parse args
const args = process.argv.slice(2);
let inputPath: string | undefined;
const options = { merge: true, dryRun: false };

for (const arg of args) {
  if (arg.startsWith('--input=')) {
    inputPath = arg.split('=')[1];
  } else if (arg === '--replace') {
    options.merge = false;
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--help') {
    console.log(`
Usage: npm run import [options]

Options:
  --input=PATH   Input JSON file (required)
  --replace      Replace all existing words (default: merge)
  --dry-run      Test without saving to database
  --help         Show this help

Examples:
  npm run import -- --input=words-export.json
  npm run import -- --input=words-export.json --replace
  npm run import -- --input=words-export.json --dry-run
`);
    process.exit(0);
  }
}

if (!inputPath) {
  // Default to words-export.json in project root
  inputPath = path.join(__dirname, '../../../words-export.json');
}

importWords(inputPath, options)
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
