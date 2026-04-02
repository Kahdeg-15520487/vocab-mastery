import { ref } from 'vue'

const STORAGE_KEY = 'vocab-master-onboarding-complete'

const showOnboarding = ref(false)

export function useOnboarding() {
  function checkShouldShow() {
    const completed = localStorage.getItem(STORAGE_KEY)
    showOnboarding.value = !completed
    return showOnboarding.value
  }

  function markComplete() {
    localStorage.setItem(STORAGE_KEY, Date.now().toString())
    showOnboarding.value = false
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    showOnboarding,
    checkShouldShow,
    markComplete,
    reset,
  }
}
