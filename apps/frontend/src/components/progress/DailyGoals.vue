<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  wordsToLearn: number
  wordsToReview: number
  wordsLearned: number
  wordsReviewed: number
  completed: boolean
}

const props = defineProps<Props>()

const learnProgress = computed(() => {
  if (props.wordsToLearn === 0) return 100
  return Math.min(100, Math.round((props.wordsLearned / props.wordsToLearn) * 100))
})

const reviewProgress = computed(() => {
  if (props.wordsToReview === 0) return 100
  return Math.min(100, Math.round((props.wordsReviewed / props.wordsToReview) * 100))
})
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-slate-800">Daily Goals</h3>
      <span v-if="completed" class="text-green-500 text-xl">✅</span>
    </div>
    
    <div class="space-y-4">
      <!-- Learn Goal -->
      <div>
        <div class="flex justify-between text-sm mb-1">
          <span class="text-slate-600">Learn</span>
          <span class="font-medium">
            {{ wordsLearned }} / {{ wordsToLearn }}
          </span>
        </div>
        <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-300 rounded-full"
            :class="learnProgress >= 100 ? 'bg-green-500' : 'bg-indigo-500'"
            :style="{ width: `${learnProgress}%` }"
          ></div>
        </div>
      </div>
      
      <!-- Review Goal -->
      <div>
        <div class="flex justify-between text-sm mb-1">
          <span class="text-slate-600">Review</span>
          <span class="font-medium">
            {{ wordsReviewed }} / {{ wordsToReview }}
          </span>
        </div>
        <div class="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-300 rounded-full"
            :class="reviewProgress >= 100 ? 'bg-green-500' : 'bg-purple-500'"
            :style="{ width: `${reviewProgress}%` }"
          ></div>
        </div>
      </div>
    </div>
    
    <div v-if="completed" class="mt-4 p-3 bg-green-50 rounded-lg text-center">
      <p class="text-green-700 font-medium">🎉 Daily goals completed!</p>
    </div>
  </div>
</template>
