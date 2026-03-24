import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

interface ExportedWord {
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
  themes: string[];
}

async function exportWords(outputPath?: string) {
  console.log('📤 Exporting words from database...\n');

  // Get all words with their themes
  const words = await prisma.word.findMany({
    include: {
      themes: {
        include: {
          theme: {
            select: { slug: true },
          },
        },
      },
    },
    orderBy: { word: 'asc' },
  });

  console.log(`Found ${words.length} words in database`);

  // Transform to export format
  const exportedWords: ExportedWord[] = words.map((w) => ({
    word: w.word,
    phoneticUs: w.phoneticUs,
    phoneticUk: w.phoneticUk,
    partOfSpeech: w.partOfSpeech as string[],
    definition: w.definition,
    examples: w.examples as string[],
    synonyms: w.synonyms as string[],
    antonyms: w.antonyms as string[],
    oxfordList: w.oxfordList,
    cefrLevel: w.cefrLevel,
    frequency: w.frequency,
    themes: w.themes.map((t) => t.theme.slug),
  }));

  // Stats
  const withDefinition = exportedWords.filter((w) => w.definition).length;
  const withExamples = exportedWords.filter((w) => w.examples?.length > 0).length;
  const byLevel: Record<string, number> = {};
  exportedWords.forEach((w) => {
    byLevel[w.cefrLevel] = (byLevel[w.cefrLevel] || 0) + 1;
  });

  // Default output path
  const filePath = outputPath || path.join(__dirname, '../../../words-export.json');

  // Write to file
  const output = {
    exportedAt: new Date().toISOString(),
    totalWords: exportedWords.length,
    stats: {
      withDefinition,
      withExamples,
      byLevel,
    },
    words: exportedWords,
  };

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

  console.log('\n📊 Export Summary');
  console.log('==================');
  console.log(`Total words: ${exportedWords.length}`);
  console.log(`With definitions: ${withDefinition}`);
  console.log(`With examples: ${withExamples}`);
  console.log('\nBy CEFR Level:');
  Object.entries(byLevel)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([level, count]) => {
      console.log(`  ${level}: ${count}`);
    });
  console.log(`\n✅ Exported to: ${filePath}`);
  console.log(`📁 File size: ${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB`);
}

// Parse args
const args = process.argv.slice(2);
let outputPath: string | undefined;
for (const arg of args) {
  if (arg.startsWith('--output=')) {
    outputPath = arg.split('=')[1];
  } else if (arg === '--help') {
    console.log(`
Usage: npm run export [options]

Options:
  --output=PATH  Output file path (default: words-export.json)
  --help         Show this help
`);
    process.exit(0);
  }
}

exportWords(outputPath)
  .catch((error) => {
    console.error('Export failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
