import prisma from '../lib/prisma.js'

/**
 * Get the current active sprint for a user, or the most recent one
 */
export async function getCurrentSprint(userId: string) {
  const active = await prisma.sprint.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      words: { include: { word: true } },
      _count: { select: { words: true, writings: true } },
    },
  })
  if (active) return active

  // Return the latest sprint if no active one
  return prisma.sprint.findFirst({
    where: { userId },
    orderBy: { number: 'desc' },
    include: {
      words: { include: { word: true } },
      _count: { select: { words: true, writings: true } },
    },
  })
}

/**
 * Get or create the next sprint for a user.
 * Assigns words based on frequency (highest first), excluding words already in other sprints.
 */
export async function createNextSprint(
  userId: string,
  options?: {
    wordTarget?: number
    durationDays?: number
    isReviewSprint?: boolean
    cefrLevel?: string
    themeId?: string
  }
) {
  const wordTarget = options?.wordTarget ?? 265
  const durationDays = options?.durationDays ?? 14

  // Get the latest sprint number
  const latestSprint = await prisma.sprint.findFirst({
    where: { userId },
    orderBy: { number: 'desc' },
    select: { number: true, endDate: true },
  })

  const number = (latestSprint?.number ?? 0) + 1
  const startDate = latestSprint?.endDate
    ? new Date(Math.max(latestSprint.endDate.getTime(), Date.now()))
    : new Date()
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + durationDays)

  // Get word IDs already assigned to any sprint for this user
  const existingSprintWords = await prisma.sprintWord.findMany({
    where: { sprint: { userId } },
    select: { wordId: true },
  })
  const usedWordIds = new Set(existingSprintWords.map((sw) => sw.wordId))

  // Build filter for word selection
  const where: any = {
    id: { notIn: [...usedWordIds] },
  }
  if (options?.cefrLevel) where.cefrLevel = options.cefrLevel
  if (options?.themeId) {
    where.themes = { some: { themeId: options.themeId } }
  }

  // Select words by frequency (highest first), limited to target
  const candidateWords = await prisma.word.findMany({
    where,
    orderBy: { frequency: 'desc' },
    select: { id: true },
    take: wordTarget * 2, // get extra candidates in case some are filtered
  })

  const wordIds = candidateWords.slice(0, wordTarget).map((w) => w.id)

  // Create sprint with words in a transaction
  const sprint = await prisma.sprint.create({
    data: {
      userId,
      number,
      status: 'PLANNED',
      startDate,
      endDate,
      wordTarget,
      isReviewSprint: options?.isReviewSprint ?? false,
      phase: 'ACQUISITION',
      words: {
        create: wordIds.map((wordId) => ({ wordId })),
      },
    },
    include: {
      words: { include: { word: true } },
      _count: { select: { words: true, writings: true } },
    },
  })

  return sprint
}

/**
 * Start a planned sprint (change status to ACTIVE, set startDate to now)
 */
export async function startSprint(userId: string, sprintId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, userId },
  })
  if (!sprint) throw new Error('Sprint not found')
  if (sprint.status !== 'PLANNED') throw new Error('Only PLANNED sprints can be started')

  // End any currently active sprint
  await prisma.sprint.updateMany({
    where: { userId, status: 'ACTIVE' },
    data: { status: 'COMPLETED' },
  })

  return prisma.sprint.update({
    where: { id: sprintId },
    data: {
      status: 'ACTIVE',
      startDate: new Date(),
      phase: 'ACQUISITION',
    },
    include: {
      words: { include: { word: true } },
      _count: { select: { words: true, writings: true } },
    },
  })
}

/**
 * Compute sprint progress stats
 */
