import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { categorizeWord, categorizeWordsBatch, checkLLMAvailability, clearLLMConfigCache, getLLMConfig, THEMES } from '../lib/llm.js';

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require admin role
  app.addHook('preHandler', requireAdmin);

  // ============================================
  // GET /api/admin/stats - Platform statistics
  // ============================================
  app.get('/admin/stats', async (request, reply) => {
    const [
      totalUsers,
      activeUsersToday,
      totalWords,
      wordsLearned,
      totalSessions,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      // Active users today (users who have refresh tokens created today)
      prisma.refreshToken.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      // Total words in database
      prisma.word.count(),
      // Words with progress
      prisma.wordProgress.count({
        where: { status: { not: 'new' } },
      }),
      // Total learning sessions
      prisma.learningSession.count(),
    ]);

    // Users by subscription tier
    const usersByTier = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: true,
    });

    // Users by role
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    });

    return {
      users: {
        total: totalUsers,
        activeToday: activeUsersToday,
        byTier: usersByTier.reduce((acc, item) => {
          acc[item.subscriptionTier] = item._count;
          return acc;
        }, {} as Record<string, number>),
        byRole: usersByRole.reduce((acc, item) => {
          acc[item.role] = item._count;
          return acc;
        }, {} as Record<string, number>),
      },
      content: {
        totalWords,
        wordsLearned,
      },
      activity: {
        totalSessions,
      },
    };
  });

  // ============================================
  // GET /api/admin/users - List users (paginated)
  // ============================================
  app.get('/admin/users', async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      role?: string;
      tier?: string;
    };

    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search filter
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Role filter
    if (query.role) {
      where.role = query.role;
    }

    // Tier filter
    if (query.tier) {
      where.subscriptionTier = query.tier;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
          createdAt: true,
          lastLoginAt: true,
          googleId: true,
          _count: {
            select: { refreshTokens: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        subscriptionTier: u.subscriptionTier,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        hasGoogleAuth: !!u.googleId,
        sessionCount: u._count.refreshTokens,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ============================================
  // GET /api/admin/users/:id - Get single user
  // ============================================
  app.get('/admin/users/:id', async (request, reply) => {
    const params = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        googleId: true,
        _count: {
          select: { refreshTokens: true },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Get user's learning stats
    const progressStats = await prisma.wordProgress.aggregate({
      where: { wordId: { not: '' } }, // Placeholder - would need userId relation
      _count: true,
    });

    return {
      ...user,
      hasGoogleAuth: !!user.googleId,
      sessionCount: user._count.refreshTokens,
    };
  });

  // ============================================
  // PUT /api/admin/users/:id - Update user
  // ============================================
  app.put('/admin/users/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      role?: 'LEARNER' | 'ADMIN';
      subscriptionTier?: 'FREE' | 'EXPLORER' | 'WORDSMITH';
      subscriptionExpiresAt?: string;
    };

    // Check user exists
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Prevent removing the last admin
    if (body.role === 'LEARNER' && existing.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot remove the last admin' });
      }
    }

    const updateData: any = {};

    if (body.role) updateData.role = body.role;
    if (body.subscriptionTier) updateData.subscriptionTier = body.subscriptionTier;
    if (body.subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = body.subscriptionExpiresAt
        ? new Date(body.subscriptionExpiresAt)
        : null;
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return user;
  });

  // ============================================
  // DELETE /api/admin/users/:id - Delete user
  // ============================================
  app.delete('/admin/users/:id', async (request, reply) => {
    const params = request.params as { id: string };

    // Check user exists
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Prevent deleting the last admin
    if (existing.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot delete the last admin' });
      }
    }

    // Prevent self-deletion
    if (request.user?.userId === params.id) {
      return reply.status(400).send({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: params.id },
    });

    return { success: true, message: 'User deleted' };
  });

  // ============================================
  // GET /api/admin/config - Get system config
  // ============================================
  app.get('/admin/config', async (request, reply) => {
    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });

    // Return as key-value object
    const result: Record<string, string> = {};
    for (const config of configs) {
      result[config.key] = config.value;
    }

    return result;
  });

  // ============================================
  // PUT /api/admin/config/:key - Update config
  // ============================================
  app.put('/admin/config/:key', async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { value: string };

    if (!body.value) {
      return reply.status(400).send({ error: 'Value is required' });
    }

    const config = await prisma.systemConfig.upsert({
      where: { key: params.key },
      update: { value: body.value },
      create: { key: params.key, value: body.value },
    });

    // Clear LLM config cache if it's an LLM-related config
    if (params.key.startsWith('llm.')) {
      clearLLMConfigCache();
    }

    return config;
  });

  // ============================================
  // LLM Configuration Endpoints
  // ============================================

  // GET /api/admin/llm/config - Get current LLM config (masked)
  app.get('/admin/llm/config', async (request, reply) => {
    const config = await getLLMConfig();
    
    // Mask sensitive values
    return {
      provider: config.provider,
      baseUrl: config.baseUrl || '',
      model: config.model,
      context: config.context || '',
      apiKey: config.apiKey ? '••••••••' + config.apiKey.slice(-4) : null,
      hasApiKey: !!config.apiKey,
    };
  });

  // PUT /api/admin/llm/config - Update LLM config
  app.put('/admin/llm/config', async (request, reply) => {
    const body = request.body as {
      provider?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      context?: string;
    };

    const updates: Promise<any>[] = [];

    if (body.provider !== undefined) {
      updates.push(
        prisma.systemConfig.upsert({
          where: { key: 'llm.provider' },
          update: { value: body.provider },
          create: { key: 'llm.provider', value: body.provider },
        })
      );
    }

    if (body.baseUrl !== undefined) {
      updates.push(
        prisma.systemConfig.upsert({
          where: { key: 'llm.base_url' },
          update: { value: body.baseUrl },
          create: { key: 'llm.base_url', value: body.baseUrl },
        })
      );
    }

    if (body.model !== undefined) {
      updates.push(
        prisma.systemConfig.upsert({
          where: { key: 'llm.model' },
          update: { value: body.model },
          create: { key: 'llm.model', value: body.model },
        })
      );
    }

    if (body.apiKey !== undefined) {
      // Only update if not empty and not the masked placeholder
      if (body.apiKey && !body.apiKey.startsWith('••••')) {
        updates.push(
          prisma.systemConfig.upsert({
            where: { key: 'llm.api_key' },
            update: { value: body.apiKey },
            create: { key: 'llm.api_key', value: body.apiKey },
          })
        );
      }
    }

    if (body.context !== undefined) {
      updates.push(
        prisma.systemConfig.upsert({
          where: { key: 'llm.context' },
          update: { value: body.context },
          create: { key: 'llm.context', value: body.context },
        })
      );
    }

    await Promise.all(updates);
    
    // Clear cache
    clearLLMConfigCache();

    // Return updated config
    const config = await getLLMConfig();
    return {
      provider: config.provider,
      baseUrl: config.baseUrl || '',
      model: config.model,
      context: config.context || '',
      apiKey: config.apiKey ? '••••••••' + config.apiKey.slice(-4) : null,
      hasApiKey: !!config.apiKey,
    };
  });

  // ============================================
  // LLM Categorization Endpoints
  // ============================================

  // GET /api/admin/llm/status - Check LLM availability
  app.get('/admin/llm/status', async (request, reply) => {
    const status = await checkLLMAvailability();
    return status;
  });

  // GET /api/admin/categorization/stats - Get categorization progress
  app.get('/admin/categorization/stats', async (request, reply) => {
    const [totalWords, categorizedWordsRaw, wordsByTheme] = await Promise.all([
      prisma.word.count(),
      prisma.wordTheme.groupBy({
        by: ['wordId'],
        _count: { _all: true },
      }),
      prisma.wordTheme.groupBy({
        by: ['themeId'],
        _count: { wordId: true },
      }),
    ]);

    const categorizedWords = categorizedWordsRaw.length;

    // Get theme names
    const themes = await prisma.theme.findMany();
    const themeMap = Object.fromEntries(themes.map(t => [t.id, t]));

    const themeStats = wordsByTheme.map(item => ({
      themeId: item.themeId,
      themeSlug: themeMap[item.themeId]?.slug || 'unknown',
      themeName: themeMap[item.themeId]?.name || 'Unknown',
      count: item._count.wordId,
    }));

    return {
      totalWords,
      categorizedWords,
      uncategorizedWords: totalWords - categorizedWords,
      themeStats,
    };
  });

  // POST /api/admin/categorize/preview - Preview categorization for a word
  app.post('/admin/categorize/preview', async (request, reply) => {
    const body = request.body as { word?: string; wordId?: string };

    if (!body.word && !body.wordId) {
      return reply.status(400).send({ error: 'word or wordId is required' });
    }

    let wordData: { word: string; definition: string | null; partOfSpeech: any };
    
    if (body.wordId) {
      const word = await prisma.word.findUnique({
        where: { id: body.wordId },
        select: { word: true, definition: true, partOfSpeech: true },
      });
      if (!word) {
        return reply.status(404).send({ error: 'Word not found' });
      }
      wordData = word;
    } else {
      wordData = { word: body.word!, definition: null, partOfSpeech: null };
    }

    const category = await categorizeWord(
      wordData.word,
      wordData.definition || undefined,
      wordData.partOfSpeech as string[] | undefined
    );

    return { word: wordData.word, category };
  });

  // POST /api/admin/categorize/batch - Batch categorize uncategorized words
  app.post('/admin/categorize/batch', async (request, reply) => {
    const body = request.body as { 
      limit?: number; 
      overwrite?: boolean;
      themeSlugs?: string[];
    };
    
    const limit = body.limit || 100;
    const overwrite = body.overwrite || false;
    const themeSlugs = body.themeSlugs || THEMES.map(t => t.slug);
    const CHUNK_SIZE = 100; // Words per LLM request

    // Get themes
    const themes = await prisma.theme.findMany({
      where: { slug: { in: themeSlugs } },
    });
    const themeBySlug = Object.fromEntries(themes.map(t => [t.slug, t]));

    // Get uncategorized words (or all if overwrite)
    const words = await prisma.word.findMany({
      where: body.overwrite ? {} : {
        themes: { none: {} },
      },
      select: {
        id: true,
        word: true,
        definition: true,
        partOfSpeech: true,
      },
      take: limit,
    });

    if (words.length === 0) {
      return { message: 'No words to categorize', categorized: 0 };
    }

    // Process in chunks to avoid token limits
    const allResults: Array<{ word: string; category: string }> = [];
    const chunks = [];
    for (let i = 0; i < words.length; i += CHUNK_SIZE) {
      chunks.push(words.slice(i, i + CHUNK_SIZE));
    }

    console.log(`Categorizing ${words.length} words in ${chunks.length} chunk(s)...`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} words)...`);
      
      const chunkResults = await categorizeWordsBatch(
        chunk.map(w => ({
          word: w.word,
          definition: w.definition || undefined,
          partOfSpeech: w.partOfSpeech as string[] | undefined,
        }))
      );
      
      allResults.push(...chunkResults);
    }

    // Build wordId -> category map
    const wordCategoryMap = new Map(
      allResults.map((r, i) => [words[i].id, r.category])
    );

    // Clear existing themes if overwrite
    if (overwrite) {
      await prisma.wordTheme.deleteMany({
        where: { wordId: { in: words.map(w => w.id) } },
      });
    }

    // Insert new theme associations
    const themeInserts: Array<{ wordId: string; themeId: string }> = [];
    
    for (const [wordId, category] of wordCategoryMap) {
      if (category !== 'general' && themeBySlug[category]) {
        themeInserts.push({
          wordId,
          themeId: themeBySlug[category].id,
        });
      }
    }

    if (themeInserts.length > 0) {
      await prisma.wordTheme.createMany({
        data: themeInserts,
        skipDuplicates: true,
      });
    }

    // Count by category
    const categoryCounts: Record<string, number> = {};
    for (const r of allResults) {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    }

    return {
      message: `Categorized ${allResults.length} words`,
      total: allResults.length,
      tagged: themeInserts.length,
      categoryCounts,
    };
  });

  // POST /api/admin/categorize/single - Categorize and save a single word
  app.post('/admin/categorize/single', async (request, reply) => {
    const body = request.body as { wordId: string };

    if (!body.wordId) {
      return reply.status(400).send({ error: 'wordId is required' });
    }

    const word = await prisma.word.findUnique({
      where: { id: body.wordId },
      select: { id: true, word: true, definition: true, partOfSpeech: true },
    });

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    const category = await categorizeWord(
      word.word,
      word.definition || undefined,
      word.partOfSpeech as string[] | undefined
    );

    // Get theme
    const theme = await prisma.theme.findUnique({
      where: { slug: category },
    });

    // Clear existing themes for this word
    await prisma.wordTheme.deleteMany({
      where: { wordId: word.id },
    });

    // Add new theme if not 'general'
    if (theme && category !== 'general') {
      await prisma.wordTheme.create({
        data: {
          wordId: word.id,
          themeId: theme.id,
        },
      });
    }

    return { word: word.word, category, tagged: !!theme };
  });
}
