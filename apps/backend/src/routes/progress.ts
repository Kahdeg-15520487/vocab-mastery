import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { updateStreak, getStreak } from '../lib/streak.js';
import { checkAchievements, getUserAchievements, getAllAchievementsWithStatus } from '../lib/achievements.js';
import { calculateNextReview, responseToQuality, createInitialProgress } from '../lib/spaced-repetition.js';

// Default daily goals
const DEFAULT_LEARN_GOAL = 10;
const DEFAULT_REVIEW_GOAL = 20;

/** Get user's daily goal targets, falling back to defaults */
async function getUserDailyGoals(userId: string): Promise<{ learnGoal: number; reviewGoal: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyLearnGoal: true, dailyReviewGoal: true },
  });
  return {
    learnGoal: user?.dailyLearnGoal ?? DEFAULT_LEARN_GOAL,
    reviewGoal: user?.dailyReviewGoal ?? DEFAULT_REVIEW_GOAL,
  };
}

export async function progressRoutes(app: FastifyInstance) {
  // All progress routes require authentication
  app.addHook('preHandler', authenticate);

  // ============================================
  // GET /api/progress/dashboard - Dashboard data
  // ============================================
  app.get('/progress/dashboard', async (request, _reply) => {
    const userId = request.user!.userId;

    // Get user XP/level
    const userXp = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, level: true },
    });

    // Get streak
    const streak = await getStreak(userId);

    // Get today's goal
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    
    let dailyGoal = await prisma.dailyGoal.findUnique({
      where: { userId_date: { userId, date: todayStart } },
    });

    if (!dailyGoal) {
      // Create goal for today using user's configured targets
      const userGoals = await getUserDailyGoals(userId);
      dailyGoal = await prisma.dailyGoal.create({
        data: {
          userId,
          date: todayStart,
          wordsToLearn: userGoals.learnGoal,
          wordsToReview: userGoals.reviewGoal,
        },
      });
    }

    // Get CEFR level progress (scoped to current user)
    const cefrLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const levelProgress = await Promise.all(
      cefrLevels.map(async (level) => {
        const totalWords = await prisma.word.count({ where: { cefrLevel: level } });
        const learnedWords = await prisma.wordProgress.count({
          where: { userId, word: { cefrLevel: level }, status: { not: 'new' } },
        });
        const masteredWords = await prisma.wordProgress.count({
          where: { userId, word: { cefrLevel: level }, status: 'mastered' },
        });

        return {
          level,
          total: totalWords,
          learned: learnedWords,
          mastered: masteredWords,
          progress: totalWords > 0 ? Math.round((learnedWords / totalWords) * 100) : 0,
        };
      })
    );

    // Get recent achievements (last 5)
    const recentAchievements = await getUserAchievements(userId);

    // Get activity for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const dailyGoals = await prisma.dailyGoal.findMany({
      where: {
        userId,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: 'asc' },
    });

    // Get total stats (scoped to current user)
    const totalWordsLearned = await prisma.wordProgress.count({
      where: { userId, status: { not: 'new' } },
    });
    const totalWordsMastered = await prisma.wordProgress.count({
      where: { userId, status: 'mastered' },
    });

    // Count words due for review
    const wordsDueForReview = await prisma.wordProgress.count({
      where: {
        userId,
        nextReview: { lte: new Date() },
        status: { not: 'new' },
      },
    });

    // Recent progress (last 6 words learned)
    const recentProgress = await prisma.wordProgress.findMany({
      where: { userId, status: { not: 'new' } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      include: { word: { select: { word: true, cefrLevel: true } } },
    });

    // Total words in database for overall progress
    const totalWordsInDb = await prisma.word.count();

    // Favorite count and total sessions
    const [favoriteCount, totalSessions] = await Promise.all([
      prisma.wordFavorite.count({ where: { userId } }),
      prisma.learningSession.count({ where: { userId, completedAt: { not: null } } }),
    ]);

    // Compute weekly progress (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6); // including today = 7 days
    const weekStart = new Date(Date.UTC(sevenDaysAgo.getUTCFullYear(), sevenDaysAgo.getUTCMonth(), sevenDaysAgo.getUTCDate()));
    const weeklyGoals = dailyGoals.filter(g => g.date >= weekStart);
    const weeklyProgress = {
      wordsLearned: weeklyGoals.reduce((sum, g) => sum + g.wordsLearned, 0),
      wordsReviewed: weeklyGoals.reduce((sum, g) => sum + g.wordsReviewed, 0),
      daysActive: weeklyGoals.filter(g => g.wordsLearned > 0 || g.wordsReviewed > 0).length,
      totalDays: 7,
    };

    return {
      streak: {
        current: streak.currentStreak,
        longest: streak.longestStreak,
        lastActivity: streak.lastActivityDate,
      },
      dailyGoal: {
        date: dailyGoal.date,
        wordsToLearn: dailyGoal.wordsToLearn,
        wordsToReview: dailyGoal.wordsToReview,
        wordsLearned: dailyGoal.wordsLearned,
        wordsReviewed: dailyGoal.wordsReviewed,
        completed: dailyGoal.completed,
        progress: {
          learn: dailyGoal.wordsToLearn > 0 
            ? Math.min(100, Math.round((dailyGoal.wordsLearned / dailyGoal.wordsToLearn) * 100))
            : 0,
          review: dailyGoal.wordsToReview > 0
            ? Math.min(100, Math.round((dailyGoal.wordsReviewed / dailyGoal.wordsToReview) * 100))
            : 0,
        },
      },
      levelProgress,
      stats: {
        totalWordsLearned,
        totalWordsMastered,
        wordsDueForReview,
        totalXp: userXp?.totalXp ?? 0,
        level: userXp?.level ?? 1,
        totalWordsInDb,
        favoriteCount,
        totalSessions,
      },
      recentAchievements: recentAchievements.slice(0, 5),
      recentProgress: recentProgress.map(wp => ({
        wordId: wp.wordId,
        word: wp.word.word,
        cefrLevel: wp.word.cefrLevel,
        status: wp.status,
        updatedAt: wp.updatedAt,
      })),
      activity: dailyGoals.map((g) => ({
        date: g.date,
        completed: g.completed,
        wordsLearned: g.wordsLearned,
        wordsReviewed: g.wordsReviewed,
      })),
      weeklyProgress,
    };
  });

  // ============================================
  // GET /api/progress/streak - Get streak info
  // ============================================
  app.get('/progress/streak', async (request, _reply) => {
    const userId = request.user!.userId;
    const streak = await getStreak(userId);
    return streak;
  });

  // ============================================
  // GET /api/progress/calendar - Activity heatmap
  // ============================================
  app.get('/progress/calendar', async (request, _reply) => {
    const userId = request.user!.userId;
    const query = request.query as { days?: string };
    const days = parseInt(query.days || '90', 10);

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);

    const dailyGoals = await prisma.dailyGoal.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    // Generate calendar data
    const calendar: Array<{
      date: string;
      level: number; // 0-4 intensity
      wordsLearned: number;
      wordsReviewed: number;
      completed: boolean;
    }> = [];

    const goalMap = new Map(dailyGoals.map((g) => [g.date.toISOString().split('T')[0], g]));

    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const goal = goalMap.get(dateStr);

      if (goal) {
        const totalActivity = goal.wordsLearned + goal.wordsReviewed;
        const maxActivity = goal.wordsToLearn + goal.wordsToReview;
        const intensity = maxActivity > 0 ? Math.min(4, Math.ceil((totalActivity / maxActivity) * 4)) : 0;

        calendar.push({
          date: dateStr,
          level: goal.completed ? 4 : intensity,
          wordsLearned: goal.wordsLearned,
          wordsReviewed: goal.wordsReviewed,
          completed: goal.completed,
        });
      } else {
        calendar.push({
          date: dateStr,
          level: 0,
          wordsLearned: 0,
          wordsReviewed: 0,
          completed: false,
        });
      }
    }

    return calendar;
  });

  // Get upcoming review schedule (next 14 days)
  app.get('/progress/review-schedule', async (request, _reply) => {
    const userId = request.user!.userId;

    const now = new Date();
    const twoWeeks = new Date(now);
    twoWeeks.setDate(twoWeeks.getDate() + 14);

    // Group words due for review by date
    const dueWords = await prisma.wordProgress.findMany({
      where: {
        userId,
        status: { not: 'new' },
        nextReview: { gte: now, lte: twoWeeks },
      },
      select: { nextReview: true },
    });

    // Count overdue words
    const overdue = await prisma.wordProgress.count({
      where: {
        userId,
        status: { not: 'new' },
        nextReview: { lt: now },
      },
    });

    // Group by day
    const schedule: Record<string, number> = {};
    for (const wp of dueWords) {
      const dateStr = (wp.nextReview as Date).toISOString().split('T')[0];
      schedule[dateStr] = (schedule[dateStr] || 0) + 1;
    }

    // Format as array of days
    const days = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        dayLabel: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        count: i === 0 ? overdue : (schedule[dateStr] || 0),
        isToday: i === 0,
      });
    }

    return { overdue, days };
  });

  // ============================================
  // GET /api/progress/review-recommendations - Smart review suggestions
  // ============================================
  app.get('/progress/review-recommendations', async (request, _reply) => {
    const userId = request.user!.userId;

    const now = new Date();

    // 1. Overdue words (high priority)
    const overdue = await prisma.wordProgress.findMany({
      where: {
        userId,
        status: { not: 'new' },
        nextReview: { lt: now },
      },
      include: {
        word: {
          select: { id: true, word: true, definition: true, cefrLevel: true, partOfSpeech: true },
        },
      },
      orderBy: { nextReview: 'asc' },
      take: 20,
    });

    // 2. Weak words (low ease factor, many incorrect reviews)
    const weakWords = await prisma.wordProgress.findMany({
      where: {
        userId,
        status: { in: ['learning', 'reviewing'] },
        nextReview: { gte: now },
        OR: [
          { easeFactor: { lt: 2.0 } },
          { correctReviews: { lt: 2 } },
        ],
      },
      include: {
        word: {
          select: { id: true, word: true, definition: true, cefrLevel: true, partOfSpeech: true },
        },
      },
      orderBy: { easeFactor: 'asc' },
      take: 10,
    });

    // 3. Recently learned (need reinforcement)
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentNew = await prisma.wordProgress.findMany({
      where: {
        userId,
        status: 'learning',
        lastReview: { gte: threeDaysAgo },
        totalReviews: { lt: 3 },
      },
      include: {
        word: {
          select: { id: true, word: true, definition: true, cefrLevel: true, partOfSpeech: true },
        },
      },
      take: 10,
    });

    // Stats summary
    const totalLearning = await prisma.wordProgress.count({
      where: { userId, status: 'learning' },
    });
    const totalReviewing = await prisma.wordProgress.count({
      where: { userId, status: 'reviewing' },
    });
    const totalMastered = await prisma.wordProgress.count({
      where: { userId, status: { in: ['known', 'mastered'] } },
    });

    // Recommendation message
    let recommendation: string;
    let priority: 'high' | 'medium' | 'low';
    if (overdue.length > 0) {
      recommendation = `You have ${overdue.length} overdue word${overdue.length > 1 ? 's' : ''} to review. Start with these to maintain your memory!`;
      priority = 'high';
    } else if (weakWords.length > 5) {
      recommendation = `You have ${weakWords.length} words that need reinforcement. Review them to strengthen your recall.`;
      priority = 'medium';
    } else if (recentNew.length > 0) {
      recommendation = `${recentNew.length} recently learned words could use a quick review to cement them in memory.`;
      priority = 'low';
    } else {
      recommendation = 'Great job! All words are up to date. Try learning some new words!';
      priority = 'low';
    }

    return {
      overdue: overdue.map(wp => ({
        ...wp.word,
        nextReview: wp.nextReview,
        easeFactor: wp.easeFactor,
        totalReviews: wp.totalReviews,
        correctReviews: wp.correctReviews,
        daysOverdue: Math.floor((now.getTime() - (wp.nextReview as Date).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      weak: weakWords.map(wp => ({
        ...wp.word,
        nextReview: wp.nextReview,
        easeFactor: wp.easeFactor,
        totalReviews: wp.totalReviews,
        correctReviews: wp.correctReviews,
      })),
      recentNew: recentNew.map(wp => ({
        ...wp.word,
        nextReview: wp.nextReview,
        totalReviews: wp.totalReviews,
      })),
      stats: { totalLearning, totalReviewing, totalMastered },
      recommendation,
      priority,
    };
  });

  // ============================================
  // POST /api/progress/update - Update goal progress
  // ============================================
  app.post('/progress/update', async (request, _reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      wordsLearned?: number;
      wordsReviewed?: number;
    };

    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    // Get or create today's goal
    let dailyGoal = await prisma.dailyGoal.findUnique({
      where: { userId_date: { userId, date: todayStart } },
    });

    if (!dailyGoal) {
      const userGoals = await getUserDailyGoals(userId);
      dailyGoal = await prisma.dailyGoal.create({
        data: {
          userId,
          date: todayStart,
          wordsToLearn: userGoals.learnGoal,
          wordsToReview: userGoals.reviewGoal,
        },
      });
    }

    // Update progress
    const updateData: any = {};
    if (body.wordsLearned !== undefined) {
      updateData.wordsLearned = dailyGoal.wordsLearned + body.wordsLearned;
    }
    if (body.wordsReviewed !== undefined) {
      updateData.wordsReviewed = dailyGoal.wordsReviewed + body.wordsReviewed;
    }

    // Check if goal is completed
    const newLearned = updateData.wordsLearned ?? dailyGoal.wordsLearned;
    const newReviewed = updateData.wordsReviewed ?? dailyGoal.wordsReviewed;
    
    const learnGoalMet = newLearned >= dailyGoal.wordsToLearn;
    const reviewGoalMet = newReviewed >= dailyGoal.wordsToReview;
    
    if (learnGoalMet && reviewGoalMet && !dailyGoal.completed) {
      updateData.completed = true;
      updateData.completedAt = new Date();
    }

    if (Object.keys(updateData).length > 0) {
      dailyGoal = await prisma.dailyGoal.update({
        where: { id: dailyGoal.id },
        data: updateData,
      });
    }

    // Update streak if there was activity
    if (body.wordsLearned || body.wordsReviewed) {
      const streakResult = await updateStreak(userId);

      // Check for streak achievements
      if (streakResult.streakExtended) {
        await checkAchievements({
          userId,
          type: 'streak_days',
          value: streakResult.currentStreak,
        });
      }
    }

    return {
      success: true,
      dailyGoal: {
        wordsLearned: dailyGoal.wordsLearned,
        wordsReviewed: dailyGoal.wordsReviewed,
        completed: dailyGoal.completed,
      },
    };
  });

  // ============================================
  // GET /api/progress/achievements - All achievements
  // ============================================
  app.get('/progress/achievements', async (request, _reply) => {
    const userId = request.user!.userId;
    const achievements = await getAllAchievementsWithStatus(userId);
    return achievements;
  });

  // ============================================
  // GET /api/progress - Get all word progress (legacy)
  // ============================================
  app.get('/progress', async (request, _reply) => {
    const userId = request.user!.userId;
    const progress = await prisma.wordProgress.findMany({
      where: { userId },
      include: {
        word: {
          select: {
            word: true,
            cefrLevel: true,
          },
        },
      },
      orderBy: { nextReview: 'asc' },
    });

    return progress;
  });

  // ============================================
  // GET /api/progress/:wordId - Get word progress
  // ============================================
  app.get('/progress/:wordId', async (request, reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };

    const progress = await prisma.wordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
      include: { word: true },
    });

    if (!progress) {
      return reply.status(404).send({ error: 'Progress not found' });
    }

    return progress;
  });

  // ============================================
  // POST /api/progress/:wordId - Update word progress
  // ============================================
  app.post('/progress/:wordId', async (request, reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };
    const { response } = request.body as {
      response: 'easy' | 'medium' | 'hard' | 'forgot';
      responseTime?: number;
    };

    // Check if word exists
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // Get or create progress
    let existingProgress = await prisma.wordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    if (!existingProgress) {
      const initial = createInitialProgress(wordId);
      existingProgress = await prisma.wordProgress.create({
        data: {
          userId,
          wordId,
          status: initial.status,
          interval: initial.interval,
          easeFactor: initial.easeFactor,
          repetitions: initial.repetitions,
          nextReview: initial.nextReview,
          lastReview: initial.lastReview,
          totalReviews: initial.totalReviews,
          correctReviews: initial.correctReviews,
        },
      });
    }

    // Calculate new progress
    const quality = responseToQuality(response);
    const wasNew = existingProgress.status === 'new';
    const wasNotMastered = existingProgress.status !== 'mastered';
    
    const updated = calculateNextReview(
      {
        wordId: existingProgress.wordId,
        status: existingProgress.status as any,
        interval: existingProgress.interval,
        easeFactor: existingProgress.easeFactor,
        repetitions: existingProgress.repetitions,
        nextReview: existingProgress.nextReview,
        lastReview: existingProgress.lastReview,
        totalReviews: existingProgress.totalReviews,
        correctReviews: existingProgress.correctReviews,
      },
      quality
    );

    // Update in database
    const progress = await prisma.wordProgress.update({
      where: { id: existingProgress.id },
      data: {
        status: updated.status,
        interval: updated.interval,
        easeFactor: updated.easeFactor,
        repetitions: updated.repetitions,
        nextReview: updated.nextReview,
        lastReview: updated.lastReview,
        totalReviews: updated.totalReviews,
        correctReviews: updated.correctReviews,
      },
    });

    // Update daily goal and streak
    // Count as "learned" when word was new, "reviewed" when it was already known
    const dailyLearned = wasNew && updated.status !== 'new' ? 1 : 0;
    const dailyReviewed = !wasNew ? 1 : 0;
    await updateDailyProgress(userId, dailyLearned, dailyReviewed);

    // Check achievements (scoped to user)
    const unlockedAchievements: string[] = [];
    
    if (wasNew && updated.status !== 'new') {
      // Word was learned
      const totalLearned = await prisma.wordProgress.count({
        where: { userId, status: { not: 'new' } },
      });
      const newUnlocked = await checkAchievements({
        userId,
        type: 'words_learned',
        value: totalLearned,
      });
      unlockedAchievements.push(...newUnlocked);
    }

    if (wasNotMastered && updated.status === 'mastered') {
      // Word was mastered
      const totalMastered = await prisma.wordProgress.count({
        where: { userId, status: 'mastered' },
      });
      const newUnlocked = await checkAchievements({
        userId,
        type: 'words_mastered',
        value: totalMastered,
      });
      unlockedAchievements.push(...newUnlocked);
    }

    // Check review achievement
    const newUnlocked = await checkAchievements({
      userId,
      type: 'total_reviews',
      value: updated.totalReviews,
    });
    unlockedAchievements.push(...newUnlocked);

    return {
      success: true,
      progress: {
        status: progress.status,
        interval: progress.interval,
        nextReview: progress.nextReview,
      },
      achievementsUnlocked: unlockedAchievements,
    };
  });

  // ============================================
  // PUT /api/progress/:wordId/status - Quick status set (browse)
  // ============================================
  app.put('/progress/:wordId/status', async (request, reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };
    const { status } = request.body as { status: 'learning' | 'reviewing' | 'mastered' | 'new' };

    if (!['learning', 'reviewing', 'mastered', 'new'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status. Must be: learning, reviewing, mastered, or new' });
    }

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    const existingProgress = await prisma.wordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    const now = new Date();

    if (existingProgress) {
      // Update existing progress
      const wasNew = existingProgress.status === 'new';
      const updated = await prisma.wordProgress.update({
        where: { id: existingProgress.id },
        data: {
          status,
          lastReview: status !== 'new' ? now : existingProgress.lastReview,
          nextReview: status === 'mastered'
            ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
            : status === 'reviewing'
            ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
            : status === 'learning'
            ? new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000) // 1 day
            : existingProgress.nextReview,
        },
      });

      // Track daily goal if transitioning from new
      if (wasNew && status !== 'new') {
        await updateDailyProgress(userId, 1, 0);
      }

      return { success: true, status: updated.status };
    } else {
      // Create new progress entry
      const progress = await prisma.wordProgress.create({
        data: {
          userId,
          wordId,
          status,
          lastReview: status !== 'new' ? now : null,
          nextReview: status === 'mastered'
            ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
            : status === 'reviewing'
            ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
            : status === 'learning'
            ? new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
            : new Date(now.getTime() + 24 * 60 * 60 * 1000),
          totalReviews: status !== 'new' ? 1 : 0,
          correctReviews: status === 'mastered' ? 1 : 0,
        },
      });

      if (status !== 'new') {
        await updateDailyProgress(userId, 1, 0);
      }

      return { success: true, status: progress.status };
    }
  });

  // ============================================
  // POST /api/progress/batch - Batch update
  // ============================================
  app.post('/progress/batch', async (request, _reply) => {
    const userId = request.user!.userId;
    const { updates } = request.body as {
      updates: Array<{
        wordId: string;
        response: 'easy' | 'medium' | 'hard' | 'forgot';
      }>;
    };

    const results = await prisma.$transaction(async (tx) => {
      const batchResults = [];
      let wordsLearned = 0;
      let wordsReviewed = 0;

      for (const update of updates) {
        const { wordId, response } = update;

        const word = await tx.word.findUnique({ where: { id: wordId } });
        if (!word) continue;

        let existingProgress = await tx.wordProgress.findUnique({
          where: { userId_wordId: { userId, wordId } },
        });

        if (!existingProgress) {
          const initial = createInitialProgress(wordId);
          existingProgress = await tx.wordProgress.create({
            data: {
              userId,
              wordId,
              status: initial.status,
              interval: initial.interval,
              easeFactor: initial.easeFactor,
              repetitions: initial.repetitions,
              nextReview: initial.nextReview,
              totalReviews: initial.totalReviews,
              correctReviews: initial.correctReviews,
            },
          });
        }

        const quality = responseToQuality(response);
        const updated = calculateNextReview(
          {
            wordId: existingProgress.wordId,
            status: existingProgress.status as any,
            interval: existingProgress.interval,
            easeFactor: existingProgress.easeFactor,
            repetitions: existingProgress.repetitions,
            nextReview: existingProgress.nextReview,
            lastReview: existingProgress.lastReview,
            totalReviews: existingProgress.totalReviews,
            correctReviews: existingProgress.correctReviews,
          },
          quality
        );

        const wasNew = existingProgress.status === 'new';
        const progress = await tx.wordProgress.update({
          where: { id: existingProgress.id },
          data: {
            status: updated.status,
            interval: updated.interval,
            easeFactor: updated.easeFactor,
            repetitions: updated.repetitions,
            nextReview: updated.nextReview,
            lastReview: updated.lastReview,
            totalReviews: updated.totalReviews,
            correctReviews: updated.correctReviews,
          },
        });

        // Track for daily goal: learned if was new and now learning+, reviewed if was already known
        if (wasNew && updated.status !== 'new') {
          wordsLearned++;
        } else if (!wasNew) {
          wordsReviewed++;
        }

        batchResults.push({
          wordId,
          status: progress.status,
          interval: progress.interval,
          nextReview: progress.nextReview,
        });
      }

      return { results: batchResults, wordsLearned, wordsReviewed };
    });

    // Update daily progress (outside transaction to avoid holding lock too long)
    await updateDailyProgress(userId, results.wordsLearned, results.wordsReviewed);

    return { success: true, updated: results.results.length, results: results.results };
  });

  // ============================================
  // PUT /api/progress/settings - Update daily goals
  // ============================================
  app.put('/progress/settings', async (request, _reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      dailyLearnGoal?: number;
      dailyReviewGoal?: number;
    };

    const updateData: { dailyLearnGoal?: number; dailyReviewGoal?: number } = {};

    if (body.dailyLearnGoal !== undefined) {
      if (body.dailyLearnGoal < 1 || body.dailyLearnGoal > 200) {
        return { success: false, error: 'Daily learn goal must be between 1 and 200' };
      }
      updateData.dailyLearnGoal = body.dailyLearnGoal;
    }
    if (body.dailyReviewGoal !== undefined) {
      if (body.dailyReviewGoal < 1 || body.dailyReviewGoal > 500) {
        return { success: false, error: 'Daily review goal must be between 1 and 500' };
      }
      updateData.dailyReviewGoal = body.dailyReviewGoal;
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, error: 'No valid fields to update' };
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { dailyLearnGoal: true, dailyReviewGoal: true },
    });

    return { success: true, settings: user };
  });

  // ============================================
  // EXPORT USER DATA
  // ============================================
  app.get('/progress/export', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;

    const [progress, favorites, streak, goals, sessions] = await Promise.all([
      prisma.wordProgress.findMany({
        where: { userId },
        select: {
          wordId: true,
          status: true,
          interval: true,
          easeFactor: true,
          repetitions: true,
          nextReview: true,
          lastReview: true,
          totalReviews: true,
          correctReviews: true,
        },
      }),
      prisma.wordFavorite.findMany({
        where: { userId },
        select: { wordId: true, createdAt: true },
      }),
      prisma.userStreak.findUnique({
        where: { userId },
        select: {
          currentStreak: true,
          longestStreak: true,
          lastActivityDate: true,
        },
      }),
      prisma.dailyGoal.findMany({
        where: { userId },
        select: {
          date: true,
          wordsLearned: true,
          wordsReviewed: true,
          completed: true,
        },
        orderBy: { date: 'desc' },
        take: 90,
      }),
      prisma.learningSession.findMany({
        where: { userId },
        select: {
          type: true,
          startedAt: true,
          completedAt: true,
          totalCorrect: true,
          totalIncorrect: true,
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
    ]);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dailyLearnGoal: true, dailyReviewGoal: true },
    });

    reply.header('Content-Disposition', 'attachment; filename=vocab-mastery-backup.json');
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        dailyLearnGoal: user?.dailyLearnGoal || 10,
        dailyReviewGoal: user?.dailyReviewGoal || 20,
      },
      progress,
      favorites: favorites.map(f => f.wordId),
      streak,
      goals,
      sessions,
    };
  });

  // ============================================
  // IMPORT USER DATA
  // ============================================
  app.post('/progress/import', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      version?: number;
      settings?: { dailyLearnGoal?: number; dailyReviewGoal?: number };
      progress?: Array<{
        wordId: string;
        status: string;
        interval: number;
        easeFactor: number;
        repetitions: number;
        nextReview: string;
        totalReviews: number;
        correctReviews: number;
      }>;
      favorites?: string[];
    };

    if (!body || (!body.progress && !body.favorites && !body.settings)) {
      return reply.status(400).send({ error: 'No data to import' });
    }

    let imported = 0;

    // Import settings
    if (body.settings) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.settings.dailyLearnGoal && { dailyLearnGoal: body.settings.dailyLearnGoal }),
          ...(body.settings.dailyReviewGoal && { dailyReviewGoal: body.settings.dailyReviewGoal }),
        },
      });
    }

    // Import progress (upsert)
    if (body.progress?.length) {
      for (const p of body.progress) {
        try {
          await prisma.wordProgress.upsert({
            where: { userId_wordId: { userId, wordId: p.wordId } },
            update: {
              status: p.status,
              interval: p.interval,
              easeFactor: p.easeFactor,
              repetitions: p.repetitions,
              nextReview: new Date(p.nextReview),
              totalReviews: p.totalReviews,
              correctReviews: p.correctReviews,
            },
            create: {
              userId,
              wordId: p.wordId,
              status: p.status,
              interval: p.interval,
              easeFactor: p.easeFactor,
              repetitions: p.repetitions,
              nextReview: new Date(p.nextReview),
              totalReviews: p.totalReviews,
              correctReviews: p.correctReviews,
            },
          });
          imported++;
        } catch {
          // Skip invalid word IDs
        }
      }
    }

    // Import favorites
    if (body.favorites?.length) {
      for (const wordId of body.favorites) {
        try {
          await prisma.wordFavorite.upsert({
            where: { userId_wordId: { userId, wordId } },
            update: {},
            create: { userId, wordId },
          });
          imported++;
        } catch {
          // Skip invalid word IDs
        }
      }
    }

    return { success: true, imported };
  });
}

