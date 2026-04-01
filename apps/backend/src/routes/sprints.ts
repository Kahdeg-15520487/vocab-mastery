import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import {
  getCurrentSprint,
  createNextSprint,
  startSprint,
  getSprintStats,
  advanceSprintPhase,
  getMilestonesWithProgress,
  getSprintReport,
  detectPlateau,
  generateWritingPrompts,
  getNextSprintSuggestion,
  calculatePace,
  getFocusRecommendations,
} from '../lib/sprints.js'

export async function sprintRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── Static routes FIRST (before /:id parametric routes) ──

  // Get current sprint with stats
  app.get('/current', async (request) => {
    const userId = (request.user as any).userId
    const sprint = await getCurrentSprint(userId)

    if (!sprint) {
      return { sprint: null, stats: null }
    }

    // Auto-advance phase
    if (sprint.status === 'ACTIVE') {
      await advanceSprintPhase(userId, sprint.id)
    }

    const stats = await getSprintStats(userId, sprint.id)
    return { sprint, stats }
  })

  // Get sprint list
  app.get('/', async (request) => {
    const userId = (request.user as any).userId
    const sprints = await prisma.sprint.findMany({
      where: { userId },
      orderBy: { number: 'desc' },
      include: {
        _count: { select: { words: true, writings: true } },
      },
    })
    return { sprints }
  })

  // Get milestones
  app.get('/milestones/all', async (request) => {
    const userId = (request.user as any).userId
    const milestones = await getMilestonesWithProgress(userId)
    return { milestones }
  })

  // Plateau detection
  app.get('/insights/plateau', async (request) => {
    const userId = (request.user as any).userId
    const result = await detectPlateau(userId)
    return result
  })

  // Get sprint overview (dashboard data)
  app.get('/overview/dashboard', async (request) => {
    const userId = (request.user as any).userId

    const [sprint, milestones, sprintCount] = await Promise.all([
      getCurrentSprint(userId),
      getMilestonesWithProgress(userId),
      prisma.sprint.count({ where: { userId } }),
    ])

    let stats = null
    if (sprint) {
      stats = await getSprintStats(userId, sprint.id)
    }

    const totalLearned = await prisma.wordProgress.count({
      where: { userId, status: { not: 'new' } },
    })

    return {
      currentSprint: sprint,
      sprintStats: stats,
      milestones,
      totalSprints: sprintCount,
      totalWordsLearned: totalLearned,
      yearTarget: 5000,
      yearProgress: Math.round((totalLearned / 5000) * 100),
    }
  })

  // Get next sprint suggestion
  app.get('/suggestions/next', async (request) => {
    const userId = (request.user as any).userId
    const suggestion = await getNextSprintSuggestion(userId)
    return suggestion
  })

  // Focus recommendations
  app.get('/focus', async (request) => {
    const userId = (request.user as any).userId
    const recommendations = await getFocusRecommendations(userId)
    return recommendations
  })

  // Get pace calculation
  app.get('/pace', async (request) => {
    const userId = (request.user as any).userId
    const pace = await calculatePace(userId)
    return pace
  })

  // Update year goal settings
  app.put('/year-goal', async (request) => {
    const userId = (request.user as any).userId
    const body = request.body as {
      yearWordTarget?: number
      yearTargetDate?: string
    }

    const data: any = {}
    if (body.yearWordTarget) data.yearWordTarget = body.yearWordTarget
    if (body.yearTargetDate) data.yearTargetDate = new Date(body.yearTargetDate)

    await prisma.user.update({
      where: { id: userId },
      data,
    })

    const pace = await calculatePace(userId)
    return { success: true, pace }
  })

  // Create next sprint
  app.post('/', async (request) => {
    const userId = (request.user as any).userId
    const body = request.body as {
      wordTarget?: number
      durationDays?: number
      isReviewSprint?: boolean
      cefrLevel?: string
      themeId?: string
    }

    const sprint = await createNextSprint(userId, body)
    return { sprint }
  })

  // ── Parametric routes (/ :id) ──

  // Get specific sprint with full details
  app.get('/:id', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    const sprint = await prisma.sprint.findFirst({
      where: { id, userId },
      include: {
        words: {
          include: {
            word: {
              include: {
                progress: { where: { userId } },
              },
            },
          },
          orderBy: { word: { frequency: 'desc' } },
        },
        writings: { orderBy: { createdAt: 'desc' } },
      },
    })

    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    const stats = await getSprintStats(userId, id)
    return { sprint, stats }
  })

  // Get sprint completion report
  app.get('/:id/report', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    const sprint = await prisma.sprint.findFirst({ where: { id, userId } })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    const report = await getSprintReport(userId, id)
    return report
  })

  // Get sprint words
  app.get('/:id/words', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    const sprint = await prisma.sprint.findFirst({
      where: { id, userId },
    })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    const words = await prisma.sprintWord.findMany({
      where: { sprintId: id },
      include: {
        word: {
          include: {
            progress: { where: { userId } },
          },
        },
      },
      orderBy: { word: { frequency: 'desc' } },
    })

    return { words }
  })

  // Writing prompts for a sprint
  app.get('/:id/prompts', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    const sprint = await prisma.sprint.findFirst({ where: { id, userId } })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found' }

    const prompts = await generateWritingPrompts(userId, id)
    return { prompts }
  })

  // Start a planned sprint
  app.post('/:id/start', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    const sprint = await startSprint(userId, id)
    return { sprint }
  })

  // Abandon a sprint
  app.post('/:id/abandon', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    const sprint = await prisma.sprint.findFirst({
      where: { id, userId, status: { in: ['PLANNED', 'ACTIVE'] } },
    })
    if (!sprint) throw { statusCode: 404, message: 'Sprint not found or cannot be abandoned' }

    const updated = await prisma.sprint.update({
      where: { id },
      data: { status: 'ABANDONED' },
    })

    return { sprint: updated }
  })

  // Complete a sprint manually
  app.post('/:id/complete', async (request) => {
    const userId = (request.user as any).userId
    const { id } = request.params as { id: string }

    // Get final stats before completing
    const finalStats = await getSprintStats(userId, id)

    await advanceSprintPhase(userId, id)
    const updated = await prisma.sprint.findFirst({
      where: { id, userId, status: 'COMPLETED' },
    })
    if (!updated) throw { statusCode: 400, message: 'Cannot complete this sprint' }

    // Get detailed report data
    const report = await getSprintReport(userId, id)

    return { sprint: updated, stats: finalStats, report }
  })
}
