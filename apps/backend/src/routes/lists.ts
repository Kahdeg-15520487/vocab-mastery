import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { TIER_LIMITS, canShareList, canCreateList, canUseLlm, trackLlmCall, getUserTier } from '../lib/lists.js';
import { getLLMConfig, callLLM } from '../lib/llm.js';

export async function listsRoutes(app: FastifyInstance) {
  // All list routes require authentication
  app.addHook('preHandler', authenticate);

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
}
