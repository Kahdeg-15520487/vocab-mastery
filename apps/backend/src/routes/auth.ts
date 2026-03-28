import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { hashPassword, comparePassword, validatePassword } from '../lib/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  JwtPayload,
} from '../lib/jwt.js';
import { authenticate } from '../middleware/auth.js';
import { createSystemLists } from '../lib/lists.js';

export async function authRoutes(app: FastifyInstance) {
  // ============================================
  // POST /api/auth/register
  // ============================================
  app.post('/auth/register', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as {
      email: string;
      password: string;
      username: string;
    };

    // Validate input
    if (!body.email || !body.password || !body.username) {
      return reply.status(400).send({ error: 'Email, password, and username are required' });
    }

    // Validate password
    const passwordValidation = validatePassword(body.password);
    if (!passwordValidation.valid) {
      return reply.status(400).send({ error: passwordValidation.error });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return reply.status(400).send({ error: 'Invalid email format' });
    }

    // Validate username (alphanumeric and underscores only)
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!usernameRegex.test(body.username)) {
      return reply.status(400).send({
        error: 'Username must be 3-30 characters, alphanumeric and underscores only',
      });
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });
    if (existingEmail) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    // Check if username already exists
    const existingUsername = await prisma.user.findUnique({
      where: { username: body.username },
    });
    if (existingUsername) {
      return reply.status(409).send({ error: 'Username already taken' });
    }

    // Hash password
    const passwordHash = await hashPassword(body.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash,
        username: body.username,
        role: 'LEARNER',
        subscriptionTier: 'FREE',
      },
    });

    // Create system lists for new user
    await createSystemLists(user.id);

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiry = getRefreshTokenExpiry();

    // Save refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiry,
      },
    });

    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: refreshTokenExpiry,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
      },
      accessToken,
    };
  });

  // ============================================
  // POST /api/auth/login
  // ============================================
  app.post('/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as {
      login: string;
      password: string;
    };

    // Validate input
    if (!body.login || !body.password) {
      return reply.status(400).send({ error: 'Username/email and password are required' });
    }

    // Find user by email or username
    const loginLower = body.login.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: loginLower },
          { username: body.login }, // Username is case-sensitive
        ],
      },
    });

    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: 'Invalid username/email or password' });
    }

    // Compare password
    const isValid = await comparePassword(body.password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid username/email or password' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiry = getRefreshTokenExpiry();

    // Save refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiry,
      },
    });

    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: refreshTokenExpiry,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
      },
      accessToken,
    };
  });

  // ============================================
  // POST /api/auth/refresh
  // ============================================
  app.post('/auth/refresh', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token provided' });
    }

    // Find refresh token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    // Token reuse detection: if already revoked, the token was already used
    // This indicates a potential token theft — revoke ALL tokens for this user
    if (storedToken.revoked) {
      console.warn(`⚠️ Refresh token reuse detected for user ${storedToken.userId}. Revoking all tokens.`);
      await prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId },
        data: { revoked: true },
      });
      return reply.status(401).send({ error: 'Token reuse detected. All sessions revoked.' });
    }

    // Check if expired
    if (storedToken.expiresAt < new Date()) {
      return reply.status(401).send({ error: 'Refresh token expired' });
    }

    // Revoke old token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    // Generate new tokens
    const payload: JwtPayload = {
      userId: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken();
    const refreshTokenExpiry = getRefreshTokenExpiry();

    // Save new refresh token
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        token: newRefreshToken,
        expiresAt: refreshTokenExpiry,
      },
    });

    // Set new refresh token cookie
    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: refreshTokenExpiry,
    });

    return { accessToken: newAccessToken };
  });

  // ============================================
  // POST /api/auth/logout
  // ============================================
  app.post('/auth/logout', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;

    if (refreshToken) {
      // Revoke the token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    }

    // Clear cookie
    reply.clearCookie('refreshToken', { path: '/' });

    return { success: true };
  });

  // ============================================
  // POST /api/auth/logout-all
  // ============================================
  app.post('/auth/logout-all', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;

    // Revoke all refresh tokens for this user
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    // Clear cookie
    reply.clearCookie('refreshToken', { path: '/' });

    return { success: true };
  });

  // ============================================
  // GET /api/auth/me
  // ============================================
  app.get('/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        totalXp: true,
        level: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return { user };
  });

  // ============================================
  // PUT /api/auth/password
  // ============================================
  app.put('/auth/password', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!body.currentPassword || !body.newPassword) {
      return reply.status(400).send({ error: 'Current and new password are required' });
    }

    // Validate new password
    const passwordValidation = validatePassword(body.newPassword);
    if (!passwordValidation.valid) {
      return reply.status(400).send({ error: passwordValidation.error });
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await comparePassword(body.currentPassword, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    // Hash and update password
    const newPasswordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all refresh tokens (force re-login)
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { revoked: true },
    });

    // Clear cookie
    reply.clearCookie('refreshToken', { path: '/' });

    return { success: true, message: 'Password updated. Please login again.' };
  });

  // ============================================
  // DELETE /api/auth/account
  // ============================================
  app.delete('/auth/account', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as { password?: string };

    if (!body.password) {
      return reply.status(400).send({ error: 'Password confirmation required' });
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Verify password
    const isValid = await comparePassword(body.password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ error: 'Incorrect password' });
    }

    // Delete user (cascade will delete related data)
    await prisma.user.delete({ where: { id: userId } });

    // Clear cookie
    reply.clearCookie('refreshToken', { path: '/' });

    return { success: true, message: 'Account deleted' };
  });

  // ============================================
  // GET /api/auth/export (GDPR)
  // ============================================
  app.get('/auth/export', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        lastLoginAt: true,
        refreshTokens: {
          select: { createdAt: true, expiresAt: true },
        },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        ...user,
        refreshTokens: undefined, // Remove from main export
      },
      sessions: user.refreshTokens.map((t) => ({
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
      })),
    };

    const filename = `user-data-export-${new Date().toISOString().split('T')[0]}.json`;

    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    return exportData;
  });

  // ============================================
  // POST /api/auth/forgot-password
  // ============================================
  app.post('/auth/forgot-password', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { email: string };

    if (!body.email) {
      return reply.status(400).send({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { success: true, message: 'If that email exists, a reset link has been sent.' };
    }

    // Invalidate any existing reset tokens for this user
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate a secure token
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // In production, send email with reset link
    // For now, return the token in dev mode
    const isDev = process.env.NODE_ENV !== 'production';

    return {
      success: true,
      message: 'If that email exists, a reset link has been sent.',
      ...(isDev && { resetToken: token, resetUrl: `/reset-password?token=${token}` }),
    };
  });

  // ============================================
  // POST /api/auth/reset-password
  // ============================================
  app.post('/auth/reset-password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { token: string; password: string };

    if (!body.token || !body.password) {
      return reply.status(400).send({ error: 'Token and new password are required' });
    }

    const passwordValidation = validatePassword(body.password);
    if (!passwordValidation.valid) {
      return reply.status(400).send({ error: passwordValidation.error });
    }

    // Find valid reset token
    const reset = await prisma.passwordReset.findUnique({
      where: { token: body.token },
    });

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired reset token' });
    }

    // Update password
    const hashedPassword = await hashPassword(body.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash: hashedPassword },
      }),
      prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all refresh tokens (force re-login)
      prisma.refreshToken.deleteMany({
        where: { userId: reset.userId },
      }),
    ]);

    return { success: true, message: 'Password has been reset. Please log in with your new password.' };
  });
}
