<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 dark:text-white">✍️ Sprint Writing</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Practice using your sprint words in context</p>
      </div>
      <div v-if="sprintId" class="flex gap-2">
        <button
          @click="mode = 'sentence'"
          :class="mode === 'sentence' ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          Sentence Practice
        </button>
        <button
          @click="mode = 'long-form'"
          :class="mode === 'long-form' ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          Long-form Writing
        </button>
      </div>
    </div>

    <!-- No active sprint -->
    <div v-if="!sprintId" class="card text-center py-12">
      <div class="text-5xl mb-4">🏃</div>
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">No Active Sprint</h2>
      <p class="text-slate-500 dark:text-slate-400 mb-4">Start a sprint first to practice writing with its words.</p>
      <router-link to="/sprints" class="btn-primary">Go to Sprints</router-link>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="card text-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Loaded -->
    <template v-else>
    <!-- Sentence Mode -->
    <template v-if="mode === 'sentence'">
      <div class="card space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-slate-500 dark:text-slate-400">
            Prompt {{ currentIndex + 1 }} / {{ prompts.length }}
          </span>
          <span v-if="currentPrompt" class="text-sm font-medium text-primary-600 dark:text-primary-400">
            {{ results.filter(r => r.valid).length }} ✓ correct
          </span>
        </div>

        <!-- Progress bar -->
        <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-primary-500 rounded-full transition-all duration-300"
            :style="{ width: `${((currentIndex + 1) / prompts.length) * 100}%` }"
          />
        </div>

        <!-- Current prompt -->
        <div v-if="currentPrompt" class="space-y-4">
          <div class="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ currentPrompt.word }}</span>
              <span v-if="currentPrompt.partOfSpeech?.length" class="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full">
                {{ currentPrompt.partOfSpeech[0] }}
              </span>
              <button @click="speak(currentPrompt.word)" class="text-indigo-500 hover:text-indigo-700">
                🔊
              </button>
            </div>
            <p class="text-slate-700 dark:text-slate-300">{{ currentPrompt.definition }}</p>
            <p v-if="currentPrompt.examples?.length" class="text-sm text-slate-500 dark:text-slate-400 mt-2 italic">
              Example: {{ currentPrompt.examples[0] }}
            </p>
          </div>

          <!-- Previous result -->
          <div v-if="lastResult" :class="lastResult.valid ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'" class="p-3 rounded-lg border">
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ lastResult.valid ? '✅' : '⚠️' }}</span>
              <span class="text-sm font-medium" :class="lastResult.valid ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'">
                {{ lastResult.valid ? 'Great! You used the word correctly.' : `Word "${lastResult.targetWord}" not found. Accepted forms: ${lastResult.inflections.join(', ')}` }}
              </span>
            </div>
          </div>

          <!-- AI Coach Feedback -->
          <AIFeedbackPanel
            :visible="ai.enabled.value && aiFeedbackStatus !== 'idle'"
            :status="aiFeedbackStatus"
            :evaluation="aiEvaluation"
            :error-message="aiError"
          />

          <!-- Input -->
          <div class="space-y-2">
            <textarea
              v-model="sentence"
              placeholder="Write a sentence using this word..."
              class="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              rows="3"
              @keydown.ctrl.enter="submitSentence"
              :disabled="submitting"
            />
            <div class="flex justify-between items-center">
              <span class="text-xs text-slate-400">{{ sentence.trim().split(/\s+/).filter(Boolean).length }} words</span>
              <div class="flex gap-2">
                <button
                  v-if="!hasSubmittedCurrent && currentIndex > 0"
                  @click="skipPrompt"
                  class="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Skip
                </button>
                <button
                  v-if="hasSubmittedCurrent"
                  @click="nextPrompt"
                  class="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  {{ currentIndex < prompts.length - 1 ? 'Next →' : 'See Results →' }}
                </button>
                <button
                  v-else
                  @click="submitSentence"
                  :disabled="!sentence.trim() || submitting"
                  class="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  {{ submitting ? 'Checking...' : 'Submit (Ctrl+Enter)' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- All done -->
        <div v-else-if="prompts.length > 0" class="text-center py-8 space-y-4">
          <div class="text-5xl">🎉</div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Writing Practice Complete!</h2>
          <p class="text-slate-600 dark:text-slate-400">
            You used <strong class="text-green-600 dark:text-green-400">{{ results.filter(r => r.valid).length }}</strong>
            out of <strong>{{ results.length }}</strong> words correctly.
          </p>
          <div class="flex justify-center gap-3">
            <button @click="loadPrompts" class="btn-primary">Try Again</button>
            <button @click="mode = 'long-form'" class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600">
              Long-form Challenge →
            </button>
          </div>
        </div>
      </div>

      <!-- Writing History -->
      <div v-if="writings.length > 0" class="card space-y-3">
        <h3 class="font-semibold text-slate-900 dark:text-white">Recent Sentences</h3>
        <div v-for="w in writings.slice(0, 10)" :key="w.id" class="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <p class="text-slate-900 dark:text-white">{{ w.text }}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs" :class="w.sprintWordsUsed > 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">
              {{ w.sprintWordsUsed > 0 ? '✓ Word used' : '⚠ Word not detected' }}
            </span>
            <span class="text-xs text-slate-400">{{ w.wordCount }} words</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Long-form Mode -->
    <template v-if="mode === 'long-form'">
      <div class="card space-y-4">
        <div class="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-lg">
          <h2 class="font-semibold text-slate-900 dark:text-white mb-2">📖 Long-form Writing Challenge</h2>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Write a paragraph or story using as many sprint words as possible. Try to use at least 5 words from your sprint!
          </p>
          <div v-if="sprintWords.length" class="mt-3 flex flex-wrap gap-1.5">
            <span
              v-for="w in sprintWords.slice(0, 20)"
              :key="w.word"
              class="px-2 py-0.5 text-xs rounded-full"
              :class="usedLongFormWords.has(w.word.toLowerCase()) ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'"
            >
              {{ w.word }}
            </span>
            <span v-if="sprintWords.length > 20" class="text-xs text-slate-400">+{{ sprintWords.length - 20 }} more</span>
          </div>
        </div>

        <!-- Long-form result -->
        <div v-if="longFormResult" class="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div>
              <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ longFormResult.sprintWordsUsed }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Sprint Words</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{{ longFormResult.wordCount }}</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Total Words</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ longFormResult.coverage }}%</div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Coverage</div>
            </div>
          </div>
          <div v-if="longFormResult.usedWords.length" class="mt-3 flex flex-wrap gap-1">
            <span v-for="w in longFormResult.usedWords" :key="w" class="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 rounded-full">
              {{ w }}
            </span>
          </div>
        </div>

        <textarea
          v-model="longFormText"
          placeholder="Write a paragraph or story using your sprint words..."
          class="w-full p-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          rows="8"
          @input="trackLongFormWords"
        />
        <div class="flex justify-between items-center">
          <span class="text-xs text-slate-400">{{ longFormText.trim().split(/\s+/).filter(Boolean).length }} words · {{ usedLongFormWords.size }} sprint words detected</span>
          <button
            @click="submitLongForm"
            :disabled="!longFormText.trim() || submitting"
            class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {{ submitting ? 'Analyzing...' : 'Submit Writing' }}
          </button>
        </div>
      </div>
    </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { writingApi, sprintApi } from '../lib/api'
