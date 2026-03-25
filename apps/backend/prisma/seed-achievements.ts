import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultAchievements = [
  // Learning achievements
  {
    key: 'first_word',
    name: 'First Steps',
    description: 'Learn your first word',
    icon: '🌱',
    category: 'learning',
    conditionType: 'words_learned',
    conditionValue: 1,
    xpReward: 10,
  },
  {
    key: 'words_10',
    name: 'Word Collector',
    description: 'Learn 10 words',
    icon: '📚',
    category: 'learning',
    conditionType: 'words_learned',
    conditionValue: 10,
    xpReward: 25,
  },
  {
    key: 'words_50',
    name: 'Vocabulary Builder',
    description: 'Learn 50 words',
    icon: '📖',
    category: 'learning',
    conditionType: 'words_learned',
    conditionValue: 50,
    xpReward: 50,
  },
  {
    key: 'words_100',
    name: 'Century Club',
    description: 'Learn 100 words',
    icon: '💯',
    category: 'learning',
    conditionType: 'words_learned',
    conditionValue: 100,
    xpReward: 100,
  },
  {
    key: 'words_500',
    name: 'Word Wizard',
    description: 'Learn 500 words',
    icon: '🧙',
    category: 'learning',
    conditionType: 'words_learned',
    conditionValue: 500,
    xpReward: 250,
  },
  {
    key: 'words_1000',
    name: 'Lexicon Master',
    description: 'Learn 1,000 words',
    icon: '👑',
    category: 'learning',
    conditionType: 'words_learned',
    conditionValue: 1000,
    xpReward: 500,
  },
  {
    key: 'mastered_10',
    name: 'Solid Foundation',
    description: 'Master 10 words',
    icon: '基石',
    category: 'learning',
    conditionType: 'words_mastered',
    conditionValue: 10,
    xpReward: 30,
  },
  {
    key: 'mastered_50',
    name: 'Memory Expert',
    description: 'Master 50 words',
    icon: '🧠',
    category: 'learning',
    conditionType: 'words_mastered',
    conditionValue: 50,
    xpReward: 75,
  },
  {
    key: 'mastered_100',
    name: 'Unforgettable',
    description: 'Master 100 words',
    icon: '💎',
    category: 'learning',
    conditionType: 'words_mastered',
    conditionValue: 100,
    xpReward: 150,
  },

  // Streak achievements
  {
    key: 'streak_3',
    name: 'Getting Started',
    description: 'Maintain a 3-day streak',
    icon: '🔥',
    category: 'streak',
    conditionType: 'streak_days',
    conditionValue: 3,
    xpReward: 15,
  },
  {
    key: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    icon: '⚡',
    category: 'streak',
    conditionType: 'streak_days',
    conditionValue: 7,
    xpReward: 50,
  },
  {
    key: 'streak_14',
    name: 'Fortnight Fighter',
    description: 'Maintain a 14-day streak',
    icon: '💪',
    category: 'streak',
    conditionType: 'streak_days',
    conditionValue: 14,
    xpReward: 100,
  },
  {
    key: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    icon: '🏆',
    category: 'streak',
    conditionType: 'streak_days',
    conditionValue: 30,
    xpReward: 200,
  },
  {
    key: 'streak_100',
    name: 'Streak Legend',
    description: 'Maintain a 100-day streak',
    icon: '🌟',
    category: 'streak',
    conditionType: 'streak_days',
    conditionValue: 100,
    xpReward: 500,
  },

  // Review achievements
  {
    key: 'reviews_50',
    name: 'Review Rookie',
    description: 'Complete 50 reviews',
    icon: '🔄',
    category: 'review',
    conditionType: 'total_reviews',
    conditionValue: 50,
    xpReward: 25,
  },
  {
    key: 'reviews_200',
    name: 'Review Regular',
    description: 'Complete 200 reviews',
    icon: '🔁',
    category: 'review',
    conditionType: 'total_reviews',
    conditionValue: 200,
    xpReward: 50,
  },
  {
    key: 'reviews_500',
    name: 'Review Machine',
    description: 'Complete 500 reviews',
    icon: '⚙️',
    category: 'review',
    conditionType: 'total_reviews',
    conditionValue: 500,
    xpReward: 100,
  },
  {
    key: 'reviews_1000',
    name: 'Review Champion',
    description: 'Complete 1,000 reviews',
    icon: '🏅',
    category: 'review',
    conditionType: 'total_reviews',
    conditionValue: 1000,
    xpReward: 200,
  },

  // Session achievements
  {
    key: 'session_perfect',
    name: 'Perfect Session',
    description: 'Complete a session with 100% accuracy',
    icon: '✨',
    category: 'session',
    conditionType: 'perfect_session',
    conditionValue: 1,
    xpReward: 30,
  },
  {
    key: 'sessions_10',
    name: 'Dedicated Learner',
    description: 'Complete 10 learning sessions',
    icon: '🎯',
    category: 'session',
    conditionType: 'sessions_completed',
    conditionValue: 10,
    xpReward: 25,
  },
  {
    key: 'sessions_50',
    name: 'Session Star',
    description: 'Complete 50 learning sessions',
    icon: '⭐',
    category: 'session',
    conditionType: 'sessions_completed',
    conditionValue: 50,
    xpReward: 75,
  },

  // Level achievements (CEFR)
  {
    key: 'level_a1_complete',
    name: 'A1 Complete',
    description: 'Master all A1 level words',
    icon: '🥉',
    category: 'level',
    conditionType: 'level_mastered',
    conditionValue: 1, // A1 = level 1
    xpReward: 100,
  },
  {
    key: 'level_a2_complete',
    name: 'A2 Complete',
    description: 'Master all A2 level words',
    icon: '🥈',
    category: 'level',
    conditionType: 'level_mastered',
    conditionValue: 2, // A2 = level 2
    xpReward: 150,
  },
  {
    key: 'level_b1_complete',
    name: 'B1 Complete',
    description: 'Master all B1 level words',
    icon: '🥇',
    category: 'level',
    conditionType: 'level_mastered',
    conditionValue: 3, // B1 = level 3
    xpReward: 200,
  },
  {
    key: 'level_b2_complete',
    name: 'B2 Complete',
    description: 'Master all B2 level words',
    icon: '🎖️',
    category: 'level',
    conditionType: 'level_mastered',
    conditionValue: 4, // B2 = level 4
    xpReward: 300,
  },
  {
    key: 'level_c1_complete',
    name: 'C1 Complete',
    description: 'Master all C1 level words',
    icon: '🏅',
    category: 'level',
    conditionType: 'level_mastered',
    conditionValue: 5, // C1 = level 5
    xpReward: 400,
  },
  {
    key: 'level_c2_complete',
    name: 'C2 Complete',
    description: 'Master all C2 level words - Native-like!',
    icon: '👑',
    category: 'level',
    conditionType: 'level_mastered',
    conditionValue: 6, // C2 = level 6
    xpReward: 500,
  },

  // Daily goal achievements
  {
    key: 'daily_goal_7',
    name: 'Goal Getter',
    description: 'Complete daily goals 7 days in a row',
    icon: '📅',
    category: 'goal',
    conditionType: 'daily_goals_streak',
    conditionValue: 7,
    xpReward: 50,
  },
  {
    key: 'daily_goal_30',
    name: 'Goal Crusher',
    description: 'Complete daily goals 30 days in a row',
    icon: '🗓️',
    category: 'goal',
    conditionType: 'daily_goals_streak',
    conditionValue: 30,
    xpReward: 150,
  },
];

async function main() {
  console.log('Seeding achievements...');

  for (const achievement of defaultAchievements) {
    await prisma.achievement.upsert({
      where: { key: achievement.key },
      update: {
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        category: achievement.category,
        conditionType: achievement.conditionType,
        conditionValue: achievement.conditionValue,
        xpReward: achievement.xpReward,
      },
      create: achievement,
    });
    console.log(`  ✓ ${achievement.key}: ${achievement.name}`);
  }

  console.log(`\nSeeded ${defaultAchievements.length} achievements!`);
}

main()
  .catch((e) => {
    console.error('Error seeding achievements:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
