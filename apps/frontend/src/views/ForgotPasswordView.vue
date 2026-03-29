<script setup lang="ts">
import { ref } from 'vue'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useTheme } from '@/composables/useTheme'

const { isDark, toggleTheme } = useTheme()

const toast = useToast()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref('')
const resetToken = ref('')

async function handleSubmit() {
  if (!email.value) {
    error.value = 'Please enter your email'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const data = await request<{ success: boolean; message: string; resetToken?: string; resetUrl?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.value }),
    })

    sent.value = true
    // In dev mode, show the reset token directly
    if (data.resetToken) {
      resetToken.value = data.resetToken
      toast.info('Dev mode: reset token generated', 'Check below')
    }
  } catch (e: any) {
    error.value = e.message || 'Failed to send reset email'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 relative">
    <button
      @click="toggleTheme"
      class="absolute top-4 right-4 text-2xl p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    >
      {{ isDark ? '☀️' : '🌙' }}
    </button>
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="text-5xl mb-3">📚</div>
        <h1 class="text-2xl font-bold text-primary-600 dark:text-primary-400">Vocab Master</h1>
        <p class="text-slate-600 dark:text-slate-400 mt-1">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      <!-- Success State -->
      <div v-if="sent" class="card">
        <div class="text-center">
          <div class="text-4xl mb-4">📧</div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">Check Your Email</h2>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-4">
            If an account exists for <strong>{{ email }}</strong>, you'll receive a password reset link.
          </p>

          <!-- Dev mode: show token directly -->
          <div v-if="resetToken" class="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p class="text-xs text-yellow-700 dark:text-yellow-400 mb-2">🔧 Dev Mode — Reset token:</p>
            <div class="flex items-center gap-2">
              <code class="text-xs bg-white dark:bg-slate-800 px-2 py-1 rounded break-all select-all flex-1">{{ resetToken }}</code>
            </div>
            <RouterLink
              :to="`/reset-password?token=${resetToken}`"
              class="mt-3 inline-block text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              → Go to Reset Page
            </RouterLink>
          </div>

          <div class="mt-4 space-y-2">
            <RouterLink to="/login" class="block text-sm text-primary-600 dark:text-primary-400 hover:underline">
              ← Back to Login
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Request Form -->
      <form v-else @submit.prevent="handleSubmit" class="space-y-4">
        <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {{ error }}
        </div>

        <div>
          <label for="email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Email Address
          </label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            class="input"
            placeholder="you@example.com"
          />
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="btn btn-primary w-full"
        >
          <span v-if="loading">Sending...</span>
          <span v-else>Send Reset Link</span>
        </button>

        <p class="text-center text-sm text-slate-600 dark:text-slate-400">
          <RouterLink to="/login" class="text-primary-600 dark:text-primary-400 hover:underline">
            ← Back to Login
          </RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>
