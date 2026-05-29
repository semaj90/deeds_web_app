import Redis from 'ioredis';
import { ENV } from '../env.server.js';

const redis = new Redis(ENV.REDIS_URL);

export async function recordExecutionOutcome(query: string, success: boolean, ctx: any) {
  const hash = Buffer.from(query).toString('base64').substring(0, 10);
  const key = `learning:outcome:${hash}`;

  await redis.hset(key, {
    query,
    success: String(success),
    strategy: ctx.strategy || 'default',
    timestamp: Date.now()
  });

  // Increment success/failure counters for the specific strategy
  if (success) {
    await redis.zincrby('learning:strategy_weights', 1, ctx.strategy || 'default');
  } else {
    await redis.zincrby('learning:strategy_weights', -0.5, ctx.strategy || 'default');
  }
}

export async function mutatePromptWithLearnings(basePrompt: string, intentContext: string): Promise<string> {
  // Retrieve top performing strategies for this intent
  const topStrategies = await redis.zrevrange('learning:strategy_weights', 0, 2, 'WITHSCORES');

  let mutatedPrompt = basePrompt;
  if (topStrategies.length > 0) {
    mutatedPrompt += `\n\n[SYSTEM LEARNING INJECTION]\nBased on previous outcomes, prioritize these execution strategies if applicable: ${topStrategies.filter((_, i) => i % 2 === 0).join(', ')}`;
  }

  return mutatedPrompt;
}
