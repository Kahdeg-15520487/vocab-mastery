<script setup lang="ts">
import { computed } from 'vue'

interface DayActivity {
  date: string
  level: number
  wordsLearned: number
  wordsReviewed: number
  completed: boolean
}

interface Props {
  activities: DayActivity[]
}

const props = defineProps<Props>()

// Group activities by week
const weeks = computed(() => {
  const result: DayActivity[][] = []
  let currentWeek: DayActivity[] = []

  // Pad the first week if needed
  if (props.activities.length > 0) {
    const firstDate = new Date(props.activities[0].date)
    const dayOfWeek = firstDate.getUTCDay()
    for (let i = 0; i < dayOfWeek; i++) {
      currentWeek.push({ date: '', level: -1, wordsLearned: 0, wordsReviewed: 0, completed: false })
    }
  }

  for (const day of props.activities) {
    const date = new Date(day.date)
    const dayOfWeek = date.getUTCDay()

    if (dayOfWeek === 0 && currentWeek.length > 0) {
      result.push(currentWeek)
      currentWeek = []
    }

    currentWeek.push(day)
  }

  if (currentWeek.length > 0) {
    result.push(currentWeek)
  }

  return result
})

function getLevelColor(level: number): string {
  switch (level) {
    case 0: return 'bg-slate-100 dark:bg-slate-700'
    case 1: return 'bg-green-200'
    case 2: return 'bg-green-300'
    case 3: return 'bg-green-400'
    case 4: return 'bg-green-500'
    default: return 'bg-transparent'
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
    <h3 class="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Activity</h3>
    
    <div class="pb-8">
      <div class="inline-flex gap-1">
        <!-- Day labels -->
        <div class="flex flex-col gap-1 mr-2 text-xs text-slate-400">
          <div class="h-3"></div>
          <div class="h-3">Mon</div>
          <div class="h-3"></div>
          <div class="h-3">Wed</div>
          <div class="h-3"></div>
          <div class="h-3">Fri</div>
          <div class="h-3"></div>
        </div>
        
        <!-- Weeks -->
        <div class="flex gap-1">
          <div
            v-for="(week, weekIndex) in weeks"
            :key="weekIndex"
            class="flex flex-col gap-1"
          >
            <div
              v-for="(day, dayIndex) in week"
              :key="dayIndex"
              class="relative group"
            >
              <div
                class="w-3 h-3 rounded-sm transition-colors"
                :class="getLevelColor(day.level)"
              ></div>
              
              <!-- Tooltip -->
              <div
                v-if="day.date"
                class="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
              >
                <div class="font-medium">{{ formatDate(day.date) }}</div>
                <div v-if="day.completed" class="text-green-400">✓ Goal completed</div>
                <div v-else>
                  {{ day.wordsLearned }} learned, {{ day.wordsReviewed }} reviewed
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Legend -->
    <div class="flex items-center justify-end gap-2 mt-4 text-xs text-slate-500 dark:text-slate-400">
      <span>Less</span>
      <div class="flex gap-1">
        <div class="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-700"></div>
        <div class="w-3 h-3 rounded-sm bg-green-200"></div>
        <div class="w-3 h-3 rounded-sm bg-green-300"></div>
        <div class="w-3 h-3 rounded-sm bg-green-400"></div>
        <div class="w-3 h-3 rounded-sm bg-green-500"></div>
      </div>
      <span>More</span>
    </div>
  </div>
</template>
