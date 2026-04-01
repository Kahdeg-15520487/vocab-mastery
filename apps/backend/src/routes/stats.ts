import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getLLMConfig, callLLM } from '../lib/llm.js';
import { Prisma } from '@prisma/client';

export async function statsRoutes(app: FastifyInstance) {
  // All stats routes require authentication
  app.addHook('preHandler', authenticate);

  // Get overall statistics
  app.get('/stats', async (request, _reply) => {
    const userId = request.user!.userId;

    const [
      streak,
      totalWordsLearned,
      totalWordsMastered,
      totalWords,
      statusCounts,
      levelDistribution,
      userXpData,
      recentSessions,
      sessionTypeCounts,
      totalSessions,
    ] = await Promise.all([
      prisma.userStreak.findUnique({ where: { userId } }),
      prisma.wordProgress.count({ where: { userId, status: { not: 'new' } } }),
      prisma.wordProgress.count({ where: { userId, status: 'mastered' } }),
      prisma.word.count(),
      prisma.wordProgress.groupBy({
        by: ['status'],
        where: { userId },
        _count: true,
      }),
      prisma.word.groupBy({
        by: ['cefrLevel'],
        _count: true,
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { totalXp: true, level: true },
      }),
      prisma.learningSession.findMany({
        where: {
          userId,
          completedAt: { not: null },
        },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          completedAt: true,
          totalCorrect: true,
          totalIncorrect: true,
        },
      }),
      prisma.learningSession.groupBy({
        by: ['type'],
        where: { userId, completedAt: { not: null } },
        _count: true,
      }),
      prisma.learningSession.count({ where: { userId, completedAt: { not: null } } }),
    ]);

    const statusMap = {
      new: 0,
      learning: 0,
      reviewing: 0,
      mastered: 0,
    };

    statusCounts.forEach(item => {
      statusMap[item.status as keyof typeof statusMap] = item._count;
    });

    const levelMap: Record<string, number> = {};
    levelDistribution.forEach(item => {
      levelMap[item.cefrLevel] = item._count;
    });

    const sessionTypeMap: Record<string, number> = {};
    sessionTypeCounts.forEach(item => {
      sessionTypeMap[item.type] = item._count;
    });

    return {
      user: {
        totalWords: totalWordsLearned,
        masteredWords: totalWordsMastered,
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
        lastActiveDate: streak?.lastActivityDate?.toISOString() ?? null,
        totalXP: userXpData?.totalXp ?? 0,
        level: userXpData?.level ?? 1,
        totalSessions,
      },
      words: {
        total: totalWords,
        learned: totalWordsLearned,
        status: statusMap,
        byLevel: levelMap,
      },
      sessionTypes: sessionTypeMap,
      recentSessions: recentSessions.map(s => ({
        id: s.id,
        type: s.type,
        completedAt: s.completedAt,
        accuracy: s.totalCorrect + s.totalIncorrect > 0
          ? Math.round((s.totalCorrect / (s.totalCorrect + s.totalIncorrect)) * 100)
          : 0,
      })),
    };
  });

  // Get daily stats
  app.get('/stats/daily', async (request, _reply) => {
    const userId = request.user!.userId;
    const { days = 7 } = request.query as { days?: number };

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const sessions = await prisma.learningSession.findMany({
      where: {
        userId,
        completedAt: {
          gte: startDate,
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    // Group by day
    const dailyStats: Record<string, { date: string; wordsReviewed: number; correct: number; incorrect: number; sessions: number }> = {};

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyStats[dateStr] = {
        date: dateStr,
        wordsReviewed: 0,
        correct: 0,
        incorrect: 0,
        sessions: 0,
      };
    }

    sessions.forEach(session => {
      if (session.completedAt) {
        const dateStr = session.completedAt.toISOString().split('T')[0];
        if (dailyStats[dateStr]) {
          dailyStats[dateStr].wordsReviewed += session.totalCorrect + session.totalIncorrect;
          dailyStats[dateStr].correct += session.totalCorrect;
          dailyStats[dateStr].incorrect += session.totalIncorrect;
          dailyStats[dateStr].sessions++;
        }
      }
    });

    return Object.values(dailyStats).reverse();
  });

  // Get weekly stats
  app.get('/stats/weekly', async (request, _reply) => {
    const userId = request.user!.userId;
    const { weeks = 4 } = request.query as { weeks?: number };

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - weeks * 7);
    startDate.setHours(0, 0, 0, 0);

    const sessions = await prisma.learningSession.findMany({
      where: {
        userId,
        completedAt: {
          gte: startDate,
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    // Group by week
    const weeklyStats: Record<string, { week: string; wordsReviewed: number; correct: number; sessions: number }> = {};

    sessions.forEach(session => {
      if (session.completedAt) {
        const weekStart = new Date(session.completedAt);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekStr = weekStart.toISOString().split('T')[0];

        if (!weeklyStats[weekStr]) {
          weeklyStats[weekStr] = {
            week: weekStr,
            wordsReviewed: 0,
            correct: 0,
            sessions: 0,
          };
        }

        weeklyStats[weekStr].wordsReviewed += session.totalCorrect + session.totalIncorrect;
        weeklyStats[weekStr].correct += session.totalCorrect;
        weeklyStats[weekStr].sessions++;
      }
    });

    return Object.values(weeklyStats);
  });

  // Get level distribution
  app.get('/stats/level-distribution', async (request, _reply) => {
    const userId = request.user!.userId;
    const distribution = await prisma.word.groupBy({
      by: ['cefrLevel'],
      _count: true,
      orderBy: { cefrLevel: 'asc' },
    });

    // Get progress by level scoped to user
    const levelProgress = await prisma.$queryRaw<Array<{ cefr_level: string; count: bigint }>>`
      SELECT w.cefr_level, COUNT(wp.id) as count
      FROM words w
      LEFT JOIN word_progress wp ON w.id = wp.word_id AND wp.user_id = ${userId}
      GROUP BY w.cefr_level
      ORDER BY w.cefr_level
    `;

    return {
      total: distribution.map(d => ({
        level: d.cefrLevel,
        total: d._count,
        learned: Number(levelProgress.find(lp => lp.cefr_level === d.cefrLevel)?.count || 0),
      })),
    };
  });

  // ============================================
  // GET /stats/leaderboard - XP-based ranking
  // ============================================
  app.get('/stats/leaderboard', async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as Record<string, string | undefined>;
    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 50);

    const [users, total, currentUser] = await Promise.all([
      prisma.user.findMany({
        where: { totalXp: { gt: 0 } },
        orderBy: [{ totalXp: 'desc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          username: true,
          totalXp: true,
          level: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where: { totalXp: { gt: 0 } } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, totalXp: true, level: true },
      }),
    ]);

    // Calculate user's rank
    const userRank = currentUser
      ? await prisma.user.count({
          where: { totalXp: { gt: currentUser.totalXp } },
        })
      : null;

    return {
      entries: users.map((u, i) => ({
        rank: (page - 1) * limit + i + 1,
        id: u.id,
        username: u.username,
        totalXp: u.totalXp,
        level: u.level,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      currentUser: currentUser ? {
        rank: (userRank ?? 0) + 1,
        id: currentUser.id,
        username: currentUser.username,
        totalXp: currentUser.totalXp,
        level: currentUser.level,
      } : null,
    };
  });

  // GET /stats/heatmap — Activity heatmap data (last 12 months)
  app.get('/stats/heatmap', async (request, reply) => {
    const userId = request.user!.userId;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Get daily activity counts
    const dailyActivity = await prisma.$queryRaw<Array<{ date: string; wordsLearned: bigint; wordsReviewed: bigint }>>`
      SELECT
        DATE(dg.date) as date,
        COALESCE(SUM(dg.words_learned), 0) as "wordsLearned",
        COALESCE(SUM(dg.words_reviewed), 0) as "wordsReviewed"
      FROM daily_goals dg
      WHERE dg.user_id = ${userId}
        AND dg.date >= ${twelveMonthsAgo}
      GROUP BY DATE(dg.date)
      ORDER BY date ASC
    `;

    return dailyActivity.map(d => ({
      date: d.date,
      wordsLearned: Number(d.wordsLearned),
      wordsReviewed: Number(d.wordsReviewed),
    }));
  });

  // GET /stats/study-time — Average study time and total study time
  app.get('/stats/study-time', async (request, reply) => {
    const userId = request.user!.userId;

    // Compute total study time from sessions
    const sessions = await prisma.$queryRaw<Array<{ totalMs: bigint; sessionCount: bigint; avgMs: bigint }>>`
      SELECT
        SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as "totalMs",
        COUNT(*) as "sessionCount",
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as "avgMs"
      FROM learning_sessions
      WHERE user_id = ${userId}
        AND completed_at IS NOT NULL
        AND (completed_at - started_at) < INTERVAL '2 hours'
    `;

    const row = sessions[0];
    const totalMs = Number(row?.totalMs || 0);
    const sessionCount = Number(row?.sessionCount || 0);
    const avgMs = Number(row?.avgMs || 0);

    // Study time by type
    const byType = await prisma.$queryRaw<Array<{ type: string; totalMs: bigint; sessionCount: bigint }>>`
      SELECT
        type,
        SUM(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) as "totalMs",
        COUNT(*) as "sessionCount"
      FROM learning_sessions
      WHERE user_id = ${userId}
        AND completed_at IS NOT NULL
        AND (completed_at - started_at) < INTERVAL '2 hours'
      GROUP BY type
    `;

    return {
      totalTimeMinutes: Math.round(totalMs / 60000),
      totalSessions: sessionCount,
      avgSessionMinutes: Math.round(avgMs / 60000 * 10) / 10,
      byType: byType.map(r => ({
        type: r.type,
        totalMinutes: Math.round(Number(r.totalMs) / 60000),
        sessions: Number(r.sessionCount),
      })),
    };
  });

  // GET /stats/velocity — Learning velocity (words/day for last 30 days)
  app.get('/stats/velocity', async (request, reply) => {
    const userId = request.user!.userId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyData = await prisma.$queryRaw<Array<{ date: string; learned: bigint; reviewed: bigint }>>`
      SELECT
        DATE(dg.date) as date,
        COALESCE(SUM(dg.words_learned), 0) as learned,
        COALESCE(SUM(dg.words_reviewed), 0) as reviewed
      FROM daily_goals dg
      WHERE dg.user_id = ${userId}
        AND dg.date >= ${thirtyDaysAgo}
      GROUP BY DATE(dg.date)
      ORDER BY date ASC
    `;

    // Also get CEFR level progress over time (words learned per level per week)
    const weeklyProgress = await prisma.$queryRaw<Array<{ week: string; level: string; count: bigint }>>`
      SELECT
        DATE_TRUNC('week', wp.created_at) as week,
        w.cefr_level as level,
        COUNT(*) as count
      FROM word_progress wp
      JOIN words w ON w.id = wp.word_id
      WHERE wp.user_id = ${userId}
        AND wp.status != 'new'
        AND wp.created_at >= ${thirtyDaysAgo}
      GROUP BY DATE_TRUNC('week', wp.created_at), w.cefr_level
      ORDER BY week ASC, level ASC
    `;

    const daily = dailyData.map(d => ({
      date: d.date,
      learned: Number(d.learned),
      reviewed: Number(d.reviewed),
    }));

    const weekly = weeklyProgress.map(w => ({
      week: w.week,
      level: w.level,
      count: Number(w.count),
    }));

    // Compute averages
    const totalLearned = daily.reduce((sum, d) => sum + d.learned, 0);
    const totalReviewed = daily.reduce((sum, d) => sum + d.reviewed, 0);
    const activeDays = daily.length || 1;

    return {
      daily,
      weekly,
      avgLearnedPerDay: Math.round(totalLearned / activeDays * 10) / 10,
      avgReviewedPerDay: Math.round(totalReviewed / activeDays * 10) / 10,
      totalLearned,
      totalReviewed,
      activeDays,
    };
  });

  // ============================================
  // GET /stats/mastery — Per-CEFR-level mastery with goal tracking
  // ============================================
  app.get('/stats/mastery', async (request, reply) => {
    const userId = request.user!.userId;

    // Total words per level in database
    const totalByLevel = await prisma.word.groupBy({
      by: ['cefrLevel'],
      _count: true,
      orderBy: { cefrLevel: 'asc' },
    });

    // Words with progress per level
    const masteredByLevel = await prisma.$queryRaw<Array<{ cefr_level: string; mastered: bigint; learning: bigint; reviewing: bigint }>>`
      SELECT w.cefr_level,
        COUNT(CASE WHEN wp.status = 'mastered' THEN 1 END) as mastered,
        COUNT(CASE WHEN wp.status = 'learning' THEN 1 END) as learning,
        COUNT(CASE WHEN wp.status = 'reviewing' THEN 1 END) as reviewing
      FROM words w
      INNER JOIN word_progress wp ON w.id = wp.word_id AND wp.user_id = ${userId}
      GROUP BY w.cefr_level
      ORDER BY w.cefr_level
    `;

    const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const levels = CEFR_ORDER.filter(l => totalByLevel.some(t => t.cefrLevel === l));

    const result = levels.map(level => {
      const total = totalByLevel.find(t => t.cefrLevel === level)?._count || 0;
      const row = masteredByLevel.find(m => m.cefr_level === level);
      const mastered = Number(row?.mastered || 0);
      const learning = Number(row?.learning || 0);
      const reviewing = Number(row?.reviewing || 0);
      const seen = mastered + learning + reviewing;

      return {
        level,
        total,
        mastered,
        learning,
        reviewing,
        unseen: total - seen,
        masteryPercent: total > 0 ? Math.round((mastered / total) * 100) : 0,
        coveragePercent: total > 0 ? Math.round((seen / total) * 100) : 0,
      };
    });

    // Overall mastery
    const totalWords = result.reduce((s, r) => s + r.total, 0);
    const totalMastered = result.reduce((s, r) => s + r.mastered, 0);
    const totalSeen = result.reduce((s, r) => s + r.mastered + r.learning + r.reviewing, 0);

    return {
      levels: result,
      overall: {
        totalWords,
        totalMastered,
        totalSeen,
        masteryPercent: totalWords > 0 ? Math.round((totalMastered / totalWords) * 100) : 0,
        coveragePercent: totalWords > 0 ? Math.round((totalSeen / totalWords) * 100) : 0,
      },
      estimatedLevel: computeEstimatedLevel(result),
    };
  });

  // POST /stats/study-plan — Generate personalized study plan via LLM
  app.post('/stats/study-plan', async (request, _reply) => {
    const userId = request.user!.userId;

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw { statusCode: 404, message: 'User not found' };

      // CEFR mastery
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const masteryByLevel: Record<string, { learned: number; mastered: number; total: number }> = {};
      for (const level of levels) {
        const total = await prisma.word.count({ where: { cefrLevel: level } });
        const learned = await prisma.wordProgress.count({
          where: { userId, word: { cefrLevel: level }, status: { not: 'NEW' } },
        });
        const mastered = await prisma.wordProgress.count({
          where: { userId, word: { cefrLevel: level }, status: 'MASTERED' },
        });
        masteryByLevel[level] = { learned, mastered, total };
      }

      // Recent activity (last 7 days)
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const recentSessions = await prisma.learningSession.findMany({
        where: { userId, createdAt: { gte: weekAgo } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const sessionTypes = recentSessions.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const streak = await prisma.userStreak.findUnique({ where: { userId } });
      const currentStreak = streak?.currentStreak || 0;
      const xp = user.totalXp || 0;
      const userLevel = user.level || 1;

      const contextData = {
        username: user.username,
        level: userLevel,
        xp,
        currentStreak,
        masteryByLevel,
        recentSessions: { count: recentSessions.length, types: sessionTypes },
        yearGoal: (user as any).yearWordTarget || null,
      };

      const config = await getLLMConfig();

      const systemPrompt = `You are an expert language learning advisor. Create a personalized weekly study plan.
Return ONLY valid JSON:
{"assessment":"2-3 sentence assessment","weeklyGoal":"specific goal","schedule":[{"day":"Monday","focus":"activity","duration":"X min","tasks":["task1","task2"]}],"tips":["tip1","tip2","tip3"],"priorityWords":"focus area"}
7 days in schedule. Be specific and actionable.`;

      const userPrompt = 'My learning data:\n' + JSON.stringify(contextData, null, 2) + '\n\nCreate my study plan.';

      const responseText = await callLLM(systemPrompt, userPrompt, config, { disableReasoning: true });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid LLM response');
      const plan = JSON.parse(jsonMatch[0].replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']'));
      return { plan, generatedAt: new Date().toISOString() };
    } catch (error: any) {
      console.error('[study-plan] Error:', error.message);
      throw { statusCode: 500, message: 'Failed to generate study plan' };
    }
  });

  // GET /stats/speed-round — Get 20 random words for speed round
  app.get('/stats/speed-round', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;

    // Get mix of unseen, learning, and reviewing words
    const words = await prisma.$queryRaw<Array<{
      id: string; word: string; definition: string; cefr_level: string
    }>>`
      SELECT w.id, w.word, w.definition, w.cefr_level
      FROM words w
      LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
      WHERE w.cefr_level IN ('A1','A2','B1','B2')
        AND w.word NOT LIKE '% %'
        AND LENGTH(w.word) >= 3
      ORDER BY RANDOM()
      LIMIT 20
    `;

    return { words, total: words.length };
  });

  // GET /stats/daily-challenge — Get today's daily challenge (5 words)
  app.get('/stats/daily-challenge', async (request, reply) => {
    const userId = request.user!.userId;
    const today = new Date();
    const dayKey = today.toISOString().split('T')[0];

    // Check if already completed today
    const existing = await prisma.dailyGoal.findFirst({
      where: { userId, date: new Date(dayKey) },
    });

    // Day-of-week themed challenge
    const dayOfWeek = today.getUTCDay();
    const themes = [
      { name: 'Sunday Synonyms', type: 'synonym' as const },
      { name: 'Monday Motivation', type: 'definition' as const },
      { name: 'Tuesday Translation', type: 'definition' as const },
      { name: 'Wednesday Words', type: 'mixed' as const },
      { name: 'Thursday Thesaurus', type: 'synonym' as const },
      { name: 'Friday Flashback', type: 'review' as const },
      { name: 'Saturday Spelling', type: 'spelling' as const },
    ];
    const theme = themes[dayOfWeek];

    // Seed random from date for consistent words per day
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

    // Get words the user hasn't mastered yet
    const masteredIds = await prisma.wordProgress.findMany({
      where: { userId, status: 'mastered' },
      select: { wordId: true },
    });
    const masteredSet = new Set(masteredIds.map(m => m.wordId));

    // Get 5 random unmastered words (or any words if all mastered)
    let words;
    if (masteredSet.size > 0) {
      words = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; cefr_level: string; part_of_speech: string[]; examples: string[] }>>`
        SELECT id, word, definition, cefr_level, part_of_speech, examples
        FROM words
        WHERE id NOT IN (${Prisma.join([...masteredSet].slice(0, 5000))})
        ORDER BY RANDOM()
        LIMIT 5
      `;
    } else {
      words = await prisma.$queryRaw<Array<{ id: string; word: string; definition: string; cefr_level: string; part_of_speech: string[]; examples: string[] }>>`
        SELECT id, word, definition, cefr_level, part_of_speech, examples
        FROM words
        ORDER BY RANDOM()
        LIMIT 5
      `;
    };

    // For synonym type, get wrong answer options
    const questions = words.map((w, i) => {
      return {
        index: i,
        id: w.id,
        word: w.word,
        definition: w.definition,
        cefrLevel: w.cefr_level,
        partOfSpeech: w.part_of_speech,
        examples: w.examples,
        type: theme.type,
      };
    });

    return {
      challengeDay: dayKey,
      challengeName: theme.name,
      challengeType: theme.type,
      questions,
      completed: false, // TODO: check from dailyGoal
      bonusXp: 50,
    };
  });

  // POST /stats/daily-challenge — Submit daily challenge answers
  app.post('/stats/daily-challenge', async (request, reply) => {
    const userId = request.user!.userId;
    const { answers } = request.body as { answers: Array<{ wordId: string; correct: boolean }> };

    if (!answers?.length) {
      return reply.status(400).send({ error: 'answers array required' });
    }

    const correct = answers.filter(a => a.correct).length;
    const total = answers.length;
    const accuracy = Math.round((correct / total) * 100);

    // Bonus XP based on performance
    let bonusXp = 0;
    if (accuracy >= 80) bonusXp = 50;
    else if (accuracy >= 60) bonusXp = 30;
    else if (accuracy >= 40) bonusXp = 15;
    else bonusXp = 5; // participation

    // Perfect score bonus
    if (correct === total) bonusXp += 25;

    // Award XP
    if (bonusXp > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { totalXp: { increment: bonusXp } },
      });
    }

    // Update word progress for correct answers
    for (const answer of answers) {
      if (answer.correct) {
        const existing = await prisma.wordProgress.findUnique({
          where: { userId_wordId: { userId, wordId: answer.wordId } },
        });
        if (existing) {
          await prisma.wordProgress.update({
            where: { userId_wordId: { userId, wordId: answer.wordId } },
            data: {
              repetitions: { increment: 1 },
              lastReview: new Date(),
            },
          });
        }
      }
    }

    return { correct, total, accuracy, bonusXp };
  });

  // GET /stats/recommendations — Smart word recommendations based on gaps
  app.get('/stats/recommendations', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;
    const limit = Math.min(20, Math.max(1, Number((request.query as any).limit) || 10));

    // 1. Find weakest topic (lowest % learned)
    const weakTopics = await prisma.$queryRaw<Array<{
      topic: string; theme_slug: string; theme_name: string;
      total: bigint; learned: bigint
    }>>`
      SELECT wt.topic, th.slug as theme_slug, th.name as theme_name,
        COUNT(DISTINCT w.id) as total,
        COUNT(DISTINCT CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN w.id END) as learned
      FROM word_themes wt
      JOIN words w ON w.id = wt."wordId"
      JOIN themes th ON th.id = wt."themeId"
      LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
      WHERE wt.topic IS NOT NULL
      GROUP BY wt.topic, th.slug, th.name
      HAVING COUNT(DISTINCT CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN w.id END) < COUNT(DISTINCT w.id) * 0.3
      ORDER BY (COUNT(DISTINCT CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN w.id END)::float / COUNT(DISTINCT w.id)) ASC
      LIMIT 3
    `;

    // 2. Find CEFR level gaps — levels with fewest learned words
    const cefrGaps = await prisma.$queryRaw<Array<{
      cefr_level: string; total: bigint; learned: bigint
    }>>`
      SELECT w.cefr_level, COUNT(*) as total,
        COUNT(CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN 1 END) as learned
      FROM words w
      LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
      WHERE w.cefr_level IN ('A1','A2','B1','B2','C1','C2')
        AND w.word NOT LIKE '% %'
      GROUP BY w.cefr_level
      ORDER BY (COUNT(CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN 1 END)::float / COUNT(*)) ASC
      LIMIT 2
    `;

    // 3. Get recommended words — prioritize weak topics and CEFR gaps
    const weakTopicNames = weakTopics.map(t => t.topic);
    const weakCefrLevels = cefrGaps.map(g => g.cefr_level);

    // Build prioritized word query
    let recommended: Array<{
      id: string; word: string; definition: string; cefr_level: string;
      part_of_speech: any; topic: string; theme_name: string;
      reason: string; priority: number
    }> = [];

    if (weakTopicNames.length > 0) {
      // Words from weak topics the user hasn't learned
      const topicWords = await prisma.$queryRaw<Array<{
        id: string; word: string; definition: string; cefr_level: string;
        part_of_speech: any; topic: string; theme_name: string
      }>>`
        SELECT w.id, w.word, w.definition, w.cefr_level, w.part_of_speech,
          wt.topic, th.name as theme_name
        FROM words w
        JOIN word_themes wt ON wt."wordId" = w.id
        JOIN themes th ON th.id = wt."themeId"
        LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
        WHERE wt.topic IN (${Prisma.join(weakTopicNames)})
          AND (wp.status IS NULL OR wp.status = 'new')
          AND w.cefr_level IN (${Prisma.join(weakCefrLevels.length > 0 ? weakCefrLevels : ['A1','A2','B1','B2'])})
          AND w.word NOT LIKE '% %'
        ORDER BY RANDOM()
        LIMIT ${limit}
      `;

      recommended.push(...topicWords.map(w => ({
        ...w, reason: `Weak topic: ${w.topic}`, priority: 3
      })));
    }

    // Fill remaining with CEFR gap words
    if (recommended.length < limit) {
      const remaining = limit - recommended.length;
      const excludeIds = recommended.map(r => r.id);
      let cefrWords: Array<{
        id: string; word: string; definition: string; cefr_level: string;
        part_of_speech: any
      }>;

      if (excludeIds.length > 0) {
        cefrWords = await prisma.$queryRaw`
          SELECT w.id, w.word, w.definition, w.cefr_level, w.part_of_speech
          FROM words w
          LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
          WHERE w.cefr_level IN (${Prisma.join(weakCefrLevels.length > 0 ? weakCefrLevels : ['A1','A2','B1','B2'])})
            AND (wp.status IS NULL OR wp.status = 'new')
            AND w.word NOT LIKE '% %'
            AND w.id NOT IN (${Prisma.join(excludeIds)})
          ORDER BY RANDOM()
          LIMIT ${remaining}
        `;
      } else {
        cefrWords = await prisma.$queryRaw`
          SELECT w.id, w.word, w.definition, w.cefr_level, w.part_of_speech
          FROM words w
          LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
          WHERE w.cefr_level IN (${Prisma.join(weakCefrLevels.length > 0 ? weakCefrLevels : ['A1','A2','B1','B2'])})
            AND (wp.status IS NULL OR wp.status = 'new')
            AND w.word NOT LIKE '% %'
          ORDER BY RANDOM()
          LIMIT ${remaining}
        `;
      }

      recommended.push(...cefrWords.map(w => ({
        ...w, topic: '', theme_name: '',
        reason: weakCefrLevels.length > 0 ? `Gap at ${w.cefr_level} level` : `New ${w.cefr_level} word`,
        priority: 2
      })));
    }

    // Sort by priority desc, then random
    recommended.sort((a, b) => b.priority - a.priority);

    return {
      recommendations: recommended.slice(0, limit),
      insights: {
        weakTopics: weakTopics.map(t => ({
          topic: t.topic,
          theme: t.theme_name,
          total: Number(t.total),
          learned: Number(t.learned),
          pct: t.total > 0 ? Math.round((Number(t.learned) / Number(t.total)) * 100) : 0,
        })),
        cefrGaps: cefrGaps.map(g => ({
          level: g.cefr_level,
          total: Number(g.total),
          learned: Number(g.learned),
          pct: g.total > 0 ? Math.round((Number(g.learned) / Number(g.total)) * 100) : 0,
        })),
      }
    };
  });

  // GET /stats/collections — Word collection badges by topic
  app.get('/stats/collections', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;

    // Get all topics with learned counts
    const topicStats = await prisma.$queryRaw<Array<{
      topic: string; theme_name: string; theme_slug: string;
      total: bigint; learned: bigint; mastered: bigint
    }>>`
      SELECT wt.topic, th.name as theme_name, th.slug as theme_slug,
        COUNT(DISTINCT w.id) as total,
        COUNT(DISTINCT CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN w.id END) as learned,
        COUNT(DISTINCT CASE WHEN wp.status = 'mastered' THEN w.id END) as mastered
      FROM word_themes wt
      JOIN words w ON w.id = wt."wordId"
      JOIN themes th ON th.id = wt."themeId"
      LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
      WHERE wt.topic IS NOT NULL
      GROUP BY wt.topic, th.name, th.slug
      ORDER BY th.slug, wt.topic
    `;

    // Calculate badges for each topic
    const badges = topicStats.map(t => {
      const total = Number(t.total);
      const learned = Number(t.learned);
      const mastered = Number(t.mastered);
      const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
      const masteredPct = total > 0 ? Math.round((mastered / total) * 100) : 0;

      let tier: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum' = 'none';
      if (masteredPct >= 80) tier = 'platinum';
      else if (masteredPct >= 60) tier = 'gold';
      else if (masteredPct >= 40) tier = 'silver';
      else if (learned >= 10) tier = 'bronze';

      return {
        topic: t.topic,
        theme: t.theme_name,
        themeSlug: t.theme_slug,
        total,
        learned,
        mastered,
        pct,
        masteredPct,
        tier,
      };
    });

    // Summary stats
    const totalBadges = badges.filter(b => b.tier !== 'none').length;
    const platinum = badges.filter(b => b.tier === 'platinum').length;
    const gold = badges.filter(b => b.tier === 'gold').length;
    const silver = badges.filter(b => b.tier === 'silver').length;
    const bronze = badges.filter(b => b.tier === 'bronze').length;

    return {
      badges,
      summary: { totalBadges, platinum, gold, silver, bronze, totalTopics: badges.length },
    };
  });

  // GET /stats/topic-breakdown — Vocabulary breakdown by topic
  app.get('/stats/topic-breakdown', { preHandler: authenticate }, async (request, _reply) => {
    const userId = request.user!.userId;

    const topics = await prisma.$queryRaw<Array<{
      theme_slug: string; theme_name: string; topic: string;
      total_words: bigint; learned: bigint; mastered: bigint
    }>>`
      SELECT th.slug as theme_slug, th.name as theme_name, t.topic,
        COUNT(DISTINCT w.id) as total_words,
        COUNT(DISTINCT CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN w.id END) as learned,
        COUNT(DISTINCT CASE WHEN wp.status = 'mastered' THEN w.id END) as mastered
      FROM word_themes t
      JOIN words w ON w.id = t."wordId"
      JOIN themes th ON th.id = t."themeId"
      LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
      WHERE t.topic IS NOT NULL
      GROUP BY th.slug, th.name, t.topic
      ORDER BY th.slug, t.topic
    `;

    // Group by theme
    const grouped: Record<string, {
      name: string; slug: string;
      topics: Array<{ name: string; total: number; learned: number; mastered: number; pct: number }>
    }> = {};

    for (const row of topics) {
      const slug = row.theme_slug;
      if (!grouped[slug]) {
        grouped[slug] = { name: row.theme_name, slug, topics: [] };
      }
      const total = Number(row.total_words);
      const learned = Number(row.learned);
      const mastered = Number(row.mastered);
      grouped[slug].topics.push({
        name: row.topic,
        total,
        learned,
        mastered,
        pct: total > 0 ? Math.round((learned / total) * 100) : 0,
      });
    }

    return Object.values(grouped).sort((a, b) => {
      const aLearned = a.topics.reduce((s, t) => s + t.learned, 0);
      const bLearned = b.topics.reduce((s, t) => s + t.learned, 0);
      return bLearned - aLearned;
    });
  });
}

function computeEstimatedLevel(levels: Array<{ level: string; coveragePercent: number }>): string {
  const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  let estimated = 'A1';
  for (const cefr of CEFR) {
    const data = levels.find(l => l.level === cefr);
    if (data && data.coveragePercent >= 80) {
      estimated = cefr;
    } else {
      break;
    }
  }
  return estimated;
}
