import Redis from 'ioredis';
import { callAgentFunction } from './agenticFunctions';

const redis = new Redis();

export async function queryTopK(query: string) {
  const cached = await redis.get(`topk:${query}`);
  if (cached) return JSON.parse(cached);
  // placeholder: call vector DB
  const results: unknown[] = [];
  await redis.set(`topk:${query}`, JSON.stringify(results), 'EX', 3600);
  return results;
}

/**
 * Server-side RPC to call an agentic function by name.
 * Validates name is a string and limits arguments to a shallow-serializable set.
 */
export async function callAgenticFunction(name: string, args: unknown[] = []) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Invalid agent function name');
  }

  // Defensive shallow-serialization check to avoid passing complex objects
  const safeArgs = args.map((a) => {
    const t = typeof a;
    if (a == null || t === 'string' || t === 'number' || t === 'boolean') return a;
    // arrays and plain objects are allowed but strip functions/symbols
    if (Array.isArray(a) || t === 'object') {
      try {
        return JSON.parse(JSON.stringify(a));
      } catch (_e) {
        return null;
      }
    }
    return null;
  });

  try {
    console.log(`🤖 Calling agentic function: ${name} with args`, safeArgs);
    const res = await callAgentFunction(name, ...safeArgs);
    console.log(`✅ Agentic function ${name} returned`, res);
    return res;
  } catch (err) {
    console.error(`❌ Agentic function ${name} failed`, err);
    throw err;
  }
}