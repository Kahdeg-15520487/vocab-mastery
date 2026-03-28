<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'primary'
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
}>()

const show = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  show.value = val
})

function close() {
  show.value = false
  emit('update:modelValue', false)
}

function handleConfirm() {
  emit('confirm')
  close()
}

const variantClasses = {
  danger: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white',
  warning: 'bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-800 text-white',
  primary: 'btn-primary',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="close"
        />

        <!-- Dialog -->
        <div
          class="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all"
          @click.stop
        >
          <!-- Icon -->
          <div class="text-center mb-4">
            <span class="text-4xl">
              {{ variant === 'danger' ? '⚠️' : variant === 'warning' ? '🟡' : '❓' }}
            </span>
          </div>

          <!-- Title -->
          <h3 v-if="title" class="text-lg font-semibold text-slate-900 dark:text-white text-center mb-2">
            {{ title }}
          </h3>

          <!-- Message -->
          <p class="text-slate-600 dark:text-slate-400 text-center mb-6">
            {{ message }}
          </p>

          <!-- Actions -->
          <div class="flex gap-3 justify-center">
            <button
              @click="close"
              class="btn btn-secondary"
            >
              {{ cancelText || 'Cancel' }}
            </button>
            <button
              @click="handleConfirm"
              :class="variantClasses[variant || 'primary']"
              class="btn px-6"
            >
              {{ confirmText || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>
