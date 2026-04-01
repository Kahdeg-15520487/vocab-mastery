import { ref, onMounted, onUnmounted } from 'vue'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSAL_KEY = 'pwa-install-dismissed'

export function usePWAInstall() {
  const canInstall = ref(false)
  const dismissed = ref(false)
  let deferredPrompt: BeforeInstallPromptEvent | null = null

  onMounted(() => {
    // Check if already dismissed
    const dismissedAt = localStorage.getItem(DISMISSAL_KEY)
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) {
        dismissed.value = true
        return
      }
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      canInstall.value = true
    }

    window.addEventListener('beforeinstallprompt', handler)

    onUnmounted(() => {
      window.removeEventListener('beforeinstallprompt', handler)
    })
  })

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      canInstall.value = false
    }
    deferredPrompt = null
  }

  function dismiss() {
    dismissed.value = true
    canInstall.value = false
    localStorage.setItem(DISMISSAL_KEY, Date.now().toString())
  }

  return { canInstall, dismissed, install, dismiss }
}
