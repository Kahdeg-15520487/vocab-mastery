<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useTheme } from '@/composables/useTheme'

const { isDark, toggleTheme } = useTheme()

const email = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

const authStore = useAuthStore()

async function handleRegister() {
  if (!email.value || !username.value || !password.value || !confirmPassword.value) {
    error.value = 'Please fill in all fields'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const success = await authStore.register(email.value, password.value, username.value)
    
    if (success) {
      // Use full page navigation to ensure all state is refreshed
      window.location.href = '/'
    } else {
      error.value = 'Registration failed'
    }
  } catch (e: any) {
    error.value = e.message || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 relative">
    <!-- Theme toggle -->
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
        <p class="text-slate-600 dark:text-slate-400 mt-1">Create your account</p>
      </div>

      <form @submit.prevent="handleRegister" class="space-y-4">
        <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg text-sm">
          {{ error }}
        </div>

        <div>
          <label for="email" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Email
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

        <div>
          <label for="username" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Username
          </label>
          <input
            id="username"
            v-model="username"
            type="text"
            required
            class="input"
            placeholder="johndoe"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            class="input"
            placeholder="••••••••"
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
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="btn btn-primary w-full"
        >
          <span v-if="loading">Creating account...</span>
          <span v-else>Create Account</span>
        </button>

        <p class="text-center text-sm text-slate-600 dark:text-slate-400 mt-4">
          Already have an account?
          <RouterLink to="/login" class="text-primary-600 dark:text-primary-400 hover:underline">
            Sign in
          </RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>
