import { ref } from 'vue'

const STORAGE_KEY = 'vocab-master-notifications'
const CHECK_INTERVAL = 60 * 60 * 1000 // Check every hour

const permission = ref<NotificationPermission>('default')
const reminderTime = ref('09:00') // Default 9 AM

export function useNotifications() {
  let timer: ReturnType<typeof setInterval> | null = null

  // Load saved preferences
  function loadPreferences() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const prefs = JSON.parse(saved)
        reminderTime.value = prefs.reminderTime || '09:00'
      }
    } catch {
      // ignore
    }
  }

  function savePreferences() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      reminderTime: reminderTime.value,
    }))
  }

  // Check if notifications are supported
  const supported = typeof Notification !== 'undefined'

  // Request permission
  async function requestPermission(): Promise<boolean> {
    if (!supported) return false
    
    const result = await Notification.requestPermission()
    permission.value = result
    return result === 'granted'
  }

  // Send a notification
  function send(title: string, options?: NotificationOptions) {
    if (!supported || permission.value !== 'granted') return
    
    try {
      new Notification(title, {
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        ...options,
      })
    } catch {
      // Notification failed silently
    }
  }

  // Send daily reminder notification
  function sendDailyReminder(wordsDue: number) {
    if (wordsDue > 0) {
      send('📚 Vocab Master — Time to Review!', {
        body: `You have ${wordsDue} word${wordsDue !== 1 ? 's' : ''} waiting for review. Keep your streak alive!`,
        tag: 'daily-reminder',
      })
    } else {
      send('📚 Vocab Master — Daily Practice', {
        body: 'Start your daily vocabulary practice to maintain your streak!',
        tag: 'daily-reminder',
      })
    }
  }

  // Check if it's time for the daily reminder
  function checkReminder(wordsDue: number) {
    if (permission.value !== 'granted') return

    const now = new Date()
    const [hours, minutes] = reminderTime.value.split(':').map(Number)
    
    // Check if current time is within 5 minutes of reminder time
    if (now.getHours() === hours && Math.abs(now.getMinutes() - minutes) <= 5) {
      // Only send once per day
      const lastSent = localStorage.getItem('vocab-master-last-notification')
      const today = now.toDateString()
      if (lastSent !== today) {
        sendDailyReminder(wordsDue)
        localStorage.setItem('vocab-master-last-notification', today)
      }
    }
  }

  // Start periodic check
  function startReminderCheck(getWordsDue: () => number) {
    if (timer) clearInterval(timer)
    
    // Update permission state
    if (supported) {
      permission.value = Notification.permission
    }

    timer = setInterval(() => {
      checkReminder(getWordsDue())
    }, CHECK_INTERVAL)

    // Also check immediately
    checkReminder(getWordsDue())
  }

  function stopReminderCheck() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function setReminderTime(time: string) {
    reminderTime.value = time
    savePreferences()
  }

  loadPreferences()

  // Update permission on mount
  if (supported) {
    permission.value = Notification.permission
  }

  return {
    supported,
    permission,
    reminderTime,
    requestPermission,
    send,
    sendDailyReminder,
    startReminderCheck,
    stopReminderCheck,
    setReminderTime,
  }
}
