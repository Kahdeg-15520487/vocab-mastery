import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { requireAdmin } from '../middleware/auth.js';

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require admin role
  app.addHook('preHandler', requireAdmin);

  // ============================================
  // GET /api/admin/stats - Platform statistics
  // ============================================
  app.get('/admin/stats', async (request, reply) => {
    const [
      totalUsers,
      activeUsersToday,
      totalWords,
      wordsLearned,
      totalSessions,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      // Active users today (users who have refresh tokens created today)
      prisma.refreshToken.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      // Total words in database
      prisma.word.count(),
      // Words with progress
      prisma.wordProgress.count({
        where: { status: { not: 'new' } },
      }),
      // Total learning sessions
      prisma.learningSession.count(),
    ]);

    // Users by subscription tier
    const usersByTier = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: true,
    });

    // Users by role
    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
    });

    return {
      users: {
        total: totalUsers,
        activeToday: activeUsersToday,
        byTier: usersByTier.reduce((acc, item) => {
          acc[item.subscriptionTier] = item._count;
          return acc;
        }, {} as Record<string, number>),
        byRole: usersByRole.reduce((acc, item) => {
          acc[item.role] = item._count;
          return acc;
        }, {} as Record<string, number>),
      },
      content: {
        totalWords,
        wordsLearned,
      },
      activity: {
        totalSessions,
      },
    };
  });

  // ============================================
  // GET /api/admin/users - List users (paginated)
  // ============================================
  app.get('/admin/users', async (request, reply) => {
    const query = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      role?: string;
      tier?: string;
    };

    const page = parseInt(query.page || '1', 10);
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    // Search filter
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Role filter
    if (query.role) {
      where.role = query.role;
    }

    // Tier filter
    if (query.tier) {
      where.subscriptionTier = query.tier;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          subscriptionTier: true,
          subscriptionExpiresAt: true,
          createdAt: true,
          lastLoginAt: true,
          googleId: true,
          _count: {
            select: { refreshTokens: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        subscriptionTier: u.subscriptionTier,
        subscriptionExpiresAt: u.subscriptionExpiresAt,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        hasGoogleAuth: !!u.googleId,
        sessionCount: u._count.refreshTokens,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // ============================================
  // GET /api/admin/users/:id - Get single user
  // ============================================
  app.get('/admin/users/:id', async (request, reply) => {
    const params = request.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        googleId: true,
        _count: {
          select: { refreshTokens: true },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Get user's learning stats
    const progressStats = await prisma.wordProgress.aggregate({
      where: { wordId: { not: '' } }, // Placeholder - would need userId relation
      _count: true,
    });

    return {
      ...user,
      hasGoogleAuth: !!user.googleId,
      sessionCount: user._count.refreshTokens,
    };
  });

  // ============================================
  // PUT /api/admin/users/:id - Update user
  // ============================================
  app.put('/admin/users/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const body = request.body as {
      role?: 'LEARNER' | 'ADMIN';
      subscriptionTier?: 'FREE' | 'EXPLORER' | 'WORDSMITH';
      subscriptionExpiresAt?: string;
    };

    // Check user exists
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Prevent removing the last admin
    if (body.role === 'LEARNER' && existing.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot remove the last admin' });
      }
    }

    const updateData: any = {};

    if (body.role) updateData.role = body.role;
    if (body.subscriptionTier) updateData.subscriptionTier = body.subscriptionTier;
    if (body.subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = body.subscriptionExpiresAt
        ? new Date(body.subscriptionExpiresAt)
        : null;
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    return user;
  });

  // ============================================
  // DELETE /api/admin/users/:id - Delete user
  // ============================================
  app.delete('/admin/users/:id', async (request, reply) => {
    const params = request.params as { id: string };

    // Check user exists
    const existing = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Prevent deleting the last admin
    if (existing.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' },
      });

      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot delete the last admin' });
      }
    }

    // Prevent self-deletion
    if (request.user?.userId === params.id) {
      return reply.status(400).send({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: params.id },
    });

    return { success: true, message: 'User deleted' };
  });

  // ============================================
  // GET /api/admin/config - Get system config
  // ============================================
  app.get('/admin/config', async (request, reply) => {
    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });

    // Return as key-value object
    const result: Record<string, string> = {};
    for (const config of configs) {
      result[config.key] = config.value;
    }

    return result;
  });

  // ============================================
  // PUT /api/admin/config/:key - Update config
  // ============================================
  app.put('/admin/config/:key', async (request, reply) => {
    const params = request.params as { key: string };
    const body = request.body as { value: string };

    if (!body.value) {
      return reply.status(400).send({ error: 'Value is required' });
    }

    const config = await prisma.systemConfig.upsert({
      where: { key: params.key },
      update: { value: body.value },
      create: { key: params.key, value: body.value },
    });

    return config;
  });
}