// Helper to update daily progress
async function updateDailyProgress(userId: string, wordsLearned: number, wordsReviewed: number) {
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  let dailyGoal = await prisma.dailyGoal.findUnique({
    where: { userId_date: { userId, date: todayStart } },
  });

  if (!dailyGoal) {
    const userGoals = await getUserDailyGoals(userId);
    dailyGoal = await prisma.dailyGoal.create({
      data: {
        userId,
        date: todayStart,
        wordsToLearn: userGoals.learnGoal,
        wordsToReview: userGoals.reviewGoal,
        wordsLearned,
        wordsReviewed,
      },
    });
  } else {
    const updateData: any = {
      wordsLearned: { increment: wordsLearned },
      wordsReviewed: { increment: wordsReviewed },
    };

    // Check if goal is completed
    const newLearned = dailyGoal.wordsLearned + wordsLearned;
    const newReviewed = dailyGoal.wordsReviewed + wordsReviewed;

    if (newLearned >= dailyGoal.wordsToLearn && newReviewed >= dailyGoal.wordsToReview && !dailyGoal.completed) {
      updateData.completed = true;
      updateData.completedAt = new Date();
    }

    await prisma.dailyGoal.update({
      where: { id: dailyGoal.id },
      data: updateData,
    });
  }

  // Update streak
  if (wordsLearned > 0 || wordsReviewed > 0) {
    await updateStreak(userId);
  }
}
