import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

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

    return {
      user: {
        totalWords: totalWordsLearned,
        masteredWords: totalWordsMastered,
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
        lastActiveDate: streak?.lastActivityDate?.toISOString() ?? null,
        totalXP: userXpData?.totalXp ?? 0,
        level: userXpData?.level ?? 1,
      },
      words: {
        total: totalWords,
        learned: totalWordsLearned,
        status: statusMap,
        byLevel: levelMap,
      },
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
}
