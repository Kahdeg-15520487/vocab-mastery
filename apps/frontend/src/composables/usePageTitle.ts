import { watch } from 'vue'
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
  '/leaderboard': 'Leaderboard',
  '/words': 'Word Details',
  '/settings': 'Settings',
  '/admin': 'Admin Panel',
  '/login': 'Sign In',
  '/register': 'Create Account',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
}

export function usePageTitle() {
  const route = useRoute()

  watch(() => route.path, (path) => {
    let title: string | undefined = titles[path]
    if (!title) {
      const match = Object.keys(titles).find(key => path.startsWith(key) && key !== '/')
      title = match ? titles[match] : undefined
    }
    
    document.title = title 
      ? `${title} · Vocab Master`
      : 'Vocab Master'
  }, { immediate: true })
}

export default usePageTitle
