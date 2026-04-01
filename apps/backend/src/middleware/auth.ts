import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, JwtPayload } from '../lib/jwt.js';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Middleware to authenticate user via JWT
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  let token: string | undefined;

  // Try Authorization header first
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Fall back to query parameter (for print/export views)
  if (!token) {
    const query = request.query as { token?: string };
    token = query.token;
  }

  if (!token) {
    reply.status(401).send({ error: 'Missing or invalid authorization header' });
    return;
  }

  const payload = verifyAccessToken(token);

  if (!payload) {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return;
  }

  // Attach user to request
  request.user = payload;
}

/**
 * Middleware to require authentication
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticate(request, reply);
}

/**
 * Middleware to require admin role
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First authenticate
  await authenticate(request, reply);

  // Check if authentication failed (reply already sent)
  if (reply.sent) return;

  // Check admin role
  if (request.user?.role !== 'ADMIN') {
    reply.status(403).send({ error: 'Admin access required' });
    return;
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    if (payload) {
      request.user = payload;
    }
  }
}

/**
 * Check if user owns the resource or is admin
 */
export function canAccessUser(
  request: FastifyRequest,
  targetUserId: string
): boolean {
  if (!request.user) return false;
  if (request.user.role === 'ADMIN') return true;
  return request.user.userId === targetUserId;
}
