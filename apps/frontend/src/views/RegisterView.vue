<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const email = ref('')
const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

const router = useRouter()
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
    const success = await authStore.register(email.value, username.value, password.value)
    
    if (success) {
      router.push('/')
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
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-slate-900">Create Account</h1>
        <p class="text-slate-600">Join Vocab Master today</p>
      </div>

      <form @submit.prevent="handleRegister" class="space-y-4">
        <div v-if="error" class="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {{ error }}
        </div>

        <div>
          <label for="email" class="block text-sm font-medium text-slate-700 mb-1">
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
          <label for="username" class="block text-sm font-medium text-slate-700 mb-1">
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
          <label for="password" class="block text-sm font-medium text-slate-700 mb-1">
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
          <label for="confirmPassword" class="block text-sm font-medium text-slate-700 mb-1">
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

        <p class="text-center text-sm text-slate-600 mt-4">
          Already have an account?
          <RouterLink to="/login" class="text-primary-600 hover:underline">
            Sign in
          </RouterLink>
        </p>
      </form>
    </div>
  </div>
</template>
