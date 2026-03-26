import prisma from './prisma.js';

// Job types
export type JobType = 'CATEGORIZE_WORDS' | 'IMPORT_WORDS' | 'EXPORT_DATA' | 'CLEANUP';
export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface JobPayload {
  [key: string]: any;
}

export interface JobResult {
  [key: string]: any;
}

// Job handler type
type JobHandler = (job: {
  id: string;
  payload: JobPayload;
  updateProgress: (processed: number, total: number) => Promise<void>;
  checkCancelled: () => Promise<boolean>;
}) => Promise<JobResult>;

// Registered handlers
const handlers: Map<string, JobHandler> = new Map();

// Is the job runner active?
let isRunning = false;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Register a job handler
 */
export function registerJobHandler(type: JobType, handler: JobHandler) {
  handlers.set(type, handler);
  console.log(`Registered job handler: ${type}`);
}

/**
 * Create a new job
 */
export async function createJob(
  type: JobType,
  payload: JobPayload,
  options?: { 
    priority?: number; 
    userId?: string;
  }
): Promise<{ id: string }> {
  const job = await prisma.job.create({
    data: {
      type,
      payload,
      priority: options?.priority || 0,
      userId: options?.userId || null,
    },
  });

  console.log(`Created job ${job.id} (${type})`);
  
  // Trigger immediate processing if runner is active
  if (isRunning) {
    processNextJob().catch(console.error);
  }

  return { id: job.id };
}

/**
 * Get job by ID
 */
export async function getJob(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
  });
}

/**
 * Get all jobs (with filters)
 */
export async function getJobs(options?: {
  status?: JobStatus;
  type?: JobType;
  userId?: string;
  limit?: number;
}) {
  const where: any = {};
  
  if (options?.status) where.status = options.status;
  if (options?.type) where.type = options.type;
  if (options?.userId) where.userId = options.userId;

  return prisma.job.findMany({
    where,
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
    take: options?.limit || 50,
  });
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job) return false;
  if (job.status !== 'PENDING' && job.status !== 'RUNNING') {
    return false;
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
    },
  });

  console.log(`Cancelled job ${jobId}`);
  return true;
}

/**
 * Delete a job
 */
export async function deleteJob(jobId: string): Promise<boolean> {
  try {
    await prisma.job.delete({
      where: { id: jobId },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the job runner
 */
export function startJobRunner(intervalMs: number = 5000) {
  if (isRunning) {
    console.log('Job runner already running');
    return;
  }

  isRunning = true;
  console.log(`Starting job runner (check interval: ${intervalMs}ms)`);

  // Process immediately
  processNextJob().catch(console.error);

  // Then check periodically
  checkInterval = setInterval(() => {
    processNextJob().catch(console.error);
  }, intervalMs);
}

/**
 * Stop the job runner
 */
export function stopJobRunner() {
  isRunning = false;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  console.log('Job runner stopped');
}

/**
 * Process the next pending job
 */
async function processNextJob(): Promise<void> {
  // Find next pending job (highest priority first)
  const job = await prisma.job.findFirst({
    where: { status: 'PENDING' },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'asc' },
    ],
  });

  if (!job) return;

  const handler = handlers.get(job.type);
  if (!handler) {
    console.error(`No handler for job type: ${job.type}`);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: `No handler registered for job type: ${job.type}`,
        completedAt: new Date(),
      },
    });
    return;
  }

  // Mark as running
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  console.log(`Processing job ${job.id} (${job.type})`);

  try {
    // Helper functions for the handler
    const updateProgress = async (processed: number, total: number) => {
      const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
      await prisma.job.update({
        where: { id: job.id },
        data: {
          progress,
          processedItems: processed,
          totalItems: total,
        },
      });
    };

    const checkCancelled = async () => {
      const current = await prisma.job.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      return current?.status === 'CANCELLED';
    };

    // Run the handler
    const result = await handler({
      id: job.id,
      payload: job.payload as JobPayload,
      updateProgress,
      checkCancelled,
    });

    // Mark as completed
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        result,
        completedAt: new Date(),
      },
    });

    console.log(`Job ${job.id} completed`);
  } catch (error: any) {
    console.error(`Job ${job.id} failed:`, error);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: error.message || 'Unknown error',
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.job.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] },
      completedAt: { lt: cutoff },
    },
  });

  return result.count;
}
