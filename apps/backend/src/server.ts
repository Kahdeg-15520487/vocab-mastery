import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { wordRoutes } from './routes/words.js';
import { themeRoutes } from './routes/themes.js';
import { progressRoutes } from './routes/progress.js';
import { sessionRoutes } from './routes/sessions.js';
import { statsRoutes } from './routes/stats.js';
import { dataRoutes } from './routes/data.js';
import prisma from './lib/prisma.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

async function start() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: true, // Allow all origins in development
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Disable for development
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // API routes
  app.register(async (instance) => {
    instance.register(wordRoutes);
    instance.register(themeRoutes);
    instance.register(progressRoutes);
    instance.register(sessionRoutes);
    instance.register(statsRoutes);
    instance.register(dataRoutes);
  }, { prefix: '/api' });

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info('Shutting down gracefully...');
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
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
