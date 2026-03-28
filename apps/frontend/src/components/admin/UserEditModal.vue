<script setup lang="ts">
import { ref, watch } from 'vue'
import { request } from '@/lib/api'

interface User {
  id: string
  email: string
  username: string
  role: 'LEARNER' | 'ADMIN'
  subscriptionTier: 'FREE' | 'EXPLORER' | 'WORDSMITH'
  subscriptionExpiresAt: string | null
}

const props = defineProps<{
  user: User
}>()

const emit = defineEmits<{
  close: []
  update: [user: User]
}>()

const form = ref({
  role: props.user.role,
  subscriptionTier: props.user.subscriptionTier,
  subscriptionExpiresAt: props.user.subscriptionExpiresAt
    ? props.user.subscriptionExpiresAt.split('T')[0]
    : '',
})

const loading = ref(false)
const error = ref<string | null>(null)

// Reset form when user changes
watch(() => props.user, (newUser) => {
  form.value = {
    role: newUser.role,
    subscriptionTier: newUser.subscriptionTier,
    subscriptionExpiresAt: newUser.subscriptionExpiresAt
      ? newUser.subscriptionExpiresAt.split('T')[0]
      : '',
  }
}, { immediate: true })

async function handleSubmit() {
  loading.value = true
  error.value = null

  try {
    const updatedUser = await request<any>(`/admin/users/${props.user.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        role: form.value.role,
        subscriptionTier: form.value.subscriptionTier,
        subscriptionExpiresAt: form.value.subscriptionExpiresAt || null,
      }),
    })
    emit('update', updatedUser)
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Edit User</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400">{{ user.username }} ({{ user.email }})</p>
      </div>

      <!-- Form -->
      <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
        <!-- Error -->
        <div v-if="error" class="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {{ error }}
        </div>

        <!-- Role -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Role</label>
          <select
            v-model="form.role"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="LEARNER">Learner</option>
            <option value="ADMIN">Admin</option>
          </select>
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Admins can access this panel and manage users</p>
        </div>

        <!-- Subscription Tier -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subscription Tier</label>
          <select
            v-model="form.subscriptionTier"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="FREE">Free</option>
            <option value="EXPLORER">Explorer ($4.99/mo)</option>
            <option value="WORDSMITH">Wordsmith ($9.99/mo)</option>
          </select>
        </div>

        <!-- Subscription Expiry -->
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Subscription Expiry
            <span class="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            v-model="form.subscriptionExpiresAt"
            type="date"
            class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave empty for no expiry</p>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-3 pt-4">
          <button
            type="button"
            @click="emit('close')"
            class="px-4 py-2 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white dark:text-white"
            :disabled="loading"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            :disabled="loading"
          >
            {{ loading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
