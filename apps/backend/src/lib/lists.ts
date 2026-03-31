import prisma from './prisma.js';

// Default system lists created for new users
const DEFAULT_SYSTEM_LISTS = [
  {
    name: 'Favorites',
    description: 'Your favorite words',
    color: '#f59e0b', // amber-500
    icon: '⭐',
    isSystem: true,
  },
  {
    name: 'Difficult Words',
    description: 'Words you find challenging',
    color: '#ef4444', // red-500
    icon: '🔥',
    isSystem: true,
  },
  {
    name: 'To Review',
    description: 'Words to review later',
    color: '#8b5cf6', // violet-500
    icon: '📝',
    isSystem: true,
  },
];

/**
 * Create default system lists for a new user
 */
export async function createSystemLists(userId: string): Promise<void> {
  for (const listData of DEFAULT_SYSTEM_LISTS) {
    await prisma.studyList.create({
      data: {
        userId,
        name: listData.name,
        description: listData.description,
        color: listData.color,
        icon: listData.icon,
        isSystem: listData.isSystem,
      },
    });
  }
}

/**
 * Get subscription tier limits
 */
export const TIER_LIMITS = {
  FREE: { maxLists: 3, maxWordsPerList: 50, maxLlmCallsPerMonth: 0, canShareLists: false },
  EXPLORER: { maxLists: 10, maxWordsPerList: 200, maxLlmCallsPerMonth: 10, canShareLists: true },
  WORDSMITH: { maxLists: 50, maxWordsPerList: 1000, maxLlmCallsPerMonth: -1, canShareLists: true },
} as const;

export type TierLimits = typeof TIER_LIMITS[keyof typeof TIER_LIMITS];

/**
 * Check if user can create a new list
 */
export async function canCreateList(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  const tier = user?.subscriptionTier || 'FREE';
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

  const currentCount = await prisma.studyList.count({
    where: { userId, isSystem: false },
  });

  if (currentCount >= limits.maxLists) {
    return {
      allowed: false,
      reason: `List limit reached (${limits.maxLists} lists for ${tier} tier). Upgrade to create more lists.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if user can add word to list
 */
export async function canAddWordToList(userId: string, listId: string): Promise<{ allowed: boolean; reason?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  const tier = user?.subscriptionTier || 'FREE';
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

  const currentCount = await prisma.studyListWord.count({
    where: { listId },
  });

  if (currentCount >= limits.maxWordsPerList) {
    return {
      allowed: false,
      reason: `Word limit reached (${limits.maxWordsPerList} words per list for ${tier} tier). Upgrade to add more words.`,
    };
  }

  return { allowed: true };
}
