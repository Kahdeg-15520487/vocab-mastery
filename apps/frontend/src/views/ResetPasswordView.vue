<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { request } from '@/lib/api'

const route = useRoute()
const token = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

onMounted(() => {
  token.value = (route.query.token as string) || ''
})

async function handleReset() {
  if (!token.value) {
    error.value = 'Invalid or missing reset token'
    return
  }

  if (!password.value || !confirmPassword.value) {
    error.value = 'Please fill in all fields'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  loading.value = true
  error.value = ''

  try {
    await request<{ success: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        token: token.value,
        password: password.value,
      }),
    })
    success.value = true
  } catch (e: any) {
    error.value = e.message || 'Failed to reset password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <!-- Success State -->
      <div v-if="success" class="card">
        <div class="text-center">
          <div class="text-4xl mb-4">✅</div>
          <h1 class="text-xl font-bold text-slate-900 dark:text-white mb-2">Password Reset!</h1>
          <p class="text-slate-600 dark:text-slate-400 text-sm mb-4">
            Your password has been changed successfully. You can now sign in with your new password.
          </p>
          <a href="/login" class="btn btn-primary inline-block">
            Sign In
          </a>
        </div>
      </div>

      <!-- Reset Form -->
      <div v-else>
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">🔒 New Password</h1>
          <p class="text-slate-600 dark:text-slate-400">
            Enter your new password below.
          </p>
        </div>

        <form @submit.prevent="handleReset" class="space-y-4">
          <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
            {{ error }}
          </div>

          <div v-if="!token" class="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm">
            No reset token found. Please use the link from your email.
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              New Password
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              class="input"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              class="input"
              placeholder="Confirm your password"
            />
          </div>

          <button
            type="submit"
            :disabled="loading || !token"
            class="btn btn-primary w-full"
          >
            <span v-if="loading">Resetting...</span>
            <span v-else>Reset Password</span>
          </button>

          <p class="text-center text-sm text-slate-600 dark:text-slate-400">
            <RouterLink to="/login" class="text-primary-600 dark:text-primary-400 hover:underline">
              ← Back to Login
            </RouterLink>
          </p>
        </form>
      </div>
    </div>
  </div>
</template>
