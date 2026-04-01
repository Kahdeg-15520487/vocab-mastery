import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sprintApi } from '@/lib/api'

export const useSprintStore = defineStore('sprint', () => {
  const currentSprint = ref<any>(null)
  const sprintStats = ref<any>(null)
  const milestones = ref<any[]>([])
  const sprints = ref<any[]>([])
  const dashboard = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const hasActiveSprint = computed(() => currentSprint.value?.status === 'ACTIVE')
  const hasPlannedSprint = computed(() => currentSprint.value?.status === 'PLANNED')
  const sprintProgress = computed(() => sprintStats.value?.progress ?? 0)
  const daysRemaining = computed(() => sprintStats.value?.daysRemaining ?? 0)

  async function fetchCurrent() {
    try {
      loading.value = true
      error.value = null
      const data = await sprintApi.getCurrent()
      currentSprint.value = data.sprint
      sprintStats.value = data.stats
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchDashboard() {
    try {
      loading.value = true
      error.value = null
      dashboard.value = await sprintApi.getDashboard()
      if (dashboard.value) {
        currentSprint.value = dashboard.value.currentSprint
        sprintStats.value = dashboard.value.sprintStats
        milestones.value = dashboard.value.milestones
      }
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSprints() {
    try {
      loading.value = true
      const data = await sprintApi.list()
      sprints.value = data.sprints
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createSprint(options?: { wordTarget?: number; durationDays?: number; cefrLevel?: string; themeId?: string }) {
    try {
      loading.value = true
      error.value = null
      const data = await sprintApi.create(options)
      currentSprint.value = data.sprint
      return data.sprint
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function startSprint(id: string) {
    try {
      loading.value = true
      error.value = null
      const data = await sprintApi.start(id)
      currentSprint.value = data.sprint
      // Refresh stats
      await fetchCurrent()
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function abandonSprint(id: string) {
    try {
      loading.value = true
      error.value = null
      await sprintApi.abandon(id)
      currentSprint.value = null
      sprintStats.value = null
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function completeSprint(id: string) {
    try {
      loading.value = true
      error.value = null
      const result = await sprintApi.complete(id)
      currentSprint.value = null
      sprintStats.value = null
      return result
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    currentSprint,
    sprintStats,
    milestones,
    sprints,
    dashboard,
    loading,
    error,
    hasActiveSprint,
    hasPlannedSprint,
    sprintProgress,
    daysRemaining,
    fetchCurrent,
    fetchDashboard,
    fetchSprints,
    createSprint,
    startSprint,
    abandonSprint,
    completeSprint,
  }
})
