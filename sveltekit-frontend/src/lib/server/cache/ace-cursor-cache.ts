import { redis } from '$lib/server/redis';
import { z } from 'zod';

/**
 * ACE Cursor Schema — Redis-persisted cursor for Phase 3 Step 1 validation state
 * Enables continuation without replaying validation gates across server restarts
 */
export const ACECursorSchema = z.object({
  /** Packet key identifying the retrieval context */
  packet_key: z.string(),
  /** Timestamp of last retrieval (ISO 8601) */
  last_retrieved_at: z.string().datetime(),
  /** 4-gate validation state (deserialization → contract → payload → upsert) */
  validation_gates: z.object({
    gate_1_deserialization: z.enum(['PASS', 'FAIL', 'SKIP']),
    gate_2_contract_validation: z.enum(['PASS', 'FAIL', 'SKIP']),
    gate_3_qdrant_payload: z.enum(['PASS', 'FAIL', 'SKIP']),
    gate_4_qdrant_manager_upsert: z.enum(['PASS', 'FAIL', 'SKIP'])
  }),
  /** Verified embedding dimension (768-dim canonical, 384 projected, 256/64 routing) */
  dimension_verified: z.number().optional(),
  /** Embedding lane identifier (dense_768, dense_384, routing_only) */
  embedding_lane: z.string().optional(),
  /** Projection version if dimension < 768 (mrl-384-v1, mrl-256-v1, autoencoder-64-v1) */
  projection_version: z.string().nullable().optional(),
  /** Retrieval timing breakdown for diagnostics */
  retrieval_trace: z.object({
    qdrant_elapsed_ms: z.number(),
    postgres_join_elapsed_ms: z.number(),
    total_elapsed_ms: z.number()
  }).optional()
});

/** Type inference from Zod schema */
export type ACECursor = z.infer<typeof ACECursorSchema>;

/**
 * Retrieve ACE cursor from Redis cache
 * @param sessionId Session identifier (e.g., locals.session.id)
 * @returns Parsed cursor or null if not found/expired/invalid
 */
export async function getACECursor(sessionId: string): Promise<ACECursor | null> {
  try {
    const key = `ace:cursor:${sessionId}`;
    const data = await redis.get(key);
    if (!data) return null;
    return ACECursorSchema.parse(JSON.parse(data));
  } catch (err) {
    console.warn(`[ACECursor] Failed to load cursor for ${sessionId}:`, err);
    return null;
  }
}

/**
 * Store ACE cursor to Redis cache with TTL
 * @param sessionId Session identifier
 * @param cursor Cursor object to store (validated before write)
 * @param ttlSeconds Time-to-live in seconds (default 300 = 5 min)
 */
export async function setACECursor(
  sessionId: string,
  cursor: ACECursor,
  ttlSeconds: number = 300
): Promise<void> {
  try {
    const key = `ace:cursor:${sessionId}`;
    const validated = ACECursorSchema.parse(cursor);
    await redis.setex(key, ttlSeconds, JSON.stringify(validated));
  } catch (err) {
    console.warn(`[ACECursor] Failed to store cursor for ${sessionId}:`, err);
  }
}

/**
 * Delete ACE cursor from Redis cache
 * @param sessionId Session identifier
 */
export async function deleteACECursor(sessionId: string): Promise<void> {
  try {
    const key = `ace:cursor:${sessionId}`;
    await redis.del(key);
  } catch (err) {
    console.warn(`[ACECursor] Failed to delete cursor for ${sessionId}:`, err);
  }
}

/**
 * Check if cursor has all validation gates passing
 * @param cursor Cursor object to validate
 * @returns true if all 4 gates are PASS, false otherwise
 */
export function isACECursorValid(cursor: ACECursor): boolean {
  return Object.values(cursor.validation_gates).every(gate => gate === 'PASS');
}

/**
 * Normalize untrusted JSON into ACE cursor with graceful fallback
 * @param raw Raw JSON data from external source
 * @returns Parsed cursor or null if validation fails
 */
export function normalizeACECursor(raw: unknown): ACECursor | null {
  try {
    return ACECursorSchema.parse(raw);
  } catch {
    return null;
  }
}
