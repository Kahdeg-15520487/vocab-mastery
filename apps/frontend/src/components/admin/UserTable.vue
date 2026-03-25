<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import UserEditModal from './UserEditModal.vue'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

interface User {
  id: string
  email: string
  username: string
  role: 'LEARNER' | 'ADMIN'
  subscriptionTier: 'FREE' | 'EXPLORER' | 'WORDSMITH'
  subscriptionExpiresAt: string | null
  createdAt: string
  lastLoginAt: string | null
  hasGoogleAuth: boolean
  sessionCount: number
}

// Editable user type (subset for the modal)
type EditableUser = Pick<User, 'id' | 'email' | 'username' | 'role' | 'subscriptionTier' | 'subscriptionExpiresAt'>

const users = ref<User[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Pagination
const page = ref(1)
const limit = ref(20)
const total = ref(0)
const totalPages = computed(() => Math.ceil(total.value / limit.value))

// Filters
const search = ref('')
const roleFilter = ref('')
const tierFilter = ref('')

// Edit modal
const editingUser = ref<EditableUser | null>(null)
const showEditModal = ref(false)

async function fetchUsers() {
  loading.value = true
  error.value = null

  try {
    const token = sessionStorage.getItem('accessToken')
    const params = new URLSearchParams()
    params.append('page', String(page.value))
    params.append('limit', String(limit.value))
    if (search.value) params.append('search', search.value)
    if (roleFilter.value) params.append('role', roleFilter.value)
    if (tierFilter.value) params.append('tier', tierFilter.value)

    const response = await fetch(`${API_BASE}/admin/users?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })

    if (!response.ok) throw new Error('Failed to fetch users')
    const data = await response.json()
    users.value = data.users
    total.value = data.pagination.total
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchUsers()
}

function openEditModal(user: User) {
  editingUser.value = { ...user }
  showEditModal.value = true
}

function closeEditModal() {
  showEditModal.value = false
  editingUser.value = null
}

async function handleUserUpdate(updatedUser: any) {
  // Update the user in the list
  const index = users.value.findIndex(u => u.id === updatedUser.id)
  if (index !== -1) {
    // Merge the updated fields with existing user data
    users.value[index] = { ...users.value[index], ...updatedUser }
  }
  closeEditModal()
}

async function deleteUser(user: User) {
  if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return

  try {
    const token = sessionStorage.getItem('accessToken')
    const response = await fetch(`${API_BASE}/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      credentials: 'include',
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to delete user')
    }

    // Remove from list
    users.value = users.value.filter(u => u.id !== user.id)
    total.value--
  } catch (e: any) {
    alert(e.message)
  }
}

function formatDate(date: string | null) {
  if (!date) return 'Never'
  return new Date(date).toLocaleDateString()
}

function getTierBadgeClass(tier: string) {
  switch (tier) {
    case 'EXPLORER': return 'bg-blue-100 text-blue-800'
    case 'WORDSMITH': return 'bg-purple-100 text-purple-800'
    default: return 'bg-slate-100 text-slate-800'
  }
}

function getRoleBadgeClass(role: string) {
  return role === 'ADMIN' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'
}

onMounted(fetchUsers)
</script>

<template>
  <div>
    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <div class="flex flex-wrap gap-4 items-end">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm font-medium text-slate-700 mb-1">Search</label>
          <input
            v-model="search"
            @keyup.enter="handleSearch"
            type="text"
            placeholder="Email or username..."
            class="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Role</label>
          <select
            v-model="roleFilter"
            @change="handleSearch"
            class="px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All</option>
            <option value="LEARNER">Learner</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Tier</label>
          <select
            v-model="tierFilter"
            @change="handleSearch"
            class="px-3 py-2 border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All</option>
            <option value="FREE">Free</option>
            <option value="EXPLORER">Explorer</option>
            <option value="WORDSMITH">Wordsmith</option>
          </select>
        </div>

        <button
          @click="handleSearch"
          class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          Search
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-8">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
      <p class="mt-2 text-slate-600">Loading users...</p>
    </div>

    <!-- Users Table -->
    <div v-else class="bg-white rounded-lg shadow overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                User
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Role
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Tier
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Created
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Last Login
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-slate-200">
            <tr v-for="user in users" :key="user.id" class="hover:bg-slate-50">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                  <div>
                    <div class="text-sm font-medium text-slate-900">
                      {{ user.username }}
                      <span v-if="user.hasGoogleAuth" class="ml-1 text-xs" title="Google Auth">🔗</span>
                    </div>
                    <div class="text-sm text-slate-500">{{ user.email }}</div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="['px-2 py-1 text-xs font-medium rounded-full', getRoleBadgeClass(user.role)]">
                  {{ user.role }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span :class="['px-2 py-1 text-xs font-medium rounded-full', getTierBadgeClass(user.subscriptionTier)]">
                  {{ user.subscriptionTier }}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                {{ formatDate(user.createdAt) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                {{ formatDate(user.lastLoginAt) }}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  @click="openEditModal(user)"
                  class="text-indigo-600 hover:text-indigo-900 mr-3"
                >
                  Edit
                </button>
                <button
                  @click="deleteUser(user)"
                  class="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="bg-white px-4 py-3 flex items-center justify-between border-t border-slate-200 sm:px-6">
        <div class="text-sm text-slate-700">
          Showing {{ users.length }} of {{ total }} users
        </div>
        <div class="flex gap-2">
          <button
            @click="page--; fetchUsers()"
            :disabled="page <= 1"
            class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span class="px-3 py-1">
            Page {{ page }} of {{ totalPages }}
          </span>
          <button
            @click="page++; fetchUsers()"
            :disabled="page >= totalPages"
            class="px-3 py-1 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <UserEditModal
      v-if="showEditModal && editingUser"
      :user="editingUser"
      @close="closeEditModal"
      @update="handleUserUpdate"
    />
  </div>
</template>
