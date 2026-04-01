import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import { categorizeWord, checkLLMAvailability, clearLLMConfigCache, getLLMConfig, testProviderConfig } from '../lib/llm.js';
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
  app.get('/admin/stats', async (_request, _reply) => {
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
        categorized: await prisma.wordTheme.count(),
      },
      activity: {
        totalSessions,
      },
    };
  });

  // ============================================
  // GET /api/admin/users - List users (paginated)
  // ============================================
  app.get('/admin/users', async (request, _reply) => {
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
  app.get('/admin/config', async (_request, _reply) => {
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
  app.get('/admin/llm/providers', async (_request, _reply) => {
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
      maxTokens?: number;
      reasoning?: boolean;
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
        maxTokens: body.maxTokens || 4096,
        reasoning: body.reasoning !== undefined ? body.reasoning : true,
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
      maxTokens?: number;
      reasoning?: boolean;
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
    if (body.maxTokens !== undefined) updateData.maxTokens = body.maxTokens;
    if (body.reasoning !== undefined) updateData.reasoning = body.reasoning;
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
  app.get('/admin/llm/config', async (_request, _reply) => {
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
  app.get('/admin/llm/status', async (_request, _reply) => {
    const status = await checkLLMAvailability();
    return status;
  });

  // GET /api/admin/categorization/stats - Get categorization progress
  app.get('/admin/categorization/stats', async (_request, _reply) => {
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

    // Add theme (including 'general' to mark as categorized)
    if (theme) {
      await prisma.wordTheme.create({
        data: {
          wordId: word.id,
          themeId: theme.id,
        },
      });
    }

    return { word: word.word, category, tagged: !!theme && category !== 'general' };
  });

  // ============================================
  // Job Management Endpoints
  // ============================================

  // GET /api/admin/jobs - List all jobs
  app.get('/admin/jobs', async (request, _reply) => {
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
  app.post('/admin/jobs/categorize', async (request, _reply) => {
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
  app.post('/admin/jobs/runner/start', async (_request, _reply) => {
    startJobRunner(5000);
    return { message: 'Job runner started' };
  });

  // POST /api/admin/jobs/runner/stop - Stop job runner
  app.post('/admin/jobs/runner/stop', async (_request, _reply) => {
    stopJobRunner();
    return { message: 'Job runner stopped' };
  });
}

// Public report endpoint — no auth required (read-only HTML page)
export async function jobReportRoutes(app: FastifyInstance) {
  app.get('/admin/jobs/:id/report', async (request, reply) => {
    const params = request.params as { id: string };
    const job = await getJob(params.id);

    if (!job) {
      return reply.type('text/html').status(404).send('<h1>Job not found</h1>');
    }

    const result = (job.result as any) || {};
    const words: Array<{ word: string; category: string }> = result.words || [];
    const categoryCounts: Record<string, number> = result.categoryCounts || {};
    const totalWords = words.length;

    // Compute stats
    const generalCount = categoryCounts['general'] || 0;
    const generalPct = totalWords > 0 ? Math.round((generalCount / totalWords) * 100) : 0;
    const isHighGeneral = generalPct >= 70 && totalWords > 0;

    // Sort categories by count descending
    const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

    // Format dates
    const formatDate = (d: Date | string | null) => {
      if (!d) return 'N/A';
      return new Date(d).toLocaleString();
    };
    const formatDuration = (started: string | null, completed: string | null) => {
      if (!started || !completed) return '';
      const ms = new Date(completed).getTime() - new Date(started).getTime();
      const s = Math.floor(ms / 1000);
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      return `${m}m ${s % 60}s`;
    };

    // Category colors
    const catColors: Record<string, string> = {
      technology: '#3b82f6', business: '#f59e0b', environment: '#10b981',
      health: '#ef4444', science: '#8b5cf6', education: '#06b6d4',
      food: '#f97316', society: '#ec4899', general: '#6b7280',
    };

    // Build category summary rows
    const categoryRows = sortedCategories.map(([cat, count]) => {
      const pct = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
      const barWidth = totalWords > 0 ? Math.round((count / totalWords) * 100) : 0;
      const color = catColors[cat] || '#6b7280';
      const warning = cat === 'general' && isHighGeneral ? ' ⚠ HIGH' : '';
      return `<tr><td style="color:${color};font-weight:600">${cat}</td><td>${count}</td><td>${pct}%</td><td><div style="background:${color};width:${barWidth}%;height:8px;border-radius:4px"></div></td><td>${warning}</td></tr>`;
    }).join('\n');

    // Build word table rows
    const wordRows = words.map((w, i) => {
      const color = catColors[w.category] || '#6b7280';
      return `<tr class="word-row" data-category="${w.category}" data-word="${w.word.toLowerCase()}"><td>${i + 1}</td><td style="font-weight:500">${w.word}</td><td><span style="color:${color};font-weight:500">${w.category}</span></td></tr>`;
    }).join('\n');

    const duration = formatDuration(job.startedAt as any, job.completedAt as any);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Categorization Report — ${job.id.slice(0, 8)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 20px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }
  .badge-gray { background: #f1f5f9; color: #475569; }
  .warning { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; color: #92400e; font-size: 14px; }
  .card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 16px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 12px; text-align: left; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  th { font-weight: 600; color: #64748b; font-size: 12px; text-transform: uppercase; }
  tr:hover { background: #f8fafc; }
  .controls { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
  select, input { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
  input { flex: 1; min-width: 200px; }
  .footer { color: #94a3b8; font-size: 12px; margin-top: 16px; }
</style>
</head>
<body>
  <h1>📋 Categorization Report</h1>
  <div class="meta">
    <span class="font-mono" style="font-size:12px;color:#94a3b8">${job.id}</span> ·
    <span class="badge ${job.status === 'COMPLETED' ? 'badge-green' : job.status === 'FAILED' ? 'badge-red' : 'badge-gray'}">${job.status}</span> ·
    ${formatDate(job.createdAt)}${duration ? ` · ⏱ ${duration}` : ''}
  </div>

  <div class="meta">${result.message || ''} · ${result.errors || 0} errors</div>

  ${isHighGeneral ? `<div class="warning">⚠ <strong>${generalPct}% of words were categorized as &quot;general&quot;</strong> — the model may have failed to produce proper categories. Check your LLM provider configuration and model selection.</div>` : ''}

  <div class="card">
    <h2>Category Distribution</h2>
    <table>
      <thead><tr><th>Category</th><th>Count</th><th>%</th><th style="width:40%"></th><th></th></tr></thead>
      <tbody>${categoryRows}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>Word Results</h2>
    ${totalWords === 0 ? '<p style="color:#64748b;font-size:14px">No per-word data available for this job. Word-level tracking was added in a recent update.</p>' : `
    <div class="controls">
      <select id="filterCategory">
        <option value="">All categories</option>
        ${sortedCategories.map(([cat]) => `<option value="${cat}">${cat} (${categoryCounts[cat]})</option>`).join('\n')}
      </select>
      <input type="text" id="searchWord" placeholder="Search words...">
    </div>
    <table>
      <thead><tr><th>#</th><th>Word</th><th>Category</th></tr></thead>
      <tbody id="wordTableBody">${wordRows}</tbody>
    </table>
    <div class="footer" id="countLabel">Showing ${totalWords} of ${totalWords} words</div>
    `}
  </div>

  ${totalWords === 0 ? '' : `
  <script>
    const rows = document.querySelectorAll('.word-row');
    const categorySelect = document.getElementById('filterCategory');
    const searchInput = document.getElementById('searchWord');
    const countLabel = document.getElementById('countLabel');
    const total = ${totalWords};

    function filter() {
      const cat = categorySelect.value;
      const search = searchInput.value.toLowerCase().trim();
      let visible = 0;
      rows.forEach(row => {
        const matchCat = !cat || row.dataset.category === cat;
        const matchSearch = !search || row.dataset.word.includes(search);
        row.style.display = (matchCat && matchSearch) ? '' : 'none';
        if (matchCat && matchSearch) visible++;
      });
      countLabel.textContent = 'Showing ' + visible + ' of ' + total + ' words';
    }

    categorySelect.addEventListener('change', filter);
    searchInput.addEventListener('input', filter);
  </script>
  `}
</body>
</html>`;

    return reply.type('text/html; charset=utf-8').send(html);
  });
}
