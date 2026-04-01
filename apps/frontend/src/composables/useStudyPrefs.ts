import { ref } from 'vue'

const autoPlayAudio = ref(localStorage.getItem('studyAutoPlay') !== 'false')
const showLevel = ref(localStorage.getItem('studyShowLevel') !== 'false')
const showExamples = ref(localStorage.getItem('studyShowExamples') !== 'false')
const sessionSize = ref(Number(localStorage.getItem('studySessionSize')) || 10)

export function useStudyPrefs() {
  function setAutoPlay(v: boolean) {
    autoPlayAudio.value = v
    localStorage.setItem('studyAutoPlay', String(v))
  }

  function setShowLevel(v: boolean) {
    showLevel.value = v
    localStorage.setItem('studyShowLevel', String(v))
  }

  function setShowExamples(v: boolean) {
    showExamples.value = v
    localStorage.setItem('studyShowExamples', String(v))
  }

  function setSessionSize(n: number) {
    sessionSize.value = n
    localStorage.setItem('studySessionSize', String(n))
  }

  return {
    autoPlayAudio,
    showLevel,
    showExamples,
    sessionSize,
    setAutoPlay,
    setShowLevel,
    setShowExamples,
    setSessionSize,
  }
}
