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
} from '../lib/sprints.js'

export async function sprintRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

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

  // Get milestones
  app.get('/milestones/all', async (request) => {
    const userId = (request.user as any).userId
    const milestones = await getMilestonesWithProgress(userId)
    return { milestones }
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
}
