import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { categorizeWord, categorizeWordsBatch, checkLLMAvailability, clearLLMConfigCache, getLLMConfig, testProviderConfig, THEMES } from '../lib/llm.js';
import {
  createJob,
  getJob,
  getJobs,
  cancelJob,
  deleteJob,
  startJobRunner,
  stopJobRunner,
} from '../lib/jobs.js';

// Import job handlers to register them
import '../lib/categorize-job.js';

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
  // LLM Provider Management Endpoints
  // ============================================

  // GET /api/admin/llm/providers - List all providers
  app.get('/admin/llm/providers', async (request, reply) => {
    const providers = await prisma.llmProvider.findMany({
      orderBy: { createdAt: 'desc' },
    });
    
    // Mask API keys
    return providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? '••••••••' + p.apiKey.slice(-4) : null,
      hasApiKey: !!p.apiKey,
    }));
  });

  // GET /api/admin/llm/providers/:id - Get single provider
  app.get('/admin/llm/providers/:id', async (request, reply) => {
    const params = request.params as { id: string };
    
    const provider = await prisma.llmProvider.findUnique({
      where: { id: params.id },
    });
    
    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }
    
    return {
      ...provider,
      apiKey: provider.apiKey ? '••••••••' + provider.apiKey.slice(-4) : null,
      hasApiKey: !!provider.apiKey,
    };
  });

  // POST /api/admin/llm/providers - Create new provider
  app.post('/admin/llm/providers', async (request, reply) => {
    const body = request.body as {
      name: string;
      provider: string;
      model: string;
      baseUrl?: string;
      apiKey?: string;
      context?: string;
      isActive?: boolean;
    };

    if (!body.name || !body.provider || !body.model) {
      return reply.status(400).send({ error: 'Name, provider, and model are required' });
    }

    // Check for duplicate name
    const existing = await prisma.llmProvider.findUnique({
      where: { name: body.name },
    });
    
    if (existing) {
      return reply.status(409).send({ error: 'Provider with this name already exists' });
    }

    // If setting as active, deactivate others
    if (body.isActive) {
      await prisma.llmProvider.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const newProvider = await prisma.llmProvider.create({
      data: {
        name: body.name,
        provider: body.provider,
        model: body.model,
        baseUrl: body.baseUrl || null,
        apiKey: body.apiKey || null,
        context: body.context || null,
        isActive: body.isActive ?? false,
      },
    });

    // Clear cache if this is now active
    if (newProvider.isActive) {
      clearLLMConfigCache();
    }

    return {
      ...newProvider,
      apiKey: newProvider.apiKey ? '••••••••' + newProvider.apiKey.slice(-4) : null,
      hasApiKey: !!newProvider.apiKey,
    };
  });

  // PUT /api/admin/llm/providers/:id - Update provider
  app.put('/admin/llm/providers/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      name?: string;
      provider?: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      context?: string;
      isActive?: boolean;
    };

    const existing = await prisma.llmProvider.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    // Check for duplicate name if name is being changed
    if (body.name && body.name !== existing.name) {
      const duplicate = await prisma.llmProvider.findUnique({
        where: { name: body.name },
      });
      if (duplicate) {
        return reply.status(409).send({ error: 'Provider with this name already exists' });
      }
    }

    // If setting as active, deactivate others
    if (body.isActive) {
      await prisma.llmProvider.updateMany({
        where: { isActive: true, id: { not: params.id } },
        data: { isActive: false },
      });
    }

    // Build update data
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.provider !== undefined) updateData.provider = body.provider;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.baseUrl !== undefined) updateData.baseUrl = body.baseUrl || null;
    if (body.context !== undefined) updateData.context = body.context || null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    
    // Only update API key if it's a new value (not the masked placeholder)
    if (body.apiKey !== undefined && body.apiKey && !body.apiKey.startsWith('••••')) {
      updateData.apiKey = body.apiKey;
    }

    const updated = await prisma.llmProvider.update({
      where: { id: params.id },
      data: updateData,
    });

    // Clear cache
    clearLLMConfigCache();

    return {
      ...updated,
      apiKey: updated.apiKey ? '••••••••' + updated.apiKey.slice(-4) : null,
      hasApiKey: !!updated.apiKey,
    };
  });

  // DELETE /api/admin/llm/providers/:id - Delete provider
  app.delete('/admin/llm/providers/:id', async (request, reply) => {
    const params = request.params as { id: string };

    const provider = await prisma.llmProvider.findUnique({
      where: { id: params.id },
    });

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    await prisma.llmProvider.delete({
      where: { id: params.id },
    });

    // Clear cache if deleted provider was active
    if (provider.isActive) {
      clearLLMConfigCache();
    }

    return { success: true };
  });

  // PUT /api/admin/llm/providers/:id/activate - Set active provider
  app.put('/admin/llm/providers/:id/activate', async (request, reply) => {
    const params = request.params as { id: string };

    const provider = await prisma.llmProvider.findUnique({
      where: { id: params.id },
    });

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    // Deactivate all providers
    await prisma.llmProvider.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Activate this one
    await prisma.llmProvider.update({
      where: { id: params.id },
      data: { isActive: true },
    });

    // Clear cache
    clearLLMConfigCache();

    return { success: true };
  });

  // POST /api/admin/llm/providers/:id/test - Test provider connection
  app.post('/admin/llm/providers/:id/test', async (request, reply) => {
    const params = request.params as { id: string };

    const provider = await prisma.llmProvider.findUnique({
      where: { id: params.id },
    });

    if (!provider) {
      return reply.status(404).send({ error: 'Provider not found' });
    }

    const result = await testProviderConfig({
      provider: provider.provider,
      model: provider.model,
      apiKey: provider.apiKey || undefined,
      baseUrl: provider.baseUrl || undefined,
    });

    return result;
  });

  // POST /api/admin/llm/test - Test a provider config without saving
  app.post('/admin/llm/test', async (request, reply) => {
    const body = request.body as {
      provider: string;
      model: string;
      apiKey?: string;
      baseUrl?: string;
    };

    if (!body.provider || !body.model) {
      return reply.status(400).send({ error: 'Provider and model are required' });
    }

    const result = await testProviderConfig(body);
    return result;
  });

  // GET /api/admin/llm/config - Get active LLM config (for backwards compatibility)
  app.get('/admin/llm/config', async (request, reply) => {
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

  // ============================================
  // Job Management Endpoints
  // ============================================

  // GET /api/admin/jobs - List all jobs
  app.get('/admin/jobs', async (request, reply) => {
  const query = request.query as {
    status?: string;
    type?: string;
    limit?: string;
  };

  return getJobs({
    status: query.status as any,
    type: query.type as any,
    limit: query.limit ? parseInt(query.limit) : 50,
  });
});

// GET /api/admin/jobs/:id - Get job details
app.get('/admin/jobs/:id', async (request, reply) => {
  const params = request.params as { id: string };
  
  const job = await getJob(params.id);
  
  if (!job) {
    return reply.status(404).send({ error: 'Job not found' });
  }
  
  return job;
});

// POST /api/admin/jobs - Create a new job
app.post('/admin/jobs', async (request, reply) => {
  const body = request.body as {
    type: string;
    payload: any;
    priority?: number;
  };

  if (!body.type) {
    return reply.status(400).send({ error: 'Job type is required' });
  }

  const validTypes = ['CATEGORIZE_WORDS', 'IMPORT_WORDS', 'EXPORT_DATA', 'CLEANUP'];
  if (!validTypes.includes(body.type)) {
    return reply.status(400).send({ error: `Invalid job type. Valid types: ${validTypes.join(', ')}` });
  }

  const job = await createJob(body.type as any, body.payload || {}, {
    priority: body.priority,
  });

  return job;
});

// POST /api/admin/jobs/categorize - Create categorize job (convenience)
app.post('/admin/jobs/categorize', async (request, reply) => {
  const body = request.body as {
    limit?: number;
    overwrite?: boolean;
    themeSlugs?: string[];
  };

  const job = await createJob('CATEGORIZE_WORDS', {
    limit: body.limit,
    overwrite: body.overwrite,
    themeSlugs: body.themeSlugs,
  });

  return job;
});

// PUT /api/admin/jobs/:id/cancel - Cancel a job
app.put('/admin/jobs/:id/cancel', async (request, reply) => {
  const params = request.params as { id: string };
  
  const success = await cancelJob(params.id);
  
  if (!success) {
    return reply.status(400).send({ error: 'Cannot cancel job (not found or already completed)' });
  }
  
  return { success: true };
});

// DELETE /api/admin/jobs/:id - Delete a job
app.delete('/admin/jobs/:id', async (request, reply) => {
  const params = request.params as { id: string };
  
  const success = await deleteJob(params.id);
  
  if (!success) {
    return reply.status(404).send({ error: 'Job not found' });
  }
  
  return { success: true };
});

// POST /api/admin/jobs/runner/start - Start job runner
app.post('/admin/jobs/runner/start', async (request, reply) => {
  startJobRunner(5000);
  return { message: 'Job runner started' };
});

// POST /api/admin/jobs/runner/stop - Stop job runner
app.post('/admin/jobs/runner/stop', async (request, reply) => {
  stopJobRunner();
  return { message: 'Job runner stopped' };
});
}
