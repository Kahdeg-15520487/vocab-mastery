<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { statsApi } from '@/lib/api'
import { useProgressStore } from '@/stores/progress'
import LevelBadge from '@/components/learning/LevelBadge.vue'
import ConfettiEffect from '@/components/ui/ConfettiEffect.vue'

const progressStore = useProgressStore()

type Phase = 'loading' | 'setup' | 'playing' | 'results'
const phase = ref<Phase>('loading')
const challenge = ref<any>(null)
const currentIdx = ref(0)
const answers = ref<Map<string, { correct: boolean; userInput: string }>>(new Map())
const result = ref<{ correct: number; total: number; accuracy: number; bonusXp: number } | null>(null)
const userInput = ref('')
const showResult = ref(false)
const showConfetti = ref(false)
const error = ref('')

const currentQuestion = computed(() => challenge.value?.questions?.[currentIdx.value])
const isLastQuestion = computed(() => currentIdx.value >= (challenge.value?.questions?.length ?? 0) - 1)
const progress = computed(() => challenge.value ? ((currentIdx.value) / challenge.value.questions.length) * 100 : 0)

onMounted(async () => {
  try {
    challenge.value = await statsApi.getDailyChallenge()
    phase.value = 'setup'
  } catch (e: any) {
    error.value = e.message || 'Failed to load challenge'
    phase.value = 'setup'
  }
})

function startChallenge() {
  phase.value = 'playing'
  currentIdx.value = 0
  answers.value = new Map()
  userInput.value = ''
  showResult.value = false
}

function checkSpellingAnswer() {
  if (!currentQuestion.value || !userInput.value.trim()) return
  const correct = userInput.value.trim().toLowerCase() === currentQuestion.value.word.toLowerCase()
  answers.value.set(currentQuestion.value.id, { correct, userInput: userInput.value.trim() })
  showResult.value = true
}

function checkDefinitionAnswer(correct: boolean) {
  if (!currentQuestion.value) return
  answers.value.set(currentQuestion.value.id, { correct, userInput: correct ? 'known' : 'unknown' })
  showResult.value = true
}

function nextQuestion() {
  showResult.value = false
  userInput.value = ''
  if (isLastQuestion.value) {
    finishChallenge()
  } else {
    currentIdx.value++
  }
}

