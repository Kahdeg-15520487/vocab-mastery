import { watch, ref } from 'vue'
import { useRoute } from 'vue-router'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/learn': 'Learn',
  '/review': 'Review',
  '/history': 'Session History',
  '/favorites': 'Favorite Words',
  '/quiz': 'Quiz',
  '/browse': 'Browse',
  '/lists': 'My Lists',
  '/stats': 'Statistics',
  '/achievements': 'Achievements',
  '/spelling': 'Spelling Practice',
  '/fill-blank': 'Fill in the Blank',
  '/leaderboard': 'Leaderboard',
  '/words': 'Word Details',
  '/settings': 'Settings',
  '/admin': 'Admin Panel',
  '/login': 'Sign In',
  '/register': 'Create Account',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
}

// Global review due count — set from dashboard
const reviewDueCount = ref(0)

export function setReviewDueCount(count: number) {
  reviewDueCount.value = count
  updateTitle()
}

function updateTitle() {
  const path = window.location.pathname

  let title: string | undefined = titles[path]
  if (!title) {
    const match = Object.keys(titles).find(key => path.startsWith(key) && key !== '/')
    title = match ? titles[match] : undefined
  }

  const prefix = reviewDueCount.value > 0 ? `(${reviewDueCount.value}) ` : ''
  document.title = title
    ? `${prefix}${title} · Vocab Master`
    : `${prefix}Vocab Master`
}

export function usePageTitle() {
  const route = useRoute()

  watch(() => route.path, () => updateTitle(), { immediate: true })
  watch(reviewDueCount, () => updateTitle())
}

export default usePageTitle
