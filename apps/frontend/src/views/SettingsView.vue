<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// Password change
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)
const passwordError = ref('')
const passwordSuccess = ref('')

// Account deletion
const deletePassword = ref('')
const deleteLoading = ref(false)
const deleteError = ref('')
const showDeleteConfirm = ref(false)

async function handleChangePassword() {
  passwordError.value = ''
  passwordSuccess.value = ''

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = 'Please fill in all fields'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New passwords do not match'
    return
  }

  if (newPassword.value.length < 8) {
    passwordError.value = 'Password must be at least 8 characters'
    return
  }

  passwordLoading.value = true

  try {
    const success = await authStore.changePassword(currentPassword.value, newPassword.value)
    
    if (success) {
      passwordSuccess.value = 'Password changed successfully. Please log in again.'
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)
    } else {
      passwordError.value = authStore.error || 'Failed to change password'
    }
  } catch (e: any) {
    passwordError.value = e.message || 'Failed to change password'
  } finally {
    passwordLoading.value = false
  }
}

async function handleDeleteAccount() {
  if (!deletePassword.value) {
    deleteError.value = 'Please enter your password'
    return
  }

  deleteLoading.value = true
  deleteError.value = ''

  try {
    const success = await authStore.deleteAccount(deletePassword.value)
    
    if (success) {
      window.location.href = '/'
    } else {
      deleteError.value = authStore.error || 'Failed to delete account'
    }
  } catch (e: any) {
    deleteError.value = e.message || 'Failed to delete account'
  } finally {
    deleteLoading.value = false
  }
}
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <h1 class="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

    <!-- User Info -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-4">Account Information</h2>
      <div class="space-y-2">
        <div class="flex justify-between">
          <span class="text-slate-600">Email:</span>
          <span class="font-medium">{{ authStore.user?.email }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-600">Username:</span>
          <span class="font-medium">{{ authStore.user?.username }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-600">Subscription:</span>
          <span class="badge badge-primary">{{ authStore.user?.subscriptionTier }}</span>
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>
      
      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div v-if="passwordError" class="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {{ passwordError }}
        </div>
        
        <div v-if="passwordSuccess" class="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          {{ passwordSuccess }}
        </div>

        <div>
          <label for="currentPassword" class="block text-sm font-medium text-slate-700 mb-1">
            Current Password
          </label>
          <input
            id="currentPassword"
            v-model="currentPassword"
            type="password"
            class="input"
            placeholder="Enter current password"
          />
        </div>

        <div>
          <label for="newPassword" class="block text-sm font-medium text-slate-700 mb-1">
            New Password
          </label>
          <input
            id="newPassword"
            v-model="newPassword"
            type="password"
            class="input"
            placeholder="Enter new password"
          />
        </div>

        <div>
          <label for="confirmPassword" class="block text-sm font-medium text-slate-700 mb-1">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            class="input"
            placeholder="Confirm new password"
          />
        </div>

        <button
          type="submit"
          :disabled="passwordLoading"
          class="btn btn-primary"
        >
          <span v-if="passwordLoading">Changing...</span>
          <span v-else>Change Password</span>
        </button>
      </form>
    </div>

    <!-- Danger Zone -->
    <div class="card border-red-200 bg-red-50">
      <h2 class="text-lg font-semibold text-red-900 mb-4">Danger Zone</h2>
      
      <div v-if="!showDeleteConfirm">
        <p class="text-red-700 text-sm mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          @click="showDeleteConfirm = true"
          class="btn bg-red-600 hover:bg-red-700 text-white"
        >
          Delete Account
        </button>
      </div>

      <div v-else class="space-y-4">
        <p class="text-red-700 text-sm font-medium">
          Are you absolutely sure? Enter your password to confirm.
        </p>

        <div v-if="deleteError" class="p-3 bg-red-100 text-red-700 rounded-lg text-sm">
          {{ deleteError }}
        </div>

        <div>
          <label for="deletePassword" class="block text-sm font-medium text-red-700 mb-1">
            Password
          </label>
          <input
            id="deletePassword"
            v-model="deletePassword"
            type="password"
            class="input border-red-300 focus:border-red-500 focus:ring-red-500"
            placeholder="Enter your password"
          />
        </div>

        <div class="flex gap-3">
          <button
            @click="handleDeleteAccount"
            :disabled="deleteLoading"
            class="btn bg-red-600 hover:bg-red-700 text-white"
          >
            <span v-if="deleteLoading">Deleting...</span>
            <span v-else>Yes, Delete My Account</span>
          </button>
          <button
            @click="showDeleteConfirm = false; deletePassword = ''; deleteError = ''"
            class="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
