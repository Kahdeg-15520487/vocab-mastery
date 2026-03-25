<script setup lang="ts">
import { computed } from 'vue'

interface Achievement {
  key: string
  name: string
  description: string
  icon: string
  category: string
  xpReward: number
  unlocked: boolean
  unlockedAt: string | null
}

interface Props {
  achievements: Achievement[]
  showLocked?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showLocked: true,
})

const categoryLabels: Record<string, string> = {
  learning: 'Learning',
  streak: 'Streak',
  review: 'Review',
  session: 'Sessions',
  level: 'Levels',
  goal: 'Goals',
}

const groupedAchievements = computed(() => {
  const groups: Record<string, Achievement[]> = {}
  
  for (const achievement of props.achievements) {
    if (!groups[achievement.category]) {
      groups[achievement.category] = []
    }
    groups[achievement.category].push(achievement)
  }
  
  return groups
})

const unlockedCount = computed(() => 
  props.achievements.filter(a => a.unlocked).length
)

const totalXP = computed(() =>
  props.achievements
    .filter(a => a.unlocked)
    .reduce((sum, a) => sum + a.xpReward, 0)
)
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-slate-800">Achievements</h3>
      <div class="text-sm text-slate-500">
        {{ unlockedCount }} / {{ achievements.length }} unlocked
        <span v-if="totalXP > 0" class="ml-2 text-yellow-600">
          ⭐ {{ totalXP }} XP
        </span>
      </div>
    </div>
    
    <div v-for="(achievementsInCategory, category) in groupedAchievements" :key="category" class="mb-6 last:mb-0">
      <h4 class="text-sm font-medium text-slate-500 mb-2">
        {{ categoryLabels[category] || category }}
      </h4>
      
      <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        <div
          v-for="achievement in achievementsInCategory"
          :key="achievement.key"
          class="relative group"
        >
          <div
            class="w-full aspect-square rounded-lg flex items-center justify-center text-2xl transition-transform group-hover:scale-110"
            :class="achievement.unlocked 
              ? 'bg-gradient-to-br from-yellow-100 to-orange-100' 
              : 'bg-slate-100 opacity-40'"
          >
            {{ achievement.unlocked ? achievement.icon : '🔒' }}
          </div>
          
          <!-- Tooltip -->
          <div
            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 min-w-[150px] text-center"
          >
            <div class="font-semibold">{{ achievement.name }}</div>
            <div class="text-slate-300 mt-1">{{ achievement.description }}</div>
            <div v-if="achievement.xpReward > 0" class="text-yellow-400 mt-1">
              +{{ achievement.xpReward }} XP
            </div>
            <div v-if="achievement.unlocked && achievement.unlockedAt" class="text-slate-400 mt-1 text-[10px]">
              {{ new Date(achievement.unlockedAt).toLocaleDateString() }}
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="achievements.length === 0" class="text-center py-8 text-slate-500">
      Start learning to unlock achievements!
    </div>
  </div>
</template>