import { useToast } from '../composables/useToast'
import { useSpeech } from '../composables/useSpeech'
import { useBrowserAI } from '../composables/useBrowserAI'
import { buildEvalMessages, parseSentenceEvaluation, type SentenceEvaluation } from '../lib/browser-ai-prompts'
import LoadingSpinner from '../components/ui/LoadingSpinner.vue'
import AIFeedbackPanel from '../components/writing/AIFeedbackPanel.vue'

const { playAudio: speakWord } = useSpeech()
const route = useRoute()
const toast = useToast()
const ai = useBrowserAI()

const sprintId = ref<string | null>(null)
const mode = ref<'sentence' | 'long-form'>('sentence')
const loading = ref(true)
const submitting = ref(false)

// Sentence mode
const prompts = ref<any[]>([])
const currentIndex = ref(0)
const sentence = ref('')
const results = ref<any[]>([])
const lastResult = ref<any>(null)
const writings = ref<any[]>([])

// Long-form mode
const sprintWords = ref<{ word: string }[]>([])
const longFormText = ref('')
const longFormResult = ref<any>(null)
const usedLongFormWords = ref<Set<string>>(new Set())

// AI Coach state
const aiFeedbackStatus = ref<'idle' | 'evaluating' | 'done' | 'error'>('idle')
const aiEvaluation = ref<SentenceEvaluation | null>(null)
const aiError = ref('')

const currentPrompt = computed(() => prompts.value[currentIndex.value] ?? null)
const hasSubmittedCurrent = computed(() => results.value.length > currentIndex.value)

