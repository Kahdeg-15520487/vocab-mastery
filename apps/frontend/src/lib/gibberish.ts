/**
 * Client-side gibberish detection for writing exercises.
 *
 * Uses simple heuristics to quickly reject obvious nonsense:
 * - Too few words
 * - Too many non-English-looking words (consonant clusters, no vowels, etc.)
 * - Repetitive patterns
 * - Keyboard mashing patterns (asdf, jkl;, etc.)
 */

// Common English words for quick lookup
const COMMON_WORDS = new Set([
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his',
  'she', 'her', 'it', 'its', 'they', 'them', 'their', 'the', 'a', 'an',
  'and', 'or', 'but', 'not', 'no', 'yes', 'is', 'am', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'can', 'may', 'might', 'shall', 'must',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
  'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom', 'when',
  'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'any', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'because', 'if', 'while', 'about', 'up',
  'there', 'here', 'also', 'now', 'still', 'even', 'much', 'many',
  'never', 'always', 'often', 'sometimes', 'already', 'yet', 'just',
  'like', 'get', 'got', 'make', 'made', 'go', 'went', 'come', 'came',
  'take', 'took', 'see', 'saw', 'know', 'knew', 'think', 'thought',
  'say', 'said', 'tell', 'told', 'give', 'gave', 'use', 'used', 'find',
  'found', 'want', 'need', 'try', 'tried', 'ask', 'asked', 'seem',
  'feel', 'felt', 'leave', 'left', 'call', 'called', 'keep', 'kept',
  'let', 'begin', 'began', 'show', 'showed', 'hear', 'heard', 'play',
  'run', 'move', 'live', 'believe', 'bring', 'brought', 'happen',
  'write', 'written', 'sit', 'sat', 'stand', 'stood', 'lose', 'lost',
  'pay', 'meet', 'met', 'include', 'continue', 'set', 'learn',
  'change', 'lead', 'understand', 'watch', 'follow', 'stop', 'create',
  'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk',
  'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy',
  'wait', 'serve', 'die', 'send', 'sent', 'expect', 'build', 'stay',
  'fall', 'cut', 'reach', 'kill', 'remain', 'suggest', 'raise', 'pass',
  'sell', 'require', 'report', 'decide', 'pull', 'develop', 'eat', 'ate',
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it',
  'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'thing', 'things', 'time', 'year', 'people', 'way', 'day', 'man',
  'woman', 'child', 'world', 'life', 'hand', 'part', 'place', 'case',
  'week', 'company', 'system', 'program', 'question', 'work', 'government',
  'number', 'night', 'point', 'home', 'water', 'room', 'mother', 'area',
  'money', 'story', 'fact', 'month', 'lot', 'right', 'study', 'book',
  'eye', 'job', 'word', 'business', 'issue', 'side', 'kind', 'head',
  'house', 'service', 'friend', 'father', 'power', 'hour', 'game',
  'line', 'end', 'member', 'law', 'car', 'city', 'community', 'name',
  'ever', 'never', 'really', 'something', 'anything', 'nothing',
  'everything', 'someone', 'anyone', 'everyone', 'good', 'bad', 'big',
  'small', 'new', 'old', 'first', 'last', 'long', 'great', 'little',
  'own', 'other', 'old', 'right', 'big', 'high', 'different', 'small',
  'large', 'next', 'early', 'young', 'important', 'few', 'public',
  'bad', 'same', 'able', 'sure', 'true', 'false', 'free', 'full',
  'nice', 'best', 'better', 'happy', 'sad', 'hard', 'easy', 'simple',
  'possible', 'real', 'whole', 'clear', 'close', 'open', 'true',
  'able', 'going', 'looking', 'working', 'getting', 'making',
  'talking', 'trying', 'coming', 'taking', 'something', 'nothing',
])