export async function getSprintStats(userId: string, sprintId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, userId },
    include: {
      words: { include: { word: { include: { progress: { where: { userId } } } } } },
    },
  })
  if (!sprint) throw new Error('Sprint not found')

  const totalWords = sprint.words.length
  let wordsLearned = 0
  let wordsMastered = 0
  let wordsNew = 0
  let wordsQuizzed = 0
  let wordsCorrect = 0

  for (const sw of sprint.words) {
    const progress = sw.word.progress[0]
    if (!progress || progress.status === 'new') {
      wordsNew++
    } else {
      wordsLearned++
      if (progress.status === 'mastered') wordsMastered++
    }
    if (sw.quizzed) {
      wordsQuizzed++
      if (sw.quizCorrect) wordsCorrect++
    }
  }

  const daysElapsed = Math.max(
    1,
    Math.ceil((Date.now() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24))
  )
  const daysTotal = Math.max(
    1,
    Math.ceil((sprint.endDate.getTime() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24))
  )
  const daysRemaining = Math.max(0, daysTotal - daysElapsed)

  const retentionRate = wordsQuizzed > 0 ? wordsCorrect / wordsQuizzed : null

  return {
    sprintId: sprint.id,
    number: sprint.number,
    status: sprint.status,
    phase: sprint.phase,
    isReviewSprint: sprint.isReviewSprint,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    daysElapsed,
    daysTotal,
    daysRemaining,
    totalWords,
    wordsLearned,
    wordsMastered,
    wordsNew,
    wordsQuizzed,
    wordsCorrect,
    retentionRate,
    wordTarget: sprint.wordTarget,
    reviewTarget: sprint.reviewTarget,
    progress: totalWords > 0 ? Math.round((wordsLearned / sprint.wordTarget) * 100) : 0,
    dailyPace: Math.round(wordsLearned / daysElapsed),
    onTrack: wordsLearned >= (sprint.wordTarget / daysTotal) * daysElapsed,
  }
}

/**
 * Transition sprint phase: ACQUISITION → APPLICATION (day 8+) or complete
 */
