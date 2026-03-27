import prisma from './prisma.js';

/**
 * Get the grace period month key (YYYYMM format)
 */
function getGracePeriodMonth(date: Date): number {
  return date.getFullYear() * 100 + (date.getMonth() + 1);
}

/**
 * Check if a date is within the grace period (Monday noon GMT+0 to Tuesday noon GMT+0)
 */
function isWithinGracePeriod(now: Date, lastActivity: Date): boolean {
  // Get Monday of current week at noon GMT
  const monday = new Date(now);
  const dayOfWeek = monday.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  monday.setUTCDate(monday.getUTCDate() - daysToMonday);
  monday.setUTCHours(12, 0, 0, 0);

  // Get Tuesday at noon GMT
  const tuesday = new Date(monday);
  tuesday.setUTCDate(tuesday.getUTCDate() + 1);

  // Check if last activity was before Monday noon and current time is before Tuesday noon
  const lastActivityTime = lastActivity.getTime();
  const nowTime = now.getTime();

  return lastActivityTime < monday.getTime() && nowTime >= monday.getTime() && nowTime < tuesday.getTime();
}

/**
 * Check if two dates are on the same day (UTC)
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

/**
 * Get the previous day
 */
function getPreviousDay(date: Date): Date {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev;
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  streakExtended: boolean;
  gracePeriodUsed: boolean;
}

/**
 * Update streak after activity
 * Returns the updated streak info
 */
export async function updateStreak(userId: string): Promise<StreakResult> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Get or create streak record
  let streak = await prisma.userStream.findUnique({
    where: { userId },
  });

  if (!streak) {
    streak = await prisma.userStream.create({
      data: {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        gracePeriodsUsed: 0,
        gracePeriodMonth: getGracePeriodMonth(now),
      },
    });
    return {
      currentStreak: 1,
      longestStreak: 1,
      streakExtended: true,
      gracePeriodUsed: false,
    };
  }

  // If already active today, no change needed
  if (streak.lastActivityDate && isSameDay(streak.lastActivityDate, today)) {
    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      streakExtended: false,
      gracePeriodUsed: false,
    };
  }

  const lastActivity = streak.lastActivityDate;
  let streakExtended = false;
  let gracePeriodUsed = false;
  let newCurrentStreak = streak.currentStreak;

  // Check if activity is consecutive (yesterday)
  if (lastActivity) {
    const yesterday = getPreviousDay(today);
    if (isSameDay(lastActivity, yesterday)) {
      // Consecutive day - extend streak
      newCurrentStreak++;
      streakExtended = true;
    } else {
      // Check grace period
      const currentMonth = getGracePeriodMonth(now);
      let gracePeriodsUsed = streak.gracePeriodsUsed;
      let gracePeriodMonth = streak.gracePeriodMonth;

      // Reset grace periods if new month
      if (gracePeriodMonth !== currentMonth) {
        gracePeriodsUsed = 0;
        gracePeriodMonth = currentMonth;
      }

      // Check if within grace period and has grace periods left
      if (gracePeriodsUsed < 2 && isWithinGracePeriod(now, lastActivity)) {
        // Use grace period
        newCurrentStreak++;
        streakExtended = true;
        gracePeriodUsed = true;
        gracePeriodsUsed++;

        // Update with new grace period count
        streak = await prisma.userStream.update({
          where: { userId },
          data: {
            currentStreak: newCurrentStreak,
            longestStreak: Math.max(streak.longestStreak, newCurrentStreak),
            lastActivityDate: today,
            gracePeriodsUsed,
            gracePeriodMonth,
          },
        });

        return {
          currentStreak: newCurrentStreak,
          longestStreak: streak.longestStreak,
          streakExtended,
          gracePeriodUsed,
        };
      }

      // Not consecutive and no grace period - reset streak
      newCurrentStreak = 1;
      streakExtended = false;
    }
  } else {
    // First activity ever
    newCurrentStreak = 1;
    streakExtended = true;
  }

  // Update streak
  streak = await prisma.userStream.update({
    where: { userId },
    data: {
      currentStreak: newCurrentStreak,
      longestStreak: Math.max(streak.longestStreak, newCurrentStreak),
      lastActivityDate: today,
    },
  });

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    streakExtended,
    gracePeriodUsed,
  };
}

/**
 * Get streak info for a user
 */
export async function getStreak(userId: string) {
  const streak = await prisma.userStream.findUnique({
    where: { userId },
  });

  if (!streak) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      gracePeriodsUsed: 0,
    };
  }

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    lastActivityDate: streak.lastActivityDate,
    gracePeriodsUsed: streak.gracePeriodsUsed,
  };
}
