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
}
