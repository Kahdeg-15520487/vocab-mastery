/**
 * Structured evaluation prompt templates for Browser AI Coach.
 *
 * Design principles for 0.8B model consistency:
 *  - Extremely short prompt — tiny model, tiny context
 *  - Single clear instruction + one example
 *  - JSON output for reliable parsing
 *  - Strip <think/> blocks from Qwen reasoning models
 */

export interface SentenceEvaluation {
  grammar: {
    score: 1 | 2 | 3 | 4 | 5
    note: string
  }
  usage: {
    score: 1 | 2 | 3 | 4 | 5
    note: string
  }
  clarity: {
    score: 1 | 2 | 3 | 4 | 5
    note: string
  }
  suggestion: string
}

/**
 * Strip Qwen <think/> blocks and any leading/trailing whitespace/noise.
 */
export function stripThinkBlocks(text: string): string {
  // Remove <think ...>...</think blocks (may span multiple lines)
  let cleaned = text.replace(/<think[\s\S]*?<\/think\s*>/gi, '')
  // Remove any leftover <think/> or <think .../>  self-closing tags
  cleaned = cleaned.replace(/<think[^>]*\/>/gi, '')
  // Trim
  cleaned = cleaned.trim()
  return cleaned
}

const SYSTEM_PROMPT = `Evaluate the sentence using the target word. Reply with ONLY a JSON object, nothing else.
{"grammar":{"score":1-5,"note":"brief"},"usage":{"score":1-5,"note":"brief"},"clarity":{"score":1-5,"note":"brief"},"suggestion":"brief tip or None"}
5=perfect, 1=very poor. Mark nonsensical/gibberish sentences as grammar=1, clarity=1.`

const EXAMPLE = `
Target: "mitigate" (verb) — to make less severe
Sentence: "We need mitigate the risks."
{"grammar":{"score":3,"note":"Missing 'to'."},"usage":{"score":4,"note":"Correct context."},"clarity":{"score":4,"note":"Understandable."},"suggestion":"Add 'to': We need to mitigate the risks."}`

/**
 * Build the evaluation prompt for a sentence.
 */
export function buildSentenceEvalPrompt(params: {
  word: string
  partOfSpeech?: string[]
  definition?: string
  sentence: string
}): string {
  const pos = params.partOfSpeech?.length ? ` (${params.partOfSpeech[0]})` : ''
  const def = params.definition ? ` — ${truncate(params.definition, 60)}` : ''

  return `${EXAMPLE}

Now evaluate:
Target: "${params.word}"${pos}${def}
Sentence: "${params.sentence}"`
}

/**
 * Build the messages array for chat-style generation.
 */
export function buildEvalMessages(params: {
  word: string
  partOfSpeech?: string[]
  definition?: string
  sentence: string
}): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildSentenceEvalPrompt(params) },
  ]
}

/**
 * Parse the model's raw output into a SentenceEvaluation.
 * Defensively handles malformed JSON from a small model.
 */
export function parseSentenceEvaluation(raw: string): SentenceEvaluation {
  const DEFAULT: SentenceEvaluation = {
    grammar: { score: 3, note: 'Could not evaluate.' },
    usage: { score: 3, note: 'Could not evaluate.' },
    clarity: { score: 3, note: 'Could not evaluate.' },
    suggestion: 'Could not generate suggestion.',
  }

  if (!raw) return DEFAULT

  try {
    // Strip Qwen thinking blocks
    const cleaned = stripThinkBlocks(raw)

    // Extract JSON from the response (model may add extra text)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return DEFAULT

    const parsed = JSON.parse(jsonMatch[0])

    return {
      grammar: {
        score: clampScore(parsed?.grammar?.score),
        note: String(parsed?.grammar?.note || DEFAULT.grammar.note).slice(0, 100),
      },
      usage: {
        score: clampScore(parsed?.usage?.score),
        note: String(parsed?.usage?.note || DEFAULT.usage.note).slice(0, 100),
      },
      clarity: {
        score: clampScore(parsed?.clarity?.score),
        note: String(parsed?.clarity?.note || DEFAULT.clarity.note).slice(0, 100),
      },
      suggestion: String(parsed?.suggestion || DEFAULT.suggestion).slice(0, 200),
    }
  } catch {
    return DEFAULT
  }
}

function clampScore(val: unknown): 1 | 2 | 3 | 4 | 5 {
  const n = Number(val)
  if (!Number.isFinite(n)) return 3
  return Math.max(1, Math.min(5, Math.round(n))) as 1 | 2 | 3 | 4 | 5
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}
