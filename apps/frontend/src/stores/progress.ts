import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { request } from '@/lib/api';
import { setReviewDueCount } from '@/composables/usePageTitle';

export interface StreakInfo {
  current: number;
  longest: number;
  lastActivity: string | null;
}

export interface DailyGoal {
  date: string;
  wordsToLearn: number;
  wordsToReview: number;
  wordsLearned: number;
  wordsReviewed: number;
  completed: boolean;
  progress: {
    learn: number;
    review: number;
  };
}

export interface LevelProgress {
  level: string;
  total: number;
  learned: number;
  mastered: number;
  progress: number;
}

export interface Achievement {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  xpReward: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface DashboardData {
  streak: StreakInfo;
  dailyGoal: DailyGoal;
  levelProgress: LevelProgress[];
  stats: {
    totalWordsLearned: number;
    totalWordsMastered: number;
    wordsDueForReview: number;
    totalXp: number;
    level: number;
    totalWordsInDb: number;
    favoriteCount: number;
    totalSessions: number;
  };
  recentAchievements: Achievement[];
  recentProgress: Array<{
    wordId: string;
    word: string;
    cefrLevel: string;
    status: string;
    updatedAt: string;
  }>;
  activity: Array<{
    date: string;
    completed: boolean;
    wordsLearned: number;
    wordsReviewed: number;
  }>;
}

export const useProgressStore = defineStore('progress', () => {
  const dashboard = ref<DashboardData | null>(null);
  const achievements = ref<Achievement[]>([]);
  const calendar = ref<Array<{
    date: string;
    level: number;
    wordsLearned: number;
    wordsReviewed: number;
    completed: boolean;
  }>>([]);
  
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Computed
  const hasActiveStreak = computed(() => (dashboard.value?.streak.current ?? 0) > 0)
  const todayGoalCompleted = computed(() => dashboard.value?.dailyGoal.completed ?? false)

  async function fetchDashboard() {
    loading.value = true;
    error.value = null;

    try {
      dashboard.value = await request<DashboardData>('/progress/dashboard');
      // Update tab title with review due count
      setReviewDueCount(dashboard.value?.stats?.wordsDueForReview ?? 0);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchAchievements() {
    loading.value = true;
    error.value = null;

    try {
      achievements.value = await request<Achievement[]>('/progress/achievements');
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCalendar(days = 90) {
    loading.value = true;
    error.value = null;

    try {
      calendar.value = await request<any>(`/progress/calendar?days=${days}`);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function updateProgress(data: { wordsLearned?: number; wordsReviewed?: number }) {
    try {
      const result = await request<any>('/progress/update', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      // Refresh dashboard after update
      await fetchDashboard();
      
      return result;
    } catch (e: any) {
      error.value = e.message;
      throw e;
    }
  }

  return {
    dashboard,
    achievements,
    calendar,
    loading,
    error,
    hasActiveStreak,
    todayGoalCompleted,
    fetchDashboard,
    fetchAchievements,
    fetchCalendar,
    updateProgress,
  };
});
