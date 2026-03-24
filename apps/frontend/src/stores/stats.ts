import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StatsResponse, DailyStats } from '@/types'
import { statsApi } from '@/lib/api'

export const useStatsStore = defineStore('stats', () => {
  const stats = ref<StatsResponse | null>(null)
  const dailyStats = ref<DailyStats[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetch overall stats
  async function fetchStats() {
    try {
      loading.value = true
      stats.value = await statsApi.get()
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Fetch daily stats
  async function fetchDailyStats(days?: number) {
    try {
      loading.value = true
      dailyStats.value = await statsApi.getDaily(days)
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    stats,
    dailyStats,
    loading,
    error,
    fetchStats,
    fetchDailyStats,
  }
})
