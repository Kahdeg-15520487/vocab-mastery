import { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  JwtPayload,
} from '../lib/jwt.js';

// Extend FastifyInstance for OAuth plugin
declare module 'fastify' {
  interface FastifyInstance {
    googleOAuth2: {
      getAccessTokenFromAuthorizationCodeFlow: (request: any) => Promise<{ token: { access_token?: string } }>;
    };
  }
}

// Google OAuth configuration
const GOOGLE_OAUTH_CONFIG = {
  name: 'google',
  scope: ['email', 'profile'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID || '',
      secret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    auth: {
      authorizeHost: 'https://accounts.google.com',
      authorizePath: '/o/oauth2/v2/auth',
      tokenHost: 'https://oauth2.googleapis.com',
      tokenPath: '/token',
    },
  },
  startRedirectPath: '/auth/google',
  callbackUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:7101/api/auth/google/callback',
};

interface GoogleProfile {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export async function oauthRoutes(app: FastifyInstance) {
  // Only register OAuth routes if Google credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    app.log.warn('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable.');
    return;
  }

  // Register OAuth plugin dynamically
  const oauth2 = await import('@fastify/oauth2');
  
  await app.register(oauth2.default, GOOGLE_OAUTH_CONFIG);

  // ============================================
  // GET /api/auth/google/callback - OAuth callback
  // ============================================
  app.get('/auth/google/callback', async (request, reply) => {
    try {
      const { token } = await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      if (!token.access_token) {
        return reply.status(400).send({ error: 'Failed to get access token from Google' });
      }

      // Fetch user profile from Google
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      });

      if (!profileResponse.ok) {
        app.log.error('Failed to fetch Google profile');
        return reply.status(400).send({ error: 'Failed to fetch Google profile' });
      }

      const profile: GoogleProfile = await profileResponse.json() as GoogleProfile;

      if (!profile.email) {
        return reply.status(400).send({ error: 'No email from Google profile' });
      }

      // Find or create user
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { googleId: profile.id },
            { email: profile.email.toLowerCase() },
          ],
        },
      });

      if (user) {
        // Update Google ID if not set
        if (!user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              googleId: profile.id,
              lastLoginAt: new Date(),
            },
          });
        } else {
          // Just update last login
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });
        }
      } else {
        // Create new user
        const username = profile.email.split('@')[0] + '_' + profile.id.slice(0, 6);
        
        user = await prisma.user.create({
          data: {
            email: profile.email.toLowerCase(),
            googleId: profile.id,
            username,
            role: 'LEARNER',
            subscriptionTier: 'FREE',
          },
        });
      }

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

      // Set refresh token cookie
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        expires: refreshTokenExpiry,
      });

      // Redirect to frontend with access token
      const frontendUrl = process.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:7100';
      const redirectUrl = new URL('/auth/callback', frontendUrl);
      redirectUrl.searchParams.set('accessToken', accessToken);
      redirectUrl.searchParams.set('user', JSON.stringify({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
      }));

      return reply.redirect(redirectUrl.toString());
    } catch (error) {
      app.log.error(error, 'OAuth callback error');
      const frontendUrl = process.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:7100';
      return reply.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  });
}
