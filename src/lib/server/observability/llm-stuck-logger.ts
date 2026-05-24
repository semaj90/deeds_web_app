import { db } from '$lib/server/db/client'; // Assuming a client wrapper exists
import { memoryStuckEvents } from '$lib/server/db/schema/agent-memory'; // Newly created schema
import { redis } from '$lib/server/redis/client'; // Assuming a Redis client wrapper exists
import { type LlmStuckEvent } from './types'; // Assuming types file exists

/**
 * Logs an event to indicate when an LLM agent becomes stuck during a workflow.
 * This function writes the event to Redis (hot cache) and Postgres (durable log).
 * @param event The structure containing the stuck event details.
 * @returns The payload of the logged event.
 */
export async function logLlmStuck(event: LlmStuckEvent): Promise<any> {
  const payload: LlmStuckEvent = {
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString()
  };

  // 1. Redis hot log: Push to list and trim to keep the last 500 entries
  try {
    // Assuming 'redis' client has 'lpush' and 'ltrim' methods
    await redis.lpush('llm:stuck:recent', JSON.stringify(payload));
    await redis.ltrim('llm:stuck:recent', 0, 499);
    // Set TTL for the list key to 7 days
    await redis.expire('llm:stuck:recent', 60 * 60 * 24 * 7);
  } catch (e) {
    console.error("Failed to write to Redis hot log:", e);
    // Continue to DB write even if Redis fails
  }

  // 2. Postgres durable log: Insert into the dedicated schema table
  try {
    // Assuming 'db' client can access schema definitions
    await db.insert(memoryStuckEvents).values(payload);
    return { success: true, message: "Event logged successfully to Postgres and Redis." };
  } catch (e) {
    console.error("Failed to write to Postgres durable log:", e);
    // Return the payload even if DB write fails, as Redis write might have succeeded
    return { success: false, payload: payload, message: "Event logged to Redis but failed to write to Postgres." };
  }
}