export async function advanceSprintPhase(userId: string, sprintId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, userId, status: 'ACTIVE' },
  })
  if (!sprint) throw new Error('Active sprint not found')

  const daysElapsed = Math.ceil(
    (Date.now() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  // If past day 7, switch to APPLICATION phase
  if (daysElapsed > 7 && sprint.phase === 'ACQUISITION') {
    await prisma.sprint.update({
      where: { id: sprintId },
      data: { phase: 'APPLICATION' },
    })
  }

  // If past end date, complete the sprint
  if (Date.now() >= sprint.endDate.getTime()) {
    const stats = await getSprintStats(userId, sprintId)
    await prisma.sprint.update({
      where: { id: sprintId },
      data: {
        status: 'COMPLETED',
        retentionRate: stats.retentionRate,
      },
    })
  }
}

/**
 * Get detailed sprint completion report
 */
export async function getSprintReport(userId: string, sprintId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, userId },
    include: {
      words: {
        include: {
          word: {
            include: {
              progress: { where: { userId } },
              themes: { include: { theme: true } },
            },
          },
        },
      },
      writings: true,
    },
  })
  if (!sprint) throw new Error('Sprint not found')

  const totalWords = sprint.words.length
  let wordsLearned = 0
  let wordsMastered = 0
  let wordsNew = 0
  let wordsCorrect = 0
  let wordsQuizzed = 0
  const categories: Record<string, { total: number; learned: number }> = {}
  const masteredWords: string[] = []
  const strugglingWords: string[] = []

  for (const sw of sprint.words) {
    const progress = sw.word.progress[0]
    const status = progress?.status ?? 'new'

    if (status === 'new') {
      wordsNew++
      strugglingWords.push(sw.word.word)
    } else {
      wordsLearned++
      if (status === 'mastered') {
        wordsMastered++
        masteredWords.push(sw.word.word)
      }
    }
    if (sw.quizzed) {
      wordsQuizzed++
      if (sw.quizCorrect) wordsCorrect++
    }

    // Category breakdown
    for (const wt of sw.word.themes) {
      const cat = wt.theme.name
      if (!categories[cat]) categories[cat] = { total: 0, learned: 0 }
      categories[cat].total++
      if (status !== 'new') categories[cat].learned++
    }
  }

  const durationDays = Math.max(1, Math.ceil((sprint.endDate.getTime() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24)))
  const retentionRate = wordsQuizzed > 0 ? Math.round((wordsCorrect / wordsQuizzed) * 100) : null
  const masteryRate = totalWords > 0 ? Math.round((wordsMastered / totalWords) * 100) : 0

  // Session stats from the sprint period
  const sessions = await prisma.learningSession.findMany({
    where: {
      userId,
      startedAt: { gte: sprint.startDate, lte: sprint.endDate },
    },
    select: { type: true, totalCorrect: true, totalIncorrect: true },
  })
  const totalSessions = sessions.length
  const totalCorrect = sessions.reduce((sum, s) => sum + s.totalCorrect, 0)
  const totalIncorrect = sessions.reduce((sum, s) => sum + s.totalIncorrect, 0)
  const sessionsByType: Record<string, number> = {}
  for (const s of sessions) {
    sessionsByType[s.type] = (sessionsByType[s.type] ?? 0) + 1
  }

  return {
    sprintId: sprint.id,
    sprintNumber: sprint.number,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    durationDays,
    status: sprint.status,
    phase: sprint.phase,
    isReviewSprint: sprint.isReviewSprint,
    wordTarget: sprint.wordTarget,
    totalWords,
    wordsLearned,
    wordsMastered,
    wordsNew,
    masteryRate,
    retentionRate,
    totalSessions,
    totalCorrect,
    totalIncorrect,
    sessionsByType,
    writingsCount: sprint.writings.length,
    categories: Object.entries(categories).map(([name, data]) => ({
      name,
      total: data.total,
      learned: data.learned,
      rate: data.total > 0 ? Math.round((data.learned / data.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total),
    masteredWords: masteredWords.slice(0, 20),
    strugglingWords: strugglingWords.slice(0, 20),
    dailyPace: Math.round(wordsLearned / Math.max(1, durationDays)),
  }
}

/**
 * Detect learning plateaus and generate nudge suggestions
 */
export async function detectPlateau(userId: string) {
  // Get daily learning counts for the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const dailyGoals = await prisma.dailyGoal.findMany({
    where: { userId, date: { gte: thirtyDaysAgo } },
    orderBy: { date: 'asc' },
  })

  if (dailyGoals.length < 7) {
    return { plateau: false, message: null, suggestions: [] }
  }

  // Compare recent 7 days vs previous 7 days
  const recent = dailyGoals.slice(-7)
  const previous = dailyGoals.slice(-14, -7)

  const recentAvg = recent.reduce((s, d) => s + (d.wordsLearned ?? 0), 0) / Math.max(1, recent.length)
  const previousAvg = previous.reduce((s, d) => s + (d.wordsLearned ?? 0), 0) / Math.max(1, previous.length)

  // Plateau: recent average is less than 50% of previous average
  const isPlateau = previousAvg > 0 && recentAvg < previousAvg * 0.5

  // Streak check
  const streak = await prisma.userStreak.findFirst({ where: { userId } })
  const currentStreak = streak?.currentStreak ?? 0

  // Generate suggestions
  const suggestions: string[] = []
  if (isPlateau) {
    suggestions.push('Try a different study mode — quiz or spelling practice can break the routine')
    suggestions.push('Focus on words from a specific topic that interests you')
    if (currentStreak === 0) {
      suggestions.push('Start a new streak! Even 5 minutes a day keeps vocabulary fresh')
    }
  }
  if (currentStreak > 7) {
    suggestions.push(`🔥 ${currentStreak}-day streak! Keep it going with a quick review session`)
  }
  if (recentAvg < 5) {
    suggestions.push('Set a daily goal of at least 10 new words to build momentum')
  }

  return {
    plateau: isPlateau,
    recentAvg: Math.round(recentAvg * 10) / 10,
    previousAvg: Math.round(previousAvg * 10) / 10,
    currentStreak,
    message: isPlateau
      ? `Your learning pace has slowed from ${Math.round(previousAvg)} to ${Math.round(recentAvg)} words/day. Time for a change!`
      : null,
    suggestions,
  }
}

/**
 * Generate writing prompts using sprint words
 */
export async function generateWritingPrompts(userId: string, sprintId: string) {
  const sprintWords = await prisma.sprintWord.findMany({
    where: { sprintId, sprint: { userId } },
    include: { word: true },
    take: 30,
    orderBy: { word: { frequency: 'desc' } },
  })

  if (sprintWords.length === 0) return []

  // Pick random subsets of words for different prompt types
  const shuffled = [...sprintWords].sort(() => Math.random() - 0.5)
  const prompts = []

  // Sentence prompts: use 1-2 words
  for (let i = 0; i < Math.min(5, shuffled.length); i++) {
    const word = shuffled[i].word
    prompts.push({
      type: 'sentence',
      description: `Write a sentence using the word "${word.word}"`,
      words: [word.word],
      definitions: [word.definition],
    })
  }

  // Paragraph prompts: use 3-5 words
  for (let i = 5; i + 4 < Math.min(20, shuffled.length); i += 5) {
    const words = shuffled.slice(i, i + 5).map(s => s.word.word)
    prompts.push({
      type: 'paragraph',
      description: `Write a short paragraph using these words: ${words.join(', ')}`,
      words,
      definitions: shuffled.slice(i, i + 5).map(s => s.word.definition),
    })
  }

  // Story prompts: use 5-8 words
  if (shuffled.length >= 15) {
    const storyWords = shuffled.slice(10, 18).map(s => s.word.word)
    prompts.push({
      type: 'story',
      description: `Write a short story (100-200 words) incorporating: ${storyWords.slice(0, 6).join(', ')}`,
      words: storyWords,
      definitions: shuffled.slice(10, 18).map(s => s.word.definition),
    })
  }

  // Debate/opinion prompt
  if (shuffled.length >= 5) {
    const topic = shuffled[0].word
    prompts.push({
      type: 'opinion',
      description: `Write your opinion on a topic related to "${topic.word}" — use at least 5 sprint words`,
      words: shuffled.slice(0, 10).map(s => s.word.word),
      definitions: shuffled.slice(0, 10).map(s => s.word.definition),
    })
  }

  return prompts
}

/**
 * Get milestones for a user with progress
 */
export async function getMilestonesWithProgress(userId: string) {
  // Default milestones: quarterly targets toward 5000 words
  const defaultMilestones = [
    { name: 'Q1 Foundation', wordTarget: 1250, deadline: '2026-06-30', focusArea: 'A1-A2 core vocabulary' },
    { name: 'Q2 Expansion', wordTarget: 2500, deadline: '2026-09-30', focusArea: 'B1 vocabulary & review' },
    { name: 'Q3 Mastery', wordTarget: 3750, deadline: '2026-12-31', focusArea: 'B2 vocabulary & writing' },
    { name: 'Fluency', wordTarget: 5000, deadline: '2027-03-31', focusArea: 'C1 vocabulary & speaking' },
  ]

  // Ensure milestones exist
  const existing = await prisma.milestone.findMany({
    where: { userId },
    orderBy: { wordTarget: 'asc' },
  })

  if (existing.length === 0) {
    await prisma.milestone.createMany({
      data: defaultMilestones.map((m) => ({
        userId,
        name: m.name,
        wordTarget: m.wordTarget,
        deadline: new Date(m.deadline),
        focusArea: m.focusArea,
      })),
    })
  }

  const milestones = existing.length > 0
    ? existing
    : await prisma.milestone.findMany({
        where: { userId },
        orderBy: { wordTarget: 'asc' },
      })

  // Count total words learned by user
  const totalLearned = await prisma.wordProgress.count({
    where: { userId, status: { not: 'new' } },
  })

  return milestones.map((m) => ({
    ...m,
    current: totalLearned,
    progress: Math.min(100, Math.round((totalLearned / m.wordTarget) * 100)),
    achieved: totalLearned >= m.wordTarget,
    daysRemaining: Math.max(0, Math.ceil((m.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
  }))
}
