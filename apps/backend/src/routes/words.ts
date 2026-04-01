import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { optionalAuth, authenticate } from '../middleware/auth.js';
import { callLLM, getLLMConfig } from '../lib/llm.js';

export async function wordRoutes(app: FastifyInstance) {
  // Get all words with filters (requires auth)
  app.get('/words', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string | undefined>;
    const theme = query.theme;
    const level = query.level;
    const list = query.list;
    const search = query.search;
    const status = query.status;
    const topic = query.topic;
    const subtopic = query.subtopic;
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);

    const where: any = {};
    
    if (level) where.cefrLevel = level;
    if (list) where.oxfordList = list;
    if (search) {
      where.word = { contains: search, mode: 'insensitive' };
    }
    if (theme || topic || subtopic) {
      const themeWhere: any = {};
      if (theme && theme === 'none') {
        where.themes = { none: {} };
      } else {
        if (theme) themeWhere.theme = { slug: theme };
        if (topic) themeWhere.topic = topic;
        if (subtopic) themeWhere.subtopic = subtopic;
        where.themes = { some: themeWhere };
      }
    }
    // Filter by learning status
    if (status === 'new') {
      where.progress = { none: { userId } };
    } else if (status === 'learning' || status === 'reviewing' || status === 'mastered') {
      where.progress = { some: { userId, status } };
    } else if (status === 'seen') {
      // All words the user has interacted with (any status except new/no-progress)
      where.progress = { some: { userId } };
    }

    const [words, total] = await Promise.all([
      prisma.word.findMany({
        where,
        include: {
          themes: { include: { theme: true } },
          progress: {
            where: { userId },
          },
          favorites: {
            where: { userId },
            select: { id: true },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { frequency: 'asc' },
      }),
      prisma.word.count({ where }),
    ]);

    const formattedWords = words.map(word => ({
      id: word.id,
      word: word.word,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      partOfSpeech: word.partOfSpeech as string[],
      definition: word.definition,
      examples: word.examples as string[],
      synonyms: word.synonyms as string[],
      antonyms: word.antonyms as string[],
      oxfordList: word.oxfordList,
      cefrLevel: word.cefrLevel,
      frequency: word.frequency,
      audioUs: word.audioUs,
      audioUk: word.audioUk,
      themes: word.themes.map(t => ({ slug: t.theme.slug, name: t.theme.name, topic: t.topic, subtopic: t.subtopic })),
      progress: word.progress?.[0] ? {
        status: word.progress[0].status,
        interval: word.progress[0].interval,
        nextReview: word.progress[0].nextReview,
        repetitions: word.progress[0].repetitions,
        easeFactor: word.progress[0].easeFactor,
        lastReview: word.progress[0].lastReview,
        totalReviews: word.progress[0].totalReviews,
        correctReviews: word.progress[0].correctReviews,
        difficulty: word.progress[0].difficulty,
      } : null,
      favorited: word.favorites.length > 0,
    }));

    return {
      words: formattedWords,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Word of the Day - deterministic based on date (MUST be before /:id)
  app.get('/words/daily', { preHandler: optionalAuth }, async (request, _reply) => {
    const today = new Date();
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000
    );

    // Get total word count for modulo
    const totalWords = await prisma.word.count();

    if (totalWords === 0) {
      return { word: null };
    }

    // Deterministic offset based on day of year
    const offset = dayOfYear % totalWords;

    const word = await prisma.word.findMany({
      take: 1,
      skip: offset,
      include: {
        themes: { include: { theme: true } },
        progress: request.user
          ? { where: { userId: request.user.userId } }
          : false,
      },
      orderBy: { frequency: 'asc' },
    });

    if (word.length === 0) {
      return { word: null };
    }

    const w = word[0];
    return {
      id: w.id,
      word: w.word,
      phoneticUs: w.phoneticUs,
      phoneticUk: w.phoneticUk,
      partOfSpeech: w.partOfSpeech as string[],
      definition: w.definition,
      examples: (w.examples as string[])?.slice(0, 2) || [],
      synonyms: (w.synonyms as string[])?.slice(0, 5) || [],
      cefrLevel: w.cefrLevel,
      oxfordList: w.oxfordList,
      audioUs: w.audioUs,
      audioUk: w.audioUk,
      themes: w.themes.map(t => ({ id: t.theme.id, name: t.theme.name, slug: t.theme.slug, topic: t.topic, subtopic: t.subtopic })),
      progress: request.user && w.progress?.[0] ? {
        status: w.progress[0].status,
        interval: w.progress[0].interval,
        nextReview: w.progress[0].nextReview,
        repetitions: w.progress[0].repetitions,
        easeFactor: w.progress[0].easeFactor,
        difficulty: w.progress[0].difficulty,
      } : null,
    };
  });

  // Get words due for review (requires auth)
  app.get('/words/due', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { limit = 20 } = request.query as { limit?: number };

    const dueWords = await prisma.word.findMany({
      where: {
        progress: {
          some: {
            userId,
            nextReview: { lte: new Date() },
          },
        },
      },
      include: {
        themes: { include: { theme: true } },
        progress: {
          where: { userId },
        },
      },
      take: limit,
      orderBy: {
        progress: {
          _count: 'asc',
        },
      },
    });

    return dueWords.map(word => ({
      id: word.id,
      word: word.word,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      partOfSpeech: word.partOfSpeech as string[],
      definition: word.definition,
      examples: word.examples as string[],
      synonyms: word.synonyms as string[],
      antonyms: word.antonyms as string[],
      oxfordList: word.oxfordList,
      cefrLevel: word.cefrLevel,
      audioUs: word.audioUs,
      audioUk: word.audioUk,
      themes: word.themes.map(t => ({ slug: t.theme.slug, name: t.theme.name, topic: t.topic, subtopic: t.subtopic })),
      progress: word.progress[0],
    }));
  });

  // Search words (requires auth)
  app.get('/words/search', { preHandler: authenticate }, async (request, reply) => {
    const { q, limit } = request.query as { q: string; limit?: string };

    if (!q || q.length < 2) {
      return reply.status(400).send({ error: 'Query must be at least 2 characters' });
    }

    const takeLimit = Math.min(parseInt(limit || '20', 10), 50);

    const words = await prisma.word.findMany({
      where: {
        word: { contains: q, mode: 'insensitive' },
      },
      take: takeLimit,
      select: {
        id: true,
        word: true,
        definition: true,
        cefrLevel: true,
        phoneticUs: true,
      },
    });

    return words;
  });

  // Get single word - guests get limited fields, authenticated users get full data
  // Word counts per CEFR level and theme (for browse filter badges)
  app.get('/words/counts', { preHandler: optionalAuth }, async (request) => {
    const userId = (request as any).user?.userId;

    const [levelCounts, themeCounts, total, unthemedCount] = await Promise.all([
      prisma.word.groupBy({
        by: ['cefrLevel'],
        _count: { id: true },
      }),
      prisma.wordTheme.groupBy({
        by: ['themeId'],
        _count: { wordId: true },
      }),
      prisma.word.count(),
      prisma.word.count({
        where: { themes: { none: {} } },
      }),
    ]);

    const levels: Record<string, number> = {};
    for (const row of levelCounts) {
      if (row.cefrLevel) levels[row.cefrLevel] = row._count.id;
    }

    const dbThemes = await prisma.theme.findMany({ select: { id: true, slug: true } });
    const themeSlugMap = Object.fromEntries(dbThemes.map(t => [t.id, t.slug]));

    const themes: Record<string, number> = { none: unthemedCount };
    for (const row of themeCounts) {
      const slug = themeSlugMap[row.themeId];
      if (slug) themes[slug] = row._count.wordId;
    }

    // Add status counts for authenticated users
    let statusCounts: Record<string, number> | undefined;
    if (userId) {
      const progressByStatus = await prisma.wordProgress.groupBy({
        by: ['status'],
        where: { userId },
        _count: { status: true },
      });
      const statusMap: Record<string, number> = {};
      for (const row of progressByStatus) {
        statusMap[row.status] = row._count.status;
      }
      const learned = (statusMap['learning'] || 0) + (statusMap['reviewing'] || 0) + (statusMap['mastered'] || 0);
      statusCounts = {
        new: total - learned,
        learning: statusMap['learning'] || 0,
        reviewing: statusMap['reviewing'] || 0,
        mastered: statusMap['mastered'] || 0,
      };
    }

    return { total, levels, themes, statusCounts };
  });

  app.get('/words/:id', { preHandler: optionalAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const word = await prisma.word.findUnique({
      where: { id },
      include: {
        themes: { include: { theme: true } },
        progress: request.user
          ? { where: { userId: request.user.userId } }
          : false,
        favorites: request.user
          ? { where: { userId: request.user.userId }, select: { id: true } }
          : false,
      },
    });

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // If user is not authenticated (guest), return limited fields only
    if (!request.user) {
      return {
        id: word.id,
        word: word.word,
        phoneticUs: word.phoneticUs,
        phoneticUk: word.phoneticUk,
        cefrLevel: word.cefrLevel,
        oxfordList: word.oxfordList,
        definition: word.definition,
        audioUs: word.audioUs,
        audioUk: word.audioUk,
        // NO examples, synonyms, antonyms, themes for guests
      };
    }

    // Authenticated user gets full data
    return {
      id: word.id,
      word: word.word,
      phoneticUs: word.phoneticUs,
      phoneticUk: word.phoneticUk,
      partOfSpeech: word.partOfSpeech as string[],
      definition: word.definition,
      examples: word.examples as string[],
      synonyms: word.synonyms as string[],
      antonyms: word.antonyms as string[],
      oxfordList: word.oxfordList,
      cefrLevel: word.cefrLevel,
      frequency: word.frequency,
      audioUs: word.audioUs,
      audioUk: word.audioUk,
      themes: word.themes.map(t => ({ id: t.theme.id, name: t.theme.name, slug: t.theme.slug, topic: t.topic, subtopic: t.subtopic })),
      progress: word.progress?.[0] || null,
      favorited: request.user ? (word.favorites as any[])?.length > 0 : false,
    };
  });

  // ============================================
  // WORD FAVORITES
  // ============================================

  // GET /words/favorites - List user's favorite words
  app.get('/words/favorites', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string | undefined>;
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);

    const [favorites, total] = await Promise.all([
      prisma.wordFavorite.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          word: {
            select: {
              id: true,
              word: true,
              phoneticUs: true,
              definition: true,
              cefrLevel: true,
              partOfSpeech: true,
            },
          },
        },
      }),
      prisma.wordFavorite.count({ where: { userId } }),
    ]);

    return {
      favorites: favorites.map(f => ({
        id: f.id,
        createdAt: f.createdAt,
        word: f.word,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  });

  // POST /words/:wordId/favorite - Toggle favorite
  app.post('/words/:wordId/favorite', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    // Check word exists
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // Check if already favorited
    const existing = await prisma.wordFavorite.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    if (existing) {
      // Remove favorite
      await prisma.wordFavorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    } else {
      // Add favorite
      await prisma.wordFavorite.create({
        data: { userId, wordId },
      });
      return { favorited: true };
    }
  });

  // GET /words/:wordId/favorite - Check if word is favorited
  app.get('/words/:wordId/favorite', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    const favorite = await prisma.wordFavorite.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    return { favorited: !!favorite };
  });

  // POST /words/:wordId/difficulty — Rate word difficulty (1-5), adjusts ease factor
  app.post('/words/:wordId/difficulty', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };
    const { difficulty } = request.body as { difficulty: number };

    if (!difficulty || difficulty < 1 || difficulty > 5) {
      throw { statusCode: 400, message: 'Difficulty must be 1-5' };
    }

    // Get or create progress
    let progress = await prisma.wordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    // Map difficulty to ease factor adjustment:
    // 1 (very easy) → ease +0.3, 2 (easy) → +0.15, 3 (normal) → no change
    // 4 (hard) → -0.15, 5 (very hard) → -0.3
    const easeAdjustments: Record<number, number> = { 1: 0.3, 2: 0.15, 3: 0, 4: -0.15, 5: -0.3 };
    const adjustment = easeAdjustments[difficulty] || 0;

    if (progress) {
      const newEase = Math.max(1.3, Math.min(3.0, progress.easeFactor + adjustment));
      await prisma.wordProgress.update({
        where: { id: progress.id },
        data: {
          difficulty,
          easeFactor: newEase,
        },
      });
    } else {
      const baseEase = 2.5 + adjustment;
      await prisma.wordProgress.create({
        data: {
          userId,
          wordId,
          difficulty,
          easeFactor: Math.max(1.3, Math.min(3.0, baseEase)),
        },
      });
    }

    return { difficulty, easeAdjusted: adjustment !== 0 };
  });

  // POST /words/:wordId/generate-examples - LLM-powered example sentence generation
  app.post('/words/:wordId/generate-examples', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw { statusCode: 404, message: 'Word not found' };

    try {
      const config = await getLLMConfig();

      const systemPrompt = `You are an English vocabulary tutor. Generate 3 example sentences for the given word.
Return ONLY a valid JSON array of strings. No markdown, no explanation.
Example format: ["Sentence 1.", "Sentence 2.", "Sentence 3."]

Rules:
- Each sentence should showcase a different usage or context
- Sentences should be natural and realistic
- Vary difficulty: one simple, one intermediate, one advanced
- Bold the target word using **word** format`;

      let userPrompt = `Word: "${word.word}"`;
      if ((word.partOfSpeech as string[])?.length) {
        userPrompt += `\nPart of speech: ${(word.partOfSpeech as string[]).join(', ')}`;
      }
      if (word.definition) {
        userPrompt += `\nDefinition: ${word.definition}`;
      }
      userPrompt += `\n\nGenerate 3 example sentences.`;

      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      // Parse JSON array from response
      let examples: string[] = [];
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0].replace(/,\s*\]/g, ']'));
          if (Array.isArray(parsed)) {
            examples = parsed.map((s: any) => String(s).trim()).filter((s: string) => s.length > 0);
          }
        } catch {
          // Fall back to line-based parsing
          examples = responseText
            .split('\n')
            .map(line => line.replace(/^\s*[\d\-*.]+\s*/, '').replace(/^"|"$/g, '').trim())
            .filter(line => line.length > 10 && line.includes(word.word.toLowerCase().split(' ')[0]));
        }
      }

      // Fallback if parsing failed
      if (examples.length === 0) {
        examples = [`${word.word} is a common English ${(word.partOfSpeech as string[])?.[0] || 'word'}.`];
      }

      // Cache the generated examples on the word record (append, don't overwrite)
      const existingExamples = (word.examples as string[]) || [];
      const newExamples = [...existingExamples, ...examples];
      await prisma.word.update({
        where: { id: wordId },
        data: { examples: newExamples },
      });

      return { examples, cached: false };
    } catch (error: any) {
      console.error('[generate-examples] Error:', error.message);
      throw { statusCode: 500, message: 'Failed to generate examples' };
    }
  });

  // POST /words/:wordId/etymology — Generate etymology analysis via LLM (cached)
  app.post('/words/:wordId/etymology', { preHandler: authenticate }, async (request, _reply) => {
    const { wordId } = request.params as { wordId: string };

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw { statusCode: 404, message: 'Word not found' };

    // Return cached etymology if available
    if (word.etymology) {
      try {
        return { etymology: JSON.parse(word.etymology), cached: true };
      } catch {
        // Invalid JSON, regenerate
      }
    }

    try {
      const config = await getLLMConfig();

      const systemPrompt = `You are an English etymology expert. Analyze the given word and return a JSON object with these fields:
- "origin": Brief language of origin (e.g., "Latin", "Old French", "Germanic")
- "root": The root word or morpheme it comes from
- "breakdown": Array of morphological parts, each with {"part": string, "meaning": string, "type": "prefix"|"root"|"suffix"}
- "story": One engaging sentence about the word's history or how its meaning evolved
- "related": Array of 3-5 related English words that share the same root

Return ONLY valid JSON. No markdown.`;

      const userPrompt = `Word: "${word.word}"
Part of speech: ${(word.partOfSpeech as string[])?.join(', ') || 'unknown'}
Definition: ${word.definition || 'N/A'}

Analyze the etymology.`;

      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      let etymology;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        etymology = JSON.parse(jsonMatch[0].replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']'));
      } else {
        etymology = { origin: 'Unknown', root: word.word, breakdown: [], story: 'Etymology unavailable.', related: [] };
      }

      // Cache on word record
      await prisma.word.update({
        where: { id: wordId },
        data: { etymology: JSON.stringify(etymology) },
      });

      return { etymology, cached: false };
    } catch (error: any) {
      console.error('[etymology] Error:', error.message);
      throw { statusCode: 500, message: 'Failed to generate etymology analysis' };
    }
  });

  // POST /words/:wordId/context-examples — Domain-specific usage examples (cached)
  app.post('/words/:wordId/context-examples', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw { statusCode: 404, message: 'Word not found' };

    // Return cached if available
    if (word.contextExamples) {
      try {
        return { examples: JSON.parse(word.contextExamples as string), cached: true };
      } catch { /* generate fresh */ }
    }

    try {
      const config = await getLLMConfig();

      const systemPrompt = `You are an English vocabulary expert. Generate domain-specific example sentences for a word.
Return ONLY a valid JSON object with these domain keys:
{ "academic": "...", "business": "...", "casual": "...", "news": "...", "literature": "..." }
Each value is a single natural sentence using the word in that domain's context.
Rules: natural phrasing, domain-appropriate vocabulary, bold the target word with **word**.`;

      let userPrompt = `Word: "${word.word}"`;
      if (word.definition) userPrompt += `\nDefinition: ${word.definition}`;
      if ((word.partOfSpeech as string[])?.length) userPrompt += `\nPOS: ${(word.partOfSpeech as string[]).join(', ')}`;
      userPrompt += '\n\nGenerate one sentence per domain.';

      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      let examples: Record<string, string>;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          examples = JSON.parse(jsonMatch[0].replace(/,\s*\}/g, '}'));
        } catch {
          examples = { academic: 'Context example unavailable.', business: '', casual: '', news: '', literature: '' };
        }
      } else {
        examples = { academic: '', business: '', casual: '', news: '', literature: '' };
      }

      // Cache
      await prisma.word.update({
        where: { id: wordId },
        data: { contextExamples: JSON.stringify(examples) },
      });

      return { examples, cached: false };
    } catch (error: any) {
      console.error('[context-examples] Error:', error.message);
      throw { statusCode: 500, message: 'Failed to generate context examples' };
    }
  });

  // POST /words/:wordId/translate — Get word translations in multiple languages (cached)
  app.post('/words/:wordId/translate', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };
    const body = request.body as { languages?: string[] };
    const targetLanguages = body.languages || ['es', 'fr', 'de', 'pt', 'vi', 'ja', 'ko', 'zh'];

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw { statusCode: 404, message: 'Word not found' };

    // Return cached if available
    if (word.translations) {
      try {
        const cached = JSON.parse(word.translations as string);
        return { translations: cached, cached: true };
      } catch { /* generate fresh */ }
    }

    try {
      const config = await getLLMConfig();

      const langNames: Record<string, string> = {
        es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
        vi: 'Vietnamese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
        it: 'Italian', nl: 'Dutch', ru: 'Russian', ar: 'Arabic', hi: 'Hindi', th: 'Thai',
      };
      const requestedNames = targetLanguages.map(c => langNames[c] || c).join(', ');

      const systemPrompt = `You are a professional translator. Return ONLY a valid JSON object mapping language codes to their translations.
Example: { "es": "absurdo", "fr": "absurde", "de": "absurd" }
Provide the most common translation for the given word in each language. If the word has multiple meanings, pick the most common one.`;

      const userPrompt = `Word: "${word.word}"
Definition: ${word.definition || 'N/A'}
Part of speech: ${(word.partOfSpeech as string[])?.join(', ') || 'N/A'}
Target languages: ${requestedNames}
Language codes: ${targetLanguages.join(', ')}

Return translations as a JSON object with these language codes as keys.`;

      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      let translations: Record<string, string> = {};
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          translations = JSON.parse(jsonMatch[0].replace(/,\s*\}/g, '}'));
        } catch { /* empty */ }
      }

      // Cache
      await prisma.word.update({
        where: { id: wordId },
        data: { translations: JSON.stringify(translations) },
      });

      return { translations, cached: false };
    } catch (error: any) {
      console.error('[translate] Error:', error.message);
      throw { statusCode: 500, message: 'Failed to generate translations' };
    }
  });

  // POST /words/compare — Compare two words with LLM analysis
  app.post('/words/compare', { preHandler: authenticate }, async (request, _reply) => {
    const { word1, word2 } = request.body as { word1: string; word2: string };
    if (!word1 || !word2) throw { statusCode: 400, message: 'Both word1 and word2 are required' };

    try {
      // Look up both words in DB
      const w1 = await prisma.word.findFirst({ where: { word: { equals: word1, mode: 'insensitive' } } });
      const w2 = await prisma.word.findFirst({ where: { word: { equals: word2, mode: 'insensitive' } } });

      const config = await getLLMConfig();

      const systemPrompt = `You are an English vocabulary expert helping learners distinguish between similar or commonly confused words.
Return ONLY valid JSON:
{"comparison":"1-2 sentence summary of the key difference","word1":{"word":"...","meaning":"clear definition","usage":"when to use this word","example":"example sentence","collocations":["common phrase1","phrase2"]},"word2":{"word":"...","meaning":"clear definition","usage":"when to use this word","example":"example sentence","collocations":["common phrase1","phrase2"]},"memoryTip":"A memorable tip to remember the difference","nuance":"Additional subtle differences in tone, formality, or context"}`;

      const userPrompt = `Compare these two words:
Word 1: "${word1}"${w1 ? ` — ${w1.definition}` : ''}${w1?.partOfSpeech ? ` (${(w1.partOfSpeech as string[]).join(', ')})` : ''}
Word 2: "${word2}"${w2 ? ` — ${w2.definition}` : ''}${w2?.partOfSpeech ? ` (${(w2.partOfSpeech as string[]).join(', ')})` : ''}`;

      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid LLM response');
      const result = JSON.parse(jsonMatch[0].replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']'));
      return result;
    } catch (error: any) {
      console.error('[compare] Error:', error.message);
      throw { statusCode: 500, message: 'Failed to compare words' };
    }
  });

  // GET /words/:wordId/related — Related words (same topic, similar CEFR level)
  app.get('/words/:wordId/related', async (request, reply) => {
    const { wordId } = request.params as { wordId: string };

    const word = await prisma.word.findUnique({
      where: { id: wordId },
      include: { themes: { include: { theme: true } } },
    });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    const themeIds = word.themes.map(wt => wt.themeId);

    // Find words in the same themes with similar CEFR level
    const related = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; cefrLevel: string }>>`
      SELECT w.id, w.word, w.definition, w.cefr_level as "cefrLevel"
      FROM words w
      JOIN word_themes wt ON wt."wordId" = w.id
      WHERE wt."themeId" = ANY(${themeIds}::text[])
        AND w.id != ${wordId}
        AND w.cefr_level IN (${word.cefrLevel}, 
          CASE ${word.cefrLevel}
            WHEN 'A1' THEN 'A2'
            WHEN 'A2' THEN 'B1'
            WHEN 'B1' THEN 'B2'
            WHEN 'B2' THEN 'C1'
            WHEN 'C1' THEN 'C2'
            WHEN 'C2' THEN 'C1'
            ELSE 'B1'
          END)
      GROUP BY w.id, w.word, w.definition, w.cefr_level ORDER BY RANDOM()
      LIMIT 6
    `;

    // Also find words starting with same prefix (3 chars)
    const prefix = word.word.substring(0, Math.min(3, word.word.length));
    const prefixWords = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; cefrLevel: string }>>`
      SELECT id, word, definition, cefr_level as "cefrLevel"
      FROM words
      WHERE word LIKE ${prefix + '%'}
        AND id != ${wordId}
      ORDER BY RANDOM()
      LIMIT 3
    `;

    // Word family: find morphological relatives
    // Strategy: strip common English suffixes to get stem, then find words starting with that stem
    const wordStr = word.word.toLowerCase();

    // Compute stems by removing common suffixes
    const suffixPairs: [string, string][] = [
      ['ational', 'ate'], ['ation', 'ate'], ['tion', 't'], ['sion', 's'],
      ['ment', ''], ['ness', ''], ['ity', 'e'], ['ible', ''], ['able', ''],
      ['ful', ''], ['less', ''], ['ous', ''], ['ive', ''], ['ical', ''],
      ['ally', 'al'], ['lly', 'le'], ['ling', 'le'],
      ['ing', ''], ['ing', 'e'],
      ['ied', 'y'], ['ies', 'y'],
      ['ed', ''], ['ed', 'e'],
      ['er', ''], ['er', 'e'],
      ['est', ''], ['est', 'e'],
      ['ly', ''], ['es', ''], ['s', ''],
    ];

    const stems = new Set<string>();
    for (const [suffix, replacement] of suffixPairs) {
      if (wordStr.endsWith(suffix) && (wordStr.length - suffix.length) >= 3) {
        stems.add(wordStr.slice(0, -suffix.length) + replacement);
      }
    }

    // For each stem, find words that start with it and have sufficient overlap
    // Require shared prefix >= 60% of the shorter word's length
    const minSharedLen = Math.ceil(wordStr.length * 0.65);
    const stemPrefix = wordStr.slice(0, Math.max(minSharedLen, 5));

    const familyWords = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; cefrLevel: string }>>`
      SELECT id, word, definition, cefr_level as "cefrLevel"
      FROM words
      WHERE word ILIKE ${stemPrefix + '%'}
        AND id != ${wordId}
      ORDER BY
        ABS(LENGTH(word) - LENGTH(${wordStr})),
        word ASC
      LIMIT 8
    `;

    // Further filter: require actual morphological relation
    const family = familyWords.filter(fw => {
      const fwLower = fw.word.toLowerCase();
      // Must share at least minSharedLen characters at the start
      let sharedLen = 0;
      for (let i = 0; i < Math.min(fwLower.length, wordStr.length); i++) {
        if (fwLower[i] === wordStr[i]) sharedLen++;
        else break;
      }
      return sharedLen >= minSharedLen;
    });

    return {
      sameTopic: related.map(w => ({ ...w })),
      similar: prefixWords.map(w => ({ ...w })),
      family: family.map(w => ({ ...w })),
    };
  });

  // ===== Word Encounters (Words in the Wild) =====

  // GET /words/encounters — Get all user encounters (pagination)
  app.get('/words/encounters', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { page = '1', limit = '20', source } = request.query as { page?: string; limit?: string; source?: string };

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const where: any = { userId };
    if (source) where.source = source;

    const [encounters, total] = await Promise.all([
      prisma.wordEncounter.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: { word: { select: { id: true, word: true, cefrLevel: true } } },
      }),
      prisma.wordEncounter.count({ where }),
    ]);

    return { encounters, total, page: pageNum, limit: limitNum };
  });

  // POST /words/:wordId/encounters — Log an encounter
  app.post('/words/:wordId/encounters', { preHandler: authenticate }, async (request, reply) => {
    const { wordId } = request.params as { wordId: string };
    const userId = request.user!.userId;
    const body = request.body as { source: string; note?: string };

    if (!body.source) {
      return reply.status(400).send({ error: 'Source is required' });
    }

    const validSources = ['book', 'movie', 'conversation', 'article', 'social_media', 'song', 'other'];
    if (!validSources.includes(body.source)) {
      return reply.status(400).send({ error: `Source must be one of: ${validSources.join(', ')}` });
    }

    const encounter = await prisma.wordEncounter.create({
      data: { userId, wordId, source: body.source, note: body.note || null },
    });

    return { encounter };
  });

  // GET /words/:wordId/encounters — Get encounters for a word
  app.get('/words/:wordId/encounters', { preHandler: authenticate }, async (request, reply) => {
    const { wordId } = request.params as { wordId: string };
    const userId = request.user!.userId;

    const encounters = await prisma.wordEncounter.findMany({
      where: { userId, wordId },
      orderBy: { createdAt: 'desc' },
    });

    return { encounters };
  });

  // DELETE /words/:wordId/encounters/:encounterId — Delete an encounter
  app.delete('/words/:wordId/encounters/:encounterId', { preHandler: authenticate }, async (request, reply) => {
    const { wordId, encounterId } = request.params as { wordId: string; encounterId: string };
    const userId = request.user!.userId;

    const encounter = await prisma.wordEncounter.findFirst({
      where: { id: encounterId, userId, wordId },
    });

    if (!encounter) {
      return reply.status(404).send({ error: 'Encounter not found' });
    }

    await prisma.wordEncounter.delete({ where: { id: encounterId } });
    return { success: true };
  });

  // ============================================
  // WORD CHAIN GAME
  // ============================================

  // GET /words/chain/start — Get a random starting word for word chain game
  app.get('/words/chain/start', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;

    // Prefer single words the user is currently learning
    const learningWords = await prisma.wordProgress.findMany({
      where: { userId, status: { in: ['learning', 'reviewing'] }, word: { word: { not: { contains: ' ' } } } },
      include: { word: { select: { id: true, word: true, definition: true, cefrLevel: true } } },
      take: 20,
      orderBy: { nextReview: 'asc' },
    });

    if (learningWords.length > 0) {
      const pick = learningWords[Math.floor(Math.random() * learningWords.length)];
      return {
        word: pick.word.word,
        definition: pick.word.definition,
        cefrLevel: pick.word.cefrLevel,
        wordId: pick.word.id,
      };
    }

    // Fallback to random word
    const [word] = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; cefr_level: string }>>`
      SELECT id, word, definition, cefr_level FROM words
      WHERE LENGTH(word) >= 3 AND LENGTH(word) <= 12 AND word NOT LIKE '% %'
      ORDER BY RANDOM() LIMIT 1
    `;

    return {
      word: word.word,
      definition: word.definition,
      cefrLevel: word.cefr_level,
      wordId: word.id,
    };
  });

  // POST /words/chain/validate — Validate a word chain move
  app.post('/words/chain/validate', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const { previousWord, userWord, chainLength } = request.body as {
      previousWord: string;
      userWord: string;
      chainLength: number;
    };

    if (!userWord || !previousWord) {
      throw { statusCode: 400, message: 'Both previous and current word are required' };
    }

    const normalizedUser = userWord.toLowerCase().trim();
    const normalizedPrev = previousWord.toLowerCase().trim();

    if (normalizedUser.includes(' ')) {
      return { valid: false, reason: 'Single words only (no spaces)', chainLength };
    }

    // Check chain rule: last letter of previous must be first letter of user's word
    const lastLetter = normalizedPrev[normalizedPrev.length - 1];
    const firstLetter = normalizedUser[0];

    if (lastLetter !== firstLetter) {
      return {
        valid: false,
        reason: `Word must start with "${lastLetter.toUpperCase()}"`,
        chainLength,
      };
    }

    // Check if word exists in database
    const word = await prisma.word.findFirst({
      where: { word: { equals: normalizedUser, mode: 'insensitive' } },
    });

    if (!word) {
      return {
        valid: false,
        reason: `"${userWord}" is not in the dictionary`,
        chainLength,
      };
    }

    // Calculate XP reward
    const baseXp = 5;
    const lengthBonus = Math.min(chainLength * 2, 20);
    const totalXp = baseXp + lengthBonus;

    // Award XP
    await prisma.user.update({
      where: { id: userId },
      data: { totalXp: { increment: totalXp } },
    });

    return {
      valid: true,
      word: word.word,
      definition: word.definition,
      cefrLevel: word.cefrLevel,
      wordId: word.id,
      xpEarned: totalXp,
      chainLength: chainLength + 1,
    };
  });
}
