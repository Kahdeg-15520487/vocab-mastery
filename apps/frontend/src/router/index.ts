import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/RegisterView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/views/ForgotPasswordView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/views/ResetPasswordView.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/auth/callback',
    name: 'oauth-callback',
    component: () => import('@/views/OAuthCallback.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/learn',
    name: 'learn',
    component: () => import('@/views/LearnView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/learn/:theme',
    name: 'learn-theme',
    component: () => import('@/views/LearnView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/review',
    name: 'review',
    component: () => import('@/views/ReviewView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: () => import('@/views/FavoritesView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/quiz',
    name: 'quiz',
    component: () => import('@/views/QuizView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/spelling',
    name: 'spelling',
    component: () => import('@/views/SpellingView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/fill-blank',
    name: 'fill-blank',
    component: () => import('@/views/FillBlankView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/browse',
    name: 'browse',
    component: () => import('@/views/BrowseView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/words/:id',
    name: 'word-detail',
    component: () => import('@/views/WordDetailView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('@/views/StatsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/achievements',
    name: 'achievements',
    component: () => import('@/views/AchievementsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/leaderboard',
    name: 'leaderboard',
    component: () => import('@/views/LeaderboardView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/sprints',
    name: 'sprints',
    component: () => import('@/views/SprintsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/lists',
    name: 'lists',
    component: () => import('@/views/ListsView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/lists/:id',
    name: 'list-detail',
    component: () => import('@/views/ListView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

// Track if user has been fetched
let userFetched = false

// Reset fetch state when auth changes (called from auth store)
export function resetUserFetched() {
  userFetched = false
}

// Navigation guard for protected routes
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const requiresAuth = to.meta.requiresAuth !== false
  const requiresAdmin = to.meta.requiresAdmin === true

  // Sync token state from sessionStorage on every navigation
  authStore.syncTokenState()

  // Fetch user data if not already fetched and token exists
  if (!userFetched && authStore.isAuthenticated) {
    const success = await authStore.fetchUser()
    userFetched = true
    
    // If fetchUser failed, clear token state and redirect to login
    if (!success || !authStore.user) {
      authStore.syncTokenState()
      if (requiresAuth) {
        next('/login')
        return
      }
    }
  }

  if (requiresAuth && !authStore.isAuthenticated) {
    // Redirect to login if not authenticated
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register') && authStore.isAuthenticated) {
    // Redirect to home if already authenticated
    next('/')
  } else if (requiresAdmin && !authStore.isAdmin) {
    // Redirect to home if not admin
    next('/')
  } else {
    next()
  }
})

export default router
