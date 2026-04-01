<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { request } from '@/lib/api'
import { useToast } from '@/composables/useToast'
import { useNotifications } from '@/composables/useNotifications'
import { useBrowserAI } from '@/composables/useBrowserAI'
import UserAvatar from '@/components/ui/UserAvatar.vue'

const authStore = useAuthStore()
const toast = useToast()
const notifications = useNotifications()
const ai = useBrowserAI()

// Password change
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)
const passwordError = ref('')

// Account deletion
const deletePassword = ref('')
const deleteLoading = ref(false)
const deleteError = ref('')
const showDeleteConfirm = ref(false)

// Daily goals
const dailyLearnGoal = ref(10)
const dailyReviewGoal = ref(20)
const goalsLoading = ref(false)
const goalsSaving = ref(false)
const goalsError = ref('')

// Data backup
const exporting = ref(false)
const importing = ref(false)
const backupError = ref('')

onMounted(async () => {
  await loadGoals()
})

async function loadGoals() {
  goalsLoading.value = true
  try {
    const data = await request<any>('/progress/dashboard')
    // Extract goals from dashboard response
    if (data.dailyGoal) {
      dailyLearnGoal.value = data.dailyGoal.wordsToLearn
      dailyReviewGoal.value = data.dailyGoal.wordsToReview
    }
  } catch (_e) {
    // Use defaults if fetch fails
  } finally {
    goalsLoading.value = false
  }
}

async function handleSaveGoals() {
  goalsSaving.value = true
  goalsError.value = ''

  try {
    await request<any>('/progress/settings', {
      method: 'PUT',
      body: JSON.stringify({
        dailyLearnGoal: dailyLearnGoal.value,
        dailyReviewGoal: dailyReviewGoal.value,
      }),
    })
    toast.success('Daily goals updated!')
  } catch (e: any) {
    goalsError.value = e.message || 'Failed to update goals'
  } finally {
    goalsSaving.value = false
  }
}

