import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Global handler for auth expiration - ensures store is updated
window.addEventListener('auth:expired', () => {
  const authStore = useAuthStore()
  authStore.clearAuth()
})

app.mount('#app')
