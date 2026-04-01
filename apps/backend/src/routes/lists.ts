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
}
