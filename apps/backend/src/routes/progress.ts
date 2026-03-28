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
      },
      recentAchievements: recentAchievements.slice(0, 5),
      activity: dailyGoals.map((g) => ({
        date: g.date,
        completed: g.completed,
        wordsLearned: g.wordsLearned,
        wordsReviewed: g.wordsReviewed,
      })),
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
