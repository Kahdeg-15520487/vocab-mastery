<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center px-4">
    <div class="text-center">
      <div class="text-8xl mb-6">🔍</div>
      <h1 class="text-4xl font-bold text-slate-900 mb-2">404</h1>
      <h2 class="text-xl font-semibold text-slate-700 mb-4">Page Not Found</h2>
      <p class="text-slate-500 mb-8 max-w-md mx-auto">
        The page <code class="px-1.5 py-0.5 bg-slate-100 rounded text-sm font-mono">{{ route.path }}</code> doesn't exist or has been moved.
      </p>
      <div class="flex gap-4 justify-center">
        <router-link to="/" class="btn btn-primary">
          ← Go Home
        </router-link>
        <router-link to="/browse" class="btn btn-secondary">
          Browse Words
        </router-link>
      </div>
    </div>
  </div>
</template>