// Common English consonant clusters that are NOT gibberish
const VALID_CLUSTERS = new Set([
  'th', 'ch', 'sh', 'ph', 'wh', 'ck', 'gh', 'gn', 'kn', 'wr', 'ng',
  'st', 'sp', 'sm', 'sn', 'sl', 'sw', 'sk', 'sc', 'squ',
  'tr', 'dr', 'pr', 'br', 'cr', 'gr', 'fr', 'fl', 'cl', 'pl', 'bl', 'gl',
  'str', 'spr', 'spl', 'scr',
  'nd', 'nt', 'nk', 'ng', 'mp', 'mb', 'lt', 'ld', 'lf', 'lv', 'lk',
  'pt', 'ct', 'ft', 'gh', 'ght', 'nth',
  'tion', 'sion', 'cian', 'tch', 'atch',
])

// Keyboard mashing patterns
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'asdf', 'jkl;']

/**
 * Check if a single word looks like gibberish.
 * Returns true if the word is likely nonsense.
 */
function isGibberishWord(word: string, targetWord: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return false

  // Target word is always valid
  if (w === targetWord.toLowerCase()) return false

  // Single chars are ok (a, I)
  if (w.length <= 1) return false

  // Common words are always ok
  if (COMMON_WORDS.has(w)) return false

  // Check for keyboard mashing: 3+ consecutive chars from same keyboard row
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i <= w.length - 3; i++) {
      const tri = w.slice(i, i + 3)
      if (row.includes(tri)) {
        // Check it's not a real subsequence like "str", "per", "ing"
        if (!VALID_CLUSTERS.has(tri)) return true
      }
    }
  }

  // Check vowel ratio: real English words have vowels
  const vowels = (w.match(/[aeiouy]/g) || []).length
  const vowelRatio = vowels / w.length

  // Words with very few vowels are suspicious
  if (w.length >= 4 && vowelRatio < 0.15) return true

  // Check for 4+ consecutive consonants (excluding valid clusters)
  const consonantRuns = w.match(/[^aeiouy]{4,}/g)
  if (consonantRuns) {
    for (const run of consonantRuns) {
      let isKnownCluster = false
      for (const cluster of VALID_CLUSTERS) {
        if (run.includes(cluster)) { isKnownCluster = true; break }
      }
      if (!isKnownCluster) return true
    }
  }

  // Check for repeated characters (like "aaa", "fff")
  if (/(.)\1{2,}/.test(w)) return true

  return false
}

export interface SentenceQuality {
  isGibberish: boolean
  reason: string
  gibberishWords: string[]
  realWordCount: number
  totalWordCount: number
  realWordRatio: number
}

/**
 * Analyze a sentence for gibberish content.
 */
export function analyzeSentenceQuality(
  sentence: string,
  targetWord: string
): SentenceQuality {
  const words = sentence.trim().split(/\s+/).filter(Boolean)
  const cleanWords = words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean)

  if (cleanWords.length < 3) {
    return {
      isGibberish: true,
      reason: 'Sentence is too short. Write at least 3 words.',
      gibberishWords: [],
      realWordCount: cleanWords.length,
      totalWordCount: cleanWords.length,
      realWordRatio: 0,
    }
  }

  const gibberishWords: string[] = []
  let realWordCount = 0

  for (let i = 0; i < cleanWords.length; i++) {
    const w = cleanWords[i]
    if (COMMON_WORDS.has(w) || w === targetWord.toLowerCase()) {
      realWordCount++
    } else if (isGibberishWord(w, targetWord)) {
      gibberishWords.push(words[i])
    } else {
      realWordCount++ // Give benefit of the doubt
    }
  }

  const realWordRatio = cleanWords.length > 0 ? realWordCount / cleanWords.length : 0

  // If more than 40% of words are gibberish, reject
  const gibberishRatio = gibberishWords.length / cleanWords.length
  const isGibberish = gibberishRatio > 0.4

  let reason = ''
  if (isGibberish) {
    if (gibberishRatio > 0.8) {
      reason = 'This doesn\'t look like a real sentence. Please write a meaningful sentence using the word.'
    } else {
      reason = `These words don't look real: "${gibberishWords.slice(0, 3).join('", "')}". Please write a proper sentence.`
    }
  }

  return {
    isGibberish,
    reason,
    gibberishWords,
    realWordCount,
    totalWordCount: cleanWords.length,
    realWordRatio,
  }
}
