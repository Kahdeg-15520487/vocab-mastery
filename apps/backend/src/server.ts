import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { wordRoutes } from './routes/words.js';
import { themeRoutes } from './routes/themes.js';
import { progressRoutes } from './routes/progress.js';
import { sessionRoutes } from './routes/sessions.js';
import { statsRoutes } from './routes/stats.js';
import { dataRoutes } from './routes/data.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { oauthRoutes } from './routes/oauth.js';
import { listsRoutes } from './routes/lists.js';
import prisma from './lib/prisma.js';
import { startJobRunner, stopJobRunner } from './lib/jobs.js';

const PORT = Number(process.env.PORT) || 7101;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const isProduction = process.env.NODE_ENV === 'production';

async function start() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: 50 * 1024 * 1024, // 50MB limit for large imports
  });

  // Register plugins
  await app.register(cors, {
    origin: isProduction ? (process.env.CORS_ORIGIN?.split(',') || false) : true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cookie, {
    parseOptions: {},
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check (public)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // API routes
  app.register(async (instance) => {
    // Auth routes (public)
    instance.register(authRoutes);
    
    // OAuth routes (public)
    instance.register(oauthRoutes);
    
    // Data routes (requires admin)
    instance.register(dataRoutes);
    
    // Admin routes (requires admin role)
    instance.register(adminRoutes);
    
    // Other routes (will add auth middleware later)
    instance.register(wordRoutes);
    instance.register(themeRoutes);
    instance.register(progressRoutes);
    instance.register(sessionRoutes);
    instance.register(statsRoutes);
    instance.register(listsRoutes);
  }, { prefix: '/api' });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down gracefully...');
    stopJobRunner();
    await prisma.$disconnect();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server running at http://${HOST}:${PORT}`);
    
    // Start job runner after server is up
    startJobRunner(5000);
    app.log.info('Job runner started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
