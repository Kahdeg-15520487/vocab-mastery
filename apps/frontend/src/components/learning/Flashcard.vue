<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Word } from '@/types'
import { useSpeech } from '@/composables/useSpeech'
import LevelBadge from './LevelBadge.vue'

const props = defineProps<{
  word: Word
}>()

const emit = defineEmits<{
  (e: 'response', response: 'easy' | 'medium' | 'hard' | 'forgot'): void
  (e: 'flip', flipped: boolean): void
}>()

const { playAudio, isSpeaking } = useSpeech()
const isFlipped = ref(false)

const level = computed(() => props.word.cefrLevel)

// Get all definitions as list
const definitions = computed(() => {
  if (!props.word.definition) return []
  return props.word.definition.split('\n\n').filter(Boolean)
})

function flipCard() {
  isFlipped.value = !isFlipped.value
  emit('flip', isFlipped.value)
}

function pronounce() {
  playAudio(props.word.word, props.word.audioUs || null, 'us')
}

function respond(response: 'easy' | 'medium' | 'hard' | 'forgot') {
  emit('response', response)
  isFlipped.value = false
}
</script>

<template>
  <div class="w-full max-w-lg mx-auto">
    <!-- Card Container -->
    <div 
      class="flashcard-container cursor-pointer"
      @click="flipCard"
    >
      <div 
        :class="[
          'flashcard relative w-full',
          isFlipped ? 'flipped' : ''
        ]"
      >
        <!-- Front (Word) -->
        <div class="flashcard-front card min-h-[320px] flex flex-col items-center justify-center text-center">
          <LevelBadge :level="level" class="absolute top-4 right-4" />
          
          <!-- Part of speech -->
          <div v-if="word.partOfSpeech?.length" class="absolute top-4 left-4 flex gap-1">
            <span
              v-for="pos in word.partOfSpeech"
              :key="pos"
              class="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full italic"
            >
              {{ pos }}
            </span>
          </div>

          <h2 class="text-4xl font-bold text-slate-900 dark:text-white mb-1">
            {{ word.word }}
          </h2>
          
          <div class="flex items-center gap-3 mb-5">
            <span v-if="word.phoneticUs" class="text-slate-400 dark:text-slate-500 text-sm">
              {{ word.phoneticUs }}
            </span>
            <button
              @click.stop="pronounce"
              :disabled="isSpeaking"
              class="w-8 h-8 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
              title="Pronounce"
            >
              🔊
            </button>
          </div>
          
          <div class="text-sm text-slate-400 dark:text-slate-500">
            <span class="inline-flex items-center gap-1">
              📖 Tap to reveal definition
            </span>
          </div>
        </div>

        <!-- Back (Definition) -->
        <div class="flashcard-back card min-h-[320px] absolute inset-0 flex flex-col">
          <LevelBadge :level="level" class="absolute top-4 right-4" />
          
          <!-- Word header -->
          <div class="flex items-center gap-3 mb-3">
            <h3 class="text-xl font-bold text-slate-900 dark:text-white">
              {{ word.word }}
            </h3>
            <button
              @click.stop="pronounce"
              class="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
              title="Pronounce"
            >
              🔊
            </button>
          </div>

          <div class="flex-1 overflow-auto space-y-3 pr-1">
            <!-- Definitions -->
            <div>
              <p class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 font-semibold">Definition</p>
              <div class="space-y-1.5">
                <p
                  v-for="(def, idx) in definitions.slice(0, 3)"
                  :key="idx"
                  class="text-sm text-slate-700 dark:text-slate-300 pl-3 border-l-2 border-primary-200 dark:border-primary-800"
                >
                  <span v-if="definitions.length > 1" class="text-slate-400 mr-1">{{ idx + 1 }}.</span>
                  {{ def }}
                </p>
              </div>
            </div>
            
            <!-- Example -->
            <div v-if="word.examples?.length">
              <p class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 font-semibold">Example</p>
              <p class="text-sm text-slate-600 dark:text-slate-400 italic pl-3 border-l-2 border-amber-200 dark:border-amber-800">
                "{{ word.examples[0] }}"
              </p>
            </div>
            
            <!-- Synonyms -->
            <div v-if="word.synonyms?.length">
              <p class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 font-semibold">Synonyms</p>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="syn in word.synonyms.slice(0, 5)"
                  :key="syn"
                  class="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full"
                >
                  {{ syn }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Response Buttons -->
    <div v-if="isFlipped" class="grid grid-cols-4 gap-2 mt-6">
      <button
        @click="respond('forgot')"
        class="btn flex flex-col items-center py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800"
      >
        <span class="text-lg">😵</span>
        <span class="text-xs mt-1">Forgot</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[1]</span>
      </button>
      <button
        @click="respond('hard')"
        class="btn flex flex-col items-center py-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-orange-200 dark:border-orange-800"
      >
        <span class="text-lg">😬</span>
        <span class="text-xs mt-1">Hard</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[2]</span>
      </button>
      <button
        @click="respond('medium')"
        class="btn flex flex-col items-center py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800"
      >
        <span class="text-lg">😊</span>
        <span class="text-xs mt-1">Good</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[3]</span>
      </button>
      <button
        @click="respond('easy')"
        class="btn flex flex-col items-center py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800"
      >
        <span class="text-lg">🚀</span>
        <span class="text-xs mt-1">Easy</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[4]</span>
      </button>
    </div>
  </div>
</template>
