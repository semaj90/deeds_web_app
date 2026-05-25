import Redis from 'ioredis';
import { ENV } from '../env.server.js';
const redis = new Redis(ENV.REDIS_URL || 'redis://127.0.0.1:6379');

export type ExecutionTransition = {
  from: string;
  to: string;
  intent: string;
  success: boolean;
  frequency?: number;
};

export async function recordTransition(t: ExecutionTransition) {
  try {
    const key = `transition:${t.from}:${t.to}:${t.intent}`;
    await redis.hincrby('execution:transitions', key, t.frequency || 1);
    
    // Also track success/failure splits
    const statusKey = t.success ? 'success' : 'failure';
    await redis.hincrby(`execution:transitions:status:${statusKey}`, key, t.frequency || 1);
  } catch (err) {
    console.warn('[ExecutionTransition] Failed to record to Redis:', err);
    // Postgres fallback planned for later
  }
}
