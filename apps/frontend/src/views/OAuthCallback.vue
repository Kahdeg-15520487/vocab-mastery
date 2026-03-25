<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const accessToken = route.query.accessToken as string
    const userJson = route.query.user as string

    if (!accessToken || !userJson) {
      throw new Error('Missing authentication data')
    }

    // Parse user data
    const user = JSON.parse(userJson)

    // Store token and update auth store
    sessionStorage.setItem('accessToken', accessToken)
    authStore.user = user

    // Redirect to home
    router.replace('/')
  } catch (e: any) {
    error.value = e.message || 'Authentication failed'
    setTimeout(() => {
      router.replace('/login')
    }, 2000)
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-50">
    <div class="text-center">
      <div v-if="error" class="space-y-4">
        <div class="text-6xl">😕</div>
        <h1 class="text-2xl font-bold text-slate-800">Authentication Failed</h1>
        <p class="text-slate-600">{{ error }}</p>
        <p class="text-sm text-slate-500">Redirecting to login...</p>
      </div>
      <div v-else class="space-y-4">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <h1 class="text-xl font-semibold text-slate-800">Signing you in...</h1>
        <p class="text-slate-600">Please wait while we complete your authentication.</p>
      </div>
    </div>
  </div>
</template>
