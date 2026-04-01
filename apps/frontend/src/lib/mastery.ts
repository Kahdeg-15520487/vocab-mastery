/**
 * Compute a 5-tier mastery level from WordProgress fields
 */
export type MasteryTier = 'new' | 'learning' | 'familiar' | 'mastered' | 'expert'

const MASTERY_CONFIG: Record<MasteryTier, { label: string; color: string; bgColor: string; darkBgColor: string; icon: string }> = {
  new:      { label: 'New',      color: 'text-slate-500',      bgColor: 'bg-slate-100',      darkBgColor: 'dark:bg-slate-800',      icon: '⚫' },
  learning: { label: 'Learning', color: 'text-amber-600',      bgColor: 'bg-amber-100',      darkBgColor: 'dark:bg-amber-900/30',   icon: '📙' },
  familiar: { label: 'Familiar', color: 'text-blue-600',       bgColor: 'bg-blue-100',       darkBgColor: 'dark:bg-blue-900/30',    icon: '📘' },
  mastered: { label: 'Mastered', color: 'text-green-600',      bgColor: 'bg-green-100',      darkBgColor: 'dark:bg-green-900/30',   icon: '📗' },
  expert:   { label: 'Expert',   color: 'text-purple-600',     bgColor: 'bg-purple-100',     darkBgColor: 'dark:bg-purple-900/30',  icon: '💎' },
}

export function getMasteryConfig(tier: MasteryTier) {
  return MASTERY_CONFIG[tier]
}

export function computeMasteryTier(params: {
  status: string
  repetitions: number
  easeFactor: number
}): MasteryTier {
  const { status, repetitions, easeFactor } = params

  if (status === 'MASTERED') {
    return repetitions >= 8 ? 'expert' : 'mastered'
  }

  if (status === 'REVIEWING') {
    if (repetitions >= 5 && easeFactor >= 2.3) return 'mastered'
    if (repetitions >= 3 && easeFactor >= 2.0) return 'familiar'
    return 'learning'
  }

  if (status === 'LEARNING') return 'learning'

  return 'new'
}
