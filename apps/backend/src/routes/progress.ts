import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { calculateNextReview, responseToQuality, createInitialProgress } from '../lib/spaced-repetition.js';

export async function progressRoutes(app: FastifyInstance) {
  // Get all progress
  app.get('/progress', async (request, reply) => {
    const progress = await prisma.wordProgress.findMany({
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

  // Get progress for a specific word
  app.get('/progress/:wordId', async (request, reply) => {
    const { wordId } = request.params as { wordId: string };

    const progress = await prisma.wordProgress.findFirst({
      where: { wordId },
      include: { word: true },
    });

    if (!progress) {
      return reply.status(404).send({ error: 'Progress not found' });
    }

    return progress;
  });

  // Update progress after review
  app.post('/progress/:wordId', async (request, reply) => {
    const { wordId } = request.params as { wordId: string };
    const { response, responseTime } = request.body as { 
      response: 'easy' | 'medium' | 'hard' | 'forgot';
      responseTime?: number;
    };

    // Check if word exists
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // Get or create progress
    let existingProgress = await prisma.wordProgress.findFirst({
      where: { wordId },
    });

    if (!existingProgress) {
      const initial = createInitialProgress(wordId);
      existingProgress = await prisma.wordProgress.create({
        data: {
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

    // Update user stats
    await updateUserStats();

    return {
      success: true,
      progress: {
        status: progress.status,
        interval: progress.interval,
        nextReview: progress.nextReview,
      },
    };
  });

  // Batch update progress
  app.post('/progress/batch', async (request, reply) => {
    const { updates } = request.body as {
      updates: Array<{
        wordId: string;
        response: 'easy' | 'medium' | 'hard' | 'forgot';
      }>;
    };

    const results = [];

    for (const update of updates) {
      const { wordId, response } = update;

      const word = await prisma.word.findUnique({ where: { id: wordId } });
      if (!word) continue;

      let existingProgress = await prisma.wordProgress.findFirst({
        where: { wordId },
      });

      if (!existingProgress) {
        const initial = createInitialProgress(wordId);
        existingProgress = await prisma.wordProgress.create({
          data: {
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

      results.push({
        wordId,
        status: progress.status,
        interval: progress.interval,
        nextReview: progress.nextReview,
      });
    }

    await updateUserStats();

    return { success: true, updated: results.length, results };
  });
}

// Helper to update user stats
async function updateUserStats() {
  const stats = await prisma.userStats.findFirst();

  if (!stats) {
    await prisma.userStats.create({
      data: {
        totalWords: 0,
        masteredWords: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalXP: 0,
        level: 1,
      },
    });
    return;
  }

  const [totalWords, masteredWords] = await Promise.all([
    prisma.wordProgress.count(),
    prisma.wordProgress.count({ where: { status: 'mastered' } }),
  ]);

  // Check streak
  const lastActive = new Date(stats.lastActiveDate);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

  let currentStreak = stats.currentStreak;
  if (diffDays === 1) {
    currentStreak++;
  } else if (diffDays > 1) {
    currentStreak = 1;
  }

  await prisma.userStats.update({
    where: { id: stats.id },
    data: {
      totalWords,
      masteredWords,
      currentStreak,
      longestStreak: Math.max(stats.longestStreak, currentStreak),
      lastActiveDate: today,
      totalXP: stats.totalXP + 5, // +5 XP per review
      level: Math.floor((stats.totalXP + 5) / 100) + 1,
    },
  });
}
