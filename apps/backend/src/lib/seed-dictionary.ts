/**
 * Dictionary seeding job — imports Oxford 5000 words + topic data on first run.
 *
 * Data sources:
 *   dictionary/data/oxford_5000.json  — full word data (phonetics, definitions, examples, audio refs)
 *   dictionary/oxford_topic/words_hierarchical.json — category → topic → subtopic → words (for themes)
 *
 * Strategy:
 *   1. Check SystemConfig "dictionary_seeded" — skip if already done
 *   2. Create 18 Theme rows from topic categories
 *   3. Build a merged word map: oxford_5000 data enriched with topic assignments
 *   4. Upsert words in batches of 500
 *   5. Create WordTheme links with topic/subtopic metadata
 *   6. Mark "dictionary_seeded" = "true"
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve dictionary data directory — supports both dev and Docker
const DICT_BASE = process.env.DICT_DIR
  || path.resolve(__dirname, '../../../../dictionary');

// ────────────────────────────────────────────
// Types for raw JSON data
// ────────────────────────────────────────────

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

interface TopicWord {
  word: string;
  pos: string;
  cefr: string;
  primaryCefr?: string;
  cefrBySubtopic?: Record<string, string>;
  definitionUrl?: string;
}

// Hierarchical: { category: { topic: { subtopic: TopicWord[] } } }
type HierarchicalData = Record<string, Record<string, Record<string, TopicWord[]>>>;

// ────────────────────────────────────────────
// Theme definitions derived from categories
// ────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, { icon: string; description: string }> = {
  'Animals': { icon: '🐾', description: 'Animal-related vocabulary including mammals, birds, fish, insects and more' },
  'Appearance': { icon: '👤', description: 'Words for describing physical appearance, beauty, and body language' },
  'Communication': { icon: '💬', description: 'Language and communication-related vocabulary' },
  'Culture': { icon: '🎭', description: 'Arts, media, religion, and cultural vocabulary' },
  'Food and drink': { icon: '🍽️', description: 'Food, cooking, dining, and drink vocabulary' },
  'Functions': { icon: '🔧', description: 'Functional language for specific communicative purposes' },
  'Health': { icon: '🏥', description: 'Health, medicine, and body-related vocabulary' },
  'Homes and buildings': { icon: '🏠', description: 'Housing, furniture, buildings, and household vocabulary' },
  'Leisure': { icon: '🎮', description: 'Hobbies, entertainment, and free time vocabulary' },
  'Notions': { icon: '💡', description: 'Abstract concepts, quantities, and qualities' },
  'People': { icon: '👥', description: 'People, relationships, personality, and human attributes' },
  'Politics and society': { icon: '🏛️', description: 'Government, politics, law, and social issues' },
  'Science and technology': { icon: '🔬', description: 'Science, computing, technology, and math vocabulary' },
  'Sport': { icon: '⚽', description: 'Sports, fitness, and physical activities' },
  'The natural world': { icon: '🌍', description: 'Nature, environment, weather, and geography' },
  'Time and space': { icon: '⏰', description: 'Time expressions, location, and spatial vocabulary' },
  'Travel': { icon: '✈️', description: 'Travel, tourism, and transportation vocabulary' },
  'Work and business': { icon: '💼', description: 'Business, finance, employment, and workplace vocabulary' },
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ────────────────────────────────────────────
// Main seed function
// ────────────────────────────────────────────

export async function seedDictionary(prisma: PrismaClient, force = false): Promise<void> {
  const FLAG_KEY = 'dictionary_seeded';

  // 1. Check if already seeded
  if (!force) {
    const flag = await prisma.systemConfig.findUnique({ where: { key: FLAG_KEY } });
    if (flag?.value === 'true') {
      console.log('[seed] Dictionary already seeded — skipping');
      return;
    }
  } else {
    console.log('[seed] Force re-seed requested');
  }

  console.log('[seed] Starting dictionary import...');

  // 2. Load data files
  const oxfordPath = path.join(DICT_BASE, 'data', 'oxford_5000.json');
  const topicPath = path.join(DICT_BASE, 'oxford_topic', 'words_hierarchical.json');

  if (!fs.existsSync(oxfordPath)) {
    console.log(`[seed] Oxford data not found at ${oxfordPath} — skipping seed`);
    return;
  }
  if (!fs.existsSync(topicPath)) {
    console.log(`[seed] Topic data not found at ${topicPath} — skipping seed`);
    return;
  }

  const raw5000 = JSON.parse(fs.readFileSync(oxfordPath, 'utf-8')) as Record<string, OxfordEntry>;
  const rawTopic = JSON.parse(fs.readFileSync(topicPath, 'utf-8')) as HierarchicalData;

  const oxfordEntries = Object.values(raw5000);
  console.log(`[seed] Loaded ${oxfordEntries.length} Oxford 5000 entries`);

  // 3. Build topic lookup: word (lowercase) → [{ themeSlug, topic, subtopic, cefr }]
  interface TopicAssignment {
    themeSlug: string;
    themeName: string;
    topic: string;
    subtopic: string;
    cefr: string;
    definitionUrl?: string;
  }

  const topicMap = new Map<string, TopicAssignment[]>();

  for (const [category, topics] of Object.entries(rawTopic)) {
    const slug = slugify(category);
    for (const [topic, subtopics] of Object.entries(topics)) {
      for (const [subtopic, words] of Object.entries(subtopics)) {
        for (const w of (words as TopicWord[])) {
          const key = w.word.toLowerCase();
          let list = topicMap.get(key);
          if (!list) {
            list = [];
            topicMap.set(key, list);
          }
          list.push({
            themeSlug: slug,
            themeName: category,
            topic,
            subtopic,
            cefr: w.primaryCefr || w.cefr || '',
            definitionUrl: w.definitionUrl,
          });
        }
      }
    }
  }

  console.log(`[seed] Built topic map for ${topicMap.size} unique words across ${Object.keys(rawTopic).length} categories`);

  // 4. Create/update themes
  const categoryNames = Object.keys(rawTopic);
  const themeSlugToId = new Map<string, string>();

  for (const catName of categoryNames) {
    const slug = slugify(catName);
    const meta = CATEGORY_ICONS[catName] || { icon: '📌', description: catName };

    const theme = await prisma.theme.upsert({
      where: { slug },
      update: { name: catName, icon: meta.icon, description: meta.description },
      create: { name: catName, slug, icon: meta.icon, description: meta.description },
    });
    themeSlugToId.set(slug, theme.id);
  }

  console.log(`[seed] Created/updated ${categoryNames.length} themes`);

  // 5. Merge all words: oxford_5000 data + topic-only words (no full data)
  interface MergedWord {
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
    audioUs: string | null;
    audioUk: string | null;
    definitionUrl: string | null;
    topics: TopicAssignment[];
  }

  const mergedMap = new Map<string, MergedWord>();

  // Add words from oxford_5000.json (full data)
  for (const entry of oxfordEntries) {
    const key = entry.word.toLowerCase();
    const pos = entry.type ? [entry.type] : [];

    mergedMap.set(key, {
      word: entry.word,
      phoneticUs: entry.phon_n_am || '',
      phoneticUk: entry.phon_br || '',
      partOfSpeech: pos,
      definition: entry.definition || '',
      examples: entry.example ? [entry.example] : [],
      synonyms: [],
      antonyms: [],
      oxfordList: '5000',
      cefrLevel: entry.cefr?.toUpperCase() || 'B2',
      frequency: 0,
      audioUs: entry.us || null,
      audioUk: entry.uk || null,
      definitionUrl: null,
      topics: topicMap.get(key) || [],
    });
  }

  // Add topic-only words (not in oxford_5000) — partial data
  for (const [key, assignments] of topicMap) {
    if (mergedMap.has(key)) continue;

    // Use cefr from topic data
    const cefr = assignments[0]?.cefr?.toUpperCase() || 'C1';

    mergedMap.set(key, {
      word: key, // lowercase — will be title-cased for display
      phoneticUs: '',
      phoneticUk: '',
      partOfSpeech: [],
      definition: '',
      examples: [],
      synonyms: [],
      antonyms: [],
      oxfordList: 'topic',
      cefrLevel: cefr,
      frequency: 0,
      audioUs: null,
      audioUk: null,
      definitionUrl: assignments.find(a => a.definitionUrl)?.definitionUrl || null,
      topics: assignments,
    });
  }

  // ────────────────────────────────────────────
  // 5b. Enrich topic-only words from WordNet 2025
  // ────────────────────────────────────────────
  const wnDir = path.join(DICT_BASE, 'english-wordnet-2025-json');
  let wnEnriched = 0;
  let wnSkipped = 0;

  if (fs.existsSync(wnDir)) {
    console.log('[seed] Loading WordNet 2025 for enrichment...');

    // Load all synset files into a lookup: synsetId → { definition, example, members, partOfSpeech }
    const synsetMap = new Map<string, { definition: string; examples: string[]; members: string[]; partOfSpeech: string }>();
    const synsetFiles = fs.readdirSync(wnDir).filter(f =>
      /^(noun|verb|adj|adv)\.\w+\.json$/.test(f)
    );

    for (const sf of synsetFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(wnDir, sf), 'utf-8')) as Record<string, any>;
      for (const [id, syn] of Object.entries(data)) {
        if (syn.definition?.length) {
          synsetMap.set(id, {
            definition: syn.definition[0],
            examples: syn.example || [],
            members: syn.members || [],
            partOfSpeech: syn.partOfSpeech || '',
          });
        }
      }
    }
    console.log(`[seed] Loaded ${synsetMap.size} WordNet synsets`);

    // Load all entry files: word → { pos → { sense: [{ synset }] } }
    const entryMap = new Map<string, Record<string, { sense: Array<{ synset: string }> }>>();
    const entryFiles = fs.readdirSync(wnDir).filter(f => f.startsWith('entries-') && f.endsWith('.json'));

    for (const ef of entryFiles) {
      const data = JSON.parse(fs.readFileSync(path.join(wnDir, ef), 'utf-8')) as Record<string, any>;
      for (const [word, poses] of Object.entries(data)) {
        entryMap.set(word.toLowerCase(), poses);
      }
    }
    console.log(`[seed] Loaded ${entryMap.size} WordNet entries`);

    // Enrich topic-only words that have empty definitions
    for (const [key, merged] of mergedMap) {
      if (merged.definition) continue; // already has data from Oxford 5000

      const wnEntry = entryMap.get(key);
      if (!wnEntry) {
        wnSkipped++;
        continue;
      }

      // Collect all synsets across all POS, pick the one with the most examples (or first)
      let bestSynset: { definition: string; examples: string[]; members: string[]; partOfSpeech: string } | null = null;
      let bestScore = -1;
      const posList: string[] = [];

      for (const [pos, data] of Object.entries(wnEntry)) {
        const posMap: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };
        if (!posList.includes(posMap[pos] || pos)) {
          posList.push(posMap[pos] || pos);
        }

        for (const sense of (data as any).sense || []) {
          const syn = synsetMap.get(sense.synset);
          if (!syn) continue;

          // Score: prefer synsets with examples and shorter definitions (more common sense)
          const score = syn.examples.length * 10 - syn.definition.length * 0.01;
          if (score > bestScore) {
            bestScore = score;
            bestSynset = syn;
          }
        }
      }

      if (bestSynset) {
        merged.definition = bestSynset.definition;
        merged.examples = bestSynset.examples.slice(0, 5);
        merged.synonyms = bestSynset.members.filter(m => m.toLowerCase() !== key).slice(0, 10);
        if (posList.length > 0 && merged.partOfSpeech.length === 0) {
          merged.partOfSpeech = posList;
        }
        wnEnriched++;
      } else {
        wnSkipped++;
      }
    }

    console.log(`[seed] WordNet enrichment: ${wnEnriched} words enriched, ${wnSkipped} not found in WordNet`);
  } else {
    console.log('[seed] WordNet directory not found — skipping enrichment');
  }

  const allWords = Array.from(mergedMap.values());
  const withDefinition = allWords.filter(w => w.definition).length;
  console.log(`[seed] Final word list: ${allWords.length} words (${withDefinition} with definitions, ${allWords.length - withDefinition} without)`);

  // 6. Upsert words in batches
  const BATCH_SIZE = 500;
  let upserted = 0;

  for (let i = 0; i < allWords.length; i += BATCH_SIZE) {
    const batch = allWords.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(
      batch.map(w =>
        prisma.word.upsert({
          where: { word: w.word },
          update: {
            phoneticUs: w.phoneticUs,
            phoneticUk: w.phoneticUk,
            partOfSpeech: w.partOfSpeech,
            definition: w.definition,
            examples: w.examples,
            synonyms: w.synonyms,
            antonyms: w.antonyms,
            oxfordList: w.oxfordList,
            cefrLevel: w.cefrLevel,
            audioUs: w.audioUs,
            audioUk: w.audioUk,
            definitionUrl: w.definitionUrl,
          },
          create: {
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
            audioUs: w.audioUs,
            audioUk: w.audioUk,
            definitionUrl: w.definitionUrl,
          },
        })
      )
    );

    upserted += batch.length;
    if (upserted % 2000 === 0 || upserted === allWords.length) {
      console.log(`[seed] Upserted ${upserted}/${allWords.length} words...`);
    }
  }

  // 7. Create WordTheme links — batch fetch word IDs first
  console.log('[seed] Creating theme links...');

  // Build a word → id map from DB (batch query)
  const dbWords = await prisma.word.findMany({
    select: { id: true, word: true },
  });
  const wordIdMap = new Map(dbWords.map(w => [w.word.toLowerCase(), w.id]));

  let themeLinksCreated = 0;
  const THEME_BATCH = 1000;
  const themeLinks: { wordId: string; themeId: string; topic: string | null; subtopic: string | null }[] = [];

  for (const [wordKey, merged] of mergedMap) {
    const wordId = wordIdMap.get(wordKey);
    if (!wordId) continue;

    for (const ta of merged.topics) {
      const themeId = themeSlugToId.get(ta.themeSlug);
      if (!themeId) continue;

      themeLinks.push({
        wordId,
        themeId,
        topic: ta.topic,
        subtopic: ta.subtopic,
      });
    }
  }

  console.log(`[seed] Total theme links to create: ${themeLinks.length}`);

  for (let i = 0; i < themeLinks.length; i += THEME_BATCH) {
    const batch = themeLinks.slice(i, i + THEME_BATCH);

    await prisma.$transaction(
      batch.map(link =>
        prisma.wordTheme.upsert({
          where: {
            wordId_themeId: { wordId: link.wordId, themeId: link.themeId },
          },
          update: {
            topic: link.topic,
            subtopic: link.subtopic,
          },
          create: {
            wordId: link.wordId,
            themeId: link.themeId,
            topic: link.topic,
            subtopic: link.subtopic,
          },
        })
      )
    );

    themeLinksCreated += batch.length;
    if (themeLinksCreated % 5000 === 0 || themeLinksCreated === themeLinks.length) {
      console.log(`[seed] Created ${themeLinksCreated}/${themeLinks.length} theme links...`);
    }
  }

  // 8. Stats
  const cefrStats: Record<string, number> = {};
  for (const w of allWords) {
    cefrStats[w.cefrLevel] = (cefrStats[w.cefrLevel] || 0) + 1;
  }

  console.log('[seed] Import complete!');
  console.log(`[seed]   Words: ${allWords.length} (CEFR: ${JSON.stringify(cefrStats)})`);
  console.log(`[seed]   Themes: ${categoryNames.length}`);
  console.log(`[seed]   Theme links: ${themeLinksCreated}`);

  // 9. Mark as seeded
  await prisma.systemConfig.upsert({
    where: { key: FLAG_KEY },
    update: { value: 'true' },
    create: { key: FLAG_KEY, value: 'true' },
  });

  console.log('[seed] Marked dictionary_seeded = true');
}
