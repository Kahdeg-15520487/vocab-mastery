# Oxford Dictionary Crawler Plan

## Overview

Crawl word definitions, phonetics, examples, and synonyms from [Oxford Learners Dictionaries](https://www.oxfordlearnersdictionaries.com/) to populate our vocabulary database.

---

## ⚠️ Legal & Ethical Considerations

| Concern | Mitigation |
|---------|------------|
| **Terms of Service** | Oxford allows personal/educational use; rate limit to avoid abuse |
| **Copyright** | Definitions are copyrighted; this is for personal learning use only |
| **Server Load** | Implement delays between requests (1-2 seconds minimum) |
| **API Alternative** | Oxford has a paid API (£££); crawling is free for personal use |

**Recommendation**: Use this for personal learning only. For commercial use, purchase the [Oxford Dictionaries API](https://developer.oxforddictionaries.com/).

---

## Target Website

**Oxford Learners Dictionaries** (best for ESL learners):
```
https://www.oxfordlearnersdictionaries.com/definition/english/{word}
```

Example: https://www.oxfordlearnersdictionaries.com/definition/english/sustainable

---

## Data to Extract

For each word:

| Field | Source | Notes |
|-------|--------|-------|
| `word` | URL/page title | Already have |
| `phoneticUs` | `/span[class="phonetics"]/div[class="phons_n_am"]/span[class="phonetic"]` | US pronunciation |
| `phoneticUk` | `/span[class="phonetics"]/div[class="phons_br"]/span[class="phonetic"]` | UK pronunciation |
| `partOfSpeech` | `span[class="pos"]` | noun, verb, adjective, etc. |
| `definition` | `span[class="def"]` | Main definition(s) |
| `examples` | `ul[class="examples"]/li` | Example sentences |
| `synonyms` | Related words section | If available |
| `antonyms` | Related words section | If available |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Crawler Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Load words from DB (where definition is empty)          │
│                    ↓                                         │
│  2. For each word:                                           │
│     a. Check if already crawled (skip if yes)               │
│     b. Fetch page from Oxford                                │
│     c. Parse HTML to extract data                            │
│     d. Update database with results                          │
│     e. Wait (rate limit: 1-2 seconds)                        │
│                    ↓                                         │
│  3. Generate report (success/fail counts)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Options

### Option A: Puppeteer (Browser Automation)
**Pros**: Handles JavaScript, can see page like real user
**Cons**: Slower, more resource intensive

### Option B: Cheerio + Axios (HTML Parsing)
**Pros**: Faster, lighter weight
**Cons**: May miss dynamically loaded content

### Option C: Playwright (Recommended)
**Pros**: Fast, reliable, good for batch processing
**Cons**: Additional dependency

**Recommendation**: **Option B (Cheerio + Axios)** - Oxford pages are static HTML, no JS needed.

---

## Technical Design

### File Structure
```
apps/backend/
├── src/
│   └── crawler/
│       ├── index.ts           # Main crawler entry point
│       ├── oxford.ts          # Oxford-specific scraper
│       ├── parser.ts          # HTML parsing utilities
│       └── types.ts           # Crawler types
├── prisma/
│   └── crawl-log.json         # Resume capability (optional)
```

### Core Types
```typescript
interface CrawlResult {
  word: string;
  success: boolean;
  phoneticUs?: string;
  phoneticUk?: string;
  definitions?: string[];
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
  error?: string;
}

interface CrawlerConfig {
  batchSize: number;        // Words per batch (default: 50)
  delayMs: number;          // Delay between requests (default: 1500)
  maxRetries: number;       // Retry failed requests (default: 3)
  resume: boolean;          // Resume from last position (default: true)
  concurrency: number;      // Parallel requests (default: 1)
}
```

### Main Crawler Flow
```typescript
async function crawlOxfordDictionary(config: CrawlerConfig) {
  // 1. Get words without definitions
  const words = await prisma.word.findMany({
    where: { definition: '' },
    select: { id: true, word: true },
    orderBy: { word: 'asc' },
    take: config.batchSize,
  });

  // 2. Process each word
  for (const word of words) {
    try {
      const result = await fetchWordData(word.word);
      
      if (result.success) {
        await prisma.word.update({
          where: { id: word.id },
          data: {
            phoneticUs: result.phoneticUs,
            phoneticUk: result.phoneticUk,
            definition: result.definitions?.join('\n') || '',
            examples: result.examples || [],
            synonyms: result.synonyms || [],
            antonyms: result.antonyms || [],
          },
        });
      }
      
      // Rate limiting
      await sleep(config.delayMs);
      
    } catch (error) {
      console.error(`Failed: ${word.word}`, error);
    }
  }
}
```

---

## NPM Scripts

```json
{
  "crawl": "tsx src/crawler/index.ts",
  "crawl:batch": "tsx src/crawler/index.ts --batch=100",
  "crawl:resume": "tsx src/crawler/index.ts --resume",
  "crawl:dry": "tsx src/crawler/index.ts --dry-run"
}
```

---

## Progress Tracking

Store crawl progress in database or JSON file:

```typescript
// Option 1: JSON file (simple)
interface CrawlProgress {
  lastWord: string;
  completed: number;
  failed: number;
  lastRun: string;
}

// Option 2: Database table (robust)
model CrawlLog {
  id        String   @id @default(uuid())
  word      String   @unique
  status    String   // "pending" | "success" | "failed"
  error     String?
  crawledAt DateTime @default(now())
}
```

---

## Error Handling

| Error Type | Handling |
|------------|----------|
| Word not found | Mark as "failed", continue |
| Rate limited (429) | Exponential backoff, wait 60s |
| Network error | Retry 3 times with backoff |
| Parse error | Log error, save partial data |
| Timeout | Retry with longer timeout |

---

## Estimated Time

| Metric | Value |
|--------|-------|
| Total words | ~4,933 |
| Delay per word | 1.5 seconds |
| Time per batch (100) | ~2.5 minutes |
| **Total time** | **~2 hours** |

---

## CLI Interface

```bash
# Start crawler
npm run crawl

# Crawl specific batch
npm run crawl:batch -- --start=0 --count=100

# Resume from last position
npm run crawl:resume

# Dry run (test without saving)
npm run crawl:dry

# Show progress
npm run crawl -- --status
```

---

## Testing Strategy

1. **Unit tests**: Test HTML parsing with sample pages
2. **Integration test**: Crawl 10 words, verify data
3. **Manual verification**: Spot check definitions for accuracy

---

## Future Enhancements

- [ ] Multi-source crawling (Cambridge, Merriam-Webster)
- [ ] Audio pronunciation download
- [ ] Image associations
- [ ] Etymology data
- [ ] Frequency data from corpora

---

## Implementation Order

1. **Phase 1**: Basic crawler (HTML fetch + parse)
2. **Phase 2**: Database integration + progress tracking
3. **Phase 3**: CLI with options
4. **Phase 4**: Error handling + retries
5. **Phase 5**: Testing + validation

---

## Ready to Implement?

Say **"start implementation"** and I'll build the crawler, or let me know if you want to modify the plan.
