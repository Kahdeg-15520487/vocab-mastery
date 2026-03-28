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

const { speak, isSpeaking } = useSpeech()
const isFlipped = ref(false)

const level = computed(() => props.word.cefrLevel)

function flipCard() {
  isFlipped.value = !isFlipped.value
  emit('flip', isFlipped.value)
}

function pronounce() {
  speak(props.word.word)
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
        <div class="flashcard-front card min-h-[300px] flex flex-col items-center justify-center text-center">
          <LevelBadge :level="level" class="absolute top-4 right-4" />
          
          <h2 class="text-3xl font-bold text-slate-900 mb-2">
            {{ word.word }}
          </h2>
          
          <p class="text-slate-500 mb-4">
            {{ word.phoneticUs }}
          </p>
          
          <button
            @click.stop="pronounce"
            :disabled="isSpeaking"
            class="btn btn-secondary flex items-center gap-2"
          >
            <span>🔊</span>
            <span>Pronounce</span>
          </button>
          
          <p class="text-sm text-slate-400 mt-6">
            Tap or press Space to reveal definition
          </p>
        </div>

        <!-- Back (Definition) -->
        <div class="flashcard-back card min-h-[300px] absolute inset-0 flex flex-col">
          <LevelBadge :level="level" class="absolute top-4 right-4" />
          
          <h3 class="text-xl font-bold text-slate-900 mb-2">
            {{ word.word }}
          </h3>
          
          <p class="text-slate-500 text-sm mb-4">
            {{ word.phoneticUs }}
          </p>
          
          <div class="flex-1 overflow-auto">
            <p class="text-slate-700 mb-3">
              <span class="text-xs uppercase text-slate-400">Definition:</span><br>
              {{ word.definition }}
            </p>
            
            <p class="text-slate-600 text-sm mb-3" v-if="word.examples?.length">
              <span class="text-xs uppercase text-slate-400">Example:</span><br>
              <em>"{{ word.examples[0] }}"</em>
            </p>
            
            <p class="text-slate-500 text-sm" v-if="word.synonyms?.length">
              <span class="text-xs uppercase text-slate-400">Synonyms:</span>
              {{ word.synonyms.join(' • ') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Response Buttons -->
    <div v-if="isFlipped" class="grid grid-cols-4 gap-2 mt-6">
      <button
        @click="respond('forgot')"
        class="btn flex flex-col items-center py-3 bg-danger-50 text-danger-700 hover:bg-danger-100"
      >
        <span class="text-lg">😵</span>
        <span class="text-xs mt-1">Forgot</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[1]</span>
      </button>
      <button
        @click="respond('hard')"
        class="btn flex flex-col items-center py-3 bg-warning-50 text-warning-700 hover:bg-warning-100"
      >
        <span class="text-lg">😬</span>
        <span class="text-xs mt-1">Hard</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[2]</span>
      </button>
      <button
        @click="respond('medium')"
        class="btn flex flex-col items-center py-3 bg-primary-50 text-primary-700 hover:bg-primary-100"
      >
        <span class="text-lg">😊</span>
        <span class="text-xs mt-1">Good</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[3]</span>
      </button>
      <button
        @click="respond('easy')"
        class="btn flex flex-col items-center py-3 bg-secondary-50 text-secondary-700 hover:bg-secondary-100"
      >
        <span class="text-lg">🚀</span>
        <span class="text-xs mt-1">Easy</span>
        <span class="text-[10px] text-slate-400 mt-0.5">[4]</span>
      </button>
    </div>
  </div>
</template>
