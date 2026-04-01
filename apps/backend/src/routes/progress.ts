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

  // GET /progress/next-review — Get the next upcoming review time
  app.get('/progress/next-review', async (request, _reply) => {
    const userId = request.user!.userId;

    const now = new Date();

    // Count due now
    const dueNow = await prisma.wordProgress.count({
      where: { userId, nextReview: { lte: now }, status: { not: 'new' } },
    });

    // Find next upcoming review
    const nextUp = await prisma.wordProgress.findFirst({
      where: { userId, nextReview: { gt: now }, status: { not: 'new' } },
      orderBy: { nextReview: 'asc' },
      select: { nextReview: true, word: { select: { word: true } } },
    });

    // Total reviews scheduled in next 24h
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const upcoming24h = await prisma.wordProgress.count({
      where: { userId, nextReview: { gt: now, lte: in24h }, status: { not: 'new' } },
    });

    return {
      dueNow,
      nextReview: nextUp ? { at: nextUp.nextReview, word: nextUp.word.word } : null,
      upcoming24h,
    };
  });

  // POST /progress/streak/freeze — Activate streak freeze (once per 7 days)
  app.post('/progress/streak/freeze', async (request, _reply) => {
    const userId = request.user!.userId;

    const streak = await prisma.userStreak.findUnique({ where: { userId } });
    if (!streak) throw { statusCode: 404, message: 'No streak found' };

    // Check cooldown (7 days)
    if (streak.lastFreezeUsed) {
      const daysSinceFreeze = (Date.now() - streak.lastFreezeUsed.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFreeze < 7) {
        throw { statusCode: 400, message: `Streak freeze available in ${Math.ceil(7 - daysSinceFreeze)} days` };
      }
    }

    // Must have an active streak to freeze
    if (streak.currentStreak < 2) {
      throw { statusCode: 400, message: 'Need at least 2-day streak to use freeze' };
    }

    // Set frozen_until to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    await prisma.userStreak.update({
      where: { userId },
      data: {
        lastFreezeUsed: new Date(),
        frozenUntil: tomorrow,
      },
    });

    return { success: true, frozenUntil: tomorrow.toISOString() };
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
  // PUT /progress/:wordId/notes — Update personal notes/mnemonics
  app.put('/progress/:wordId/notes', async (request, reply) => {
    const userId = request.user!.userId;
    const { wordId } = request.params as { wordId: string };
    const { notes } = request.body as { notes: string };

    if (typeof notes !== 'string') {
      return reply.status(400).send({ error: 'Notes must be a string' });
    }

    if (notes.length > 1000) {
      return reply.status(400).send({ error: 'Notes must be under 1000 characters' });
    }

    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    const existing = await prisma.wordProgress.findUnique({
      where: { userId_wordId: { userId, wordId } },
    });

    if (existing) {
      await prisma.wordProgress.update({
        where: { userId_wordId: { userId, wordId } },
        data: { notes },
      });
    } else {
      await prisma.wordProgress.create({
        data: { userId, wordId, notes, status: 'new' },
      });
    }

    return { success: true, notes };
  });

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

  // GET /progress/export-csv — Export learned vocabulary as CSV
  app.get('/progress/export-csv', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const status = (request.query as any).status || 'all';

    const where: any = { userId };
    if (status !== 'all' && ['new', 'learning', 'reviewing', 'mastered'].includes(status)) {
      where.status = status;
    } else {
      where.status = { not: 'new' }; // Default: exclude unseen
    }

    const progress = await prisma.wordProgress.findMany({
      where,
      include: {
        word: {
          select: {
            word: true,
            definition: true,
            cefrLevel: true,
            partOfSpeech: true,
            examples: true,
            phoneticUs: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Build CSV
    const headers = ['Word', 'Definition', 'CEFR', 'Part of Speech', 'Phonetic', 'Status', 'Repetitions', 'Ease Factor', 'Interval (days)', 'Total Reviews', 'Correct Reviews', 'Accuracy %', 'Next Review', 'Examples'];
    const rows = progress.map(p => {
      const w = (p as any).word;
      const accuracy = p.totalReviews > 0 ? Math.round((p.correctReviews / p.totalReviews) * 100) : 0;
      const examples = Array.isArray(w?.examples) ? (w.examples as string[]).join(' | ') : '';
      const pos = Array.isArray(w?.partOfSpeech) ? (w.partOfSpeech as string[]).join(',') : (w?.partOfSpeech || '');
      const def = String(w?.definition || '').replace(/"/g, '""');
      const nextReview = p.nextReview ? new Date(p.nextReview as Date).toISOString().split('T')[0] : '';

      return [
        w?.word || '',
        `"${def}"`,
        w?.cefrLevel || '',
        pos,
        w?.phoneticUs || '',
        p.status,
        p.repetitions,
        p.easeFactor,
        p.interval,
        p.totalReviews,
        p.correctReviews,
        accuracy,
        nextReview,
        `"${examples}"`,
      ];
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename=vocab-${status}-${new Date().toISOString().split('T')[0]}.csv`);
    return csv;
  });

  // GET /progress/report — Self-contained HTML progress report
  app.get('/progress/report', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw { statusCode: 404, message: 'User not found' };

    // Gather data
    const [streak, masteryData, recentSessions] = await Promise.all([
      prisma.userStreak.findUnique({ where: { userId } }),
      prisma.$queryRaw<Array<{ cefr_level: string; total: bigint; learned: bigint; mastered: bigint }>>`
        SELECT w.cefr_level,
          COUNT(*) as total,
          COUNT(CASE WHEN wp.status IN ('learning','reviewing','mastered') THEN 1 END) as learned,
          COUNT(CASE WHEN wp.status = 'mastered' THEN 1 END) as mastered
        FROM words w
        LEFT JOIN word_progress wp ON wp.word_id = w.id AND wp.user_id = ${userId}
        GROUP BY w.cefr_level
        ORDER BY ARRAY_POSITION(ARRAY['A1','A2','B1','B2','C1','C2'], w.cefr_level)
      `,
      prisma.learningSession.findMany({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' }, take: 10,
        select: { type: true, totalCorrect: true, totalIncorrect: true, completedAt: true },
      }),
    ]);

    // Weak words (learning status, low ease factor)
    const weakWords = await prisma.wordProgress.findMany({
      where: { userId, status: 'learning' },
      include: { word: { select: { word: true, definition: true, cefrLevel: true } } },
      orderBy: { easeFactor: 'asc' }, take: 20,
    });

    const totalLearned = masteryData.reduce((s, r) => s + Number(r.learned), 0);
    const totalMastered = masteryData.reduce((s, r) => s + Number(r.mastered), 0);
    const totalWords = masteryData.reduce((s, r) => s + Number(r.total), 0);

    const cefrColors: Record<string, string> = { A1: '#22c55e', A2: '#3b82f6', B1: '#f59e0b', B2: '#ef4444', C1: '#8b5cf6', C2: '#ec4899' };

    const masteryRows = masteryData.map(r => {
      const lvl = r.cefr_level;
      const total = Number(r.total);
      const learned = Number(r.learned);
      const mastered = Number(r.mastered);
      const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
      const mPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
      return `<tr><td style="padding:8px;font-weight:600;color:${cefrColors[lvl] || '#333'}">${lvl}</td><td style="padding:8px;text-align:center">${total}</td><td style="padding:8px;text-align:center">${learned} (${pct}%)</td><td style="padding:8px;text-align:center">${mastered} (${mPct}%)</td><td style="padding:8px"><div style="background:#e2e8f0;border-radius:999px;height:8px;width:100%"><div style="background:${cefrColors[lvl] || '#3b82f6'};height:8px;border-radius:999px;width:${pct}%"></div></div></td></tr>`;
    }).join('');

    const weakRows = weakWords.map(w =>
      `<tr><td style="padding:6px 8px;font-weight:500">${w.word.word}</td><td style="padding:6px 8px;color:#64748b;font-size:13px">${(w.word.definition || '').substring(0, 60)}...</td><td style="padding:6px 8px;text-align:center;color:${cefrColors[w.word.cefrLevel] || '#333'}">${w.word.cefrLevel}</td></tr>`
    ).join('');

    const sessionRows = recentSessions.map(s =>
      `<tr><td style="padding:6px 8px;text-transform:capitalize">${s.type}</td><td style="padding:6px 8px;text-align:center">${s.totalCorrect}/${s.totalCorrect + s.totalIncorrect}</td><td style="padding:6px 8px;text-align:center">${s.completedAt ? new Date(s.completedAt).toLocaleDateString() : '-'}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Vocab Master — Progress Report</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
      h1 { font-size: 24px; margin-bottom: 4px; }
      h2 { font-size: 18px; margin: 24px 0 12px; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
      .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
      .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
      .stat { background: white; border-radius: 12px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      .stat .value { font-size: 28px; font-weight: 700; color: #312e81; }
      .stat .label { font-size: 12px; color: #64748b; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
      th { background: #f1f5f9; padding: 8px; text-align: left; font-size: 13px; color: #475569; font-weight: 600; }
      td { border-bottom: 1px solid #f1f5f9; font-size: 14px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
      @media print { body { padding: 20px; } .no-print { display: none; } }
    </style></head><body>
      <div class="no-print" style="text-align:right;margin-bottom:16px"><button onclick="window.print()" style="padding:8px 20px;background:#312e81;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">Print / Save PDF</button></div>
      <h1>Vocabulary Progress Report</h1>
      <p class="meta">${user.username} &middot; Level ${user.level} &middot; ${user.totalXp} XP &middot; ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
      <div class="stats">
        <div class="stat"><div class="value">${totalLearned}</div><div class="label">Words Learned</div></div>
        <div class="stat"><div class="value">${totalMastered}</div><div class="label">Mastered</div></div>
        <div class="stat"><div class="value">${streak?.currentStreak || 0}</div><div class="label">Day Streak</div></div>
        <div class="stat"><div class="value">${user.totalXp}</div><div class="label">Total XP</div></div>
      </div>
      <h2>CEFR Mastery Breakdown</h2>
      <table><thead><tr><th>Level</th><th style="text-align:center">Total</th><th style="text-align:center">Learned</th><th style="text-align:center">Mastered</th><th>Coverage</th></tr></thead><tbody>${masteryRows}</tbody></table>
      ${weakWords.length ? `<h2>Words to Focus On (${weakWords.length})</h2><table><thead><tr><th>Word</th><th>Definition</th><th style="text-align:center">Level</th></tr></thead><tbody>${weakRows}</tbody></table>` : ''}
      ${recentSessions.length ? `<h2>Recent Sessions</h2><table><thead><tr><th>Type</th><th style="text-align:center">Score</th><th style="text-align:center">Date</th></tr></thead><tbody>${sessionRows}</tbody></table>` : ''}
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:32px">Generated by Vocab Master &middot; ${new Date().toLocaleDateString()}</p>
    </body></html>`;

    reply.type('text/html').send(html);
  });
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
