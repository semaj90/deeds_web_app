import { ENV } from '../env.server.js';
import Redis from 'ioredis';

const redis = new Redis(ENV.REDIS_URL);

export async function preflight(query: string) {
  // Read top 10 most recent failures from the hot cache
  const failures = await redis.lrange("atlas:failures", 0, 10);

  // Convert query to lower case for basic string matching
  const q = query.toLowerCase();

  // Find if this exact error signature has been triggered recently
  const known = failures.find(f => q.includes(f.toLowerCase()));

  if (known) {
    return {
      prevent: true,
      reason: known,
      suggestion: "Use alternative approach. This failure signature was recently encountered and failed."
    };
  }

  return { prevent: false };
}
