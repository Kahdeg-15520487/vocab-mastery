/**
 * Client-side sentence quality check for writing exercises.
 *
 * Layers:
 *  1. Profanity filter
 *  2. Minimum sentence length
 *  3. Grammar word requirement (articles, pronouns, auxiliaries)
 *  4. Per-word gibberish detection (structural heuristics)
 *  5. Overall real-word ratio
 */

// ─── Profanity blocklist ──────────────────────────────────────────
const PROFANITY = new Set([
  'fuck', 'shit', 'damn', 'ass', 'bitch', 'crap', 'dick', 'piss',
  'hell', 'bastard', 'douche', 'slut', 'whore', 'cock', 'pussy',
  'dickhead', 'motherfucker', 'bullshit', 'horseshit', 'dipshit',
])

// ─── Grammar / connector words ────────────────────────────────────
// A real English sentence should contain at least one of these.
const GRAMMAR_WORDS = new Set([
  // Articles
  'the', 'a', 'an',
  // Pronouns
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'theirs',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  // Prepositions
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'about', 'up', 'down',
  // Conjunctions
  'and', 'or', 'but', 'so', 'yet', 'nor', 'if', 'when', 'while',
  'because', 'although', 'though', 'unless', 'since', 'until',
  // Auxiliary / modal verbs
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'can', 'may', 'might',
  'shall', 'must',
  // Common adverbs
  'not', 'no', 'never', 'always', 'often', 'very', 'really',
  'just', 'also', 'too', 'here', 'there', 'now', 'then', 'still',
  'even', 'only', 'already', 'again', 'ever',
  // Common verbs (top 100)
  'say', 'go', 'get', 'make', 'know', 'think', 'take', 'see',
  'come', 'want', 'look', 'use', 'find', 'give', 'tell', 'work',
  'call', 'try', 'ask', 'need', 'feel', 'become', 'leave', 'put',
  'mean', 'keep', 'let', 'begin', 'seem', 'help', 'show', 'hear',
  'play', 'run', 'move', 'live', 'believe', 'bring', 'happen',
  'write', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet',
  'include', 'continue', 'set', 'learn', 'change', 'lead',
  'understand', 'watch', 'follow', 'stop', 'create', 'speak',
  'read', 'allow', 'add', 'spend', 'grow', 'open', 'walk',
  'win', 'offer', 'remember', 'love', 'consider', 'appear',
  'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build',
  'stay', 'fall', 'cut', 'reach', 'kill', 'remain', 'raise',
  'pass', 'sell', 'report', 'decide', 'pull', 'eat', 'drink',
  'said', 'went', 'got', 'made', 'knew', 'thought', 'took', 'saw',
  'came', 'wanted', 'found', 'gave', 'told', 'worked', 'left',
  'kept', 'began', 'showed', 'heard', 'played', 'ran', 'lived',
  'wrote', 'sat', 'stood', 'lost', 'paid', 'met', 'set',
  'learned', 'changed', 'built', 'stayed', 'fell', 'sent',
  'ate', 'drank', 'spoke', 'read', 'won', 'sold', 'spent',
  // Common nouns
  'thing', 'things', 'time', 'year', 'people', 'way', 'day', 'man',
  'woman', 'child', 'world', 'life', 'hand', 'part', 'place', 'case',
  'week', 'number', 'night', 'point', 'home', 'water', 'room',
  'money', 'story', 'fact', 'month', 'lot', 'right', 'book',
  'eye', 'job', 'word', 'house', 'friend', 'father', 'mother',
  'power', 'hour', 'game', 'line', 'end', 'name', 'school',
  'family', 'country', 'head', 'side', 'kind', 'work', 'problem',
  'fact', 'state', 'group', 'company', 'door', 'street',
  // Common adjectives
  'good', 'bad', 'big', 'small', 'new', 'old', 'first', 'last',
  'long', 'great', 'little', 'different', 'large', 'next', 'early',
  'young', 'important', 'few', 'public', 'same', 'able', 'sure',
  'true', 'free', 'full', 'nice', 'best', 'better', 'happy',
  'hard', 'easy', 'simple', 'possible', 'real', 'whole', 'clear',
  'close', 'open', 'every', 'each', 'all', 'both', 'more', 'most',
  'much', 'many', 'other', 'some', 'such', 'own', 'any',
  // Contractions
  "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't",
  "shouldn't", "can't", "isn't", "aren't", "wasn't", "weren't",
  "haven't", "hasn't", "hadn't", "i'm", "you're", "he's", "she's",
  "it's", "we're", "they're", "i've", "you've", "we've", "they've",
  "i'll", "you'll", "he'll", "she'll", "we'll", "they'll",
  "i'd", "you'd", "he'd", "she'd", "we'd", "they'd",
])

