import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

export async function readingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Analyze text for sprint word coverage
  app.post('/analyze', async (request) => {
    const userId = (request as any).user.userId
    const body = request.body as {
      text: string
      sprintId?: string
    }

    if (!body.text?.trim()) {
      throw { statusCode: 400, message: 'Text is required' }
    }

    const textLower = body.text.toLowerCase()
    const words = textLower.split(/\W+/).filter(w => w.length > 1)

    // Unique words in text
    const uniqueTextWords = [...new Set(words)]

    // Get user's learned/learning words
    const userProgress = await prisma.wordProgress.findMany({
      where: { userId },
      select: {
        word: { select: { id: true, word: true, cefrLevel: true, definition: true } },
        status: true,
      },
    })

    const knownWords = new Set(
      userProgress
        .filter(p => p.status === 'learned' || p.status === 'reviewing')
        .map(p => p.word.word.toLowerCase())
    )
    const learningWords = new Set(
      userProgress
        .filter(p => p.status === 'learning')
        .map(p => p.word.word.toLowerCase())
    )

    // Categorize text words
    const known: string[] = []
    const learning: string[] = []
    const unknown: string[] = []

    for (const w of uniqueTextWords) {
      if (knownWords.has(w)) known.push(w)
      else if (learningWords.has(w)) learning.push(w)
      else unknown.push(w)
    }

    // Look up unknown words in dictionary
    const dictWords = await prisma.word.findMany({
      where: { word: { in: unknown.map(w => w.toLowerCase()).slice(0, 50) } },
      select: { id: true, word: true, definition: true, cefrLevel: true, partOfSpeech: true },
    })
    const dictMap = new Map(dictWords.map(w => [w.word.toLowerCase(), w]))

    const unknownInDict = unknown.filter(w => dictMap.has(w))
    const unknownNotInDict = unknown.filter(w => !dictMap.has(w))

    // Sprint word coverage (if sprintId provided)
    let sprintCoverage: any = null
    if (body.sprintId) {
      const sprintWords = await prisma.sprintWord.findMany({
        where: { sprintId: body.sprintId },
        include: { word: { select: { word: true } } },
      })
      const sprintWordSet = new Set(sprintWords.map(sw => sw.word.word.toLowerCase()))
      const sprintWordsInText = uniqueTextWords.filter(w => sprintWordSet.has(w))
      const sprintWordsNotInText = [...sprintWordSet].filter(w => !uniqueTextWords.includes(w))

      sprintCoverage = {
        total: sprintWordSet.size,
        found: sprintWordsInText.length,
        foundWords: sprintWordsInText,
        missingWords: sprintWordsNotInText,
        coverage: sprintWordSet.size > 0
          ? Math.round((sprintWordsInText.length / sprintWordSet.size) * 100)
          : 0,
      }
    }

    return {
      totalWords: words.length,
      uniqueWords: uniqueTextWords.length,
      known: { count: known.length, words: known },
      learning: { count: learning.length, words: learning },
      unknown: {
        count: unknown.length,
        inDictionary: unknownInDict.map(w => dictMap.get(w)),
        notInDictionary: unknownNotInDict,
      },
      sprintCoverage,
      readability: {
        knownPercent: uniqueTextWords.length > 0
          ? Math.round((known.length / uniqueTextWords.length) * 100)
          : 0,
        learningPercent: uniqueTextWords.length > 0
          ? Math.round((learning.length / uniqueTextWords.length) * 100)
          : 0,
        unknownPercent: uniqueTextWords.length > 0
          ? Math.round((unknown.length / uniqueTextWords.length) * 100)
          : 0,
      },
    }
  })

  // Get reading suggestions based on user's level
  app.get('/suggestions', async (request) => {
    const userId = (request as any).user.userId

    // Get user's average level from progress
    const progress = await prisma.wordProgress.findMany({
      where: { userId, status: { in: ['learning', 'learned', 'reviewing'] } },
      include: { word: { select: { cefrLevel: true } } },
      take: 100,
      orderBy: { updatedAt: 'desc' },
    })

    // Count CEFR levels
    const levelCounts: Record<string, number> = {}
    for (const p of progress) {
      const level = p.word.cefrLevel || 'A1'
      levelCounts[level] = (levelCounts[level] || 0) + 1
    }

    // Determine user's level
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    let userLevel = 'A1'
    for (const level of levels) {
      if ((levelCounts[level] || 0) >= 5) userLevel = level
    }

    // Get words just above user's level for reading practice
    const currentIdx = levels.indexOf(userLevel)
    const nextLevel = levels[Math.min(currentIdx + 1, levels.length - 1)]

    const allSuggested = await prisma.word.findMany({
      where: {
        cefrLevel: nextLevel,
      },
      take: 50,
      orderBy: { frequency: 'asc' },
    })
    const suggestedWords = allSuggested
      .filter(w => Array.isArray(w.examples) && w.examples.length > 0)
      .slice(0, 10)

    return {
      userLevel,
      nextLevel,
      suggestedWords: suggestedWords.map(w => ({
        id: w.id,
        word: w.word,
        definition: w.definition,
        cefrLevel: w.cefrLevel,
        examples: w.examples,
      })),
    }
  })
}
