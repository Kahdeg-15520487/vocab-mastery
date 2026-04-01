/**
 * Structured evaluation prompt templates for Browser AI Coach.
 *
 * Design principles for 0.8B model consistency:
 *  - Extremely constrained output format
 *  - Few-shot examples establish the pattern
 *  - JSON output for reliable parsing
 *  - Short instructions (model has limited context reasoning)
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

const SYSTEM_PROMPT = `You are an English writing evaluator. You ALWAYS respond with exactly one JSON object. No other text. No markdown. No explanation.
Format: {"grammar":{"score":N,"note":"brief"},"usage":{"score":N,"note":"brief"},"clarity":{"score":N,"note":"brief"},"suggestion":"brief"}
Scores are 1-5. Notes must be under 15 words. Suggestion must be under 20 words.`

const FEW_SHOT_EXAMPLES = `
Example 1:
Target: "sustainable" (adjective) — capable of being maintained over time
Sentence: "The company adopted sustainable practices to reduce waste."
{"grammar":{"score":5,"note":"Grammatically correct."},"usage":{"score":5,"note":"Natural and appropriate use."},"clarity":{"score":5,"note":"Clear and easy to understand."},"suggestion":"Could add 'environmentally' before sustainable for emphasis."}

Example 2:
Target: "mitigate" (verb) — to make less severe
Sentence: "We need mitigate the risks before launching."
{"grammar":{"score":3,"note":"Missing 'to' before mitigate."},"usage":{"score":4,"note":"Correct meaning and context."},"clarity":{"score":4,"note":"Understandable but grammatically incomplete."},"suggestion":"Add 'to': 'We need to mitigate the risks.'"}

Example 3:
Target: "abundant" (adjective) — existing in large quantities
Sentence: "The garden has abundant flowers in spring."
{"grammar":{"score":5,"note":"No errors."},"usage":{"score":5,"note":"Perfect collocation."},"clarity":{"score":5,"note":"Very clear."},"suggestion":"No improvement needed."}

Example 4:
Target: "elaborate" (verb) — to explain in detail
Sentence: "She elaborate on her theory during the meeting."
{"grammar":{"score":2,"note":"Wrong verb form, needs past tense."},"usage":{"score":4,"note":"Correct context."},"clarity":{"score":4,"note":"Meaning is clear."},"suggestion":"Use 'elaborated': 'She elaborated on her theory.'"}`

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
  const def = params.definition ? ` — ${truncate(params.definition, 80)}` : ''

  return `${SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLES}

Now evaluate:
Target: "${params.word}"${pos}${def}
Sentence: "${params.sentence}"`
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

  try {
    // Extract JSON from the response (model may add extra text)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
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