async function handleChangePassword() {
  passwordError.value = ''

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
      toast.success('Password changed! Redirecting to login...')
      currentPassword.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
      
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

async function handleExport() {
  exporting.value = true
  backupError.value = ''

  try {
    const data = await request<any>('/progress/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vocab-mastery-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Data exported successfully!')
  } catch (e: any) {
    backupError.value = e.message || 'Failed to export data'
  } finally {
    exporting.value = false
  }
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  importing.value = true
  backupError.value = ''

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    if (!data.version && !data.progress && !data.favorites) {
      throw new Error('Invalid backup file format')
    }

    const result = await request<{ success: boolean; imported: number }>('/progress/import', {
      method: 'POST',
      body: JSON.stringify(data),
    })

    toast.success(`Imported ${result.imported} items successfully!`)
  } catch (e: any) {
    backupError.value = e.message || 'Failed to import data'
  } finally {
    importing.value = false
    input.value = '' // Reset file input
  }
}
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-2xl">
    <h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h1>

    <!-- User Info -->
    <div class="card mb-6">
      <div class="flex items-center gap-4 mb-4">
        <UserAvatar v-if="authStore.user?.username" :username="authStore.user.username" size="lg" />
        <div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-white">{{ authStore.user?.username }}</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400">{{ authStore.user?.email }}</p>
          <p v-if="authStore.user?.level" class="text-sm text-primary-500">Level {{ authStore.user.level }}</p>
        </div>
      </div>
      <div class="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
        <div class="flex justify-between">
          <span class="text-slate-600 dark:text-slate-400">Subscription:</span>
          <span class="badge badge-primary">{{ authStore.user?.subscriptionTier }}</span>
        </div>
      </div>
    </div>

    <!-- Daily Goals -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Daily Goals</h2>
      <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Set your daily learning targets. These appear on your dashboard.
      </p>
      
      <form @submit.prevent="handleSaveGoals" class="space-y-4">
        <div v-if="goalsError" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {{ goalsError }}
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="dailyLearnGoal" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Words to Learn / Day
            </label>
            <input
              id="dailyLearnGoal"
              v-model.number="dailyLearnGoal"
              type="number"
              min="1"
              max="200"
              class="input"
              :disabled="goalsLoading"
            />
          </div>
          <div>
            <label for="dailyReviewGoal" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Words to Review / Day
            </label>
            <input
              id="dailyReviewGoal"
              v-model.number="dailyReviewGoal"
              type="number"
              min="1"
              max="500"
              class="input"
              :disabled="goalsLoading"
            />
          </div>
        </div>

        <button
          type="submit"
          :disabled="goalsSaving || goalsLoading"
          class="btn btn-primary"
        >
          <span v-if="goalsSaving">Saving...</span>
          <span v-else>Save Goals</span>
        </button>
      </form>
    </div>

    <!-- Notification Settings -->
    <div v-if="notifications.supported" class="card">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">🔔 Notifications</h2>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">Daily Reminder</p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Get reminded to practice every day</p>
          </div>
          <button
            @click="notifications.permission.value === 'granted' ? notifications.permission = { value: 'denied' } as any : notifications.requestPermission()"
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            :class="notifications.permission.value === 'granted'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : notifications.permission.value === 'denied'
                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
                : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 hover:bg-primary-200'"
            :disabled="notifications.permission.value === 'denied'"
          >
            {{ notifications.permission.value === 'granted' ? '✅ Enabled' : notifications.permission.value === 'denied' ? '🚫 Blocked' : 'Enable' }}
          </button>
        </div>
        <div v-if="notifications.permission.value === 'granted'" class="flex items-center justify-between">
          <label class="text-sm font-medium text-slate-900 dark:text-white">Reminder Time</label>
          <input
            type="time"
            :value="notifications.reminderTime.value"
            @change="notifications.setReminderTime(($event.target as HTMLInputElement).value)"
            class="input w-auto"
          />
        </div>
      </div>
    </div>

    <!-- AI Coach (Browser AI) -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-2">🤖 AI Coach</h2>
      <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Run a small AI model locally in your browser to get instant feedback on your writing exercises.
        The model is downloaded once and cached by your browser (~500 MB).
      </p>

      <!-- Toggle -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">Enable AI Coach</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Requires WebGPU (Chrome 113+, Edge 113+)</p>
        </div>
        <button
          @click="ai.setEnabled(!ai.enabled.value)"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="ai.enabled.value ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="ai.enabled.value ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <!-- Status -->
      <div v-if="ai.enabled.value" class="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
        <!-- Model info -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500 dark:text-slate-400">Model</span>
          <span class="text-slate-900 dark:text-white font-mono text-xs">Qwen 3.5 0.8B (q4)</span>
        </div>

        <!-- Status -->
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-500 dark:text-slate-400">Status</span>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" :class="{
              'bg-green-500': ai.isReady.value,
              'bg-amber-500 animate-pulse': ai.isLoading.value,
              'bg-red-500': ai.status.value === 'error',
              'bg-slate-400': ai.status.value === 'idle' || ai.status.value === 'disabled',
            }"></span>
            <span class="text-slate-900 dark:text-white">
              <template v-if="ai.isReady.value">Ready</template>
              <template v-else-if="ai.isLoading.value">
                {{ ai.status.value === 'downloading' ? 'Downloading' : 'Loading' }}
              </template>
              <template v-else-if="ai.status.value === 'error'">Error</template>
              <template v-else>Idle</template>
            </span>
          </div>
        </div>

        <!-- Progress bar (visible during download) -->
        <div v-if="ai.isLoading.value && ai.status.value === 'downloading'">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>{{ ai.statusMessage.value || 'Downloading model files…' }}</span>
            <span>{{ ai.progressPercent.value }}%</span>
          </div>
          <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-primary-500 rounded-full transition-all duration-300"
              :style="{ width: `${ai.progressPercent.value}%` }"
            />
          </div>
          <p v-if="ai.progress.value.file" class="text-xs text-slate-400 mt-1 truncate">
            {{ ai.progress.value.file }}
          </p>
        </div>

        <!-- Error message -->
        <div v-if="ai.status.value === 'error' && ai.errorMessage.value" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {{ ai.errorMessage.value }}
        </div>

        <!-- Actions -->
        <div class="flex gap-2">
          <button
            v-if="ai.status.value === 'error'"
            @click="ai.setEnabled(false); $nextTick(() => ai.setEnabled(true))"
            class="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            Retry
          </button>
          <button
            v-if="ai.isReady.value"
            @click="ai.setEnabled(false)"
            class="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            Unload Model
          </button>
        </div>
      </div>
    </div>

    <!-- Change Password -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">Change Password</h2>
      
      <form @submit.prevent="handleChangePassword" class="space-y-4">
        <div v-if="passwordError" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {{ passwordError }}
        </div>
        
        <div>
          <label for="currentPassword" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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
          <label for="newPassword" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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
          <label for="confirmPassword" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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

    <!-- Data Backup -->
    <div class="card mb-6">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">💾 Data Backup</h2>
      <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
        Export your progress, favorites, and settings as a JSON file. You can import this later to restore your data.
      </p>
      
      <div v-if="backupError" class="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm mb-4">
        {{ backupError }}
      </div>
      <div class="flex gap-3 flex-wrap">
        <button @click="handleExport" :disabled="exporting" class="btn btn-primary">
          <span v-if="exporting">Exporting...</span>
          <span v-else>📥 Export Data</span>
        </button>

        <label class="btn btn-secondary cursor-pointer" :class="{ 'opacity-50': importing }">
          <span v-if="importing">Importing...</span>
          <span v-else>📤 Import Data</span>
          <input
            type="file"
            accept=".json"
            class="hidden"
            @change="handleImport"
            :disabled="importing"
          />
        </label>
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="card border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
      <h2 class="text-lg font-semibold text-red-900 dark:text-red-400 mb-4">Danger Zone</h2>
      
      <div v-if="!showDeleteConfirm">
        <p class="text-red-700 dark:text-red-400 text-sm mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button
          @click="showDeleteConfirm = true"
          class="btn bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white"
        >
          Delete Account
        </button>
      </div>

      <div v-else class="space-y-4">
        <p class="text-red-700 dark:text-red-400 text-sm font-medium">
          Are you absolutely sure? Enter your password to confirm.
        </p>

        <div v-if="deleteError" class="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {{ deleteError }}
        </div>

        <div>
          <label for="deletePassword" class="block text-sm font-medium text-red-700 dark:text-red-400 mb-1">
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
            class="btn bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800 text-white"
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
