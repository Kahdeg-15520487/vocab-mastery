import { ref } from 'vue'

export function useSpeech() {
  const isSpeaking = ref(false)
  const isSupported = ref('speechSynthesis' in window)

  function speak(text: string, lang: string = 'en-US') {
    if (!isSupported.value) {
      console.warn('Speech synthesis not supported')
      return
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = 0.9
    utterance.pitch = 1

    utterance.onstart = () => {
      isSpeaking.value = true
    }

    utterance.onend = () => {
      isSpeaking.value = false
    }

    utterance.onerror = () => {
      isSpeaking.value = false
    }

    window.speechSynthesis.speak(utterance)
  }

  function stop() {
    if (isSupported.value) {
      window.speechSynthesis.cancel()
      isSpeaking.value = false
    }
  }

  return {
    isSpeaking,
    isSupported,
    speak,
    stop,
  }
}
