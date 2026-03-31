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
import { adminRoutes, jobReportRoutes } from './routes/admin.js';
import { oauthRoutes } from './routes/oauth.js';
import { listsRoutes } from './routes/lists.js';
import { sprintRoutes } from './routes/sprints.js';
import { writingRoutes } from './routes/writing.js';
import { readingRoutes } from './routes/reading.js';
import prisma from './lib/prisma.js';
import { startJobRunner, stopJobRunner } from './lib/jobs.js';
import path from 'path';
import fs from 'fs';

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

  // Audio files — serve MP3s from dictionary/audio directory
  const AUDIO_BASE = path.resolve(process.env.AUDIO_DIR || path.join(process.cwd(), '..', '..', 'dictionary', 'audio'));

  app.get('/audio/:accent/:filename', async (request, reply) => {
    const { accent, filename } = request.params as { accent: string; filename: string };

    // Validate accent
    if (accent !== 'us' && accent !== 'uk') {
      return reply.status(400).send({ error: 'Invalid accent. Use "us" or "uk".' });
    }

    // Sanitize filename — prevent directory traversal
    const sanitized = filename.replace(/[^a-zA-Z0-9_\-.]/g, '');
    if (!sanitized.endsWith('.mp3')) {
      return reply.status(400).send({ error: 'Only MP3 files are served.' });
    }

    const subDir = accent === 'us' ? 'us_audio_split_24m' : 'uk_audio_split_24m';
    const filePath = path.join(AUDIO_BASE, subDir, sanitized);

    // Check file exists
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ error: 'Audio file not found.' });
    }

    // Stream the file
    const stream = fs.createReadStream(filePath);
    reply.header('Content-Type', 'audio/mpeg');
    reply.header('Cache-Control', 'public, max-age=31536000');
    return reply.send(stream);
  });

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    // Log the error for debugging
    app.log.error(error);

    // Prisma known errors
    if (error.constructor.name === 'PrismaClientKnownRequestError') {
      const prismaError = error as any;
      switch (prismaError.code) {
        case 'P2002': // Unique constraint violation
          return reply.status(409).send({ error: 'A record with this data already exists' });
        case 'P2025': // Record not found
          return reply.status(404).send({ error: 'Record not found' });
        case 'P2003': // Foreign key constraint
          return reply.status(400).send({ error: 'Related record not found' });
      }
    }

    // Validation errors from Fastify
    if (error.validation) {
      return reply.status(400).send({ error: 'Validation error', details: error.validation });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({ error: 'Too many requests. Please try again later.' });
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 && isProduction
      ? 'Internal server error'
      : error.message || 'Internal server error';

    reply.status(statusCode).send({ error: message });
  });

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
    instance.register(jobReportRoutes);
    
    // Other routes (will add auth middleware later)
    instance.register(wordRoutes);
    instance.register(themeRoutes);
    instance.register(progressRoutes);
    instance.register(sessionRoutes);
    instance.register(statsRoutes);
    instance.register(listsRoutes);
    instance.register(sprintRoutes, { prefix: '/sprints' });
    instance.register(writingRoutes, { prefix: '/writing' });
    instance.register(readingRoutes, { prefix: '/reading' });
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
