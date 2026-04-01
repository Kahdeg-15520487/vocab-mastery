<template>
  <teleport to="body">
    <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <!-- Confetti header -->
        <div class="bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 rounded-t-2xl p-6 text-center text-white relative overflow-hidden">
          <div class="text-5xl mb-2">🎉</div>
          <h2 class="text-2xl font-bold">Sprint #{{ report?.sprintNumber }} Complete!</h2>
          <p class="text-white/80 mt-1">{{ report?.wordsLearned }} / {{ report?.wordTarget }} words learned</p>
        </div>

        <div v-if="report" class="p-6 space-y-5">
          <!-- Stats grid -->
          <div class="grid grid-cols-3 gap-3">
            <div class="text-center p-3 rounded-xl bg-green-50 dark:bg-green-900/30">
              <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ report.wordsMastered }}</div>
              <div class="text-xs text-green-600/70 dark:text-green-400/70">Mastered</div>
            </div>
            <div class="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30">
              <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{{ report.wordsLearned - report.wordsMastered }}</div>
              <div class="text-xs text-blue-600/70 dark:text-blue-400/70">Learning</div>
            </div>
            <div class="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div class="text-2xl font-bold text-gray-500 dark:text-gray-400">{{ report.wordsNew }}</div>
              <div class="text-xs text-gray-500/70 dark:text-gray-400/70">Unseen</div>
            </div>
          </div>

          <!-- Key metrics -->
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Mastery Rate</span>
              <span class="font-semibold text-gray-900 dark:text-white">{{ report.masteryRate }}%</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div class="h-2 rounded-full bg-green-500 transition-all" :style="{ width: report.masteryRate + '%' }"></div>
            </div>

            <div v-if="report.retentionRate !== null" class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Retention Rate</span>
              <span class="font-semibold" :class="report.retentionRate >= 80 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">{{ report.retentionRate }}%</span>
            </div>
            <div v-if="report.retentionRate !== null" class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
              <div class="h-2 rounded-full transition-all" :class="report.retentionRate >= 80 ? 'bg-green-500' : 'bg-amber-500'" :style="{ width: report.retentionRate + '%' }"></div>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Daily Pace</span>
              <span class="font-semibold text-gray-900 dark:text-white">{{ report.dailyPace }} words/day</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Duration</span>
              <span class="font-semibold text-gray-900 dark:text-white">{{ report.durationDays }} days</span>
            </div>

            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Sessions</span>
              <span class="font-semibold text-gray-900 dark:text-white">{{ report.totalSessions }}</span>
            </div>

            <div v-if="report.totalCorrect + report.totalIncorrect > 0" class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Accuracy</span>
              <span class="font-semibold text-gray-900 dark:text-white">
                {{ Math.round(report.totalCorrect / (report.totalCorrect + report.totalIncorrect) * 100) }}%
                ({{ report.totalCorrect }} / {{ report.totalCorrect + report.totalIncorrect }})
              </span>
            </div>

            <div v-if="report.writingsCount > 0" class="flex justify-between items-center">
              <span class="text-sm text-gray-600 dark:text-gray-400">Writing Exercises</span>
              <span class="font-semibold text-gray-900 dark:text-white">{{ report.writingsCount }}</span>
            </div>
          </div>

          <!-- Category breakdown -->
          <div v-if="report.categories?.length" class="space-y-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">📚 Word Categories</h3>
            <div v-for="cat in report.categories.slice(0, 5)" :key="cat.name" class="flex items-center gap-2">
              <span class="text-xs text-gray-500 dark:text-gray-400 w-28 truncate">{{ cat.name }}</span>
              <div class="flex-1 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                <div class="h-1.5 rounded-full bg-indigo-500" :style="{ width: cat.rate + '%' }"></div>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400 w-12 text-right">{{ cat.learned }}/{{ cat.total }}</span>
            </div>
          </div>

          <!-- Session type breakdown -->
          <div v-if="Object.keys(report.sessionsByType).length > 0" class="space-y-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">📊 Session Breakdown</h3>
            <div class="flex flex-wrap gap-2">
              <span v-for="(count, type) in report.sessionsByType" :key="String(type)"
                class="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                {{ formatType(String(type)) }}: {{ count }}
              </span>
            </div>
          </div>

          <!-- Mastered words -->
          <div v-if="report.masteredWords?.length" class="space-y-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">✅ Top Mastered Words</h3>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="w in report.masteredWords.slice(0, 15)" :key="w"
                class="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                {{ w }}
              </span>
            </div>
          </div>

          <!-- Struggling words -->
          <div v-if="report.strugglingWords?.length" class="space-y-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">💪 Words to Review</h3>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="w in report.strugglingWords.slice(0, 15)" :key="w"
                class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {{ w }}
              </span>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="p-6 pt-0 flex gap-3">
          <button @click="$emit('close')" class="btn-secondary flex-1">Close</button>
          <button @click="$emit('create-next')" class="btn-primary flex-1">
            🚀 Start Next Sprint
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
defineProps<{
  report: any
}>()

defineEmits<{
  close: []
  'create-next': []
}>()

function formatType(type: string): string {
  const map: Record<string, string> = {
    learn: '📖 Learn',
    review: '🔄 Review',
    quiz: '🧠 Quiz',
    spelling: '✍️ Spelling',
    fillBlank: '📝 Fill Blank',
    writing: '📝 Writing',
  }
  return map[type] ?? type
}
</script>
