import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Part of speech mapping
const POS_MAP: Record<string, string> = {
  'n.': 'noun',
  'v.': 'verb',
  'adj.': 'adjective',
  'adv.': 'adverb',
  'prep.': 'preposition',
  'conj.': 'conjunction',
  'pron.': 'pronoun',
  'det.': 'determiner',
  'int.': 'interjection',
  'exclam.': 'exclamation',
  'modal.': 'modal verb',
  'phrasal v.': 'phrasal verb',
  'pl.': 'plural noun',
  'sing.': 'singular noun',
  'abbr.': 'abbreviation',
  'prefix': 'prefix',
  'suffix': 'suffix',
};

interface ParsedWord {
  word: string;
  cefrLevel: string;
  partOfSpeech: string[];
  oxfordList: '3000' | '5000';
}

async function parseOxfordFile(
  filePath: string,
  oxfordList: '3000' | '5000'
): Promise<ParsedWord[]> {
  const words: ParsedWord[] = [];
  const fileStream = fs.createReadStream(filePath);
  
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let currentLevel = '';
  const levelPattern = /^(A1|A2|B1|B2|C1|C2)$/;
  // Match word followed by part of speech, e.g., "action n." or "add v." or "about prep., adv."
  const wordPattern = /^([a-zA-Z\-']+)(?:\s+(.+))?$/;

  for await (const line of rl) {
    const trimmed = line.trim();
    
    // Skip empty lines and headers
    if (!trimmed || trimmed.startsWith('©') || trimmed.startsWith('The Oxford')) {
      continue;
    }
    
    // Check for page numbers (e.g., "1 / 12")
    if (/^\d+\s*\/\s*\d+$/.test(trimmed)) {
      continue;
    }
    
    // Check for CEFR level
    if (levelPattern.test(trimmed)) {
      currentLevel = trimmed;
      continue;
    }
    
    // Skip if we don't have a level yet
    if (!currentLevel) {
      continue;
    }
    
    // Parse word line
    const match = trimmed.match(wordPattern);
    if (match) {
      const word = match[1].toLowerCase();
      const posText = match[2] || '';
      
      // Skip if word contains numbers or special formatting
      if (/\d/.test(word) || word.startsWith('the ')) {
        continue;
      }
      
      // Parse parts of speech
      const partsOfSpeech: string[] = [];
      if (posText) {
        // Split by comma and parse each POS
        const posParts = posText.split(/,\s*/);
        for (const part of posParts) {
          const trimmedPart = part.trim();
          // Find matching POS
          for (const [abbrev, full] of Object.entries(POS_MAP)) {
            if (trimmedPart.includes(abbrev)) {
              if (!partsOfSpeech.includes(full)) {
                partsOfSpeech.push(full);
              }
              break;
            }
          }
        }
      }
      
      // Default to noun if no POS found but line looks like a word entry
      if (partsOfSpeech.length === 0 && /^[a-z]/.test(word) && word.length > 1) {
        // Try to detect from context
        if (posText.includes('n.') || posText === '') {
          partsOfSpeech.push('noun');
        }
      }
      
      words.push({
        word,
        cefrLevel: currentLevel,
        partOfSpeech: partsOfSpeech.length > 0 ? partsOfSpeech : ['noun'],
        oxfordList,
      });
    }
  }

  return words;
}

async function main() {
  console.log('Importing Oxford word lists...');
  
  // Files are in the project root (5000_words_eval)
  const dataDir = path.resolve(__dirname, '../../..');
  
  // Parse both files
  console.log('Parsing oxford_3000.txt...');
  const words3000 = await parseOxfordFile(
    path.join(dataDir, 'oxford_3000.txt'),
    '3000'
  );
  console.log(`Found ${words3000.length} words in Oxford 3000`);
  
  console.log('Parsing oxford_5000.txt...');
  const words5000 = await parseOxfordFile(
    path.join(dataDir, 'oxford_5000.txt'),
    '5000'
  );
  console.log(`Found ${words5000.length} words in Oxford 5000`);
  
  // Combine all words and deduplicate
  const wordMap = new Map<string, ParsedWord>();
  
  // Add 3000 words first
  for (const w of words3000) {
    if (!wordMap.has(w.word)) {
      wordMap.set(w.word, w);
    }
  }
  
  // Add 5000 words (won't overwrite existing)
  for (const w of words5000) {
    if (!wordMap.has(w.word)) {
      wordMap.set(w.word, w);
    }
  }
  
  const allWords = Array.from(wordMap.values());
  console.log(`Total unique words to import: ${allWords.length}`);
  
  // Clear existing words (optional - comment out to keep existing)
  console.log('Clearing existing words...');
  await prisma.wordTheme.deleteMany();
  await prisma.sessionWord.deleteMany();
  await prisma.wordProgress.deleteMany();
  await prisma.word.deleteMany();
  
  // Import words in batches
  const batchSize = 500;
  let imported = 0;
  
  for (let i = 0; i < allWords.length; i += batchSize) {
    const batch = allWords.slice(i, i + batchSize);
    
    await prisma.$transaction(
      batch.map((w) =>
        prisma.word.create({
          data: {
            word: w.word,
            phoneticUs: '',
            phoneticUk: '',
            partOfSpeech: w.partOfSpeech,
            definition: '',
            examples: [],
            synonyms: [],
            antonyms: [],
            oxfordList: w.oxfordList,
            cefrLevel: w.cefrLevel as any,
            frequency: 0,
          },
        })
      )
    );
    
    imported += batch.length;
    console.log(`Imported ${imported}/${allWords.length} words...`);
  }
  
  // Stats by level
  const stats = {
    A1: allWords.filter(w => w.cefrLevel === 'A1').length,
    A2: allWords.filter(w => w.cefrLevel === 'A2').length,
    B1: allWords.filter(w => w.cefrLevel === 'B1').length,
    B2: allWords.filter(w => w.cefrLevel === 'B2').length,
    C1: allWords.filter(w => w.cefrLevel === 'C1').length,
    C2: allWords.filter(w => w.cefrLevel === 'C2').length,
  };
  
  console.log('\nImport completed!');
  console.log('Words by CEFR level:');
  console.log(`  A1: ${stats.A1}`);
  console.log(`  A2: ${stats.A2}`);
  console.log(`  B1: ${stats.B1}`);
  console.log(`  B2: ${stats.B2}`);
  console.log(`  C1: ${stats.C1}`);
  console.log(`  C2: ${stats.C2}`);
  console.log(`  Total: ${allWords.length}`);
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
