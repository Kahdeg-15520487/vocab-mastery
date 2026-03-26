import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { authService, isTokenExpired, getTimeUntilExpiry } from './lib/auth'
import { resetAuthExpired } from './lib/api'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Check token expiry when user returns to tab
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    const token = sessionStorage.getItem('accessToken')
    if (!token) return
    
    if (isTokenExpired(token)) {
      // Token already expired - logout
      console.log('Token expired while away, redirecting to login')
      sessionStorage.removeItem('accessToken')
      resetAuthExpired()
      window.location.replace('/login')
    } else {
      // Token still valid but check if it's about to expire (within 5 minutes)
      const timeUntilExpiry = getTimeUntilExpiry(token)
      if (timeUntilExpiry > 0 && timeUntilExpiry < 5 * 60 * 1000) {
        console.log('Token expiring soon, attempting refresh...')
        try {
          await authService.refresh()
          console.log('Token refreshed successfully')
        } catch (e) {
          console.log('Token refresh failed, redirecting to login')
          sessionStorage.removeItem('accessToken')
          resetAuthExpired()
          window.location.replace('/login')
        }
      }
    }
  }
})

app.mount('#app')
