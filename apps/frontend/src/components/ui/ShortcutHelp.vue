<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const isOpen = ref(false)

function toggle() {
  isOpen.value = !isOpen.value
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
    e.preventDefault()
    toggle()
  }
  if (e.key === 'Escape' && isOpen.value) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

interface ShortcutGroup {
  title: string
  shortcuts: { keys: string; description: string }[]
}

const groups: ShortcutGroup[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: 'Ctrl+K', description: 'Open word search' },
      { keys: '/', description: 'Open word search' },
      { keys: '?', description: 'Show keyboard shortcuts' },
      { keys: 'Esc', description: 'Close modal / dialog' },
    ],
  },
  {
    title: 'Flashcards (Learn / Review)',
    shortcuts: [
      { keys: 'Space / Enter', description: 'Flip card' },
      { keys: '1', description: 'Forgot' },
      { keys: '2', description: 'Hard' },
      { keys: '3', description: 'Good' },
      { keys: '4', description: 'Easy' },
      { keys: '← / →', description: 'Previous / Next card' },
    ],
  },
  {
    title: 'Quiz / Spelling / Fill Blanks',
    shortcuts: [
      { keys: '1-4', description: 'Select answer (quiz)' },
      { keys: 'Enter', description: 'Submit / Next question' },
      { keys: 'Tab', description: 'Focus input field' },
    ],
  },
  {
    title: 'Sentence Review',
    shortcuts: [
      { keys: 'Space / Enter', description: 'Flip sentence card' },
      { keys: '← / →', description: 'Previous / Next sentence' },
    ],
  },
]
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="isOpen = false" />
      <div class="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] overflow-y-auto">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Keyboard Shortcuts</h2>
          <button @click="isOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl">&times;</button>
        </div>

        <div class="px-6 py-4 space-y-5">
          <div v-for="group in groups" :key="group.title">
            <h3 class="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{{ group.title }}</h3>
            <div class="space-y-1.5">
              <div v-for="s in group.shortcuts" :key="s.keys" class="flex items-center justify-between gap-4">
                <span class="text-sm text-slate-700 dark:text-slate-300">{{ s.description }}</span>
                <kbd class="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 whitespace-nowrap">{{ s.keys }}</kbd>
              </div>
            </div>
          </div>
        </div>

        <div class="px-6 py-3 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 text-center">
          Press <kbd class="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono">?</kbd> to toggle this panel
        </div>
      </div>
    </div>
  </Teleport>
</template>
