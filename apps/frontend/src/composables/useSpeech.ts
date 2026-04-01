import { ref } from 'vue'

// Singleton audio element for reuse
let audioElement: HTMLAudioElement | null = null
let currentSrc = ''

export type SpeechSpeed = 'slow' | 'normal' | 'fast'

const speedRates: Record<SpeechSpeed, number> = { slow: 0.6, normal: 0.9, fast: 1.3 }
const savedSpeed = (typeof localStorage !== 'undefined' && localStorage.getItem('speechSpeed')) as SpeechSpeed | null
const speechSpeed = ref<SpeechSpeed>(savedSpeed || 'normal')

export function useSpeech() {
  const isSpeaking = ref(false)
  const isSupported = ref('speechSynthesis' in window)
  const isLoading = ref(false)

  /**
   * Play audio file from server if available, fallback to TTS
   * @param word - The word to pronounce
   * @param audioFile - Audio filename from DB (e.g. "abandon_us.mp3")
   * @param accent - "us" or "uk"
   */
  function playAudio(word: string, audioFile: string | null | undefined, accent: 'us' | 'uk' = 'us') {
    // If we have a real audio file, use it
    if (audioFile) {
      const src = `/audio/${accent}/${audioFile}`

      // Reuse audio element if same source
      if (!audioElement) {
        audioElement = new Audio()
        audioElement.addEventListener('ended', () => {
          isSpeaking.value = false
          isLoading.value = false
        })
        audioElement.addEventListener('error', () => {
          // Fallback to TTS on error
          isSpeaking.value = false
          isLoading.value = false
          speakTTS(word, accent === 'uk' ? 'en-GB' : 'en-US')
        })
        audioElement.addEventListener('canplaythrough', () => {
          isLoading.value = false
        })
      }

      // If same source, just replay
      if (currentSrc === src && audioElement.readyState >= 2) {
        audioElement.currentTime = 0
        audioElement.play().catch(() => {
          speakTTS(word, accent === 'uk' ? 'en-GB' : 'en-US')
        })
        isSpeaking.value = true
        return
      }

      // New source
      currentSrc = src
      audioElement.src = src
      isSpeaking.value = true
      isLoading.value = true
      audioElement.play().catch(() => {
        speakTTS(word, accent === 'uk' ? 'en-GB' : 'en-US')
      })
      return
    }

    // Fallback to TTS
    speakTTS(word, accent === 'uk' ? 'en-GB' : 'en-US')
  }

  function speakTTS(text: string, lang: string = 'en-US') {
    if (!isSupported.value) {
      console.warn('Speech synthesis not supported')
      return
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel()
    if (audioElement) {
      audioElement.pause()
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.rate = speedRates[speechSpeed.value]
    utterance.pitch = 1

    utterance.onstart = () => {
      isSpeaking.value = true
      isLoading.value = false
    }

    utterance.onend = () => {
      isSpeaking.value = false
    }

    utterance.onerror = () => {
      isSpeaking.value = false
    }

    window.speechSynthesis.speak(utterance)
  }

  /** Legacy speak function — TTS only */
  function speak(text: string, lang: string = 'en-US') {
    speakTTS(text, lang)
  }

  function stop() {
    if (audioElement) {
      audioElement.pause()
    }
    if (isSupported.value) {
      window.speechSynthesis.cancel()
    }
    isSpeaking.value = false
    isLoading.value = false
  }

  function setSpeed(speed: SpeechSpeed) {
    speechSpeed.value = speed
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('speechSpeed', speed)
    }
  }

  return {
    isSpeaking,
    isLoading,
    isSupported,
    speechSpeed,
    speak,
    playAudio,
    setSpeed,
    stop,
  }
}
