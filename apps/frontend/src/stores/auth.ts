import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authService, type User } from '@/lib/auth';
import { AUTH_EXPIRED_EVENT } from '@/lib/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Force reactivity by tracking a version number that increments on auth changes
  const authVersion = ref(0);

  const isAuthenticated = computed(() => {
    // Touch authVersion to make this reactive
    void authVersion.value;
    return !!user.value || authService.isAuthenticated();
  });
  
  const isAdmin = computed(() => {
    void authVersion.value;
    return user.value?.role === 'ADMIN';
  });

  // Handle auth expired event from API layer
  function handleAuthExpired() {
    user.value = null;
    authVersion.value++;
  }

  // Listen for auth expired events
  if (typeof window !== 'undefined') {
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await authService.login(email, password);
      user.value = response.user;
      return true;
    } catch (e: any) {
      error.value = e.message || 'Login failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function register(email: string, password: string, username: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await authService.register(email, password, username);
      user.value = response.user;
      return true;
    } catch (e: any) {
      error.value = e.message || 'Registration failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function logout(): Promise<void> {
    loading.value = true;
    
    try {
      await authService.logout();
      user.value = null;
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchUser(): Promise<void> {
    if (!authService.isAuthenticated()) {
      user.value = null;
      return;
    }

    loading.value = true;
    
    try {
      const response = await authService.getMe();
      user.value = response.user;
    } catch (e) {
      // Token might be expired or invalid
      user.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    
    try {
      await authService.changePassword(currentPassword, newPassword);
      // Password change requires re-login
      user.value = null;
      return true;
    } catch (e: any) {
      error.value = e.message || 'Password change failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function deleteAccount(password: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    
    try {
      await authService.deleteAccount(password);
      user.value = null;
      return true;
    } catch (e: any) {
      error.value = e.message || 'Account deletion failed';
      return false;
    } finally {
      loading.value = false;
    }
  }

  function clearError() {
    error.value = null;
  }

  // Called when auth fails (token expired, refresh failed)
  function clearAuth() {
    user.value = null;
    authVersion.value++;
    authService.clearTokens();
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    login,
    register,
    logout,
    fetchUser,
    changePassword,
    deleteAccount,
    clearError,
    clearAuth,
  };
});
