import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { TIER_LIMITS, canShareList, canCreateList, canUseLlm, trackLlmCall, getUserTier } from '../lib/lists.js';
import { getLLMConfig, callLLM } from '../lib/llm.js';

export async function listsRoutes(app: FastifyInstance) {
  // All list routes require authentication
  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for public shared list view
    if (request.url.includes('/lists/shared/')) return;
    return authenticate(request, reply);
  });

  // ============================================
  // GET /api/lists - Get user's lists
  // ============================================
  app.get('/lists', async (request, _reply) => {
    const userId = request.user!.userId;

    // Get user's own lists + lists shared with user
    const [ownLists, sharedLists] = await Promise.all([
      prisma.studyList.findMany({
        where: { userId },
        include: {
          _count: { select: { words: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      }),
      prisma.sharedList.findMany({
        where: { sharedWith: userId },
        include: {
          list: {
            include: {
              _count: { select: { words: true } },
              user: { select: { id: true, username: true } },
            },
          },
        },
      }),
    ]);

    const lists = [
      ...ownLists.map((list) => ({
        id: list.id,
        name: list.name,
        description: list.description,
        color: list.color,
        icon: list.icon,
        isSystem: list.isSystem,
        isPinned: list.isPinned,
        wordCount: list._count.words,
        isOwner: true,
        owner: null,
      })),
      ...sharedLists.map((shared) => ({
        id: shared.list.id,
        name: shared.list.name,
        description: shared.list.description,
        color: shared.list.color,
        icon: shared.list.icon,
        isSystem: shared.list.isSystem,
        isPinned: false,
        wordCount: shared.list._count.words,
        isOwner: false,
        owner: {
          id: shared.list.user.id,
          username: shared.list.user.username,
        },
      })),
    ];

    return lists;
  });

  // ============================================
  // GET /api/lists/:id - Get single list with words
  // ============================================
  app.get('/lists/:id', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const query = request.query as { page?: string; limit?: string };

    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const skip = (page - 1) * limit;

    // Check access (owner or shared)
    const list = await prisma.studyList.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    const isOwner = list.userId === userId;
    const isShared = await prisma.sharedList.findUnique({
      where: { listId_sharedWith: { listId: id, sharedWith: userId } },
    });

    if (!isOwner && !isShared) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // Get words in list
    const [words, total] = await Promise.all([
      prisma.studyListWord.findMany({
        where: { listId: id },
        include: {
          word: {
            select: {
              id: true,
              word: true,
              definition: true,
              cefrLevel: true,
              phoneticUs: true,
            },
          },
        },
        orderBy: { addedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.studyListWord.count({ where: { listId: id } }),
    ]);

    return {
      id: list.id,
      name: list.name,
      description: list.description,
      color: list.color,
      icon: list.icon,
      isSystem: list.isSystem,
      isPinned: list.isPinned,
      isOwner,
      owner: isOwner ? null : { id: list.user.id, username: list.user.username },
      words: words.map((w) => ({
        id: w.word.id,
        word: w.word.word,
        definition: w.word.definition,
        cefrLevel: w.word.cefrLevel,
        phoneticUs: w.word.phoneticUs,
        addedAt: w.addedAt,
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
  // POST /api/lists - Create new list
  // ============================================
  app.post('/lists', async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      name: string;
      description?: string;
      color?: string;
      icon?: string;
    };

    if (!body.name || body.name.trim().length === 0) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    // Get user's subscription tier
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });

    const tier = user?.subscriptionTier || 'FREE';
    const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

    // Check list count limit
    const listCount = await prisma.studyList.count({
      where: { userId },
    });

    if (listCount >= limits.maxLists) {
      return reply.status(400).send({
        error: `List limit reached (${limits.maxLists} lists for ${tier} tier)`,
      });
    }

    const list = await prisma.studyList.create({
      data: {
        userId,
        name: body.name.trim(),
        description: body.description,
        color: body.color || '#6366f1',
        icon: body.icon || '📚',
      },
    });

    return reply.status(201).send(list);
  });

  // ============================================
  // PUT /api/lists/:id - Update list
  // ============================================
  app.put('/lists/:id', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
    };

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const updated = await prisma.studyList.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        description: body.description,
        color: body.color,
        icon: body.icon,
      },
    });

    return updated;
  });

  // ============================================
  // DELETE /api/lists/:id - Delete list
  // ============================================
  app.delete('/lists/:id', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    if (list.isSystem) {
      return reply.status(400).send({ error: 'Cannot delete system lists' });
    }

    await prisma.studyList.delete({
      where: { id },
    });

    return { success: true };
  });

  // ============================================
  // POST /api/lists/:id/words - Add word to list
  // ============================================
  app.post('/lists/:id/words', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const body = request.body as { wordId: string };

    if (!body.wordId) {
      return reply.status(400).send({ error: 'wordId is required' });
    }

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // Check word exists
    const word = await prisma.word.findUnique({
      where: { id: body.wordId },
    });

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // Check tier limits
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });

    const tier = user?.subscriptionTier || 'FREE';
    const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

    const currentWordCount = await prisma.studyListWord.count({
      where: { listId: id },
    });

    if (currentWordCount >= limits.maxWordsPerList) {
      return reply.status(400).send({
        error: `Word limit reached (${limits.maxWordsPerList} words per list for ${tier} tier)`,
      });
    }

    // Add word to list (upsert to handle duplicates)
    try {
      const listWord = await prisma.studyListWord.create({
        data: {
          listId: id,
          wordId: body.wordId,
        },
      });

      // Update word count
      await prisma.studyList.update({
        where: { id },
        data: { wordCount: { increment: 1 } },
      });

      return reply.status(201).send(listWord);
    } catch (error) {
      // Unique constraint violation - word already in list
      return reply.status(409).send({ error: 'Word already in list' });
    }
  });

  // POST /api/lists/:id/words/bulk — Bulk add words to list
  app.post('/lists/:id/words/bulk', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const body = request.body as { wordIds: string[] };

    if (!body.wordIds?.length) {
      return reply.status(400).send({ error: 'wordIds array is required' });
    }

    const list = await prisma.studyList.findUnique({ where: { id } });
    if (!list) return reply.status(404).send({ error: 'List not found' });
    if (list.userId !== userId) return reply.status(403).send({ error: 'Access denied' });

    // Bulk upsert
    let added = 0;
    for (const wordId of body.wordIds) {
      try {
        await prisma.studyListWord.create({ data: { listId: id, wordId } });
        added++;
      } catch {
        // Skip duplicates
      }
    }

    // Update word count
    const totalWords = await prisma.studyListWord.count({ where: { listId: id } });
    await prisma.studyList.update({ where: { id }, data: { wordCount: totalWords } });

    return { added, total: body.wordIds.length, skipped: body.wordIds.length - added };
  });

  // ============================================
  // DELETE /api/lists/:id/words/:wordId - Remove word from list
  // ============================================
  app.delete('/lists/:id/words/:wordId', async (request, reply) => {
    const userId = request.user!.userId;
    const { id, wordId } = request.params as { id: string; wordId: string };

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const listWord = await prisma.studyListWord.findUnique({
      where: { listId_wordId: { listId: id, wordId } },
    });

    if (!listWord) {
      return reply.status(404).send({ error: 'Word not in list' });
    }

    await prisma.studyListWord.delete({
      where: { id: listWord.id },
    });

    // Update word count
    await prisma.studyList.update({
      where: { id },
      data: { wordCount: { decrement: 1 } },
    });

    return { success: true };
  });

  // ============================================
  // PUT /api/lists/:id/pin - Pin/unpin list
  // ============================================
  app.put('/lists/:id/pin', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const body = request.body as { pinned: boolean };

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // If pinning, unpin any currently pinned list first
    if (body.pinned) {
      await prisma.studyList.updateMany({
        where: { userId, isPinned: true },
        data: { isPinned: false },
      });
    }

    const updated = await prisma.studyList.update({
      where: { id },
      data: { isPinned: body.pinned },
    });

    return updated;
  });

  // ============================================
  // POST /api/lists/:id/share - Share list with user
  // ============================================
  app.post('/lists/:id/share', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const body = request.body as { email?: string; username?: string };

    if (!body.email && !body.username) {
      return reply.status(400).send({ error: 'Email or username is required' });
    }

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // Check tier allows sharing
    const shareCheck = await canShareList(userId);
    if (!shareCheck.allowed) {
      return reply.status(403).send({ error: shareCheck.reason });
    }

    // Find user to share with
    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: body.email?.toLowerCase() },
          { username: body.username },
        ],
      },
    });

    if (!targetUser) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (targetUser.id === userId) {
      return reply.status(400).send({ error: 'Cannot share with yourself' });
    }

    // Check if already shared
    const existing = await prisma.sharedList.findUnique({
      where: {
        listId_sharedWith: { listId: id, sharedWith: targetUser.id },
      },
    });

    if (existing) {
      return reply.status(409).send({ error: 'Already shared with this user' });
    }

    const shared = await prisma.sharedList.create({
      data: {
        listId: id,
        sharedBy: userId,
        sharedWith: targetUser.id,
      },
    });

    return {
      ...shared,
      user: {
        id: targetUser.id,
        username: targetUser.username,
        email: targetUser.email,
      },
    };
  });

  // ============================================
  // DELETE /api/lists/:id/share/:targetUserId - Remove access
  // ============================================
  app.delete('/lists/:id/share/:targetUserId', async (request, reply) => {
    const userId = request.user!.userId;
    const { id, targetUserId } = request.params as { id: string; targetUserId: string };

    const list = await prisma.studyList.findUnique({
      where: { id },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    // Only owner can remove access
    if (list.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const shared = await prisma.sharedList.findUnique({
      where: {
        listId_sharedWith: { listId: id, sharedWith: targetUserId },
      },
    });

    if (!shared) {
      return reply.status(404).send({ error: 'Share not found' });
    }

    await prisma.sharedList.delete({
      where: { id: shared.id },
    });

    return { success: true };
  });

  // ============================================
  // POST /lists/:id/share-token — Generate public share token
  // ============================================
  app.post('/lists/:id/share-token', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const list = await prisma.studyList.findFirst({ where: { id, userId } });
    if (!list) return reply.status(404).send({ error: 'List not found' });
    if (list.isSystem) return reply.status(400).send({ error: 'Cannot share system lists' });

    // Generate token if not exists
    if (!list.shareToken) {
      const crypto = await import('crypto');
      const token = crypto.randomBytes(12).toString('base64url');
      await prisma.studyList.update({ where: { id }, data: { shareToken: token } });
      return { shareToken: token, shareUrl: `/lists/shared/${token}` };
    }

    return { shareToken: list.shareToken, shareUrl: `/lists/shared/${list.shareToken}` };
  });

  // ============================================
  // DELETE /lists/:id/share-token — Revoke public share
  // ============================================
  app.delete('/lists/:id/share-token', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const list = await prisma.studyList.findFirst({ where: { id, userId } });
    if (!list) return reply.status(404).send({ error: 'List not found' });

    await prisma.studyList.update({ where: { id }, data: { shareToken: null } });
    return { success: true };
  });

  // ============================================
  // GET /lists/shared/:token — View shared list (public, no auth)
  // ============================================
  app.get('/lists/shared/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const list = await prisma.studyList.findUnique({
      where: { shareToken: token },
      include: {
        user: { select: { username: true } },
        words: {
          include: { word: { select: { id: true, word: true, definition: true, cefrLevel: true, partOfSpeech: true, phoneticUs: true } } },
          orderBy: { word: { word: 'asc' } },
        },
      },
    });

    if (!list) return reply.status(404).send({ error: 'Shared list not found or link expired' });

    return {
      id: list.id,
      name: list.name,
      description: list.description,
      icon: list.icon,
      color: list.color,
      wordCount: list.wordCount,
      sharedBy: list.user.username,
      words: list.words.map(w => ({
        id: w.word.id,
        word: w.word.word,
        definition: w.word.definition,
        cefrLevel: w.word.cefrLevel,
        partOfSpeech: w.word.partOfSpeech,
        phoneticUs: w.word.phoneticUs,
      })),
    };
  });

  // ============================================
  // POST /lists/import-shared/:token — Import shared list into user's account
  // ============================================
  app.post('/lists/import-shared/:token', async (request, reply) => {
    const userId = request.user!.userId;
    const { token } = request.params as { token: string };
    const body = request.body as { name?: string };

    const list = await prisma.studyList.findUnique({
      where: { shareToken: token },
      include: {
        words: { include: { word: true } },
      },
    });

    if (!list) return reply.status(404).send({ error: 'Shared list not found' });

    // Don't import your own list
    if (list.userId === userId) return reply.status(400).send({ error: 'Cannot import your own list' });

    const newList = await prisma.studyList.create({
      data: {
        userId,
        name: body.name || list.name,
        description: `Imported from ${list.name}`,
        icon: list.icon,
        color: list.color,
        wordCount: list.words.length,
        words: {
          create: list.words.map(w => ({ wordId: w.word.id })),
        },
      },
      include: { words: true },
    });

    return { success: true, list: { id: newList.id, name: newList.name, wordCount: newList.words.length } };
  });

  // ============================================
  // POST /api/lists/generate - Generate a word list using LLM
  // ============================================
  app.post('/lists/generate', async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      topic?: string;
      cefrLevel?: string;
      wordCount?: number;
      name?: string;
    };

    // Validate inputs
    const topic = body?.topic?.trim();
    const cefrLevel = body?.cefrLevel || 'B1';
    const requestedCount = Math.min(Math.max(body?.wordCount || 20, 5), 50);
    const listName = body?.name?.trim() || `Generated: ${topic || cefrLevel}`;

    if (!topic && cefrLevel === 'B1') {
      return reply.status(400).send({ error: 'Provide a topic or CEFR level' });
    }

    // Check tier allows LLM usage
    const llmCheck = await canUseLlm(userId);
    if (!llmCheck.allowed) {
      return reply.status(403).send({ error: llmCheck.reason });
    }

    // Check user can create a list
    const listCheck = await canCreateList(userId);
    if (!listCheck.allowed) {
      return reply.status(403).send({ error: listCheck.reason });
    }

    try {
      const config = await getLLMConfig();

      // Build prompt for word generation
      const levelDesc = cefrLevel ? `at CEFR level ${cefrLevel}` : 'at intermediate level (B1-B2)';
      const topicDesc = topic ? `about "${topic}"` : 'useful vocabulary';

      const systemPrompt = `You are an English vocabulary expert. Generate vocabulary word lists for English learners.
You must return ONLY a valid JSON array of objects with this exact format:
[{"word": "example", "reason": "Brief reason why this word fits"}]
No markdown, no code blocks, no explanation. Just the JSON array.`;

      const userPrompt = `Generate a list of ${requestedCount} English vocabulary words ${levelDesc} ${topicDesc}.

Requirements:
- Words should be appropriate for the specified level
- Include a mix of nouns, verbs, adjectives
- Each word should be commonly used and practical
- Avoid overly obscure or archaic words
- Sort by usefulness/frequency (most useful first)

Return ONLY a JSON array of objects with "word" and "reason" fields.`;

      // Call LLM via shared callLLM (handles reasoning models, /no_think prefix, etc.)
      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      // Parse response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return reply.status(500).send({ error: 'LLM returned invalid format' });
      }

      let suggestions: Array<{ word: string; reason: string }>;
      try {
        suggestions = JSON.parse(jsonMatch[0]);
      } catch {
        return reply.status(500).send({ error: 'Failed to parse LLM response' });
      }

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        return reply.status(500).send({ error: 'LLM returned empty list' });
      }

      // Track LLM call
      await trackLlmCall(userId);

      // Match suggestions against our database
      const words = suggestions.map(s => s.word.toLowerCase().trim());
      const existingWords = await prisma.word.findMany({
        where: { word: { in: words } },
        select: { id: true, word: true, definition: true, cefrLevel: true, partOfSpeech: true, phoneticUs: true },
      });

      const wordMap = new Map(existingWords.map(w => [w.word.toLowerCase(), w]));

      // Build result with match status
      const results = suggestions.slice(0, requestedCount).map(s => {
        const normalizedWord = s.word.toLowerCase().trim();
        const dbWord = wordMap.get(normalizedWord);
        return {
          word: s.word,
          reason: s.reason,
          inDatabase: !!dbWord,
          wordData: dbWord || null,
        };
      });

      const inDbCount = results.filter(r => r.inDatabase).length;

      return {
        suggestions: results,
        totalSuggested: results.length,
        inDatabase: inDbCount,
        notInDatabase: results.length - inDbCount,
      };
    } catch (error: any) {
      console.error('LLM generation failed:', error);
      return reply.status(500).send({ error: 'Failed to generate word list. Please try again.' });
    }
  });

  // ============================================
  // POST /api/lists/generate/create - Create list from generated suggestions
  // ============================================
  app.post('/lists/generate/create', async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      name: string;
      description?: string;
      wordIds: string[];
    };

    if (!body?.name?.trim() || !body?.wordIds?.length) {
      return reply.status(400).send({ error: 'Name and word IDs required' });
    }

    // Check can create
    const listCheck = await canCreateList(userId);
    if (!listCheck.allowed) {
      return reply.status(403).send({ error: listCheck.reason });
    }

    // Check tier word limit
    const tier = await getUserTier(userId);
    const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
    if (body.wordIds.length > limits.maxWordsPerList) {
      return reply.status(400).send({ error: `Too many words. Limit is ${limits.maxWordsPerList} per list for ${tier} tier.` });
    }

    // Verify all words exist
    const existingCount = await prisma.word.count({
      where: { id: { in: body.wordIds } },
    });
    if (existingCount !== body.wordIds.length) {
      return reply.status(400).send({ error: 'Some words not found in database' });
    }

    // Create list with words
    const list = await prisma.studyList.create({
      data: {
        userId,
        name: body.name.trim(),
        description: body.description || `Generated list with ${body.wordIds.length} words`,
        isSystem: false,
      },
    });

    // Add words to list
    await prisma.studyListWord.createMany({
      data: body.wordIds.map(wordId => ({
        listId: list.id,
        wordId,
      })),
      skipDuplicates: true,
    });

    return {
      id: list.id,
      name: list.name,
      wordCount: body.wordIds.length,
    };
  });

  // GET /lists/:id/print — Print-friendly HTML view
  app.get('/lists/:id/print', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const list = await prisma.studyList.findFirst({
      where: { id, userId },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    const listWords = await prisma.studyListWord.findMany({
      where: { listId: id },
      include: {
        word: {
          include: {
            themes: { include: { theme: true } },
            progress: { where: { userId } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    const rows = listWords.map((lw, i) => {
      const w = lw.word;
      const status = (w as any).progress?.[0]?.status || 'new';
      const themes = (w as any).themes?.map((t: any) => t.theme?.name).filter(Boolean).join(', ') || '';
      const statusIcon = status === 'mastered' ? '✅' : status === 'learning' ? '📖' : '⬜';
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${i + 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">${statusIcon} ${w.word}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${w.cefrLevel || ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${w.definition || ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b">${themes}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${list.name} — Vocab Master</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1e293b; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #64748b; font-size: 14px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { background: #f8fafc; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    .footer { margin-top: 24px; font-size: 12px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px;text-align:right">
    <button onclick="window.print()" style="padding:8px 20px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save PDF</button>
  </div>
  <h1>${list.name}</h1>
  <p class="meta">${list.description || ''} — ${listWords.length} words — Generated ${new Date().toLocaleDateString()}</p>
  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Word</th>
        <th style="width:50px">Level</th>
        <th>Definition</th>
        <th>Topics</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">Generated by Vocab Master — ${new Date().toLocaleDateString()}</p>
</body>
</html>`;

    reply.type('text/html').send(html);
  });

  // GET /lists/:id/export/anki — Export list as Anki-compatible CSV
  app.get('/lists/:id/export/anki', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;

    const list = await prisma.studyList.findFirst({
      where: { id, userId },
      include: {
        words: {
          include: {
            word: {
              include: {
                themes: { include: { theme: true } },
                progress: { where: { userId } },
              },
            },
          },
          orderBy: { word: { word: 'asc' } },
        },
      },
    });

    if (!list) {
      return reply.status(404).send({ error: 'List not found' });
    }

    // Build CSV rows
    const rows: string[][] = [];
    // Header
    rows.push([
      'Word', 'Definition', 'Part of Speech', 'CEFR Level',
      'Phonetic US', 'Phonetic UK', 'Examples', 'Synonyms',
      'Topics', 'Status', 'Next Review', 'Ease Factor',
    ]);

    for (const lw of list.words) {
      const w = lw.word;
      const progress = w.progress?.[0];
      const examples = (w.examples as string[])?.join('<br>') || '';
      const synonyms = (w.synonyms as string[])?.join(', ') || '';
      const topics = w.themes.map(t => t.theme.name).join(', ');

      rows.push([
        w.word,
        (w.definition || '').replace(/\n/g, '<br>'),
        (w.partOfSpeech as string[])?.join(', ') || '',
        w.cefrLevel || '',
        w.phoneticUs || '',
        w.phoneticUk || '',
        examples,
        synonyms,
        topics,
        progress?.status || 'new',
        progress?.nextReview ? new Date(progress.nextReview).toISOString().split('T')[0] : '',
        progress?.easeFactor?.toString() || '',
      ]);
    }

    // CSV escape (handle quotes, commas, newlines)
    const csv = rows.map(row =>
      row.map(cell => {
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('<br>')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    ).join('\n');

    const filename = `${list.name.replace(/[^a-zA-Z0-9]/g, '_')}_anki_export.csv`;
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send('\uFEFF' + csv); // BOM for Excel UTF-8 compatibility
  });

  // GET /lists/:id/worksheet — Generate printable worksheet with exercises
  app.get('/lists/:id/worksheet', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const types = ((request.query as any).types as string || 'matching,fill-blank,word-scramble').split(',');
    const count = Math.min(Math.max(parseInt((request.query as any).count as string) || 10, 5), 30);

    const list = await prisma.studyList.findFirst({ where: { id, userId } });
    if (!list) return reply.status(404).send({ error: 'List not found' });

    const listWords = await prisma.studyListWord.findMany({
      where: { listId: id },
      include: { word: true },
      take: count,
      orderBy: { addedAt: 'desc' },
    });

    if (listWords.length < 3) {
      return reply.status(400).send({ error: 'Need at least 3 words for a worksheet' });
    }

    const words = listWords.map(lw => lw.word);

    // Fisher-Yates shuffle helper
    function shuffle<T>(arr: T[]): T[] {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ─── Exercise generators ───
    function getDef(w: typeof words[0]): string {
      const def = w.definition;
      if (Array.isArray(def)) return def.join('; ') || 'No definition';
      if (typeof def === 'string') return def || 'No definition';
      return 'No definition';
    }
    function matchingExercise(): string {
      const selected = shuffle(words).slice(0, Math.min(words.length, 10));
      const shuffledDefs = shuffle(selected.map(w => ({ word: w.word, def: getDef(w) })));
      const numbered = selected.map((w, i) => ({ num: i + 1, word: w.word, def: getDef(w) }));
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

      const wordRows = numbered.map(n => `<div style="display:flex;align-items:center;margin-bottom:8px"><span style="width:24px;font-weight:600">${n.num}.</span> <span style="border-bottom:1px solid #cbd5e1;width:120px;padding:4px 0">____</span> <span style="margin-left:8px">${n.word}</span></div>`).join('');
      const defItems = shuffledDefs.map((d, i) => `<div style="margin-bottom:6px"><span style="font-weight:600">${letters[i]}.</span> ${d.def}</div>`).join('');
      const answerKey = numbered.map(n => {
        const defIdx = shuffledDefs.findIndex(s => s.word === n.word);
        return `${n.num}-${letters[defIdx]}`;
      }).join(', ');

      return `
        <div class="exercise">
          <h2>Section 1: Matching</h2>
          <p class="instructions">Match each word to its definition by writing the correct letter in the blank.</p>
          <div style="display:flex;gap:32px;flex-wrap:wrap">
            <div style="flex:1;min-width:250px">${wordRows}</div>
            <div style="flex:1;min-width:250px">${defItems}</div>
          </div>
          <div class="answer-key no-print"><strong>Answer Key:</strong> ${answerKey}</div>
        </div>`;
    }

    function fillBlankExercise(): string {
      const selected = shuffle(words).slice(0, Math.min(words.length, 8));
      const rows = selected.map((w, i) => {
        const def = getDef(w);
        const blank = '_'.repeat(Math.max(w.word.length, 6));
        return `<div style="margin-bottom:10px;padding:8px;border-left:3px solid #6366f1;background:#f8fafc;border-radius:0 6px 6px 0">
          <span style="font-weight:600">${i + 1}.</span> ${def}<br>
          <span style="color:#6366f1;margin-left:20px">Answer: ${blank}</span>
        </div>`;
      }).join('');
      const answerKey = selected.map((w, i) => `${i + 1}. ${w.word}`).join(', ');

      return `
        <div class="exercise">
          <h2>Section 2: Fill in the Blank</h2>
          <p class="instructions">Write the correct word that matches each definition.</p>
          ${rows}
          <div class="answer-key no-print"><strong>Answer Key:</strong> ${answerKey}</div>
        </div>`;
    }

    function wordScrambleExercise(): string {
      const selected = shuffle(words).slice(0, Math.min(words.length, 8));
      const rows = selected.map((w, i) => {
        const chars = w.word.split('');
        // Fisher-Yates scramble
        for (let j = chars.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [chars[j], chars[k]] = [chars[k], chars[j]];
        }
        let scrambled = chars.join('');
        if (scrambled === w.word) scrambled = chars.reverse().join('');
        const def = getDef(w);
        return `<div style="margin-bottom:10px">
          <span style="font-weight:600">${i + 1}.</span>
          <span style="letter-spacing:3px;font-family:monospace;background:#f1f5f9;padding:2px 8px;border-radius:4px;margin:0 8px">${scrambled.toUpperCase()}</span>
          ${def && def !== 'No definition' ? `<span style="color:#64748b;font-size:13px">(${def})</span>` : ''}
        </div>`;
      }).join('');
      const answerKey = selected.map((w, i) => `${i + 1}. ${w.word}`).join(', ');

      return `
        <div class="exercise">
          <h2>Section 3: Word Scramble</h2>
          <p class="instructions">Unscramble each word. The definition is provided as a hint.</p>
          ${rows}
          <div class="answer-key no-print"><strong>Answer Key:</strong> ${answerKey}</div>
        </div>`;
    }

    // ─── Build worksheet HTML ───
    const exercises: string[] = [];
    if (types.includes('matching')) exercises.push(matchingExercise());
    if (types.includes('fill-blank')) exercises.push(fillBlankExercise());
    if (types.includes('word-scramble')) exercises.push(wordScrambleExercise());

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${list.name} — Worksheet</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #1e293b; }
    h1 { font-size: 22px; margin-bottom: 2px; color: #1e293b; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 4px; }
    .student-info { display: flex; gap: 24px; margin: 12px 0 20px; padding: 12px; background: #f8fafc; border-radius: 8px; }
    .student-info span { font-size: 14px; }
    .student-info input { border: none; border-bottom: 1px solid #94a3b8; outline: none; width: 180px; font-size: 14px; padding: 2px 0; }
    .exercise { margin-bottom: 28px; page-break-inside: avoid; }
    .exercise h2 { font-size: 16px; color: #4f46e5; margin-bottom: 4px; border-bottom: 2px solid #e0e7ff; padding-bottom: 4px; }
    .instructions { color: #64748b; font-size: 13px; margin-bottom: 12px; font-style: italic; }
    .answer-key { margin-top: 8px; font-size: 11px; color: #94a3b8; }
    .footer { margin-top: 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    .controls { margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
    .controls button { padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .btn-print { background: #4f46e5; color: white; }
    .btn-toggle { background: #f1f5f9; color: #475569; }
    .btn-toggle:hover { background: #e2e8f0; }
    @media print {
      .no-print { display: none !important; }
      .exercise { page-break-inside: avoid; }
      body { padding: 12px; }
    }
  </style>
</head>
<body>
  <div class="controls no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save PDF</button>
    <button class="btn-toggle" onclick="document.querySelectorAll('.answer-key').forEach(e => e.style.display = e.style.display === 'none' ? 'block' : 'none')">👁️ Toggle Answer Key</button>
  </div>
  <h1>${list.name}</h1>
  <p class="subtitle">Vocabulary Worksheet — ${words.length} words — ${new Date().toLocaleDateString()}</p>
  <div class="student-info">
    <span>Name: <input type="text" /></span>
    <span>Date: <input type="text" value="${new Date().toLocaleDateString()}" /></span>
    <span>Score: <input type="text" style="width:60px" /> / ${words.length}</span>
  </div>
  ${exercises.join('\n')}
  <div class="footer">Generated by Vocab Master — ${new Date().toLocaleDateString()}</div>
</body>
</html>`;

    reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });

  // GET /lists/:id/flashcards — Printable flashcard sheet
  app.get('/lists/:id/flashcards', async (request, reply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const list = await prisma.studyList.findFirst({ where: { id, userId } });
    if (!list) return reply.status(404).send({ error: 'List not found' });

    const listWords = await prisma.studyListWord.findMany({
      where: { listId: id },
      include: { word: true },
      orderBy: { addedAt: 'desc' },
    });

    if (listWords.length === 0) {
      return reply.status(400).send({ error: 'List has no words' });
    }

    function getDef(w: any): string {
      const def = w.definition;
      if (Array.isArray(def)) return def.join('; ') || 'No definition';
      if (typeof def === 'string') return def || 'No definition';
      return 'No definition';
    }

    // Generate cards — 4 per row, front/back format
    const cards = listWords.map((lw, i) => {
      const w = lw.word;
      const def = getDef(w).substring(0, 120);
      const level = w.cefrLevel || '';
      const phonetic = w.phoneticUs || '';
      return `
        <div class="card-front">
          <div class="card-number">${i + 1}</div>
          <div class="card-word">${w.word}</div>
          ${phonetic ? `<div class="card-phonetic">${phonetic}</div>` : ''}
          ${level ? `<div class="card-level">${level}</div>` : ''}
        </div>
        <div class="card-back">
          <div class="card-number">${i + 1}</div>
          <div class="card-definition">${def}</div>
          ${level ? `<div class="card-level">${level}</div>` : ''}
        </div>`;
    });

    // Arrange in rows of 4 cards (fronts on one row, backs on next)
    const rowSize = 4;
    const rows = [];
    for (let i = 0; i < cards.length; i += rowSize) {
      const frontRow = cards.slice(i, i + rowSize).map(c => c.split('</div>\n        <div class="card-back">')[0] + '</div>');
      const backRow = cards.slice(i, i + rowSize).map(c => {
        const parts = c.split('</div>\n        <div class="card-back">');
        return parts.length > 1 ? '<div class="card-back">' + parts[1] : '';
      });
      rows.push({ fronts: frontRow.join(''), backs: backRow.join('') });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${list.name} — Flashcards</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 10px; }
    h1 { font-size: 18px; margin-bottom: 8px; }
    .subtitle { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    .card-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .card-front, .card-back {
      flex: 1; min-height: 100px; border: 2px solid #e2e8f0; border-radius: 10px;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 8px; position: relative; overflow: hidden;
    }
    .card-front { background: #f8fafc; }
    .card-back { background: #eff6ff; border-style: dashed; }
    .card-number { position: absolute; top: 4px; left: 8px; font-size: 10px; color: #94a3b8; }
    .card-word { font-size: 20px; font-weight: 700; color: #1e293b; text-align: center; }
    .card-phonetic { font-size: 11px; color: #64748b; margin-top: 2px; }
    .card-definition { font-size: 13px; color: #1e293b; text-align: center; line-height: 1.4; }
    .card-level { position: absolute; bottom: 4px; right: 8px; font-size: 10px; padding: 1px 6px; background: #dbeafe; color: #1d4ed8; border-radius: 4px; }
    .row-label { font-size: 10px; color: #94a3b8; margin-bottom: 2px; font-weight: 600; }
    .controls { margin-bottom: 12px; }
    .controls button { padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-right: 6px; }
    .btn-print { background: #4f46e5; color: white; }
    .btn-flip { background: #f1f5f9; color: #475569; }
    .instructions { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      .card-row { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="controls no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Print</button>
    <button class="btn-flip" onclick="document.querySelectorAll('.card-front').forEach(e => e.style.display = e.style.display === 'none' ? 'flex' : 'none')">🔄 Toggle Fronts</button>
    <button class="btn-flip" onclick="document.querySelectorAll('.card-back').forEach(e => e.style.display = e.style.display === 'none' ? 'flex' : 'none')">🔄 Toggle Backs</button>
  </div>
  <h1>${list.name} — Flashcards</h1>
  <p class="subtitle">${listWords.length} words — Print, cut along borders, fold, and glue. Front (solid) | Back (dashed)</p>
  <p class="instructions">💡 Print front sides first, then flip paper and print back sides. Or print all and cut/fold.</p>
  ${rows.map(r => `<div class="row-label">FRONTS</div><div class="card-row">${r.fronts}</div><div class="row-label">BACKS</div><div class="card-row">${r.backs}</div>`).join('')}
</body>
</html>`;

    reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
  });
}
