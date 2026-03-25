import prisma from './prisma.js';

export interface AchievementCheck {
  userId: string;
  type: 'words_learned' | 'words_mastered' | 'streak_days' | 'total_reviews' | 
        'perfect_session' | 'sessions_completed' | 'level_mastered' | 'daily_goals_streak';
  value: number;
}

/**
 * Check and unlock achievements for a user
 */
export async function checkAchievements(check: AchievementCheck): Promise<string[]> {
  // Find all achievements that match the condition type and have a threshold <= value
  const achievements = await prisma.achievement.findMany({
    where: {
      conditionType: check.type,
      conditionValue: { lte: check.value },
    },
  });

  if (achievements.length === 0) {
    return [];
  }

  // Check which ones the user hasn't unlocked yet
  const unlockedKeys = await prisma.userAchievement.findMany({
    where: {
      userId: check.userId,
      achievementId: { in: achievements.map((a) => a.id) },
    },
    select: { achievement: { select: { key: true } } },
  });

  const unlockedKeySet = new Set(unlockedKeys.map((u) => u.achievement.key));

  const newAchievements = achievements.filter((a) => !unlockedKeySet.has(a.key));

  if (newAchievements.length === 0) {
    return [];
  }

  // Unlock new achievements
  await prisma.userAchievement.createMany({
    data: newAchievements.map((a) => ({
      userId: check.userId,
      achievementId: a.id,
    })),
    skipDuplicates: true,
  });

  // Return unlocked achievement keys
  return newAchievements.map((a) => a.key);
}

/**
 * Check multiple achievement types at once
 */
export async function checkAllAchievements(
  userId: string,
  stats: {
    wordsLearned?: number;
    wordsMastered?: number;
    streakDays?: number;
    totalReviews?: number;
    sessionsCompleted?: number;
  }
): Promise<string[]> {
  const checks: AchievementCheck[] = [];
  const allUnlocked: string[] = [];

  if (stats.wordsLearned !== undefined) {
    checks.push({ userId, type: 'words_learned', value: stats.wordsLearned });
  }
  if (stats.wordsMastered !== undefined) {
    checks.push({ userId, type: 'words_mastered', value: stats.wordsMastered });
  }
  if (stats.streakDays !== undefined) {
    checks.push({ userId, type: 'streak_days', value: stats.streakDays });
  }
  if (stats.totalReviews !== undefined) {
    checks.push({ userId, type: 'total_reviews', value: stats.totalReviews });
  }
  if (stats.sessionsCompleted !== undefined) {
    checks.push({ userId, type: 'sessions_completed', value: stats.sessionsCompleted });
  }

  for (const check of checks) {
    const unlocked = await checkAchievements(check);
    allUnlocked.push(...unlocked);
  }

  return allUnlocked;
}

/**
 * Get user's unlocked achievements
 */
export async function getUserAchievements(userId: string) {
  const achievements = await prisma.userAchievement.findMany({
    where: { userId },
    include: {
      achievement: true,
    },
    orderBy: { unlockedAt: 'desc' },
  });

  return achievements.map((ua) => ({
    key: ua.achievement.key,
    name: ua.achievement.name,
    description: ua.achievement.description,
    icon: ua.achievement.icon,
    category: ua.achievement.category,
    xpReward: ua.achievement.xpReward,
    unlockedAt: ua.unlockedAt,
  }));
}

/**
 * Get all achievements with unlock status for a user
 */
export async function getAllAchievementsWithStatus(userId: string) {
  const allAchievements = await prisma.achievement.findMany({
    orderBy: [{ category: 'asc' }, { conditionValue: 'asc' }],
  });

  const userAchievements = await prisma.userAchievement.findMany({
    where: { userId },
    select: { achievementId: true, unlockedAt: true },
  });

  const unlockedMap = new Map(
    userAchievements.map((ua) => [ua.achievementId, ua.unlockedAt])
  );

  return allAchievements.map((a) => ({
    key: a.key,
    name: a.name,
    description: a.description,
    icon: a.icon,
    category: a.category,
    conditionType: a.conditionType,
    conditionValue: a.conditionValue,
    xpReward: a.xpReward,
    unlocked: unlockedMap.has(a.id),
    unlockedAt: unlockedMap.get(a.id) || null,
  }));
}
