import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7101/api';

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
  };
  recentAchievements: Achievement[];
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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/progress/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch dashboard');
      dashboard.value = await response.json();
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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/progress/achievements`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch achievements');
      achievements.value = await response.json();
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
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/progress/calendar?days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch calendar');
      calendar.value = await response.json();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function updateProgress(data: { wordsLearned?: number; wordsReviewed?: number }) {
    try {
      const token = sessionStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE}/progress/update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to update progress');
      
      // Refresh dashboard after update
      await fetchDashboard();
      
      return await response.json();
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
