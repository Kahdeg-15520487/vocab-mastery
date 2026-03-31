/**
 * Convert a difficulty preset to a CEFR level range for the API.
 * Returns undefined for 'mixed' (no filter).
 */
export function getLevelRange(diff: string): [string, string] | undefined {
  switch (diff) {
    case 'easy': return ['A1', 'A2']
    case 'medium': return ['B1', 'B2']
    case 'hard': return ['C1', 'C2']
    default: return undefined
  }
}
