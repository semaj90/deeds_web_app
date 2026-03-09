import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('🔴 Connected to Redis');
  }
}

export async function setJobStatus(jobId: string, status: any) {
  await connectRedis();
  const key = `job:${jobId}`;
  await redisClient.setEx(key, 86400, JSON.stringify(status)); // 24 hour expiry
  console.log(`📊 Updated job status: ${jobId}`);
}

export async function getJobStatus(jobId: string) {
  await connectRedis();
  const key = `job:${jobId}`;
  const data = await redisClient.get(key);
  return data ? JSON.parse(data) : null;
}

export async function updateJobProgress(jobId: string, progress: number, step?: string) {
  const currentStatus = await getJobStatus(jobId);
  if (currentStatus) {
    currentStatus.progress = progress;
    if (step) {
      currentStatus.currentStep = step;
    }
    await setJobStatus(jobId, currentStatus);
  }
}

export async function addJobStep(jobId: string, step: any) {
  const currentStatus = await getJobStatus(jobId);
  if (currentStatus) {
    if (!currentStatus.steps) currentStatus.steps = [];
    currentStatus.steps.push(step);
    await setJobStatus(jobId, currentStatus);
  }
}

export async function closeRedis() {
  if (redisClient.isOpen) {
    await redisClient.quit();
  }
}

export async function getJobsForCase(caseId: string) {
  await connectRedis();
  const pattern = 'job:*';
  const keys = await redisClient.keys(pattern);
  const jobs = [];

  for (const key of keys) {
    const data = await redisClient.get(key);
    if (data) {
      const job = JSON.parse(data);
      if (job.caseId === caseId) {
        jobs.push(job);
      }
    }
  }

  return jobs;
}

export async function checkRedisConnection(): Promise<boolean> {
  try {
    await connectRedis();
    await redisClient.ping();
    return true;
  } catch (error) {
    console.error('Redis connection check failed:', error);
    return false;
  }
}