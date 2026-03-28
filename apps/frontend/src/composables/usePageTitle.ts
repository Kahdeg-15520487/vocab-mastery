import { watch } from 'vue'
import { useRoute } from 'vue-router'

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/learn': 'Learn',
  '/review': 'Review',
  '/favorites': 'Favorite Words',
  '/quiz': 'Quiz',
  '/browse': 'Browse',
  '/lists': 'My Lists',
  '/stats': 'Statistics',
  '/achievements': 'Achievements',
  '/settings': 'Settings',
  '/admin': 'Admin Panel',
  '/login': 'Sign In',
  '/register': 'Create Account',
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