// Merge grammar words into a single lookup for "is this a known word?"
const KNOWN_WORDS = new Set([...GRAMMAR_WORDS])

// Keyboard mashing patterns
const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'asdf', 'jkl;']

/**
 * Check if a single word looks like gibberish.
 */
function isGibberishWord(word: string, targetWord: string): boolean {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return false

  // Target word is always valid
  if (w === targetWord.toLowerCase()) return false

  // Single chars are ok (a, I)
  if (w.length <= 1) return false

  // Known English words are ok
  if (KNOWN_WORDS.has(w)) return false

  // Profanity is its own check, not gibberish
  if (PROFANITY.has(w)) return false

  // Check for keyboard mashing: 3+ consecutive chars from same keyboard row
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i <= w.length - 3; i++) {
      const tri = w.slice(i, i + 3)
      if (row.includes(tri)) return true
    }
  }

  // Check vowel ratio: real English words have vowels
  const vowels = (w.match(/[aeiouy]/g) || []).length
  const vowelRatio = vowels / w.length

  if (w.length >= 4 && vowelRatio < 0.15) return true

  // Check for 4+ consecutive consonants
  const consonantRuns = w.match(/[^aeiouy]{4,}/g)
  if (consonantRuns) return true

  // Check for repeated characters (like "aaa", "fff")
  if (/(.)\1{2,}/.test(w)) return true

  return false
}

export interface SentenceQuality {
  rejected: boolean
  reason: string
  gibberishWords: string[]
  hasProfanity: boolean
  tooShort: boolean
  missingGrammar: boolean
  realWordCount: number
  totalWordCount: number
}

/**
 * Analyze a sentence for quality before submission.
 * Returns a result with `rejected: true` if the sentence should be blocked.
 */
export function analyzeSentenceQuality(
  sentence: string,
  targetWord: string,
): SentenceQuality {
  const raw = sentence.trim()
  const words = raw.split(/\s+/).filter(Boolean)
  const clean = words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(Boolean)
  const target = targetWord.toLowerCase()

  const result: SentenceQuality = {
    rejected: false,
    reason: '',
    gibberishWords: [],
    hasProfanity: false,
    tooShort: false,
    missingGrammar: false,
    realWordCount: 0,
    totalWordCount: clean.length,
  }

  // ── Check 1: Minimum length ──
  if (clean.length < 4) {
    result.tooShort = true
    result.rejected = true
    result.reason = 'Write at least 4 words to form a complete sentence.'
    return result
  }

  // ── Check 2: Profanity ──
  for (const w of clean) {
    if (PROFANITY.has(w)) {
      result.hasProfanity = true
      result.rejected = true
      result.reason = 'Please use appropriate language in your sentences.'
      return result
    }
  }

  // ── Check 3: Grammar words (articles, pronouns, auxiliaries) ──
  const hasGrammarWord = clean.some(w =>
    GRAMMAR_WORDS.has(w) || w === target
  )
  if (!hasGrammarWord) {
    result.missingGrammar = true
    result.rejected = true
    result.reason = 'Write a proper sentence with articles (the, a), pronouns (I, you), or verbs (is, was, have).'
    return result
  }

  // ── Check 4: Per-word gibberish detection ──
  const gibberishWords: string[] = []
  let realWordCount = 0

  for (let i = 0; i < clean.length; i++) {
    const w = clean[i]
    if (w === target || KNOWN_WORDS.has(w)) {
      realWordCount++
    } else if (isGibberishWord(w, target)) {
      gibberishWords.push(words[i])
    } else {
      realWordCount++ // benefit of the doubt
    }
  }

  result.gibberishWords = gibberishWords
  result.realWordCount = realWordCount

  // Block if ANY gibberish words found
  if (gibberishWords.length > 0) {
    result.rejected = true
    result.reason = gibberishWords.length === 1
      ? `"${gibberishWords[0]}" doesn't look like a real word. Write a proper sentence.`
      : `These words don't look real: "${gibberishWords.slice(0, 3).join('", "')}". Write a proper sentence.`
    return result
  }

  return result
}