onMounted(async () => {
  const sid = route.query.sprintId as string
  if (sid) {
    sprintId.value = sid
    await Promise.all([loadPrompts(), loadWritings(), loadSprintWords()])
  }
  loading.value = false
})

watch(mode, (m) => {
  if (m === 'long-form' && sprintWords.value.length === 0) {
    loadSprintWords()
  }
})

async function loadPrompts() {
  if (!sprintId.value) return
  try {
    const data = await writingApi.getPrompts(sprintId.value)
    prompts.value = data.prompts
    currentIndex.value = 0
    results.value = []
    lastResult.value = null
    sentence.value = ''
  } catch (e: any) {
    toast.error('Failed to load prompts')
  }
}

async function loadWritings() {
  if (!sprintId.value) return
  try {
    const data = await writingApi.getWritings(sprintId.value)
    writings.value = data.writings
  } catch {
    // Silent fail
  }
}

async function loadSprintWords() {
  if (!sprintId.value) return
  try {
    const data = await sprintApi.getWords(sprintId.value)
    sprintWords.value = data.words.map((w: any) => ({ word: w.word }))
  } catch {
    // Silent
  }
}

async function submitSentence() {
  if (!sprintId.value || !currentPrompt.value || !sentence.value.trim()) return
  submitting.value = true
  try {
    const result = await writingApi.submitSentence(
      sprintId.value,
      currentPrompt.value.wordId,
      sentence.value.trim()
    )
    results.value.push(result)
    lastResult.value = result

    if (result.valid) {
      toast.success('Great usage! ✓')
    }

    // Trigger AI Coach evaluation if enabled and ready
    if (ai.enabled.value && ai.isReady.value) {
      evaluateWithAI()
    }

    loadWritings()
  } catch (e: any) {
    toast.error(e.message || 'Failed to submit')
  } finally {
    submitting.value = false
  }
}

function skipPrompt() {
  if (currentIndex.value < prompts.value.length - 1) {
    results.value.push({ valid: false })
    currentIndex.value++
    sentence.value = ''
    lastResult.value = null
    aiFeedbackStatus.value = 'idle'
    aiEvaluation.value = null
  }
}

function nextPrompt() {
  if (currentIndex.value < prompts.value.length - 1) {
    currentIndex.value++
    sentence.value = ''
    lastResult.value = null
    aiFeedbackStatus.value = 'idle'
    aiEvaluation.value = null
  } else {
    // All done
    currentIndex.value = prompts.value.length
  }
}

function speak(word: string) {
  speakWord(word, undefined, 'us')
}

function trackLongFormWords() {
  const text = longFormText.value.toLowerCase()
  const used = new Set<string>()
  for (const w of sprintWords.value) {
    const regex = new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(text)) {
      used.add(w.word.toLowerCase())
    }
  }
  usedLongFormWords.value = used
}

async function submitLongForm() {
  if (!sprintId.value || !longFormText.value.trim()) return
  submitting.value = true
  try {
    const result = await writingApi.submitLongForm(sprintId.value, longFormText.value.trim())
    longFormResult.value = result
    trackLongFormWords()
    toast.success(`You used ${result.sprintWordsUsed} sprint words!`)
  } catch (e: any) {
    toast.error(e.message || 'Failed to submit')
  } finally {
    submitting.value = false
  }
}

// AI Coach — evaluate the submitted sentence
async function evaluateWithAI() {
  if (!ai.isReady.value || !lastResult.value || !currentPrompt.value) return

  // Grab the sentence that was just submitted
  const submittedSentence = sentence.value.trim()
  if (!submittedSentence) return

  aiFeedbackStatus.value = 'evaluating'
  aiEvaluation.value = null
  aiError.value = ''

  try {
    const messages = buildEvalMessages({
      word: currentPrompt.value.word,
      partOfSpeech: currentPrompt.value.partOfSpeech,
      definition: currentPrompt.value.definition,
      sentence: submittedSentence,
    })

    const raw = await ai.generate(messages)
    const evaluation = parseSentenceEvaluation(raw)

    if (raw) {
      aiEvaluation.value = evaluation
      aiFeedbackStatus.value = 'done'
    } else {
      aiError.value = 'AI Coach returned an empty response.'
      aiFeedbackStatus.value = 'error'
    }
  } catch (err: any) {
    aiError.value = err.message || 'Evaluation failed'
    aiFeedbackStatus.value = 'error'
  }
}
</script>
