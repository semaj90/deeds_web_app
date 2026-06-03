import { getValkeyClient } from '../cache/valkey-client.js';
import { ENV } from '../env.server.js';
const redis = getValkeyClient();

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
