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
 * Get user's subscription tier
 */
export async function getUserTier(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  return user?.subscriptionTier || 'FREE';
}

/**
 * Get tier limits for a user
 */
export async function getUserLimits(userId: string): Promise<TierLimits> {
  const tier = await getUserTier(userId);
  return TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
}

/**
 * Check if user can create a new list
 */
export async function canCreateList(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const tier = await getUserTier(userId);
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
  const tier = await getUserTier(userId);
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

/**
 * Check if user can share lists
 */
export async function canShareList(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const tier = await getUserTier(userId);
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

  if (!limits.canShareLists) {
    return {
      allowed: false,
      reason: `List sharing is not available on the ${tier} tier. Upgrade to share lists.`,
    };
  }

  return { allowed: true };
}

/**
 * Track an LLM API call for the current month
 * Uses a SystemConfig key per user per month for lightweight counting
 */
export async function trackLlmCall(userId: string): Promise<void> {
  const now = new Date();
  const monthKey = `llm_usage_${userId}_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

  await prisma.systemConfig.upsert({
    where: { key: monthKey },
    create: { key: monthKey, value: '1' },
    update: { value: String(Number(await prisma.systemConfig.findUnique({ where: { key: monthKey } }).then(r => r?.value || '0')) + 1) },
  });
}

/**
 * Check if user can make an LLM call this month
 */
export async function canUseLlm(userId: string): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
  const tier = await getUserTier(userId);
  const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];

  // -1 means unlimited
  if (limits.maxLlmCallsPerMonth === -1) {
    return { allowed: true, remaining: Infinity };
  }

  if (limits.maxLlmCallsPerMonth === 0) {
    return {
      allowed: false,
      reason: `LLM word list generation is not available on the ${tier} tier. Upgrade to use this feature.`,
      remaining: 0,
    };
  }

  const now = new Date();
  const monthKey = `llm_usage_${userId}_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  const record = await prisma.systemConfig.findUnique({ where: { key: monthKey } });
  const used = Number(record?.value || 0);

  if (used >= limits.maxLlmCallsPerMonth) {
    return {
      allowed: false,
      reason: `Monthly LLM limit reached (${limits.maxLlmCallsPerMonth} calls for ${tier} tier). Upgrade for more.`,
      remaining: 0,
    };
  }

  return { allowed: true, remaining: limits.maxLlmCallsPerMonth - used };
}