async function finishChallenge() {
  const answerArray = Array.from(answers.value.entries()).map(([wordId, data]) => ({
    wordId,
    correct: data.correct,
  }))

  try {
    result.value = await statsApi.submitDailyChallenge(answerArray)
    phase.value = 'results'
    progressStore.fetchDashboard()
    if (result.value.accuracy >= 80) {
      showConfetti.value = true
      setTimeout(() => showConfetti.value = false, 3000)
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to submit challenge'
  }
}

function getAnswer(wordId: string) {
  return answers.value.get(wordId)
}
</script>

<template>
  <div class="max-w-2xl mx-auto">
    <ConfettiEffect v-if="showConfetti" />

    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl">🎯</div>
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Daily Challenge</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400" v-if="challenge">{{ challenge.challengeName }}</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="phase === 'loading'" class="card text-center py-12">
      <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-slate-500 dark:text-slate-400">Loading today's challenge...</p>
    </div>

    <!-- Setup -->
    <div v-else-if="phase === 'setup'" class="card">
      <div class="text-center py-6">
        <div class="text-5xl mb-4">🎯</div>
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-2" v-if="challenge">{{ challenge.challengeName }}</h2>
        <p class="text-slate-500 dark:text-slate-400 mb-6">Test your vocabulary with 5 random words. Earn bonus XP!</p>

        <div class="grid grid-cols-3 gap-4 max-w-xs mx-auto mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-amber-600">{{ challenge?.questions?.length || 5 }}</div>
            <div class="text-xs text-slate-500">Words</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">+50</div>
            <div class="text-xs text-slate-500">Max XP</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">+25</div>
            <div class="text-xs text-slate-500">Perfect</div>
          </div>
        </div>

        <button @click="startChallenge" class="px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-lg transition-colors">
          Start Challenge
        </button>
      </div>
    </div>

    <!-- Playing -->
    <div v-else-if="phase === 'playing' && currentQuestion" class="space-y-4">
      <!-- Progress bar -->
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-slate-500 dark:text-slate-400">{{ currentIdx + 1 }} / {{ challenge.questions.length }}</span>
        <div class="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
          <div class="bg-amber-500 h-2 rounded-full transition-all duration-300" :style="{ width: (progress + (showResult ? 100 / challenge.questions.length : 0)) + '%' }"></div>
        </div>
      </div>

      <!-- Question card -->
      <div class="card">
        <div class="flex items-center gap-2 mb-4">
          <LevelBadge :level="currentQuestion.cefrLevel" />
          <span class="text-xs text-slate-400 capitalize">{{ currentQuestion.type }}</span>
        </div>

        <!-- Spelling mode -->
        <template v-if="currentQuestion.type === 'spelling'">
          <p class="text-sm text-slate-600 dark:text-slate-400 mb-2">Type the word that matches this definition:</p>
          <p class="text-lg font-medium text-slate-900 dark:text-white mb-4">{{ currentQuestion.definition }}</p>
          <div class="flex gap-2">
            <input
              v-model="userInput"
              @keyup.enter="checkSpellingAnswer"
              :disabled="showResult"
              placeholder="Type the word..."
              class="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              autocomplete="off"
              spellcheck="false"
            />
            <button v-if="!showResult" @click="checkSpellingAnswer" :disabled="!userInput.trim()" class="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium disabled:opacity-50">Check</button>
          </div>
        </template>

        <!-- Definition mode (know / don't know) -->
        <template v-else>
          <p class="text-3xl font-bold text-slate-900 dark:text-white mb-2 text-center">{{ currentQuestion.word }}</p>
          <p v-if="currentQuestion.cefrLevel" class="text-center text-xs text-slate-400 mb-4">{{ currentQuestion.cefrLevel }}</p>
          <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">Do you know the meaning of this word?</p>
          <div class="flex gap-3">
            <button @click="checkDefinitionAnswer(false)" :disabled="showResult" class="flex-1 py-3 rounded-xl font-medium border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors">
              Don't Know
            </button>
            <button @click="checkDefinitionAnswer(true)" :disabled="showResult" class="flex-1 py-3 rounded-xl font-medium border-2 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50 transition-colors">
              I Know It!
            </button>
          </div>
        </template>

        <!-- Answer feedback -->
        <div v-if="showResult" class="mt-4 p-3 rounded-lg" :class="getAnswer(currentQuestion.id)?.correct ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-lg">{{ getAnswer(currentQuestion.id)?.correct ? '✅' : '❌' }}</span>
            <span class="font-medium" :class="getAnswer(currentQuestion.id)?.correct ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'">
              {{ getAnswer(currentQuestion.id)?.correct ? 'Correct!' : 'Incorrect' }}
            </span>
          </div>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            <strong class="text-slate-900 dark:text-white">{{ currentQuestion.word }}</strong> — {{ currentQuestion.definition }}
          </p>
        </div>
      </div>

      <!-- Next button -->
      <div class="flex justify-end">
        <button v-if="showResult" @click="nextQuestion" class="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors">
          {{ isLastQuestion ? 'Finish Challenge' : 'Next' }}
        </button>
      </div>
    </div>

    <!-- Results -->
    <div v-else-if="phase === 'results' && result" class="card">
      <div class="text-center py-6">
        <div class="text-5xl mb-4">{{ result.accuracy >= 80 ? '🎉' : result.accuracy >= 60 ? '👍' : '💪' }}</div>
        <h2 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          {{ result.accuracy >= 80 ? 'Excellent!' : result.accuracy >= 60 ? 'Good Job!' : 'Keep Practicing!' }}
        </h2>
        <p class="text-slate-500 dark:text-slate-400 mb-6">You got {{ result.correct }} out of {{ result.total }} correct</p>

        <div class="grid grid-cols-3 gap-4 max-w-xs mx-auto mb-6">
          <div class="text-center">
            <div class="text-2xl font-bold text-green-600">{{ result.correct }}</div>
            <div class="text-xs text-slate-500">Correct</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-amber-600">{{ result.accuracy }}%</div>
            <div class="text-xs text-slate-500">Accuracy</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-600">+{{ result.bonusXp }}</div>
            <div class="text-xs text-slate-500">Bonus XP</div>
          </div>
        </div>

        <!-- Review answers -->
        <div class="text-left space-y-2 mb-6">
          <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Review:</h3>
          <div v-for="q in challenge.questions" :key="q.id" class="flex items-center gap-2 p-2 rounded-lg text-sm"
            :class="getAnswer(q.id)?.correct ? 'bg-green-50 dark:bg-green-900/10' : 'bg-red-50 dark:bg-red-900/10'">
            <span>{{ getAnswer(q.id)?.correct ? '✅' : '❌' }}</span>
            <span class="font-medium text-slate-900 dark:text-white">{{ q.word }}</span>
            <span class="text-slate-400">—</span>
            <span class="text-slate-500 dark:text-slate-400 truncate">{{ q.definition }}</span>
          </div>
        </div>

        <router-link to="/" class="inline-block px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
          Back to Dashboard
        </router-link>
      </div>
    </div>

    <p v-if="error" class="text-red-500 text-sm mt-4">{{ error }}</p>
  </div>
</template>
