import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

export async function writingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Get writing prompts for a sprint (random sprint words)
  app.get('/:sprintId/prompts', async (request) => {
    const userId = (request.user as any).userId
    const { sprintId } = request.params as { sprintId: string }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, userId },
    })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    // Get random sprint words (not yet quizzed)
    const words = await prisma.sprintWord.findMany({
      where: { sprintId, quizzed: false },
      include: { word: true },
      take: 5,
      orderBy: { word: { frequency: 'desc' } },
    })

    if (words.length === 0) {
      // Fallback to any sprint words
      const allWords = await prisma.sprintWord.findMany({
        where: { sprintId },
        include: { word: true },
        take: 5,
      })
      return { prompts: allWords.map(sw => ({
        wordId: sw.wordId,
        word: sw.word.word,
        definition: sw.word.definition,
        partOfSpeech: sw.word.partOfSpeech,
        examples: sw.word.examples,
      }))}
    }

    return { prompts: words.map(sw => ({
      wordId: sw.wordId,
      word: sw.word.word,
      definition: sw.word.definition,
      partOfSpeech: sw.word.partOfSpeech,
      examples: sw.word.examples,
    }))}
  })

  // Submit a sentence for a sprint word
  app.post('/:sprintId/sentence', async (request) => {
    const userId = (request.user as any).userId
    const { sprintId } = request.params as { sprintId: string }
    const body = request.body as {
      wordId: string
      text: string
    }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, userId },
    })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    // Validate the sentence contains the target word
    const word = await prisma.word.findUnique({ where: { id: body.wordId } })
    if (!word) throw { statusCode: 404, message: 'Word not found' }

    const sentenceLower = body.text.toLowerCase()
    const wordLower = word.word.toLowerCase()

    // Check for exact word and common inflections
    const inflections = getInflections(word.word)
    const usedWord = inflections.some(inf => {
      const regex = new RegExp(`\\b${escapeRegex(inf)}\\b`, 'i')
      return regex.test(body.text)
    })

    const wordCount = body.text.trim().split(/\s+/).length

    const writing = await prisma.sprintWriting.create({
      data: {
        sprintId,
        type: 'sentence',
        text: body.text,
        wordCount,
        sprintWordsUsed: usedWord ? 1 : 0,
        feedback: {
          wordId: body.wordId,
          targetWord: word.word,
          usedWord,
          wordCount,
          inflections,
        },
      },
    })

    return {
      writing,
      valid: usedWord,
      targetWord: word.word,
      inflections,
    }
  })

  // Submit long-form writing for a sprint
  app.post('/:sprintId/long-form', async (request) => {
    const userId = (request.user as any).userId
    const { sprintId } = request.params as { sprintId: string }
    const body = request.body as {
      text: string
    }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, userId },
    })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    // Get all sprint words
    const sprintWords = await prisma.sprintWord.findMany({
      where: { sprintId },
      select: { wordId: true, word: { select: { word: true } } },
    })

    // Count how many sprint words are used
    const textLower = body.text.toLowerCase()
    const usedSprintWords: string[] = []
    for (const sw of sprintWords) {
      const inflections = getInflections(sw.word.word)
      if (inflections.some(inf => {
        const regex = new RegExp(`\\b${escapeRegex(inf)}\\b`, 'i')
        return regex.test(body.text)
      })) {
        usedSprintWords.push(sw.word.word)
      }
    }

    const wordCount = body.text.trim().split(/\s+/).length

    const writing = await prisma.sprintWriting.create({
      data: {
        sprintId,
        type: 'long_form',
        text: body.text,
        wordCount,
        sprintWordsUsed: usedSprintWords.length,
        feedback: {
          totalSprintWords: sprintWords.length,
          usedSprintWords,
          usedCount: usedSprintWords.length,
          coverage: sprintWords.length > 0 ? Math.round((usedSprintWords.length / sprintWords.length) * 100) : 0,
        },
      },
    })

    return {
      writing,
      wordCount,
      sprintWordsUsed: usedSprintWords.length,
      sprintWordsTotal: sprintWords.length,
      coverage: sprintWords.length > 0 ? Math.round((usedSprintWords.length / sprintWords.length) * 100) : 0,
      usedWords: usedSprintWords,
    }
  })

  // Get writing history for a sprint
  app.get('/:sprintId/writings', async (request) => {
    const userId = (request.user as any).userId
    const { sprintId } = request.params as { sprintId: string }

    const sprint = await prisma.sprint.findFirst({
      where: { id: sprintId, userId },
    })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    const writings = await prisma.sprintWriting.findMany({
      where: { sprintId },
      orderBy: { createdAt: 'desc' },
    })

    return { writings }
  })
}

function getInflections(word: string): string[] {
  const lower = word.toLowerCase()
  const inflections = [lower]

  // Common English inflection patterns
  if (lower.endsWith('y') && !lower.endsWith('ay') && !lower.endsWith('ey') && !lower.endsWith('oy') && !lower.endsWith('uy')) {
    inflections.push(lower.slice(0, -1) + 'ies')  // carry → carries
    inflections.push(lower.slice(0, -1) + 'ied')   // carry → carried
  }
  if (lower.endsWith('e')) {
    inflections.push(lower + 'd')      // create → created
    inflections.push(lower + 's')      // create → creates
    inflections.push(lower.slice(0, -1) + 'ing')  // create → creating
  } else if (lower.endsWith('ic') || lower.endsWith('er') || lower.length >= 3) {
    // Double consonant pattern (run → running) or -ing
    inflections.push(lower + 's')
    inflections.push(lower + 'ed')
    inflections.push(lower + 'ing')
    inflections.push(lower + 'er')
    inflections.push(lower + 'est')
  }
  if (!lower.endsWith('s') && !lower.endsWith('x') && !lower.endsWith('z') && !lower.endsWith('ch') && !lower.endsWith('sh')) {
    inflections.push(lower + 's')
  }
  if (lower.endsWith('us')) {
    inflections.push(lower.slice(0, -2) + 'i')  // focus → foci
  }

  // Remove duplicates
  return [...new Set(inflections)]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
